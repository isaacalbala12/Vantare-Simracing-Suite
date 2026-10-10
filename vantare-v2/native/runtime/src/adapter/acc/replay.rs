//! Replay del formato de `vantare-grabar-acc`. Dos lectores gzip acotados
//! mezclan SHM y UDP por `t_rel_ns`; nunca se extrae ni carga el corpus entero.
use std::fs::File;
use std::io::{self, BufReader, Read};
use std::path::Path;
use std::time::Duration;

use flate2::read::GzDecoder;
use serde_json::Value;
use sha2::{Digest, Sha256};
use vantare_domain::{Adapter, AdapterError, Observation, SourceKind};

use super::bytes::invalid;
use super::translate::{PAGE_SIZES, Translator};

type Archive = GzDecoder<BufReader<File>>;

#[cfg(test)]
#[path = "../../../tests/acc/replay.rs"]
mod tests;

struct Event {
    at: Duration,
    kind: Option<u8>,
    bytes: Vec<u8>,
    stable: bool,
}

struct Records {
    reader: io::Take<Archive>,
    shm: bool,
    next: Option<Event>,
    previous: Duration,
}

impl Records {
    fn open(path: &Path, member: &str, shm: bool) -> io::Result<Self> {
        let mut archive = GzDecoder::new(BufReader::new(File::open(path)?));
        loop {
            let (name, size) =
                header(&mut archive)?.ok_or_else(|| invalid(format!("falta {member}")))?;
            if name == member {
                let mut records = Self {
                    reader: archive.take(size),
                    shm,
                    next: None,
                    previous: Duration::ZERO,
                };
                records.advance()?;
                return Ok(records);
            }
            skip(&mut archive, size.next_multiple_of(512))?;
        }
    }

    fn advance(&mut self) -> io::Result<()> {
        if self.reader.limit() == 0 {
            self.next = None;
            return Ok(());
        }
        let mut expected_packet = None;
        let (at, kind, size) = if self.shm {
            let mut h = [0_u8; 13];
            self.reader.read_exact(&mut h)?;
            let kind = h[0];
            if kind != 2 {
                expected_packet = Some([h[1], h[2], h[3], h[4]]);
            }
            let size = PAGE_SIZES
                .get(usize::from(kind))
                .copied()
                .ok_or_else(|| invalid("kind SHM inválido"))?;
            let at = u64::from_le_bytes([h[5], h[6], h[7], h[8], h[9], h[10], h[11], h[12]]);
            (at, Some(kind), size)
        } else {
            let mut h = [0_u8; 12];
            self.reader.read_exact(&mut h)?;
            let size = usize::try_from(u32::from_le_bytes([h[0], h[1], h[2], h[3]]))
                .map_err(|_| invalid("longitud UDP inválida"))?;
            if !(1..=65_507).contains(&size) {
                return Err(invalid("longitud UDP fuera de límite"));
            }
            let at = u64::from_le_bytes([h[4], h[5], h[6], h[7], h[8], h[9], h[10], h[11]]);
            (at, None, size)
        };
        let at = Duration::from_nanos(at);
        if at < self.previous {
            return Err(invalid("tiempos de captura desordenados"));
        }
        self.previous = at;
        let mut bytes = vec![0; size];
        self.reader.read_exact(&mut bytes)?;
        let stable = expected_packet.is_none_or(|packet| bytes[..4] == packet);
        self.next = Some(Event {
            at,
            kind,
            bytes,
            stable,
        });
        Ok(())
    }
}

pub struct AccReplay {
    shm: Records,
    udp: Records,
    translator: Translator,
    failed: bool,
    discarded_frames: u64,
}

/// Verifica los SHA-256 de ambos miembros contra `manifest.json` antes de
/// publicar datos. La conformidad fija además el hash del paquete real.
pub fn open_acc_replay(path: &Path) -> io::Result<AccReplay> {
    verify(path)?;
    Ok(AccReplay {
        shm: Records::open(path, "shm.bin", true)?,
        udp: Records::open(path, "udp.bin", false)?,
        translator: Translator::new(SourceKind::Replay),
        failed: false,
        discarded_frames: 0,
    })
}

impl Adapter for AccReplay {
    fn poll(&mut self, now: Duration) -> Result<Option<Observation>, AdapterError> {
        if self.failed {
            return Err(AdapterError::Rejected(
                "replay ACC detenido por error previo".into(),
            ));
        }
        let result = self.next(now);
        if result.is_err() {
            self.failed = true;
        }
        result.map_err(|e| AdapterError::Rejected(format!("corpus ACC: {e}")))
    }
}

impl AccReplay {
    /// Muestras con packetId de cabecera/blob distintos, descartadas sin
    /// publicar ni refrescar señales. Diagnóstico explícito de la grabación.
    pub fn discarded_frames(&self) -> u64 {
        self.discarded_frames
    }

