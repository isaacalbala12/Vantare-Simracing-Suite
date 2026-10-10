use crate::Settings;
use std::{
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
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
        self.validate()?;
        let mut saved = self.clone();
        saved.settings = saved.settings.normalized();
        let bytes = serde_json::to_vec(&saved).map_err(|error| error.to_string())?;
        if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
            std::fs::create_dir_all(parent).map_err(|error| format!("crear ajustes: {error}"))?;
        }
        let temporary = path.with_extension("json.tmp");
        std::fs::write(&temporary, bytes).map_err(|error| format!("guardar ajustes: {error}"))?;
        std::fs::rename(&temporary, path).map_err(|error| format!("reemplazar ajustes: {error}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Kind;

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
}
