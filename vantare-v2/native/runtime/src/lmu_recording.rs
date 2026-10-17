//! Archivo LMU completo, acotado y en streaming. Cada cuerpo conserva su hash;
//! XOR contra el anterior de la misma fuente reduce el coste de los buffers SHM.
//! El lector limita a 64 MiB cuerpos y claves retenidos; cada cuerpo temporal
//! admite como máximo 16 MiB. Un archivo que excede el historial se rechaza.
use flate2::{Compression, read::GzDecoder, write::GzEncoder};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    io::{self, Read, Write},
};

pub const SCHEMA: &str = "vantare.lmu-full.v1";
const MAX_BODY: usize = 16 << 20;
const MAX_META: usize = 256 << 10;
const MAX_KEYS: usize = 512;
// Historial XOR incluyendo nombres de fuentes. No se puede expulsar una clave:
// el siguiente delta la necesita. Los buffers temporales se acotan por registro.
const MAX_PREVIOUS_BYTES: usize = 64 << 20;

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Record {
    pub kind: String,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub at_ns: u64,
    #[serde(default)]
    pub started_ns: u64,
    #[serde(default)]
    pub status: Option<u16>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub sha256: String,
    #[serde(default)]
    pub details: serde_json::Value,
    #[serde(skip)]
    pub body: Vec<u8>,
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

fn previous<'a, T: Default>(map: &'a mut HashMap<String, T>, key: &str) -> io::Result<&'a mut T> {
    if !map.contains_key(key) && map.len() >= MAX_KEYS {
        return Err(invalid("demasiadas fuentes"));
    }
    Ok(map.entry(key.to_owned()).or_default())
}

pub struct Writer<W: Write> {
    gzip: GzEncoder<W>,
    previous: HashMap<String, Vec<u8>>,
}
impl<W: Write> Writer<W> {
    pub fn new(output: W) -> Self {
        Self {
            gzip: GzEncoder::new(output, Compression::fast()),
            previous: HashMap::new(),
        }
    }
    pub fn record(&mut self, mut record: Record) -> io::Result<()> {
        if record.body.len() > MAX_BODY {
            return Err(invalid("cuerpo supera 16 MiB"));
        }
        record.sha256 = format!("{:x}", Sha256::digest(&record.body));
        let meta = serde_json::to_vec(&record)?;
        if meta.len() > MAX_META {
            return Err(invalid("metadatos demasiado grandes"));
        }
        let old = previous(&mut self.previous, &record.key)?;
        let delta: Vec<_> = record
            .body
            .iter()
            .enumerate()
            .map(|(i, b)| b ^ old.get(i).copied().unwrap_or(0))
            .collect();
        self.gzip.write_all(
            &u32::try_from(meta.len())
                .map_err(|_| invalid("longitud"))?
                .to_le_bytes(),
        )?;
        self.gzip.write_all(
            &u32::try_from(delta.len())
                .map_err(|_| invalid("longitud"))?
                .to_le_bytes(),
        )?;
        self.gzip.write_all(&meta)?;
        self.gzip.write_all(&delta)?;
        *old = record.body;
        Ok(())
    }
    pub fn flush(&mut self) -> io::Result<()> {
        self.gzip.flush()
    }
    pub fn finish(self) -> io::Result<W> {
        self.gzip.finish()
    }
}

