//! Usa el mismo guardado atómico y detección de conflictos que los demás ajustes.
use std::path::{Path, PathBuf};
use vantare_services::diagnostics::{PRIVACY_FILE, Privacy};

pub(super) struct Store {
    pub value: Privacy,
    path: PathBuf,
    observed: Option<Vec<u8>>,
}
impl Store {
    pub fn load(root: &Path) -> Result<Self, String> {
        let path = root.join(PRIVACY_FILE);
        let observed = match std::fs::metadata(&path) {
            Ok(_) => Some(crate::files::read(&path, 1024)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(format!("leer privacidad: {error}")),
        };
        let value = Privacy::load(root).map_err(|error| format!("leer privacidad: {error}"))?;
        Ok(Self {
            value,
            path,
            observed,
        })
    }
    pub fn save(&mut self, value: Privacy) -> Result<(), String> {
        let bytes =
            serde_json::to_vec(&value).map_err(|error| format!("guardar privacidad: {error}"))?;
        crate::files::save(&self.path, &bytes, self.observed.as_deref())?;
        self.observed = Some(bytes);
        self.value = value;
        Ok(())
    }
}

impl super::Hub {
    pub(super) fn settings_privacy_toggle(&mut self, usage: bool, cx: &mut gpui::Context<Self>) {
        if let Ok(store) = &mut self.settings.privacy {
            let mut next = store.value;
            if usage {
                next.usage = !next.usage;
            } else {
                next.crashes = !next.crashes;
            }
            self.settings.status = store.save(next).err();
        }
        cx.notify();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn persists_both_switches_and_preserves_changes_on_conflict() {
        let path = std::env::temp_dir().join(format!(
            "vantare-privacy-{}",
            vantare_services::random_id().expect("entropy")
        ));
        let mut first = Store::load(&path).expect("load");
        let mut second = Store::load(&path).expect("load");
        assert_eq!(first.value, Privacy::default());
        let next = Privacy {
            crashes: false,
            usage: true,
        };
        first.save(next).expect("save");
        assert_eq!(Store::load(&path).expect("reload").value, next);
        assert!(second.save(Privacy::default()).is_err());
        assert_eq!(Store::load(&path).expect("reload").value, next);
        std::fs::write(path.join(PRIVACY_FILE), b"invalid").expect("invalid config");
        assert!(Store::load(&path).is_err());
        std::fs::remove_dir_all(path).expect("cleanup");
    }
}
