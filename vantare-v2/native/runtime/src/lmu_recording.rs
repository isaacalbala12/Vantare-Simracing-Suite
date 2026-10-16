//! Archivo LMU completo, acotado y en streaming. Cada cuerpo conserva su hash;
//! XOR contra el anterior de la misma fuente reduce el coste de los buffers SHM.
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

fn previous<'a>(map: &'a mut HashMap<String, Vec<u8>>, key: &str) -> io::Result<&'a mut Vec<u8>> {
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
    previous: HashMap<String, Vec<u8>>,
    ended: bool,
    failed: bool,
}
impl<R: Read> Reader<R> {
    pub fn new(input: R) -> Self {
        Self {
            gzip: GzDecoder::new(input),
            previous: HashMap::new(),
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
        record.body.resize(body_len, 0);
        self.gzip.read_exact(&mut record.body)?;
        let old = previous(&mut self.previous, &record.key)?;
        for (i, b) in record.body.iter_mut().enumerate() {
            *b ^= old.get(i).copied().unwrap_or(0);
        }
        if record.sha256 != format!("{:x}", Sha256::digest(&record.body)) {
            return Err(invalid("hash de cuerpo incorrecto"));
        }
        old.clone_from(&record.body);
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
}