pub struct Reader<R: Read> {
    gzip: GzDecoder<R>,
    previous: HashMap<String, Box<[u8]>>,
    previous_bytes: usize,
    max_previous_bytes: usize,
    ended: bool,
    failed: bool,
}
impl<R: Read> Reader<R> {
    pub fn new(input: R) -> Self {
        Self::with_cache_limit(input, MAX_PREVIOUS_BYTES)
    }
    fn with_cache_limit(input: R, max_previous_bytes: usize) -> Self {
        Self {
            gzip: GzDecoder::new(input),
            previous: HashMap::new(),
            previous_bytes: 0,
            max_previous_bytes,
            ended: false,
            failed: false,
        }
    }
    fn read_record(&mut self) -> io::Result<Option<Record>> {
        let mut lengths = [0; 8];
        let count = self.gzip.read(&mut lengths[..1])?;
        if count == 0 {
            return if self.ended {
                Ok(None)
            } else {
                Err(invalid("grabación incompleta: falta footer"))
            };
        }
        if self.ended {
            return Err(invalid("datos después del footer"));
        }
        self.gzip.read_exact(&mut lengths[1..])?;
        let meta_len =
            u32::from_le_bytes(lengths[..4].try_into().map_err(|_| invalid("longitud"))?) as usize;
        let body_len =
            u32::from_le_bytes(lengths[4..].try_into().map_err(|_| invalid("longitud"))?) as usize;
        if meta_len > MAX_META || body_len > MAX_BODY {
            return Err(invalid("registro supera límites"));
        }
        let mut meta = vec![0; meta_len];
        self.gzip.read_exact(&mut meta)?;
        let mut record: Record = serde_json::from_slice(&meta)?;
        let old = self.previous.get(&record.key);
        if old.is_none() && self.previous.len() >= MAX_KEYS {
            return Err(invalid("demasiadas fuentes"));
        }
        let previous_bytes = self.previous_bytes - old.map_or(0, |body| body.len())
            + body_len
            + if old.is_none() { record.key.len() } else { 0 };
        if previous_bytes > self.max_previous_bytes {
            return Err(invalid(
                "historial XOR supera el límite agregado de memoria",
            ));
        }
        // Rechazar antes de reservar/inflar el cuerpo de un fichero ajeno.
        record.body.resize(body_len, 0);
        self.gzip.read_exact(&mut record.body)?;
        let old = previous(&mut self.previous, &record.key)?;
        for (i, b) in record.body.iter_mut().enumerate() {
            *b ^= old.get(i).copied().unwrap_or(0);
        }
        if record.sha256 != format!("{:x}", Sha256::digest(&record.body)) {
            return Err(invalid("hash de cuerpo incorrecto"));
        }
        if old.len() == record.body.len() {
            old.copy_from_slice(&record.body);
        } else {
            // Box no retiene capacidad al reducir el cuerpo de esta fuente.
            *old = record.body.clone().into_boxed_slice();
        }
        self.previous_bytes = previous_bytes;
        self.ended = record.kind == "footer";
        Ok(Some(record))
    }
}
impl<R: Read> Iterator for Reader<R> {
    type Item = io::Result<Record>;
    fn next(&mut self) -> Option<Self::Item> {
        if self.failed {
            return None;
        }
        let result = self.read_record().transpose();
        self.failed = matches!(result, Some(Err(_)));
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn raw_buffers_and_rest_roundtrip_with_changes_and_missing_footer_is_rejected() {
        let mut writer = Writer::new(Vec::new());
        let frame = include_bytes!("../testdata/lmu-rest-2026-10-14/frame.bin");
        for body in [frame.to_vec(), frame[..100].to_vec(), frame.to_vec()] {
            writer
                .record(Record {
                    kind: "shm".into(),
                    key: "LMU_Data".into(),
                    body,
                    ..Record::default()
                })
                .unwrap();
        }
        let compressed = writer.finish().unwrap();
        assert!(compressed.len() < frame.len());
        let mut reader = Reader::new(&compressed[..]);
        assert_eq!(reader.next().unwrap().unwrap().body, frame);
        assert_eq!(reader.next().unwrap().unwrap().body, frame[..100]);
        assert_eq!(reader.next().unwrap().unwrap().body, frame);
        assert!(
            reader.next().unwrap().is_err(),
            "no debe aprobar un cierre incompleto"
        );
    }
    #[test]
    fn footer_and_gzip_crc_are_required() {
        let mut writer = Writer::new(Vec::new());
        writer
            .record(Record {
                kind: "footer".into(),
                ..Record::default()
            })
            .unwrap();
        let bytes = writer.finish().unwrap();
        assert_eq!(Reader::new(&bytes[..]).count(), 1);
        let mut reader = Reader::new(&bytes[..bytes.len() - 5]);
        assert!(reader.any(|r| r.is_err()));
    }

    fn recording(bodies: &[(&str, usize)]) -> Vec<u8> {
        let mut writer = Writer::new(Vec::new());
        for &(key, size) in bodies {
            writer
                .record(Record {
                    kind: "rest".into(),
                    key: key.into(),
                    body: vec![1; size],
                    ..Record::default()
                })
                .unwrap();
        }
        writer
            .record(Record {
                kind: "footer".into(),
                ..Record::default()
            })
            .unwrap();
        writer.finish().unwrap()
    }

    #[test]
    fn many_small_sources_cannot_exceed_the_aggregate_cache_budget() {
        let bytes = recording(&[("a", 40), ("b", 40), ("c", 40)]);
        let mut reader = Reader::with_cache_limit(&bytes[..], 100);
        assert!(reader.next().unwrap().is_ok());
        assert!(reader.next().unwrap().is_ok());
        assert_eq!(
            reader.next().unwrap().unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
        assert!(reader.next().is_none());
        assert_eq!(reader.previous_bytes, 82);
    }

    #[test]
    fn replacing_and_shrinking_a_source_reclaims_its_budget_without_losing_xor() {
        let bytes = recording(&[("a", 60), ("b", 30), ("a", 4), ("c", 60)]);
        let mut reader = Reader::with_cache_limit(&bytes[..], 100);
        for size in [60, 30, 4, 60, 0] {
            assert_eq!(reader.next().unwrap().unwrap().body, vec![1; size]);
            assert!(reader.previous_bytes <= 100);
        }
        assert_eq!(reader.previous_bytes, 97);
        assert!(reader.next().is_none());
    }

    #[test]
    fn key_bytes_are_budgeted_and_large_bodies_are_rejected_before_reading_them() {
        let bytes = recording(&[("a-long-source-name", 0)]);
        assert_eq!(
            Reader::with_cache_limit(&bytes[..], 8)
                .next()
                .unwrap()
                .unwrap_err()
                .kind(),
            io::ErrorKind::InvalidData
        );
        // Longitud legal por registro, pero el cuerpo omitido excede el agregado.
        // InvalidData (no UnexpectedEof) demuestra el rechazo previo a su lectura.
        let meta = serde_json::to_vec(&Record {
            key: "a".into(),
            ..Record::default()
        })
        .unwrap();
        let mut gzip = GzEncoder::new(Vec::new(), Compression::fast());
        gzip.write_all(&u32::try_from(meta.len()).unwrap().to_le_bytes())
            .unwrap();
        gzip.write_all(&101_u32.to_le_bytes()).unwrap();
        gzip.write_all(&meta).unwrap();
        let bytes = gzip.finish().unwrap();
        assert_eq!(
            Reader::with_cache_limit(&bytes[..], 100)
                .next()
                .unwrap()
                .unwrap_err()
                .kind(),
            io::ErrorKind::InvalidData
        );
    }
}
