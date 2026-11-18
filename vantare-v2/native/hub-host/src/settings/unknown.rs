//! Campos del fichero de ajustes que este build no conoce (ISA-2624).
//!
//! Un build de un canal anterior no debe rechazar un `hub-settings.json` que trae
//! campos de una versión más nueva: se apartan al leer, no cuentan para la lógica
//! y se reinyectan al guardar. Viven solo aquí, nunca en los tipos del cable.
//! El residuo se guarda ordenado recursivamente (`docs/json-order.md`), con o sin
//! `preserve_order`. `general.startup` es `serde(skip)`: no es clave conocida, así
//! que un `startup` del fichero se conserva como desconocido y se reescribe.
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
    let mut fields = Value::Object(
        unknown
            .into_iter()
            .filter_map(|key| object.remove_entry(&key))
            .collect(),
    );
    fields.sort_all_objects();
    match fields {
        Value::Object(fields) => fields,
        _ => Fields::new(),
    }
}

/// Defensa al escribir: si una clave del residuo coincidiera con una conocida,
/// gana la conocida y no se duplica.
fn without(fields: &Fields, known: &[String]) -> Fields {
    fields
        .iter()
        .filter(|(key, _)| !known.contains(key))
        .map(|(key, value)| (key.clone(), value.clone()))
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
    let root = without(&unknown.root, &ROOT_KEYS.map(String::from));
    let general = without(&unknown.general, &known_keys(&Preferences::default()));
    let appearance = without(&unknown.appearance, &known_keys(&AppearanceSettings::default()));
    serde_json::to_vec_pretty(&Encoded {
        version: document.version,
        general: Merged {
            known: &document.general,
            extra: &general,
        },
        appearance: Merged {
            known: &document.appearance,
            extra: &appearance,
        },
        zoom: document.zoom,
        migration_pending: &document.migration_pending,
        extra: &root,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn root_keys_match_the_serialized_document_fields() {
        let document = Document {
            migration_pending: vec![Legacy::Zoom],
            ..Document::default()
        };
        let Value::Object(object) = serde_json::to_value(&document).unwrap() else {
            panic!("document is an object");
        };
        let mut serialized: Vec<_> = object.keys().map(String::as_str).collect();
        let mut listed = ROOT_KEYS.to_vec();
        serialized.sort_unstable();
        listed.sort_unstable();
        assert_eq!(serialized, listed);
    }

    #[test]
    fn a_residue_key_that_collides_with_a_known_one_loses_without_duplicating() {
        let mut document = Document::default();
        document.general.updates = false;
        let colliding = [
            (&mut document.unknown.root, "version"),
            (&mut document.unknown.general, "updates"),
            (&mut document.unknown.appearance, "contrast"),
        ];
        for (fields, key) in colliding {
            fields.insert(key.into(), Value::from("stale"));
            fields.insert("future".into(), Value::from(1));
        }
        let text = String::from_utf8(encode(&document).unwrap()).unwrap();
        for key in ["version", "updates", "contrast"] {
            assert_eq!(text.matches(&format!("\"{key}\"")).count(), 1, "{key}");
        }
        assert!(!text.contains("stale"));
        assert_eq!(text.matches("\"future\"").count(), 3);
        assert!(text.contains("\"updates\": false"));
    }
}
