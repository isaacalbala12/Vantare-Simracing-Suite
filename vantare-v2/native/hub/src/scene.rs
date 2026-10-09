//! Escenas reales o fixtures explícitos: el Workshop no fabrica telemetría.
use std::path::{Path, PathBuf};
use std::time::Duration;

use vantare_domain::Snapshot;

use crate::files;

const MAX_SCENE_BYTES: u64 = 16 * 1024 * 1024;
const MAX_FRAMES: usize = 512;

pub const FIXTURES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../ui/fixtures");

/// Raiz de fixtures resuelta **en runtime**.
///
/// `FIXTURES` es una ruta absoluta de la maquina de compilacion: no existe en
/// un equipo donde solo se instalo el paquete, y usarla al arrancar dejaba al
/// Hub sin abrir ventana. Se prefiere la copia que viaja junto al ejecutable
/// (`bin/fixtures`) y solo se cae a la de desarrollo si esa existe.
pub fn fixtures_root() -> Option<std::path::PathBuf> {
    if let Some(dir) = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|parent| parent.join("fixtures")))
        .filter(|dir| dir.is_dir())
    {
        return Some(dir);
    }
    let development = std::path::PathBuf::from(FIXTURES);
    development.is_dir().then_some(development)
}

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
    decode(text, path.extension().is_some_and(|ext| ext == "jsonl"))
}

