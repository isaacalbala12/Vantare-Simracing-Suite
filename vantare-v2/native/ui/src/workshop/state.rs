use crate::Settings;
use std::{
    hash::{Hash, Hasher},
    io::Write as _,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct Saved {
    pub version: u8,
    pub settings: Settings,
    pub scene: PathBuf,
    pub frame: usize,
    pub background: String,
    pub scale: f32,
    pub dimensions: Option<(f32, f32)>,
    pub study: String,
    pub preset: String,
    pub surface: String,
    pub comparison: Option<String>,
    pub language: String,
    pub player_position: Option<usize>,
    pub name_mode: String,
}

pub(super) fn path() -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("VANTARE_WORKSHOP_STATE") {
        return Ok(path.into());
    }
    let mut key = std::collections::hash_map::DefaultHasher::new();
    env!("CARGO_MANIFEST_DIR").hash(&mut key);
    Ok(crate::paths::default_data_dir()
        .map_err(str::to_owned)?
        .join("Vantare")
        .join(format!("workshop-{:016x}.json", key.finish())))
}

impl Saved {
    fn validate(&self) -> Result<(), String> {
        if self.version != 1
            || !self.scale.is_finite()
            || !(0.25..=4.0).contains(&self.scale)
            || !["context", "solid", "transparent", "grid"].contains(&self.background.as_str())
            || !["v1", "default", "v2-focus"].contains(&self.study.as_str())
            || self.dimensions.is_some_and(|(w, h)| {
                !w.is_finite()
                    || !h.is_finite()
                    || !(64.0..=3840.0).contains(&w)
                    || !(64.0..=2160.0).contains(&h)
            })
        {
            return Err("ajustes de Workshop inválidos; se conserva el fichero".into());
        }
        Ok(())
    }

    pub fn load(path: &Path) -> Result<Option<Self>, String> {
        let metadata = match std::fs::metadata(path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(format!("leer ajustes: {error}")),
        };
        if metadata.len() > 65_536 {
            return Err("ajustes de Workshop demasiado grandes".into());
        }
        let bytes = std::fs::read(path).map_err(|error| format!("leer ajustes: {error}"))?;
        let saved: Self =
            serde_json::from_slice(&bytes).map_err(|error| format!("leer ajustes: {error}"))?;
        saved.validate()?;
        Ok(Some(saved))
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        // Temporal único por intento con create_new: ni el otro escritor ni un
        // resto huérfano de un PID reutilizado pueden sobrescribirlo.
        static NEXT: AtomicU64 = AtomicU64::new(0);
        self.validate()?;
        let mut saved = self.clone();
        saved.settings = saved.settings.normalized();
        let bytes = serde_json::to_vec(&saved).map_err(|error| error.to_string())?;
        if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
            std::fs::create_dir_all(parent).map_err(|error| format!("crear ajustes: {error}"))?;
        }
        // Exclusión entre escritores: dos Workshop guardan en serie; el
        // segundo espera en vez de truncar o renombrar el temporal del primero.
        let lock = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(false)
            .open(path.with_extension("json.lock"))
            .map_err(|error| format!("bloquear ajustes: {error}"))?;
        lock.lock()
            .map_err(|error| format!("bloquear ajustes: {error}"))?;
        let mut attempt = NEXT.fetch_add(1, Ordering::Relaxed);
        let mut pending = loop {
            let candidate =
                path.with_extension(format!("json.{}.{}.tmp", std::process::id(), attempt));
            match std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&candidate)
            {
                Ok(file) => {
                    break PendingFile {
                        path: candidate,
                        file,
                    };
                }
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    attempt = NEXT.fetch_add(1, Ordering::Relaxed);
                }
                Err(error) => return Err(format!("guardar ajustes: {error}")),
            }
        };
        let failed = |error: std::io::Error| format!("guardar ajustes: {error}");
        pending.file.write_all(&bytes).map_err(failed)?;
        pending.file.sync_all().map_err(failed)?;
        // rename reemplaza el destino sin borrar primero los ajustes válidos.
        std::fs::rename(&pending.path, path).map_err(|error| format!("reemplazar ajustes: {error}"))
    }
}

