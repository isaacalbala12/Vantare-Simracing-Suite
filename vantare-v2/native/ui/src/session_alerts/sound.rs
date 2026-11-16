//! Pitido corto Windows, memoria retenida hasta terminar o destruir el widget.
use vantare_domain::session_alerts::Tone;
#[cfg(any(windows, test))]
use vantare_domain::session_alerts::wave;

#[derive(Default)]
pub(super) struct Sound {
    #[cfg(windows)]
    bytes: Vec<u8>,
}
#[cfg(windows)]
#[link(name = "winmm")]
unsafe extern "system" {
    fn PlaySoundA(sound: *const u8, module: isize, flags: u32) -> i32;
}
impl Sound {
    #[allow(clippy::unused_self)] // El backend Windows conserva el búfer hasta stop/Drop.
    pub(super) fn play(&mut self, tone: Tone, volume: u8) {
        #[cfg(windows)]
        {
            Self::stop();
            self.bytes = wave(tone, volume);
            // SAFETY: WAV completo; el Vec no cambia hasta stop/Drop.
            unsafe {
                PlaySoundA(self.bytes.as_ptr(), 0, 0x0004 | 0x0001 | 0x0002);
            }
        }
        #[cfg(not(windows))]
        let _ = (tone, volume);
    }
    #[cfg(windows)]
    fn stop() {
        // SAFETY: puntero nulo detiene el sonido asíncrono del proceso.
        unsafe {
            PlaySoundA(std::ptr::null(), 0, 0);
        }
    }
}
impl Drop for Sound {
    fn drop(&mut self) {
        #[cfg(windows)]
        if !self.bytes.is_empty() {
            Self::stop();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sounds_are_short_distinct_and_volume_scales_samples() {
        let mild = wave(Tone::Mild, 70);
        assert_eq!(&mild[..4], b"RIFF");
        assert_eq!(mild.len(), 44 + 22050 / 8 * 2);
        assert_ne!(mild, wave(Tone::Final, 70));
        assert_ne!(mild, wave(Tone::Finished, 70));
        assert!(wave(Tone::Mild, 0)[44..].iter().all(|b| *b == 0));
    }
}