fn decode(text: &str, jsonl: bool) -> Result<Vec<Snapshot>, String> {
    let photos: Vec<String> = if jsonl {
        text.lines()
            .take(MAX_FRAMES + 1)
            .map(str::to_owned)
            .collect()
    } else if text.trim_start().starts_with('[') {
        let values: Vec<serde_json::Value> =
            serde_json::from_str(text).map_err(|e| format!("secuencia JSON inválida: {e}"))?;
        values.into_iter().map(|value| value.to_string()).collect()
    } else {
        vec![text.to_owned()]
    };
    if photos.len() > MAX_FRAMES {
        return Err("escena supera 512 fotos".into());
    }
    let mut frames = Vec::new();
    for (line, text) in photos.iter().enumerate() {
        let next = vantare_ipc::snapshot_from_saved_json(text)
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
            if self.playing {
                self.playing = false;
                return;
            }
            if self.index + 1 == self.frames.len() {
                self.index = 0;
            }
            self.playing = true;
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
    let mut paths = match std::fs::read_dir(directory) {
        Ok(entries) => entries
            .map(|entry| entry.map(|entry| entry.path()))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?,
        // Sin catalogo instalado la escena abierta sigue siendo seleccionable.
        // Es preferible a abortar el arranque del Hub con un error de E/S.
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
        Err(error) => return Err(format!("{}: {error}", directory.display())),
    };
    paths.retain(|path| {
        path.is_file()
            && (path.to_string_lossy().ends_with(".snapshot.json")
                || path.to_string_lossy().ends_with(".sequence.json")
                || path.extension().is_some_and(|ext| ext == "jsonl"))
    });
    if !paths.iter().any(|path| path == initial) {
        paths.push(initial.to_path_buf());
    }
    paths.sort();
    Ok(paths)
}

/// Indica si `path` es una escena admisible: existe y vive bajo `directory`,
/// con ambos canonicalizados.
///
/// Hacia falta porque el catálogo REINYECTA la escena abierta (`catalog`), de
/// modo que la comprobacion de pertenencia de `workshop.rs` siempre acertaba y
/// cualquier ruta acababa en el selector. El estado guardado
/// (`workshop-selection.json`) puede plantarlo un tercero, asi que no se acepta
/// una ruta arbitraria.
pub fn confined_to(path: &Path, directory: &Path) -> bool {
    let (Ok(root), Ok(candidate)) = (directory.canonicalize(), path.canonicalize()) else {
        return false;
    };
    candidate.starts_with(&root) && candidate.is_file()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_arrays_use_the_current_dto_and_reject_invalid_order_limits_or_version() {
        let original =
            Scene::open(Path::new(FIXTURES).join("lmu47.snapshot.json")).expect("corpus");
        let first = original.snapshot().clone();
        let mut second = first.clone();
        second.sequence += 1;
        second.origin.received_at += Duration::from_millis(40);
        let json = |snapshot: &Snapshot| vantare_ipc::snapshot_to_json(snapshot).expect("DTO");
        let (a, b) = (json(&first), json(&second));
        let frames = decode(&format!("[{a},{b}]"), false).expect("secuencia JSON");
        assert_eq!(frames, vec![first.clone(), second.clone()]);
        assert_eq!(decode(&a, false).expect("foto única"), vec![first.clone()]);
        assert_eq!(decode(&format!("{a}\n{b}"), true).expect("JSONL"), frames);
        for text in [
            "[]".into(),
            "[null]".into(),
            format!("[{a},{a}]"),
            format!("[{b},{a}]"),
        ] {
            assert!(decode(&text, false).is_err());
        }
        second.epoch += 1;
        assert!(decode(&format!("[{a},{}]", json(&second)), false).is_err());
        second.epoch = first.epoch;
        second.origin.received_at = Duration::ZERO;
        assert!(decode(&format!("[{a},{}]", json(&second)), false).is_err());
        let mut old: serde_json::Value = serde_json::from_str(&a).expect("JSON");
        old["version"] = 3.into();
        assert!(decode(&format!("[{old}]"), false).is_err());
        assert!(decode(&format!("[{}]", vec![a; MAX_FRAMES + 1].join(",")), false).is_err());
    }

    #[test]
    fn saved_v7_and_v8_scene_files_load_without_rewriting_user_data() {
        let current = std::fs::read_to_string(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../ipc/tests/fixtures/saved-v8.snapshot.json"),
        )
        .expect("escena v8 conservada de 5e1da3f6");
        let expected = decode(&current, false).expect("dato v8 original");
        for version in [7, 8] {
            let mut old: serde_json::Value = serde_json::from_str(&current).expect("JSON");
            old["version"] = version.into();
            let bytes = old.to_string();
            let path = std::env::temp_dir().join(format!(
                "saved-1530-{}-{version}.snapshot.json",
                std::process::id()
            ));
            std::fs::write(&path, &bytes).expect("guardar");
            let scene = Scene::open(path.clone()).expect("abrir escena histórica");
            assert_eq!(scene.snapshot(), &expected[0]);
            assert_eq!(std::fs::read_to_string(&path).expect("original"), bytes);
            std::fs::remove_file(path).expect("limpiar escena de prueba");
        }
    }

    #[test]
    fn pause_on_last_photo_preserves_cursor_and_single_photo_cannot_play() {
        let mut scene = Scene::open(Path::new(FIXTURES).join("lmu47.snapshot.json")).expect("foto");
        scene.play();
        assert!(!scene.playing);
        scene.frames.push(scene.snapshot().clone());
        scene.play();
        scene.advance();
        scene.play();
        assert!(!scene.playing);
        assert_eq!(scene.index(), 1);
        scene.play();
        assert!(scene.playing);
        assert_eq!(scene.index(), 0);
        scene.seek(1).expect("última foto");
        assert!(!scene.playing);
        assert!(scene.seek(2).is_err());
        scene.step(true);
        assert_eq!(scene.index(), 1);
        scene.rewind();
        assert_eq!(scene.index(), 0);
    }

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
        let snapshot = vantare_ipc::snapshot_from_saved_json(&frame).expect("captura válida");
        let json = vantare_ipc::snapshot_to_json(&snapshot).expect("serializa");
        std::fs::write(&path, format!("{json}\n{json}\n")).expect("duplicado");
        assert!(Scene::open(path.clone()).is_err());
        std::fs::remove_file(path).expect("limpiar prueba");
    }
    #[test]
    fn only_paths_under_the_catalog_are_confined() {
        let root =
            std::env::temp_dir().join(format!("vantare-scene-confine-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).expect("directorio de prueba");
        let inside = root.join("standings.snapshot.json");
        std::fs::write(&inside, b"{}").expect("escena interna");
        let outside = std::env::temp_dir().join(format!(
            "vantare-scene-confine-outside-{}.json",
            std::process::id()
        ));
        std::fs::write(&outside, b"{}").expect("escena externa");

        assert!(
            confined_to(&inside, &root),
            "una escena del catalogo se acepta"
        );
        assert!(
            !confined_to(&outside, &root),
            "una escena externa se rechaza"
        );
        assert!(!confined_to(&root.join("no-existe.json"), &root));
        assert!(!confined_to(&root, &root), "un directorio no es una escena");

        let _ = std::fs::remove_file(&outside);
        let _ = std::fs::remove_dir_all(&root);
    }
}
