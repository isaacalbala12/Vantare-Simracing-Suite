//! Minimal layout adapter. Only existing motion is interpreted/edited;
//! other values retain their original JSON representation. No GPUI dependency.
pub mod preview;
use super::track::{PerformanceLevel, TrackView};
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
#[derive(Clone, Copy)]
enum Intent {
    Motion(bool),
    Level(PerformanceLevel),
    HideOffTrack(bool),
}
const LIMIT: u64 = 1024 * 1024;
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Change {
    Fallback,
    Saved,
    Conflict,
    Protected,
    Busy,
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
        let document = Self { observed, fields };
        document.performance()?;
        document.hide()?;
        Ok(document)
    }
    fn motion(&self) -> Option<bool> {
        self.fields
            .0
            .get("reducedMotion")
            .and_then(|value| serde_json::from_str(value.get()).ok())
            .flatten()
    }
    fn performance(&self) -> Result<Fields, ()> {
        let fields: Fields = self.fields.0.get("performance").map_or_else(
            || Ok(Fields::default()),
            |value| serde_json::from_str(value.get()).map_err(|_| ()),
        )?;
        if fields
            .0
            .keys()
            .any(|key| !matches!(key.as_str(), "level" | "widgets"))
        {
            return Err(());
        }
        if let Some(level) = fields.0.get("level") {
            serde_json::from_str::<PerformanceLevel>(level.get()).map_err(|_| ())?;
        }
        if let Some(widgets) = fields.0.get("widgets") {
            let widgets: BTreeMap<String, u16> =
                serde_json::from_str(widgets.get()).map_err(|_| ())?;
            if !super::track::valid_overrides(&widgets) {
                return Err(());
            }
        }
        Ok(fields)
    }
    fn hide(&self) -> Result<bool, ()> {
        self.fields
            .0
            .get("hideOffTrack")
            .map_or(Ok(false), |value| {
                serde_json::from_str(value.get()).map_err(|_| ())
            })
    }
    fn track(&self) -> TrackView {
        let performance = self.performance().expect("validated performance");
        let level = performance
            .0
            .get("level")
            .and_then(|v| serde_json::from_str(v.get()).ok())
            .unwrap_or_default();
        let custom_widgets = performance.0.get("widgets").map_or(0, |v| {
            serde_json::from_str::<BTreeMap<String, u16>>(v.get()).map_or(0, |v| v.len())
        });
        TrackView {
            exists: self.observed.is_some(),
            level,
            customized: custom_widgets > 0,
            custom_widgets,
            hide_off_track: self.hide().expect("validated visibility"),
            protected: false,
        }
    }
    fn save(&mut self, path: &Path, intent: Intent) -> Result<(), files::Error> {
        let mut fields = self.fields.0.clone();
        let (key, value) = match intent {
            Intent::Motion(enabled) => ("reducedMotion", enabled.to_string()),
            Intent::HideOffTrack(enabled) => ("hideOffTrack", enabled.to_string()),
            Intent::Level(level) => {
                let mut performance = self.performance().expect("validated performance");
                performance.0.insert(
                    "level".into(),
                    RawValue::from_string(serde_json::to_string(&level).expect("level"))
                        .expect("JSON"),
                );
                (
                    "performance",
                    serde_json::to_string(&performance.0).expect("performance"),
                )
            }
        };
        fields.insert(
            key.into(),
            RawValue::from_string(value).expect("valid JSON"),
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
    pending: Option<Intent>,
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
    pub fn track(&self) -> TrackView {
        self.document.as_ref().map_or_else(
            |()| TrackView {
                exists: self.path.try_exists().unwrap_or(true),
                protected: true,
                ..Default::default()
            },
            Document::track,
        )
    }
    pub fn set_level(&mut self, level: PerformanceLevel) -> Change {
        self.save(Intent::Level(level))
    }
    pub fn set_hide_off_track(&mut self, enabled: bool) -> Change {
        self.save(Intent::HideOffTrack(enabled))
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
        self.save(Intent::Motion(enabled))
    }
    fn save(&mut self, intent: Intent) -> Change {
        let Ok(document) = &mut self.document else {
            return Change::Protected;
        };
        if document.observed.is_none() && !matches!(intent, Intent::Motion(_)) {
            return Change::Protected;
        }
        if matches!(intent, Intent::Motion(_)) && document.motion().is_none() {
            return if self.pending.is_some() {
                Change::Protected
            } else {
                Change::Fallback
            };
        }
        match document.save(&self.path, intent) {
            Ok(()) => {
                self.pending = None;
                Change::Saved
            }
            Err(error) if error.kind().is_conflict() => {
                self.pending = Some(intent);
                self.document = Document::open(&self.path);
                Change::Conflict
            }
            Err(error) if error.kind() == files::Kind::Busy => {
                self.pending = Some(intent);
                Change::Busy
            }
            Err(files::Error::InvalidInput(_) | files::Error::Unsupported(_)) => Change::Protected,
            Err(_) => Change::Io,
        }
    }
    pub fn retry(&mut self) -> Option<Change> {
        self.pending.map(|intent| self.save(intent))
    }
}

#[path = "layout/onboarding.rs"]
pub(crate) mod onboarding;
