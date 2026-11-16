//! Pitido corto del aviso: el widget elige el tono y el proceso lo reproduce.
//! Windows lo hace con `winmm` desde memoria, como el overlay de GPUI; en el resto
//! de plataformas no suena. Los tests inyectan un reproductor que apunta los tonos.
use vantare_domain::session_alerts::Tone;

pub(crate) trait Player {
    fn play(&mut self, tone: Tone, volume: u8);
}

/// Lo que el proceso usa en producción: `winmm` en Windows, silencio fuera.
pub(crate) struct Speaker {
    player: Box<dyn Player>,
}
impl Default for Speaker {
    fn default() -> Self {
        Self { player: platform() }
    }
}
impl Speaker {
    pub fn play(&mut self, tone: Tone, volume: u8) {
        self.player.play(tone, volume);
    }
}
fn platform() -> Box<dyn Player> {
    #[cfg(windows)]
    {
        Box::new(Winmm::default())
    }
    #[cfg(not(windows))]
    {
        Box::new(Silent)
    }
}

#[cfg(windows)]
const SND_ASYNC: u32 = 0x0001;
#[cfg(windows)]
const SND_NODEFAULT: u32 = 0x0002;
#[cfg(windows)]
const SND_MEMORY: u32 = 0x0004;
#[cfg(windows)]
#[link(name = "winmm")]
unsafe extern "system" {
    fn PlaySoundA(sound: *const u8, module: isize, flags: u32) -> i32;
}
/// Reproductor de Windows: un WAV en memoria, asíncrono y sin alternativas del sistema.
#[cfg(windows)]
#[derive(Default)]
struct Winmm {
    bytes: Vec<u8>,
}
#[cfg(windows)]
impl Winmm {
    fn stop() {
        // SAFETY: puntero nulo detiene el sonido asíncrono del proceso.
        unsafe {
            PlaySoundA(std::ptr::null(), 0, 0);
        }
    }
}
#[cfg(windows)]
impl Player for Winmm {
    fn play(&mut self, tone: Tone, volume: u8) {
        Self::stop();
        self.bytes = vantare_domain::session_alerts::wave(tone, volume);
        // SAFETY: WAV completo; el Vec no cambia hasta el siguiente play o el Drop.
        unsafe {
            PlaySoundA(
                self.bytes.as_ptr(),
                0,
                SND_MEMORY | SND_ASYNC | SND_NODEFAULT,
            );
        }
    }
}
#[cfg(windows)]
impl Drop for Winmm {
    fn drop(&mut self) {
        if !self.bytes.is_empty() {
            Self::stop();
        }
    }
}

#[cfg(not(windows))]
struct Silent;
#[cfg(not(windows))]
impl Player for Silent {
    fn play(&mut self, _tone: Tone, _volume: u8) {}
}

/// Reproductor de los tests: apunta lo que se habría reproducido, sin sonar.
#[cfg(test)]
#[derive(Debug, Default)]
pub(crate) struct Recorder {
    pub played: Vec<(Tone, u8)>,
}
#[cfg(test)]
impl Recorder {
    pub fn record(&mut self, sounds: impl IntoIterator<Item = (Tone, u8)>) {
        self.played.extend(sounds);
    }
}
#[cfg(test)]
impl Player for Recorder {
    fn play(&mut self, tone: Tone, volume: u8) {
        self.played.push((tone, volume));
    }
}
