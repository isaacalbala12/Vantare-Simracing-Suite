//! Pitido corto Windows, memoria retenida hasta terminar o destruir el widget.
use vantare_domain::session_alerts::Tone;

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
            self.stop();
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
    fn stop(&self) {
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
            self.stop();
        }
    }
}
#[cfg(any(windows, test))]
fn wave(tone: Tone, volume: u8) -> Vec<u8> {
    let rate = 22050u32;
    let count = rate / 8;
    let length = count * 2;
    let mut out = Vec::with_capacity(length as usize + 44);
    out.extend(b"RIFF");
    out.extend((length + 36).to_le_bytes());
    out.extend(b"WAVEfmt ");
    out.extend(16u32.to_le_bytes());
    out.extend(1u16.to_le_bytes());
    out.extend(1u16.to_le_bytes());
    out.extend(rate.to_le_bytes());
    out.extend((rate * 2).to_le_bytes());
    out.extend(2u16.to_le_bytes());
    out.extend(16u16.to_le_bytes());
    out.extend(b"data");
    out.extend(length.to_le_bytes());
    let hz = match tone {
        Tone::Mild => 660.0,
        Tone::Final => 880.0,
        Tone::Finished => 520.0,
    };
    for i in 0..count {
        let envelope = ((count - i) as f32 / count as f32)
            .min(i as f32 / 220.0)
            .clamp(0.0, 1.0);
        let sample = ((i as f32 * hz * std::f32::consts::TAU / rate as f32).sin()
            * envelope
            * f32::from(volume.min(100))
            / 100.0
            * 12000.0) as i16;
        out.extend(sample.to_le_bytes());
    }
    out
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
