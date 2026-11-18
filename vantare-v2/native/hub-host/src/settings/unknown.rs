//! Campos del fichero de ajustes que este build no conoce (ISA-2624).
//!
//! Un build de un canal anterior no debe rechazar un `hub-settings.json` que trae
//! campos de una versión más nueva: se apartan al leer, no cuentan para la lógica
//! y se reinyectan al guardar. Viven solo aquí, nunca en los tipos del cable.
use super::model::{AppearanceSettings, Preferences};
use super::store::{Document, Legacy};
use serde::Serialize;
use serde_json::{Map, Value};

type Fields = Map<String, Value>;

const ROOT_KEYS: [&str; 5] = ["version", "general", "appearance", "zoom", "migrationPending"];

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(super) struct Unknown {
    root: Fields,
    general: Fields,
    appearance: Fields,
}

impl Unknown {
    /// Aparta del documento JSON los campos que no conoce; lo que queda se valida
    /// con el esquema estricto (tipos erróneos y versiones futuras siguen fallando).
    pub(super) fn take(document: &mut Value) -> Self {
        let mut unknown = Self::default();
        let Some(root) = document.as_object_mut() else {
            return unknown;
        };
        unknown.root = drain(root, &ROOT_KEYS.map(String::from));
        if let Some(general) = root.get_mut("general").and_then(Value::as_object_mut) {
            unknown.general = drain(general, &known_keys(&Preferences::default()));
        }
        if let Some(appearance) = root.get_mut("appearance").and_then(Value::as_object_mut) {
            unknown.appearance = drain(appearance, &known_keys(&AppearanceSettings::default()));
        }
        unknown
    }
}

/// Claves que el tipo escribe hoy; así la lista no se desincroniza del modelo.
fn known_keys<T: Serialize>(default: &T) -> Vec<String> {
    match serde_json::to_value(default) {
        Ok(Value::Object(object)) => object.keys().cloned().collect(),
        _ => Vec::new(),
    }
}

fn drain(object: &mut Fields, known: &[String]) -> Fields {
    let unknown: Vec<String> = object
        .keys()
        .filter(|key| !known.contains(key))
        .cloned()
        .collect();
    unknown
        .into_iter()
        .filter_map(|key| object.remove_entry(&key))
        .collect()
}

/// Los campos conocidos conservan su orden; los desconocidos van detrás.
#[derive(Serialize)]
struct Merged<'a, T: Serialize> {
    #[serde(flatten)]
    known: &'a T,
    #[serde(flatten)]
    extra: &'a Fields,
}

#[derive(Serialize)]
struct Encoded<'a> {
    version: u32,
    general: Merged<'a, Preferences>,
    appearance: Merged<'a, AppearanceSettings>,
    zoom: u16,
    #[serde(rename = "migrationPending", skip_serializing_if = "no_legacy")]
    migration_pending: &'a [Legacy],
    #[serde(flatten)]
    extra: &'a Fields,
}

fn no_legacy(items: &&[Legacy]) -> bool {
    items.is_empty()
}

pub(super) fn encode(document: &Document) -> Result<Vec<u8>, serde_json::Error> {
    let unknown = &document.unknown;
    serde_json::to_vec_pretty(&Encoded {
        version: document.version,
        general: Merged {
            known: &document.general,
            extra: &unknown.general,
        },
        appearance: Merged {
            known: &document.appearance,
            extra: &unknown.appearance,
        },
        zoom: document.zoom,
        migration_pending: &document.migration_pending,
        extra: &unknown.root,
    })
}
