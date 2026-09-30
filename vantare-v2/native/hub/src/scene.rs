//! Escenas reales o fixtures explícitos: el Workshop no fabrica telemetría.
use std::path::{Path, PathBuf};
use std::time::Duration;

use vantare_domain::Snapshot;

use crate::files;

const MAX_SCENE_BYTES: u64 = 16 * 1024 * 1024;
const MAX_FRAMES: usize = 512;

pub const FIXTURES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../ui/fixtures");

pub struct Scene {
    pub path: PathBuf,
    frames: Vec<Snapshot>,
    index: usize,
    pub playing: bool,
    pub looping: bool,
    pub error: Option<String>,
}

fn load(path: &Path) -> Result<Vec<Snapshot>, String> {
    let data = files::read(path, MAX_SCENE_BYTES)?;
    let text = std::str::from_utf8(&data).map_err(|e| format!("escena no UTF-8: {e}"))?;
    let mut frames = Vec::new();
    if path.extension().is_some_and(|ext| ext == "jsonl") {
        for (line, text) in text.lines().enumerate() {
            if frames.len() == MAX_FRAMES {
                return Err("escena supera 512 fotos".into());
            }
            let next = vantare_ipc::snapshot_from_json(text)
                .map_err(|e| format!("foto {}: {e}", line + 1))?;
            if let Some(previous) = frames.last() {
                let previous: &Snapshot = previous;
                if previous.epoch != next.epoch
                    || previous.sequence >= next.sequence
                    || previous.origin.received_at > next.origin.received_at
                {
                    return Err("secuencia fuera de orden o época distinta".into());
                }
            }
            frames.push(next);
        }
    } else {
        frames.push(vantare_ipc::snapshot_from_json(text).map_err(|e| e.to_string())?);
    }
    if frames.is_empty() {
        return Err("escena vacía".into());
    }
    Ok(frames)
}

impl Scene {
    pub fn open(path: PathBuf) -> Result<Self, String> {
        let frames = load(&path)?;
        Ok(Self {
            path,
            frames,
            index: 0,
            playing: false,
            looping: false,
            error: None,
        })
    }

    pub fn snapshot(&self) -> &Snapshot {
        &self.frames[self.index]
    }
    pub fn index(&self) -> usize {
        self.index
    }
    pub fn len(&self) -> usize {
        self.frames.len()
    }
    pub fn is_empty(&self) -> bool {
        self.frames.is_empty()
    }

    /// Una escritura incompleta no cambia escena, cursor ni reproducción.
    pub fn replace(&mut self, path: PathBuf) -> bool {
        match load(&path) {
            Ok(frames) => {
                self.frames = frames;
                self.path = path;
                self.index = 0;
                self.playing = false;
                self.error = None;
                true
            }
            Err(error) => {
                self.error = Some(error);
                false
            }
        }
    }

    pub fn step(&mut self, forward: bool) {
        self.playing = false;
        if forward {
            self.index = (self.index + 1).min(self.frames.len() - 1);
        } else {
            self.index = self.index.saturating_sub(1);
        }
    }

    pub fn rewind(&mut self) {
        self.index = 0;
        self.playing = false;
    }

    pub fn seek(&mut self, index: usize) -> Result<(), String> {
        if index >= self.frames.len() {
            return Err("foto guardada ya no existe en la escena".into());
        }
        self.index = index;
        self.playing = false;
        Ok(())
    }

    pub fn play(&mut self) {
        if self.frames.len() > 1 {
            if self.index + 1 == self.frames.len() {
                self.index = 0;
            }
            self.playing = !self.playing;
        }
    }

    pub fn delay(&self) -> Duration {
        self.frames
            .get(self.index + 1)
            .map_or(Duration::from_millis(16), |next| {
                next.origin
                    .received_at
                    .saturating_sub(self.snapshot().origin.received_at)
                    .max(Duration::from_millis(1))
            })
    }

    pub fn advance(&mut self) -> bool {
        if !self.playing {
            return false;
        }
        if self.index + 1 < self.frames.len() {
            self.index += 1;
        } else if self.looping {
            self.index = 0;
        } else {
            self.playing = false;
            return false;
        }
        true
    }
}

pub fn catalog(directory: &Path, initial: &Path) -> Result<Vec<PathBuf>, String> {
    let mut paths = std::fs::read_dir(directory)
        .map_err(|e| format!("{}: {e}", directory.display()))?
        .map(|entry| entry.map(|entry| entry.path()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    paths.retain(|path| {
        path.is_file()
            && (path.to_string_lossy().ends_with(".snapshot.json")
                || path.extension().is_some_and(|ext| ext == "jsonl"))
    });
    if !paths.iter().any(|path| path == initial) {
        paths.push(initial.to_path_buf());
    }
    paths.sort();
    Ok(paths)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn real_capture_is_preserved_after_failed_reload_and_playback_keeps_timestamps() {
        let path = Path::new(FIXTURES).join("lmu47.snapshot.json");
        let mut scene = Scene::open(path).expect("captura obligatoria");
        assert_eq!(scene.snapshot().state.cars.len(), 47);
        let original = scene.snapshot().clone();
        assert!(!scene.replace(PathBuf::from("missing.scene")));
        assert_eq!(scene.snapshot(), &original);
        scene.frames.push(Snapshot {
            sequence: original.sequence + 1,
            origin: vantare_domain::Origin {
                received_at: original.origin.received_at + Duration::from_millis(40),
                ..original.origin
            },
            ..original.clone()
        });
        scene.play();
        assert_eq!(scene.delay(), Duration::from_millis(40));
        assert!(scene.advance());
        assert!(!scene.advance());
        assert!(!scene.playing);
        scene.looping = true;
        scene.play();
        assert_eq!(scene.index(), 0);
        assert!(scene.advance());
        assert!(scene.advance());
        assert_eq!(scene.snapshot(), &original);
        scene.step(false);
        assert!(!scene.playing);
        assert_eq!(scene.index(), 0);
    }

    #[test]
    fn every_existing_fixture_decodes_and_empty_or_unordered_replays_fail() {
        let paths = catalog(
            Path::new(FIXTURES),
            &Path::new(FIXTURES).join("lmu47.snapshot.json"),
        )
        .expect("catálogo");
        assert!(!paths.is_empty());
        for path in paths {
            assert!(!Scene::open(path).expect("fixture válido").is_empty());
        }
        let path =
            std::env::temp_dir().join(format!("vantare-hub-scene-{}.jsonl", std::process::id()));
        std::fs::write(&path, "").expect("vacío");
        assert!(Scene::open(path.clone()).is_err());
        let frame = std::fs::read_to_string(Path::new(FIXTURES).join("lmu47.snapshot.json"))
            .expect("captura");
        let snapshot = vantare_ipc::snapshot_from_json(&frame).expect("captura válida");
        let json = vantare_ipc::snapshot_to_json(&snapshot).expect("serializa");
        std::fs::write(&path, format!("{json}\n{json}\n")).expect("duplicado");
        assert!(Scene::open(path.clone()).is_err());
        std::fs::remove_file(path).expect("limpiar prueba");
    }
}