/// Temporal en curso: al salir sin renombrar no deja restos que otro
/// escritor pueda confundir con un guardado válido.
struct PendingFile {
    path: PathBuf,
    file: std::fs::File,
}
impl Drop for PendingFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Kind;

    fn sample(frame: usize, background: &str) -> Saved {
        Saved {
            version: 1,
            settings: super::super::default_settings(Kind::Relative),
            scene: super::super::default_path(Kind::Relative),
            frame,
            background: background.into(),
            scale: 1.0,
            dimensions: None,
            study: "default".into(),
            preset: "1080p".into(),
            surface: "studio".into(),
            comparison: None,
            language: "es".into(),
            player_position: None,
            name_mode: "surname".into(),
        }
    }

    #[test]
    fn reopen_restores_selection_settings_background_scale_and_rejects_invalid_state() {
        let path = std::env::temp_dir().join(format!(
            "vantare-workshop-state-test-{}.json",
            std::process::id()
        ));
        let mut saved = Saved {
            version: 1,
            settings: super::super::default_settings(Kind::Relative),
            scene: super::super::default_path(Kind::Relative),
            frame: 2,
            background: "solid".into(),
            scale: 1.5,
            dimensions: Some((500.0, 300.0)),
            study: "v2-focus".into(),
            preset: "1080p".into(),
            surface: "studio".into(),
            comparison: Some("obs".into()),
            language: "en".into(),
            player_position: Some(3),
            name_mode: "surname".into(),
        };
        saved.save(&path).expect("save");
        let reopened = Saved::load(&path).expect("load").expect("saved");
        assert_eq!(reopened.settings.kind(), Kind::Relative);
        assert_eq!(reopened.scene, saved.scene);
        assert_eq!(reopened.background, "solid");
        assert_eq!(reopened.scale, 1.5);
        assert_eq!(reopened.dimensions, Some((500.0, 300.0)));
        saved.scale = 0.0;
        assert!(saved.save(&path).is_err());
        assert_eq!(
            Saved::load(&path).expect("preserved").expect("state").scale,
            1.5
        );
        std::fs::write(&path, b"{").expect("invalid json");
        assert!(Saved::load(&path).is_err());
        std::fs::remove_file(path).expect("cleanup");
    }

    /// Dos Workshop guardando el mismo estado a la vez nunca dejan un fichero
    /// a medias: cada lectura ve un guardado completo de uno de ellos (#1540).
    #[test]
    fn concurrent_saves_never_leave_torn_state() {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "vantare-workshop-race-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&dir).expect("directorio temporal");
        let path = dir.join("workshop.json");
        sample(1, "solid").save(&path).expect("semilla");
        let path = std::sync::Arc::new(path);
        let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let savers: Vec<_> = [(1, "solid"), (2, "grid")]
            .into_iter()
            .map(|(frame, background)| {
                let path = path.clone();
                let stop = stop.clone();
                std::thread::spawn(move || {
                    let saved = sample(frame, background);
                    let mut rounds = 0;
                    while !stop.load(Ordering::Relaxed) && rounds < 300 {
                        saved.save(&path).expect("guardado concurrente");
                        rounds += 1;
                    }
                    rounds
                })
            })
            .collect();
        for _ in 0..600 {
            match Saved::load(&path) {
                Ok(Some(saved)) => assert!(
                    (saved.frame == 1 && saved.background == "solid")
                        || (saved.frame == 2 && saved.background == "grid"),
                    "guardado a medias visible en el fichero"
                ),
                Ok(None) => panic!("el fichero desapareció durante guardados concurrentes"),
                Err(error) => panic!("fichero a medias durante guardados concurrentes: {error}"),
            }
        }
        stop.store(true, Ordering::Relaxed);
        for saver in savers {
            saver.join().expect("hilo de guardado");
        }
        std::fs::remove_dir_all(dir).expect("limpiar");
    }
}
