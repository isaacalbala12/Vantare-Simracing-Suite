use std::io;
use std::os::windows::ffi::OsStrExt as _;
use std::path::Path;
use std::ptr::null_mut;

use windows_sys::Win32::Media::Audio::{PlaySoundW, SND_ASYNC, SND_FILENAME, SND_NODEFAULT};

pub(super) fn play(path: &Path) -> io::Result<()> {
    let wide: Vec<_> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    // SAFETY: path fue validada como WAV local; wide termina en NUL y vive
    // durante la llamada. WinMM carga el medio y posee la reproducción async.
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
    Ok(())
}

pub(super) fn stop() -> io::Result<()> {
    // SAFETY: nombre nulo y flags cero piden parar el sonido de este proceso.
    if unsafe { PlaySoundW(std::ptr::null(), null_mut(), 0) } == 0 {
        return Err(io::Error::other("WinMM no pudo detener el clip"));
    }
    Ok(())
}
