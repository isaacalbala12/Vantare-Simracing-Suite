//! Clips locales pregenerados; sin síntesis ni fallback. WAV PCM16 canónico.
use std::fs::File;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::radio::{Intent, Locale};

#[cfg(windows)]
#[allow(unsafe_code)]
mod win;

const MAX_CLIP_BYTES: u64 = 4 * 1024 * 1024;

pub struct Voice {
    root: Option<PathBuf>,
    until: Option<Duration>,
}
impl Voice {
    pub fn new(root: Option<&Path>) -> io::Result<Self> {
        let root = root.map(Path::canonicalize).transpose()?;
        if root.as_ref().is_some_and(|root| !root.is_dir()) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "clips necesita carpeta local",
            ));
        }
        Ok(Self { root, until: None })
    }
    /// Some = `WinMM` aceptó el inicio; no acredita que se haya oído.
    pub fn play(
        &mut self,
        locale: Locale,
        intent: Intent,
        now: Duration,
    ) -> io::Result<Option<Duration>> {
        let Some(root) = &self.root else {
            return Ok(None);
        };
        let (path, duration) = resolve_clip(root, locale, intent)?;
        self.stop()?;
        #[cfg(windows)]
        win::play(&path)?;
        #[cfg(not(windows))]
        {
            let _ = (path, duration, now);
            return Err(io::Error::from(io::ErrorKind::Unsupported));
        }
        #[cfg(windows)]
        {
            self.until = Some(now.saturating_add(duration.min(intent.ttl())));
            Ok(Some(duration))
        }
    }
    pub fn stop(&mut self) -> io::Result<()> {
        if self.until.is_some() {
            #[cfg(windows)]
            win::stop()?;
            self.until = None;
        }
        Ok(())
    }
    pub fn tick(&mut self, now: Duration) -> io::Result<bool> {
        if self.until.is_some_and(|until| now >= until) {
            self.stop()?;
            return Ok(true);
        }
        Ok(false)
    }
}
impl Drop for Voice {
    fn drop(&mut self) {
        if let Err(error) = self.stop() {
            eprintln!("voz al cerrar: {error}");
        }
    }
}

/// No se acepta un clip que salga de root por symlink ni un medio irregular.
pub fn resolve_clip(
    root: &Path,
    locale: Locale,
    intent: Intent,
) -> io::Result<(PathBuf, Duration)> {
    let root = root.canonicalize()?;
    let path = root
        .join(locale.code())
        .join(format!("{}.wav", intent.key()))
        .canonicalize()?;
    if !path.starts_with(&root) || !path.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "clip fuera de carpeta o irregular",
        ));
    }
    let mut bytes = Vec::new();
    File::open(&path)?
        .take(MAX_CLIP_BYTES + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_CLIP_BYTES {
        return Err(invalid());
    }
    let duration = pcm_duration(&bytes)?;
    Ok((path, duration))
}

pub fn pcm_duration(bytes: &[u8]) -> io::Result<Duration> {
    // Contrato de asset cerrado: RIFF/WAVE, fmt PCM de 16 bytes, data contiguo.
    // El batch normaliza metadatos; no mantenemos un decoder multimedia.
    if bytes.len() < 44
        || &bytes[..4] != b"RIFF"
        || &bytes[8..16] != b"WAVEfmt "
        || &bytes[36..40] != b"data"
    {
        return Err(invalid());
    }
    let u16_at = |at: usize| u16::from_le_bytes([bytes[at], bytes[at + 1]]);
    let u32_at =
        |at: usize| u32::from_le_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]]);
    let (channels, rate, size) = (u16_at(22), u32_at(24), u32_at(40));
    let block = channels.saturating_mul(2);
    if u32_at(16) != 16
        || u16_at(20) != 1
        || !matches!(channels, 1 | 2)
        || !(16_000..=48_000).contains(&rate)
        || u16_at(34) != 16
        || u16_at(32) != block
        || u32_at(28) != rate * u32::from(block)
        || size == 0
        || size % u32::from(block) != 0
        || u64::from(size) + 44 != bytes.len() as u64
        || u64::from(u32_at(4)) + 8 != bytes.len() as u64
    {
        return Err(invalid());
    }
    let duration = Duration::from_secs_f64(f64::from(size) / f64::from(u32_at(28)));
    if duration > Duration::from_secs(8) {
        return Err(invalid());
    }
    Ok(duration)
}
fn invalid() -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidData,
        "clip requiere WAV PCM16 canónico, 16–48 kHz, mono/estéreo, máximo 8 s",
    )
}
