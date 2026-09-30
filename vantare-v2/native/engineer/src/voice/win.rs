use std::io;
use std::os::windows::ffi::OsStrExt as _;
use std::path::Path;
use std::ptr::{null, null_mut};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use windows_sys::Win32::{
    Media::{
        Audio::{PlaySoundW, SND_ASYNC, SND_FILENAME, SND_NODEFAULT},
        Multimedia::mciSendStringW,
    },
    Security::Cryptography::{BCRYPT_SHA256_ALG_HANDLE, BCryptHash},
};

pub(super) fn sha256(input: &[u8]) -> io::Result<String> {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let size = u32::try_from(input.len()).map_err(|_| io::ErrorKind::InvalidInput)?;
    let mut digest = [0_u8; 32];
    // SAFETY: pseudo-handle SHA256 válido (Windows 10+); buffers vivos y tamaños
    // exactos. Sin clave HMAC, sin handles propios que cerrar.
    let status = unsafe {
        BCryptHash(
            BCRYPT_SHA256_ALG_HANDLE,
            null(),
            0,
            input.as_ptr(),
            size,
            digest.as_mut_ptr(),
            32,
        )
    };
    if status < 0 {
        return Err(io::Error::other(format!("SHA-256 CNG: {status:#x}")));
    }
    Ok(digest
        .iter()
        .flat_map(|byte| {
            [
                char::from(HEX[usize::from(byte >> 4)]),
                char::from(HEX[usize::from(byte & 15)]),
            ]
        })
        .collect())
}

pub(super) enum Player {
    Wav(bool),
    Mp3(Mci),
}
impl Player {
    pub(super) fn play(path: &Path) -> io::Result<Self> {
        if path.extension().is_some_and(|ext| ext == "mp3") {
            let player = Mci::open(path)?;
            player.command("play", "from 0")?;
            return Ok(Self::Mp3(player));
        }
        let wide: Vec<_> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        // SAFETY: WAV validado, wide termina en NUL y vive durante la llamada;
        // WinMM posee la reproducción asíncrona sin retener nuestro buffer.
        if unsafe {
            PlaySoundW(
                wide.as_ptr(),
                null_mut(),
                SND_FILENAME | SND_ASYNC | SND_NODEFAULT,
            )
        } == 0
        {
            return Err(io::Error::other("WinMM no pudo iniciar el clip"));
        }
        Ok(Self::Wav(true))
    }
    pub(super) fn stop(&mut self) -> io::Result<()> {
        match self {
            Self::Wav(active) if *active => {
                // SAFETY: nombre nulo y flags cero paran el sonido de este proceso.
                if unsafe { PlaySoundW(null(), null_mut(), 0) } == 0 {
                    return Err(io::Error::other("WinMM no pudo detener el clip"));
                }
                *active = false;
                Ok(())
            }
            Self::Mp3(player) => {
                if player.alias.is_none() {
                    return Ok(());
                }
                let stopped = player.command("stop", "").map(|_| ());
                let closed = player.close();
                stopped.and(closed)
            }
            Self::Wav(_) => Ok(()),
        }
    }
}

pub(super) struct Mci {
    alias: Option<String>,
}
impl Mci {
    fn open(path: &Path) -> io::Result<Self> {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let alias = format!("vantare_voice_{}", NEXT.fetch_add(1, Ordering::Relaxed));
        let wide: Vec<_> = path.as_os_str().encode_wide().collect();
        if wide.iter().any(|value| matches!(*value, 0 | 34)) {
            return Err(io::ErrorKind::InvalidInput.into());
        }
        let mut command: Vec<_> = "open \"".encode_utf16().collect();
        // Canonicalize genera \\?\ para rutas locales; MCI usa ruta DOS normal.
        if let Some(unc) = wide.strip_prefix(&[92, 92, 63, 92, 85, 78, 67, 92]) {
            command.extend_from_slice(&[92, 92]);
            command.extend_from_slice(unc);
        } else {
            command.extend_from_slice(wide.strip_prefix(&[92, 92, 63, 92]).unwrap_or(&wide));
        }
        command.extend(format!("\" type mpegvideo alias {alias}").encode_utf16());
        command.push(0);
        send(&command)?;
        let player = Self { alias: Some(alias) };
        player.command("set", "time format milliseconds")?;
        Ok(player)
    }
    fn command(&self, verb: &str, tail: &str) -> io::Result<String> {
        let alias = self
            .alias
            .as_deref()
            .ok_or_else(|| io::Error::other("MCI cerrado"))?;
        send(
            &format!("{verb} {alias} {tail}")
                .encode_utf16()
                .chain(Some(0))
                .collect::<Vec<_>>(),
        )
    }
    fn close(&mut self) -> io::Result<()> {
        if self.alias.is_some() {
            self.command("close", "")?;
            self.alias = None;
        }
        Ok(())
    }
}
impl Drop for Mci {
    fn drop(&mut self) {
        if let Err(error) = self.close() {
            eprintln!("MCI al cerrar: {error}");
        }
    }
}

fn send(command: &[u16]) -> io::Result<String> {
    let mut output = [0_u16; 128];
    // SAFETY: command termina en NUL, ambos buffers viven toda la llamada y el
    // buffer de salida tiene exactamente 128 elementos; sin HWND ni callback.
    let error = unsafe { mciSendStringW(command.as_ptr(), output.as_mut_ptr(), 128, null_mut()) };
    if error != 0 {
        return Err(io::Error::other(format!("MCI error {error}")));
    }
    let size = output
        .iter()
        .position(|value| *value == 0)
        .unwrap_or(output.len());
    String::from_utf16(&output[..size]).map_err(|_| io::ErrorKind::InvalidData.into())
}

pub(super) fn mp3_duration(path: &Path) -> io::Result<Duration> {
    let mut player = Mci::open(path)?;
    let millis: u64 = player
        .command("status", "length")?
        .trim()
        .parse()
        .map_err(|_| io::ErrorKind::InvalidData)?;
    if millis == 0 || millis > 8_000 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "MP3 requiere duración entre 1 ms y 8 s",
        ));
    }
    player.close()?;
    Ok(Duration::from_millis(millis))
}
