//! Read-only catalog of packaged Workshop fixtures.
#[cfg(any(windows, test))]
use crate::preview::PreviewError;
use crate::studio::WidgetKind;
use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;

const FILE_LIMIT: usize = 256;
const BYTE_LIMIT: u64 = 16 * 1024 * 1024;
pub const FRAME_LIMIT: usize = 512;
pub const ID_PATTERN: &str = "^[a-z0-9][a-z0-9-]{0,95}$";
#[cfg(any(test, feature = "bindings"))]
pub(crate) fn id_cases() -> [(String, bool); 9] {
    [
        ("standings-default".into(), true),
        ("a".repeat(96), true),
        (String::new(), false),
        ("../a".into(), false),
        ("a/b".into(), false),
        (r"a\b".into(), false),
        ("Upper".into(), false),
        ("a\n".into(), false),
        ("a".repeat(97), false),
    ]
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkshopScene {
    pub id: String,
    pub label: String,
    pub frames: u32,
    pub frame_ms: Option<u32>,
    pub watch_for: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(deny_unknown_fields)]
pub struct WidgetScenes {
    pub kind: WidgetKind,
    pub scenes: Vec<WorkshopScene>,
}

pub(crate) fn valid_scene_id(id: &str) -> bool {
    let mut bytes = id.bytes();
    let alnum = |b: u8| b.is_ascii_lowercase() || b.is_ascii_digit();
    id.len() <= 96 && bytes.next().is_some_and(alnum) && bytes.all(|b| alnum(b) || b == b'-')
}

#[derive(Deserialize)]
struct SceneFile<'a> {
    widget: WidgetKind,
    label: String,
    #[serde(rename = "frameMs")]
    frame_ms: Option<u32>,
    #[serde(rename = "watchFor")]
    watch_for: Option<String>,
    #[serde(borrow)]
    frames: Vec<Frame<'a>>,
}
#[derive(Deserialize)]
struct Frame<'a> {
    #[serde(borrow)]
    snapshot: &'a RawValue,
}
fn valid_text(value: &str, max: usize) -> bool {
    !value.contains(['\0', '\r', '\n']) && value.chars().count() <= max
}
fn scene_file(bytes: &[u8]) -> Option<SceneFile<'_>> {
    let scene: SceneFile<'_> = serde_json::from_slice(bytes).ok()?;
    (!scene.frames.is_empty()
        && scene.frames.len() <= FRAME_LIMIT
        && valid_text(&scene.label, 120)
        && scene
            .watch_for
            .as_deref()
            .is_none_or(|text| valid_text(text, 400)))
    .then_some(scene)
}
fn valid_snapshot(text: &str) -> bool {
    vantare_ipc::snapshot_from_saved_json(text).is_ok()
}
#[derive(Clone, Copy)]
enum Format {
    Scene,
    Snapshot,
}
fn fixture_name(name: &str) -> Option<(&str, Format)> {
    let (id, format) = if let Some(id) = name.strip_suffix(".scene.json") {
        (id, Format::Scene)
    } else {
        (name.strip_suffix(".snapshot.json")?, Format::Snapshot)
    };
    valid_scene_id(id).then_some((id, format))
}
fn snapshot_widget(id: &str) -> Option<WidgetKind> {
    // A plain IPC snapshot has no widget field. Variants use the longest widget prefix.
    WidgetKind::ALL
        .iter()
        .copied()
        .filter(|kind| {
            id == kind.id()
                || id
                    .strip_prefix(kind.id())
                    .is_some_and(|rest| rest.starts_with('-'))
        })
        .max_by_key(|kind| kind.id().len())
}
fn link(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt as _;
        metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    metadata.file_type().is_symlink()
}
fn regular_root(root: &Path) -> bool {
    fs::symlink_metadata(root).is_ok_and(|metadata| metadata.is_dir() && !link(&metadata))
}
fn read_fixture(root: &Path, filename: &str) -> Option<Vec<u8>> {
    if !regular_root(root) || Path::new(filename).file_name()?.to_str()? != filename {
        return None;
    }
    let path = root.join(filename);
    let before = fs::symlink_metadata(&path).ok()?;
    if !before.is_file() || link(&before) || before.len() > BYTE_LIMIT {
        return None;
    }
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt as _;
        options.custom_flags(windows_sys::Win32::Storage::FileSystem::FILE_FLAG_OPEN_REPARSE_POINT);
    }
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        use std::os::unix::fs::OpenOptionsExt as _;
        // O_NOFOLLOW | O_NONBLOCK: reject a replaced link without opening a FIFO.
        #[cfg(target_os = "linux")]
        options.custom_flags(0x0002_0000 | 0x0800);
        #[cfg(target_os = "macos")]
        options.custom_flags(0x100 | 0x4);
    }
    let file = options.open(&path).ok()?;
    let metadata = file.metadata().ok()?;
    if !metadata.is_file()
        || link(&metadata)
        || metadata.len() > BYTE_LIMIT
        || path.canonicalize().ok()?.parent()? != root
    {
        return None;
    }
    let mut bytes = Vec::new();
    file.take(BYTE_LIMIT + 1).read_to_end(&mut bytes).ok()?;
    (bytes.len() as u64 <= BYTE_LIMIT).then_some(bytes)
}
struct Entry {
    widget: WidgetKind,
    scene: WorkshopScene,
    #[cfg(any(windows, test))]
    filename: String,
    #[cfg(any(windows, test))]
    format: Format,
}
#[derive(Default)]
pub(crate) struct Scenes {
    #[cfg(any(windows, test))]
    root: Option<PathBuf>,
    entries: Vec<Entry>,
}
impl Scenes {
    pub(crate) fn runtime() -> Self {
        let installed = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|dir| dir.join("fixtures")));
        if let Some(root) = installed.filter(|root| root.is_dir()) {
            return Self::load(Some(root));
        }
        #[cfg(debug_assertions)]
        {
            Self::load(Some(development_root()))
        }
        #[cfg(not(debug_assertions))]
        Self::default()
    }

    pub(crate) fn load(root: Option<PathBuf>) -> Self {
        let root = root
            .filter(|path| regular_root(path))
            .and_then(|path| path.canonicalize().ok());
        let Some(root) = root else {
            return Self::default();
        };
        let mut entries = Vec::new();
        if let Ok(files) = fs::read_dir(&root) {
            let mut files = files
                .filter_map(Result::ok)
                .filter_map(|file| {
                    let name = file.file_name().into_string().ok()?;
                    fixture_name(&name)?;
                    Some(name)
                })
                .take(FILE_LIMIT)
                .collect::<Vec<_>>();
            files.sort_unstable();
            for filename in files {
                if let Some(entry) = load_entry(&root, filename)
                    && !entries.iter().any(|previous: &Entry| {
                        previous.widget == entry.widget && previous.scene.id == entry.scene.id
                    })
                {
                    entries.push(entry);
                }
            }
        }
        entries.sort_unstable_by(|left, right| left.scene.id.cmp(&right.scene.id));
        Self {
            #[cfg(any(windows, test))]
            root: Some(root),
            entries,
        }
    }

    pub(crate) fn widgets(&self) -> Vec<WidgetScenes> {
        WidgetKind::ALL
            .iter()
            .map(|&kind| WidgetScenes {
                kind,
                scenes: self
                    .entries
                    .iter()
                    .filter(|entry| entry.widget == kind)
                    .map(|entry| entry.scene.clone())
                    .collect(),
            })
            .collect()
    }

    #[cfg(any(windows, test))]
    pub(crate) fn snapshot(
        &self,
        widget: WidgetKind,
        id: &str,
        frame: u32,
    ) -> Result<Vec<u8>, PreviewError> {
        let root = self.root.as_deref().ok_or(PreviewError::NoDemo)?;
        let entry = self
            .entries
            .iter()
            .find(|entry| {
                entry.widget == widget && entry.scene.id == id && frame < entry.scene.frames
            })
            .ok_or(PreviewError::InvalidInput)?;
        let bytes = read_fixture(root, &entry.filename).ok_or(PreviewError::InvalidInput)?;
        match entry.format {
            Format::Scene => {
                let scene = scene_file(&bytes)
                    .filter(|scene| scene.widget == widget)
                    .ok_or(PreviewError::InvalidInput)?;
                let snapshot = scene
                    .frames
                    .get(frame as usize)
                    .ok_or(PreviewError::InvalidInput)?
                    .snapshot
                    .get();
                if !valid_snapshot(snapshot) {
                    return Err(PreviewError::InvalidInput);
                }
                Ok(snapshot.as_bytes().to_vec())
            }
            Format::Snapshot => {
                if !std::str::from_utf8(&bytes).is_ok_and(valid_snapshot) {
                    return Err(PreviewError::InvalidInput);
                }
                Ok(bytes)
            }
        }
    }
}
fn load_entry(root: &Path, filename: String) -> Option<Entry> {
    let (id, format) = fixture_name(&filename)?;
    let bytes = read_fixture(root, &filename)?;
    let (widget, label, frames, frame_ms, watch_for) = match format {
        Format::Scene => {
            let scene = scene_file(&bytes)?;
            if !scene
                .frames
                .iter()
                .all(|frame| valid_snapshot(frame.snapshot.get()))
            {
                return None;
            }
            (
                scene.widget,
                scene.label,
                u32::try_from(scene.frames.len()).ok()?,
                scene.frame_ms,
                scene.watch_for,
            )
        }
        Format::Snapshot => {
            let widget = snapshot_widget(id)?;
            if !valid_snapshot(std::str::from_utf8(&bytes).ok()?) {
                return None;
            }
            (widget, widget.info(None).name, 1, None, None)
        }
    };
    Some(Entry {
        widget,
        scene: WorkshopScene {
            id: id.into(),
            label,
            frames,
            frame_ms,
            watch_for,
        },
        #[cfg(any(windows, test))]
        filename,
        #[cfg(any(windows, test))]
        format,
    })
}
#[cfg(any(debug_assertions, test, feature = "bindings"))]
pub(crate) fn development_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../ui/fixtures")
}

#[cfg(test)]
#[path = "workshop_tests.rs"]
mod tests;
