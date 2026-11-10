//! Minimal layout adapter. Only existing motion is interpreted/edited;
//! other values retain their original JSON representation. No GPUI dependency.
use serde::{
    Deserialize, Deserializer,
    de::{Error as _, MapAccess, Visitor},
};
use serde_json::value::RawValue;
use std::{
    collections::BTreeMap,
    fmt,
    path::{Path, PathBuf},
};
use vantare_ipc::files;
const LIMIT: u64 = 1024 * 1024;
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Change {
    Fallback,
    Saved,
    Conflict,
    Protected,
    Io,
}
#[derive(Default)]
struct Fields(BTreeMap<String, Box<RawValue>>);
impl<'de> Deserialize<'de> for Fields {
    fn deserialize<D: Deserializer<'de>>(input: D) -> Result<Self, D::Error> {
        struct Root;
        impl<'de> Visitor<'de> for Root {
            type Value = Fields;
            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("a layout object without duplicate keys")
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Fields, A::Error> {
                let mut fields = BTreeMap::new();
                while let Some((key, value)) = map.next_entry::<String, Box<RawValue>>()? {
                    if key.len() > 128 || fields.len() >= 64 || fields.insert(key, value).is_some()
                    {
                        return Err(A::Error::custom("invalid or duplicate layout key"));
                    }
                }
                Ok(Fields(fields))
            }
        }
        input.deserialize_map(Root)
    }
}
struct Document {
    observed: Option<Vec<u8>>,
    fields: Fields,
}
impl Document {
    fn open(path: &Path) -> Result<Self, ()> {
        let observed = files::read_optional(path, LIMIT).map_err(|_| ())?;
        let Some(bytes) = &observed else {
            return Ok(Self {
                observed,
                fields: Fields::default(),
            });
        };
        let fields: Fields = serde_json::from_slice(bytes).map_err(|_| ())?;
        let version: u32 =
            serde_json::from_str(fields.0.get("version").ok_or(())?.get()).map_err(|_| ())?;
        if !matches!(version, 1 | 2)
            || !fields
                .0
                .get("instances")
                .is_some_and(|value| value.get().trim_start().starts_with('['))
        {
            return Err(());
        }
        let motion = fields
            .0
            .get("reducedMotion")
            .map(|value| serde_json::from_str::<Option<bool>>(value.get()))
            .transpose()
            .map_err(|_| ())?
            .flatten();
        if version == 1 && motion.is_some() {
            return Err(());
        }
        Ok(Self { observed, fields })
    }
    fn motion(&self) -> Option<bool> {
        self.fields
            .0
            .get("reducedMotion")
            .and_then(|value| serde_json::from_str(value.get()).ok())
            .flatten()
    }
    fn save(&mut self, path: &Path, enabled: bool) -> Result<(), files::Error> {
        let mut fields = self.fields.0.clone();
        fields.insert(
            "reducedMotion".into(),
            RawValue::from_string(enabled.to_string()).expect("boolean JSON"),
        );
        let bytes = serde_json::to_vec(&fields)
            .map_err(|error| files::Error::InvalidInput(error.to_string()))?;
        files::save(
            path,
            &bytes,
            files::Mode::Observed(self.observed.as_deref()),
            &files::Options {
                limit: LIMIT,
                ..Default::default()
            },
        )?;
        self.fields = Fields(fields);
        self.observed = Some(bytes);
        Ok(())
    }
}
pub struct Layout {
    path: PathBuf,
    document: Result<Document, ()>,
    pending: Option<bool>,
}
impl Layout {
    pub fn open(path: PathBuf) -> Self {
        let document = Document::open(&path);
        Self {
            path,
            document,
            pending: None,
        }
    }
    pub fn motion(&self) -> Option<bool> {
        self.document.as_ref().ok().and_then(Document::motion)
    }
    pub fn pending(&self) -> bool {
        self.pending.is_some()
    }
    pub fn refresh(&mut self, discard: bool) {
        if discard || self.pending.is_none() {
            self.document = Document::open(&self.path);
            self.pending = None;
        }
    }
    pub fn set_motion(&mut self, enabled: bool) -> Change {
        let Ok(document) = &mut self.document else {
            return Change::Protected;
        };
        if document.motion().is_none() {
            return if self.pending.is_some() {
                Change::Protected
            } else {
                Change::Fallback
            };
        }
        match document.save(&self.path, enabled) {
            Ok(()) => {
                self.pending = None;
                Change::Saved
            }
            Err(error) if error.kind().is_conflict() => {
                self.pending = Some(enabled);
                self.document = Document::open(&self.path);
                Change::Conflict
            }
            Err(files::Error::InvalidInput(_) | files::Error::Unsupported(_)) => Change::Protected,
            Err(_) => Change::Io,
        }
    }
    pub fn retry(&mut self) -> Option<Change> {
        self.pending.map(|enabled| self.set_motion(enabled))
    }
}
