//! Caché Kokoro Go en solo lectura; sin síntesis ni cambio de voz ante ausencia.
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
    #[cfg(windows)]
    player: Option<win::Player>,
}
impl Voice {
    pub fn new(root: Option<&Path>) -> io::Result<Self> {
        if root.is_some_and(|root| root.exists() && !root.is_dir()) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "clips necesita carpeta local",
            ));
        }
        Ok(Self {
            root: root.map(Path::to_path_buf),
            until: None,
            #[cfg(windows)]
            player: None,
        })
    }
    /// Some = `WinMM` aceptó el inicio; no acredita que se haya oído.
    pub fn play(
        &mut self,
        locale: Locale,
        intent: Intent,
        now: Duration,
    ) -> io::Result<Option<Duration>> {
        #[cfg(windows)]
        let called_at = std::time::Instant::now();
        let Some(root) = &self.root else {
            return Ok(None);
        };
        let (path, duration) = resolve_clip(root, locale, intent)?;
        self.stop()?;
        #[cfg(windows)]
        {
            self.player = Some(win::Player::play(&path)?);
        }
        #[cfg(not(windows))]
        {
            let _ = (path, duration, now);
            Err(io::Error::new(
                io::ErrorKind::Unsupported,
                "reproducción de audio no disponible en esta plataforma",
            ))
        }
        #[cfg(windows)]
        {
            // Abrir/inspeccionar MCI consume tiempo: no recortar ese tiempo del
            // clip recién iniciado, conservando el límite TTL de la radio.
            self.until = Some(
                now.saturating_add(called_at.elapsed())
                    .saturating_add(duration)
                    .min(now.saturating_add(intent.ttl())),
            );
            Ok(Some(duration))
        }
    }
    pub fn stop(&mut self) -> io::Result<()> {
        if self.until.is_some() {
            #[cfg(windows)]
            if let Some(player) = &mut self.player {
                player.stop()?;
            }
            #[cfg(windows)]
            {
                self.player = None;
            }
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

pub fn default_cache_root() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("VANTARE_NATIVE_DATA_ROOT")
            .or_else(|| std::env::var_os("APPDATA"))
            .filter(|value| !value.is_empty())
            .map(|root| PathBuf::from(root).join("Vantare/Ingeniero/tts-cache/kokoro"))
    }
    #[cfg(target_os = "linux")]
    {
        let root = match std::env::var_os("XDG_CACHE_HOME") {
            Some(root) if PathBuf::from(&root).is_absolute() => PathBuf::from(root),
            Some(_) => return None,
            None => user_home()?.join(".cache"),
        };
        Some(root.join("Vantare/Ingeniero/tts-cache/kokoro"))
    }
    #[cfg(target_os = "macos")]
    {
        Some(user_home()?.join("Library/Caches/Vantare/Ingeniero/tts-cache/kokoro"))
    }
    #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
    {
        None
    }
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn user_home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .filter(|home| !home.is_empty())
        .map(PathBuf::from)
        .filter(|home| home.is_absolute())
}

/// SHA-256(locale NUL voz NUL texto UTF-8), exactamente Cache.Key del Go.
pub fn cache_key(locale: &str, voice: &str, text: &str) -> io::Result<String> {
    let input = format!("{locale}\0{voice}\0{text}");
    #[cfg(windows)]
    {
        win::sha256(input.as_bytes())
    }
    #[cfg(not(windows))]
    {
        #[cfg(unix)]
        {
            use sha2::{Digest, Sha256};
            Ok(format!("{:x}", Sha256::digest(input.as_bytes())))
        }
        #[cfg(not(unix))]
        {
            let _ = input;
            Err(io::ErrorKind::Unsupported.into())
        }
    }
}

pub fn clip_paths(root: &Path, locale: Locale, intent: Intent) -> io::Result<[PathBuf; 3]> {
    let key = cache_key(locale.code(), locale.voice(), intent.text(locale))?;
    Ok([
        root.join(format!("{key}.wav")),
        root.join(format!("{key}.mp3")),
        root.join(locale.code())
            .join(format!("{}.wav", intent.key())),
    ])
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
    let paths = clip_paths(&root, locale, intent)?;
    let mut selected = None;
    for candidate in paths {
        match candidate.canonicalize() {
            Ok(path) => {
                selected = Some(path);
                break;
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    let path =
        selected.ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "clip Kokoro ausente"))?;
    if !path.starts_with(&root) || !path.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "clip fuera de carpeta o irregular",
        ));
    }
    let size = path.metadata()?.len();
    if size == 0 || size > MAX_CLIP_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "clip vacío o mayor que 4 MiB",
        ));
    }
    if path.extension().is_some_and(|ext| ext == "mp3") {
        #[cfg(windows)]
        {
            return Ok((path.clone(), win::mp3_duration(&path)?));
        }
        #[cfg(not(windows))]
        {
            return Err(io::ErrorKind::Unsupported.into());
        }
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

/// Inspección sin reproducir; cada frase conserva texto/voz y su error real.
pub fn coverage(root: &Path) -> serde_json::Value {
    let locales: Vec<_> = [Locale::Es, Locale::En, Locale::It, Locale::PtBr]
        .into_iter()
        .map(|locale| {
            let phrases: Vec<_> = Intent::ALL
                .into_iter()
                .map(|intent| {
                    let mut row =
                        serde_json::json!({"intent":intent.key(), "text":intent.text(locale)});
                    match resolve_clip(root, locale, intent) {
                        Ok((path, duration)) => {
                            row["status"] = "available".into();
                            row["clip"] = path
                                .file_name()
                                .map(|name| name.to_string_lossy().into_owned())
                                .into();
                            row["duration_ms"] = serde_json::json!(duration.as_millis());
                        }
                        Err(error) => {
                            row["status"] = if error.kind() == io::ErrorKind::NotFound {
                                "missing"
                            } else {
                                "failed"
                            }
                            .into();
                            row["error"] = error.to_string().into();
                        }
                    }
                    row
                })
                .collect();
            serde_json::json!({"locale":locale.code(), "voice":locale.voice(), "phrases":phrases})
        })
        .collect();
    serde_json::json!({"version":"vantare.voice.coverage.v1", "locales":locales})
}

pub fn pcm_duration(bytes: &[u8]) -> io::Result<Duration> {
    // Contrato de asset cerrado: RIFF/WAVE, fmt PCM de 16 bytes, data contiguo.
    // Se conserva el contrato WAV previo; no convertimos assets ni mantenemos un decoder.
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
