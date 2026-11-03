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
    #[serde(default = "default_zoom", deserialize_with = "read_zoom")]
    pub zoom: u16,
    #[serde(
        default,
        rename = "migrationPending",
        skip_serializing_if = "Vec::is_empty"
    )]
    pub migration_pending: Vec<Legacy>,
}
impl Default for Document {
    fn default() -> Self {
        Self {
            version: 2,
            general: Preferences::default(),
            appearance: AppearanceSettings::default(),
            zoom: 100,
            migration_pending: Vec::new(),
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(in crate::shell) enum Legacy {
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
                    document.general = serde_json::from_value(value).expect("validated general");
                }
                Legacy::Appearance => {
                    document.appearance =
                        super::appearance::read_settings(&value).expect("validated appearance");
                }
                Legacy::Zoom => {
                    document.zoom = serde_json::from_value(value).expect("validated zoom");
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
    mirror_protected: Option<String>,
    repair_zoom: bool,
    pending: Option<(Document, Document)>,
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
        let mut mirror_observed = None;
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
            if kind == Legacy::Appearance {
                mirror_observed.clone_from(&source.observed);
            }
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
        let mut store = Self::empty(root, value, mirror_observed);
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
    fn empty(root: &Path, value: Document, mirror_observed: Option<Vec<u8>>) -> Self {
        Self {
            value,
            warning: None,
            mirror_warning: None,
            path: root.join(FILE),
            observed: None,
            protected: false,
            mirror: root.join("appearance.json"),
            mirror_observed,
            mirror_protected: None,
            repair_zoom: false,
            pending: None,
        }
    }
    fn open_current(root: &Path) -> Self {
        let mut repair_zoom = false;
        let opened = Doc::open_or_quarantine(
            &root.join(FILE),
            &Options {
                limit: LIMIT,
                ..Default::default()
            },
            |bytes| {
                let value: Value = serde_json::from_slice(bytes)
                    .map_err(|e| Error::InvalidInput(e.to_string()))?;
                if !matches!(value.get("version").and_then(Value::as_u64), Some(2 | 3)) {
                    files::future_version(&value, "version", 3)?;
                }
                repair_zoom = !matches!(
                    value.get("zoom").and_then(Value::as_u64),
                    Some(90 | 100 | 110 | 125)
                );
                let mut doc: Document = serde_json::from_slice(bytes)
                    .map_err(|e| Error::InvalidInput(e.to_string()))?;
                if doc.version == 2 && !doc.migration_pending.is_empty() {
                    return Err(Error::InvalidInput("Documento de ajustes no válido".into()));
                }
                clamp(&mut doc.appearance);
                repair_zoom = bad_zoom;
                Ok(doc)
            },
            Document::default,
        );
        let mirror = Doc::open_or_quarantine(
            &root.join("appearance.json"),
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
        let mirror_protected = (mirror.warning.is_some() && mirror.observed.is_none())
            .then(|| mirror.warning.clone().expect("protected mirror warning"));
        let mut store = Self::empty(root, opened.value, mirror.observed);
        store.protected = opened.warning.is_some() && opened.observed.is_none();
        store.observed = opened.observed;
        store.mirror_protected = mirror_protected;
        store.warning = opened.warning.or(mirror.warning);
        store.repair_zoom = repair_zoom && !store.protected;
        if store.repair_zoom {
            store.warning = Some(format!(
                "{}: zoom inválido; se usa 100. Se conservará copia .bak al guardar.",
                store.path.display()
            ));
        }
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
        let result = files::save(
            &self.path,
            &bytes,
            Mode::Observed(self.observed.as_deref()),
            &Options {
                limit: LIMIT,
                backup: self.repair_zoom,
                ..Default::default()
            },
        );
        if let Err(error) = result {
            if error.kind().is_conflict() {
                let previous = self.value.clone();
                let root = self.path.parent().expect("settings parent");
                let mut current = Self::open_current(root);
                current.value.general.startup = previous.general.startup;
                current.pending = Some((previous, value));
                if self.mirror_protected.is_some() {
                    current.mirror_protected.clone_from(&self.mirror_protected);
                }
                *self = current;
            }
            return Err(error);
        }
        self.warning = None;
        self.repair_zoom = false;
        self.pending = None;
        self.value = value;
        self.observed = Some(bytes);
        Ok(())
    }
    fn ensure_section(&self, section: Legacy) -> Result<(), String> {
        if self.value.migration_pending.contains(&section) {
            return Err(format!(
                "{}: {} pendiente de migración; sección protegida",
                self.path.display(),
                section.file()
            ));
        }
        Ok(())
    }
    pub fn has_pending(&self) -> bool {
        self.pending.is_some()
    }
    pub fn retry(&mut self) -> Result<(), String> {
        let Some((base, desired)) = self.pending.clone() else {
            return Ok(());
        };
        let next = rebase(&base, &desired, &self.value);
        if base.appearance != desired.appearance {
            self.save_appearance(next.appearance)
        } else if base.general != desired.general {
            self.save_general(next.general)
        } else {
            self.save_zoom(next.zoom)
        }
    }
    pub fn warning_text(&self) -> Option<String> {
        let warnings: Vec<_> = self
            .warning
            .iter()
            .chain(self.mirror_protected.iter())
            .chain(self.mirror_warning.iter())
            .map(String::as_str)
            .collect();
        (!warnings.is_empty()).then(|| warnings.join("; "))
    }
    pub fn save_general(&mut self, general: Preferences) -> Result<(), String> {
        self.ensure_section(Legacy::General)?;
        let mut next = self.value.clone();
        next.general = general;
        self.commit(next).map_err(Into::into)
    }
    pub fn save_zoom(&mut self, zoom: u16) -> Result<(), String> {
        self.ensure_section(Legacy::Zoom)?;
        if !matches!(zoom, 90 | 100 | 110 | 125) {
            return Err("Tamaño de interfaz no válido".into());
        }
        let mut next = self.value.clone();
        next.zoom = zoom;
        self.commit(next).map_err(Into::into)
    }
    pub fn save_appearance(&mut self, mut appearance: AppearanceSettings) -> Result<(), String> {
        self.ensure_section(Legacy::Appearance)?;
        clamp(&mut appearance);
        let mut next = self.value.clone();
        next.appearance = appearance;
        self.commit(next).map_err(String::from)?;
        // TODO(#1869 paso 7+8): retirar el espejo cuando layout tenga una política compatible de versión.
        let result = if let Some(reason) = &self.mirror_protected {
            Err(Error::Unsupported(format!("espejo protegido: {reason}")))
        } else {
            serde_json::to_vec_pretty(&super::appearance::StoredAppearance {
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
            })
        };
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

fn read_zoom<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<u16, D::Error> {
    let value = Value::deserialize(deserializer)?;
    Ok(match value.as_u64() {
        Some(90) => 90,
        Some(110) => 110,
        Some(125) => 125,
        _ => 100,
    })
}

/// Solo reaplica las claves editadas; las otras decisiones del ganador sobreviven.
fn rebase(base: &Document, desired: &Document, current: &Document) -> Document {
    let base = serde_json::to_value(base).expect("settings serialize");
    let desired = serde_json::to_value(desired).expect("settings serialize");
    let startup = current.general.startup;
    let mut current = serde_json::to_value(current).expect("settings serialize");
    for section in ["general", "appearance"] {
        for (key, value) in desired[section].as_object().expect("settings section") {
            if base[section][key] != *value {
                current[section][key] = value.clone();
            }
        }
    }
    if base["zoom"] != desired["zoom"] {
        current["zoom"] = desired["zoom"].clone();
    }
    let mut next: Document = serde_json::from_value(current).expect("validated settings rebase");
    next.general.startup = startup;
    next
}

const fn default_zoom() -> u16 {
    100
}

#[cfg(test)]
mod tests;
