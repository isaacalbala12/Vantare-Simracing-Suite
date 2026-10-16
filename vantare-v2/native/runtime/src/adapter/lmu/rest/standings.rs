//! Conserva solo los campos consumidos, validando también el JSON descartado.
use serde::de::{self, Deserialize, Deserializer, MapAccess, SeqAccess, Visitor};
use serde_json::{Map, Value};
use std::fmt;

pub(super) struct Row(pub Map<String, Value>);

impl<'de> Deserialize<'de> for Row {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct Fields;
        impl<'de> Visitor<'de> for Fields {
            type Value = Row;
            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("una fila de standings")
            }
            fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<Row, M::Error> {
                let mut fields = Map::new();
                while let Some(key) = map.next_key::<String>()? {
                    if matches!(
                        key.as_str(),
                        "slotID" | "carNumber" | "vehicleName" | "pitstops" | "veFraction" | "flag"
                    ) {
                        // Igual que Value: una propiedad repetida conserva la última.
                        fields.insert(key, map.next_value::<Value>()?);
                    } else {
                        map.next_value::<CheckedDiscard>()?;
                    }
                }
                Ok(Row(fields))
            }
        }
        deserializer.deserialize_map(Fields)
    }
}

/// `IgnoredAny` no convierte números y admite 1e400; `Value` los rechaza. Este
/// visitante conserva esa validación sin construir árboles de datos ignorados.
struct CheckedDiscard;
impl<'de> Deserialize<'de> for CheckedDiscard {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct Discard;
        impl<'de> Visitor<'de> for Discard {
            type Value = CheckedDiscard;
            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("un valor JSON válido")
            }
            fn visit_bool<E: de::Error>(self, _: bool) -> Result<Self::Value, E> {
                Ok(CheckedDiscard)
            }
            fn visit_i64<E: de::Error>(self, _: i64) -> Result<Self::Value, E> {
                Ok(CheckedDiscard)
            }
            fn visit_u64<E: de::Error>(self, _: u64) -> Result<Self::Value, E> {
                Ok(CheckedDiscard)
            }
            fn visit_f64<E: de::Error>(self, value: f64) -> Result<Self::Value, E> {
                if value.is_finite() {
                    Ok(CheckedDiscard)
                } else {
                    Err(E::custom("número fuera de rango"))
                }
            }
            fn visit_str<E: de::Error>(self, _: &str) -> Result<Self::Value, E> {
                Ok(CheckedDiscard)
            }
            fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> {
                Ok(CheckedDiscard)
            }
            fn visit_seq<S: SeqAccess<'de>>(self, mut seq: S) -> Result<Self::Value, S::Error> {
                while seq.next_element::<CheckedDiscard>()?.is_some() {}
                Ok(CheckedDiscard)
            }
            fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<Self::Value, M::Error> {
                while map.next_key::<CheckedDiscard>()?.is_some() {
                    map.next_value::<CheckedDiscard>()?;
                }
                Ok(CheckedDiscard)
            }
        }
        deserializer.deserialize_any(Discard)
    }
}
