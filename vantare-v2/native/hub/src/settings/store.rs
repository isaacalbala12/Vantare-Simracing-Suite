//! Documento agregado del Hub; migración pura y publicación con CAS.
use super::general::Preferences;
use crate::orbit::theme::AppearanceSettings;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use vantare_ipc::files::{self, Doc, Error, Mode, Options};

const LIMIT: u64 = 32 * 1024;
pub(in crate::shell) const FILE: &str = "hub-settings.json";
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(in crate::shell) struct Document {
    pub version: u32,
    pub general: Preferences,
    pub appearance: AppearanceSettings,
    pub zoom: u16,
}
impl Default for Document {
    fn default() -> Self {
        Self {
            version: 2,
            general: Preferences::default(),
            appearance: AppearanceSettings::default(),
            zoom: 100,
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Legacy {
    General,
    Appearance,
    Zoom,
}
impl Legacy {
    fn file(self) -> &'static str {
        match self {
            Self::General => "general.json",
            Self::Appearance => "appearance.json",
            Self::Zoom => "hub-zoom.json",
        }
    }
    fn limit(self) -> u64 {
        match self {
            Self::General => 4096,
            Self::Appearance => 16 * 1024,
            Self::Zoom => 128,
        }
    }
    fn parse(self, mut value: Value) -> Result<Value, Error> {
        match self {
            Self::General => {
                if let Some(object) = value.as_object_mut() {
                    for field in ["startup", "onboarding_simulators", "onboarding_automatic"] {
                        object.remove(field);
                    }
                }
                serde_json::from_value::<Preferences>(value.clone())
                    .map_err(|e| Error::InvalidInput(e.to_string()))?;
            }
            Self::Appearance => {
                super::appearance::read_settings(&value)?;
            }
            Self::Zoom => {
                if !matches!(value.as_u64(), Some(90 | 100 | 110 | 125)) {
                    return Err(Error::InvalidInput("Tamaño de interfaz no válido".into()));
                }
            }
        }
        Ok(value)
    }
}
/// Sin E/S: las lápidas y la paleta antigua solo se interpretan aquí.
pub(super) fn migrate_v1(
    general: Option<Value>,
    appearance: Option<Value>,
    zoom: Option<Value>,
    layout_preexisted: bool,
) -> (Document, Vec<Legacy>) {
    let mut document = Document::default();
    let mut warnings = Vec::new();
    if general.is_none() {
        document.general.onboarding_completed = layout_preexisted;
    }
    for (kind, value) in [
        (Legacy::General, general),
        (Legacy::Appearance, appearance),
        (Legacy::Zoom, zoom),
    ] {
        let Some(value) = value else { continue };
        match kind.parse(value) {
            Ok(value) => match kind {
                Legacy::General => {
                    document.general = serde_json::from_value(value).expect("validated general")
                }
                Legacy::Appearance => {
                    document.appearance =
                        super::appearance::read_settings(&value).expect("validated appearance")
                }
                Legacy::Zoom => {
                    document.zoom = serde_json::from_value(value).expect("validated zoom")
                }
            },
            Err(_) => warnings.push(kind),
        }
    }
    (document, warnings)
}

pub(in crate::shell) struct Store {
    pub value: Document,
    pub warning: Option<String>,
    pub mirror_warning: Option<String>,
    path: PathBuf,
    observed: Option<Vec<u8>>,
    protected: bool,
    mirror: PathBuf,
    mirror_observed: Option<Vec<u8>>,
}
impl Store {
    pub fn load(root: &Path, layout_preexisted: bool) -> Self {
        let path = root.join(FILE);
        // Solo confirma ausencia: un error de inspección se trata como documento protegido.
        if !matches!(path.try_exists(), Ok(false)) {
            return Self::open_current(root);
        }
        let mut sources = Vec::new();
        let mut warnings = Vec::new();
        let mut protected = false;
        for kind in [Legacy::General, Legacy::Appearance, Legacy::Zoom] {
            let source = Doc::open_or_quarantine(
                &root.join(kind.file()),
                &Options {
                    limit: kind.limit(),
                    ..Default::default()
                },
                |bytes| {
                    let value = serde_json::from_slice(bytes)
                        .map_err(|e| Error::InvalidInput(format!("JSON: {e}")))?;
                    kind.parse(value).map(Some)
                },
                || None,
            );
            protected |= source.warning.is_some() && source.observed.is_none();
            let value = if source.warning.is_some() && source.observed.is_some() {
                Some(match kind {
                    Legacy::Zoom => serde_json::json!(100),
                    _ => serde_json::json!({}),
                })
            } else {
                source.value
            };
            if let Some(warning) = source.warning {
                warnings.push(warning);
            }
            sources.push(value);
        }
        let (value, _) = migrate_v1(
            sources.remove(0),
            sources.remove(0),
            sources.remove(0),
            layout_preexisted,
        );
        let mut store = Self::empty(root, value);
        store.protected = protected;
        store.publish_migration(root, warnings)
    }
    fn publish_migration(mut self, root: &Path, mut warnings: Vec<String>) -> Self {
        if !self.protected {
            match self.commit(self.value.clone()) {
                Ok(()) => {}
                Err(error) if error.kind().is_conflict() => return Self::open_current(root),
                Err(error) => warnings.push(error.to_string()),
            }
        }
        self.warning = (!warnings.is_empty()).then(|| warnings.join("; "));
        self
    }
    fn empty(root: &Path, value: Document) -> Self {
        let mirror = root.join("appearance.json");
        let opened = Doc::open_or_quarantine(
            &mirror,
            &Options {
                limit: 16 * 1024,
                ..Default::default()
            },
            |bytes| {
                let value = serde_json::from_slice(bytes)
                    .map_err(|error| Error::InvalidInput(format!("Apariencia: {error}")))?;
                super::appearance::read_settings(&value)
            },
            AppearanceSettings::default,
        );
        Self {
            value,
            warning: opened.warning,
            mirror_warning: None,
            path: root.join(FILE),
            observed: None,
            protected: false,
            mirror_observed: opened.observed,
            mirror,
        }
    }
    fn open_current(root: &Path) -> Self {
        let opened = Doc::open_or_quarantine(
            &root.join(FILE),
            &Options {
                limit: LIMIT,
                ..Default::default()
            },
            |bytes| {
                let value: Value = serde_json::from_slice(bytes)
                    .map_err(|e| Error::InvalidInput(e.to_string()))?;
                files::future_version(&value, "version", 2)?;
                let mut doc: Document = serde_json::from_slice(bytes)
                    .map_err(|e| Error::InvalidInput(e.to_string()))?;
                if doc.version != 2 || !matches!(doc.zoom, 90 | 100 | 110 | 125) {
                    return Err(Error::InvalidInput("Documento de ajustes no válido".into()));
                }
                clamp(&mut doc.appearance);
                Ok(doc)
            },
            Document::default,
        );
        let mut store = Self::empty(root, opened.value);
        store.protected = opened.warning.is_some() && opened.observed.is_none();
        store.observed = opened.observed;
        store.warning = opened.warning;
        store
    }
    fn commit(&mut self, value: Document) -> Result<(), Error> {
        if self.protected {
            return Err(Error::Unsupported(format!(
                "{} protegido: {}",
                self.path.display(),
                self.warning.as_deref().unwrap_or("origen no recuperable")
            )));
        }
        let bytes =
            serde_json::to_vec_pretty(&value).map_err(|e| Error::InvalidInput(e.to_string()))?;
        files::save(
            &self.path,
            &bytes,
            Mode::Observed(self.observed.as_deref()),
            &Options {
                limit: LIMIT,
                ..Default::default()
            },
        )?;
        self.value = value;
        self.observed = Some(bytes);
        Ok(())
    }
    pub fn save_general(&mut self, general: Preferences) -> Result<(), String> {
        let mut next = self.value.clone();
        next.general = general;
        self.commit(next).map_err(Into::into)
    }
    pub fn save_zoom(&mut self, zoom: u16) -> Result<(), String> {
        if !matches!(zoom, 90 | 100 | 110 | 125) {
            return Err("Tamaño de interfaz no válido".into());
        }
        let mut next = self.value.clone();
        next.zoom = zoom;
        self.commit(next).map_err(Into::into)
    }
    pub fn save_appearance(&mut self, mut appearance: AppearanceSettings) -> Result<(), String> {
        clamp(&mut appearance);
        let mut next = self.value.clone();
        next.appearance = appearance;
        self.commit(next).map_err(String::from)?;
        // TODO(#1869 paso 7+8): retirar el espejo cuando layout tenga una política compatible de versión.
        let result = serde_json::to_vec_pretty(&super::appearance::StoredAppearance {
            palette_version: 1,
            settings: appearance,
        })
        .map_err(|e| Error::InvalidInput(e.to_string()))
        .and_then(|bytes| {
            files::save(
                &self.mirror,
                &bytes,
                Mode::Observed(self.mirror_observed.as_deref()),
                &Options {
                    limit: 16 * 1024,
                    ..Default::default()
                },
            )?;
            self.mirror_observed = Some(bytes);
            Ok(())
        });
        self.mirror_warning = result.err().map(|error| {
            format!(
                "Ajustes guardados en {}; no se pudo actualizar el espejo {}: {error}",
                self.path.display(),
                self.mirror.display()
            )
        });
        if let Some(warning) = &self.mirror_warning {
            eprintln!("{warning}");
        }
        Ok(())
    }
}
fn clamp(settings: &mut AppearanceSettings) {
    settings.contrast = settings.contrast.clamp(80, 120);
    settings.glass_opacity = settings.glass_opacity.clamp(50, 100);
}

#[cfg(test)]
mod tests;