    fn next(&mut self, now: Duration) -> io::Result<Option<Observation>> {
        let shm = match (&self.shm.next, &self.udp.next) {
            (None, None) => return Ok(None),
            (Some(_), None) => true,
            (None, Some(_)) => false,
            (Some(s), Some(u)) => s.at <= u.at, // desempate fijo: SHM primero.
        };
        let records = if shm { &mut self.shm } else { &mut self.udp };
        if records.next.as_ref().is_none_or(|e| e.at > now) {
            return Ok(None);
        }
        let event = records
            .next
            .take()
            .ok_or_else(|| invalid("evento ACC ausente"))?;
        records.advance()?;
        if !event.stable {
            self.discarded_frames += 1;
            return Ok(None);
        }
        let changed = match event.kind {
            Some(kind) => self.translator.shm(kind, event.bytes, event.at)?,
            None => self.translator.udp(&event.bytes, event.at)?,
        };
        // Usa el tiempo GRABADO, incluso si poll recibe todo el corpus de golpe.
        Ok(changed.then(|| self.translator.observe(event.at)).flatten())
    }
}

fn octal(bytes: &[u8]) -> io::Result<u64> {
    let text = std::str::from_utf8(bytes).map_err(|_| invalid("campo tar no ASCII"))?;
    u64::from_str_radix(text.trim_matches(['\0', ' ']), 8)
        .map_err(|_| invalid("campo tar no octal"))
}

fn header(r: &mut impl Read) -> io::Result<Option<(String, u64)>> {
    let mut h = [0_u8; 512];
    r.read_exact(&mut h)?;
    if h.iter().all(|b| *b == 0) {
        return Ok(None);
    }
    let checksum = octal(&h[148..156])?;
    h[148..156].fill(b' ');
    if h.iter().map(|b| u64::from(*b)).sum::<u64>() != checksum {
        return Err(invalid("checksum de cabecera tar inválido"));
    }
    if !matches!(h[156], 0 | b'0') {
        return Err(invalid("solo ficheros regulares ustar ACC"));
    }
    let end = h[..100].iter().position(|b| *b == 0).unwrap_or(100);
    let name = std::str::from_utf8(&h[..end])
        .map_err(|_| invalid("nombre tar inválido"))?
        .to_owned();
    let size = octal(&h[124..136])?;
    if size > 512 * 1024 * 1024 {
        return Err(invalid("miembro tar ACC supera 512 MiB"));
    }
    Ok(Some((name, size)))
}

fn skip(r: &mut impl Read, n: u64) -> io::Result<()> {
    if io::copy(&mut r.take(n), &mut io::sink())? != n {
        return Err(invalid("miembro tar truncado"));
    }
    Ok(())
}

fn verify(path: &Path) -> io::Result<()> {
    let mut archive = GzDecoder::new(BufReader::new(File::open(path)?));
    let mut hashes = std::collections::BTreeMap::new();
    let mut manifest = None;
    while let Some((name, size)) = header(&mut archive)? {
        match name.as_str() {
            "shm.bin" | "udp.bin" => {
                let mut digest = Sha256::new();
                let mut left = size;
                let mut buf = vec![0; 64 * 1024];
                while left > 0 {
                    let n = usize::try_from(left.min(buf.len() as u64))
                        .map_err(|_| invalid("tamaño inválido"))?;
                    archive.read_exact(&mut buf[..n])?;
                    digest.update(&buf[..n]);
                    left -= n as u64;
                }
                if hashes
                    .insert(name, format!("{:x}", digest.finalize()))
                    .is_some()
                {
                    return Err(invalid("miembro tar duplicado"));
                }
            }
            "manifest.json" if manifest.is_none() && size <= 64 * 1024 => {
                let mut bytes = Vec::new();
                (&mut archive).take(size).read_to_end(&mut bytes)?;
                manifest = Some(serde_json::from_slice::<Value>(&bytes)?);
            }
            _ => return Err(invalid("miembro tar ACC inesperado")),
        }
        skip(&mut archive, size.next_multiple_of(512) - size)?;
    }
    // Consumir también el cierre y CRC gzip: un trailer corrupto no es EOF limpio.
    io::copy(&mut archive, &mut io::sink())?;
    let m = manifest.ok_or_else(|| invalid("falta manifest.json"))?;
    if m["schema"] != "vantare.acc-temporal-v1" || m["smVersion"] != "1.9" {
        return Err(invalid("esquema/layout de captura ACC desconocido"));
    }
    for name in ["shm.bin", "udp.bin"] {
        let hash = hashes
            .get(name)
            .ok_or_else(|| invalid(format!("falta {name}")))?;
        if m["sha256"][name].as_str() != Some(hash.as_str()) {
            return Err(invalid(format!("SHA-256 de {name} no coincide")));
        }
    }
    Ok(())
}
