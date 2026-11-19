//! «Abrir otro archivo…» and «Guardar como…». The path is born in the main
//! process and travels only main → host: the renderer asks for a dialog with a
//! mode and a revision and gets back the name of the file, never its path.
use super::{
    OPTIONS, PRIMARY, State, StrategyExportTarget, StrategyState, StrategyView, document_state,
    files::{self, Mode},
    hash, parse_primary, validate_projection,
};
use crate::protocol::HostError;
use serde::{Deserialize, Deserializer, Serialize};
use std::{
    path::{Component, Path, PathBuf},
    time::{Duration, Instant},
};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_strategy::document::MAX_BYTES;

/// A ticket lives this long; the main process gives up at the same time.
pub const STRATEGY_PICK_LIFETIME_SECONDS: u64 = 120;
/// After a cancelled dialog the main process refuses a new one for this long
/// (the same pause as the application picker of the Launcher).
pub const STRATEGY_PICK_COOLDOWN_MS: u64 = 1500;
pub const STRATEGY_PICK_PATH_MAX: usize = 32768;
pub const STRATEGY_FILE_NAME_MAX: usize = 256;
/// The requests of the main process use these ids; the renderer's are below and
/// `u32::MAX` is the host's own background traffic.
pub(super) const INTERNAL_IDS: std::ops::Range<u32> = 0x8000_0000..u32::MAX;
pub(super) const STRATEGY_PICK_LIFETIME: Duration =
    Duration::from_secs(STRATEGY_PICK_LIFETIME_SECONDS);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum StrategyFileMode {
    /// «Abrir otro archivo…»: replaces the document with the chosen file.
    Open,
    /// «Guardar como…»: the document moves to a new file.
    SaveAs,
}

impl StrategyFileMode {
    pub const ALL: &'static [Self] = &[Self::Open, Self::SaveAs];
}

/// A cancelled dialog is `null`; a missing field is not a cancellation.
fn present<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<String>, D::Error> {
    Option::<String>::deserialize(deserializer)
}

/// Trusted main-process answer to a ticket; never admitted by the renderer port.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyFileSelection {
    /// The id of the request the host acknowledged.
    pub id: u32,
    /// `null` when the dialog was cancelled.
    #[serde(deserialize_with = "present")]
    pub path: Option<String>,
}

// Logs and panics must not carry the path the user chose.
impl std::fmt::Debug for StrategyFileSelection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("StrategyFileSelection")
            .field("id", &self.id)
            .field("path", &self.path.as_ref().map(|_| "<hidden>"))
            .finish()
    }
}

/// The file of the document: its name and nothing else.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(deny_unknown_fields)]
pub struct StrategyFile {
    /// The last segment of the path: no separators, no controls, at most 256 bytes.
    pub name: String,
}

/// What the dialog the ticket stands for is for.
pub(super) enum Kind {
    /// «Abrir otro archivo…» or «Guardar como…».
    File(StrategyFileMode),
    /// «Guardar como hoja de cálculo…»: the plan to write and, for the accepted
    /// plan, the moment it was accepted (its identity: a plan accepted again
    /// during the dialog is another plan).
    Export {
        target: StrategyExportTarget,
        accepted_at: Option<String>,
    },
}

/// One at a time, single use, bound to the revision it was asked for.
pub(super) struct Ticket {
    pub(super) id: u32,
    pub(super) kind: Kind,
    pub(super) revision: String,
    pub(super) expires: Instant,
}

/// Format and bidirectional controls that `char::is_control` does not cover.
pub(super) fn invisible(c: char) -> bool {
    matches!(c, '\u{061c}' | '\u{200e}' | '\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}')
}

/// The same rule as `fileName` in `hub-web/src/contract/modules/strategy.ts`.
pub(super) fn valid_file_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= STRATEGY_FILE_NAME_MAX
        && name != "."
        && name != ".."
        && !name.contains(['/', '\\', ':'])
        && !name.chars().any(|c| c.is_control() || invisible(c))
}

pub(super) fn file_of(path: &Path) -> Option<StrategyFile> {
    let name = path.file_name()?.to_str()?;
    valid_file_name(name).then(|| StrategyFile { name: name.into() })
}

/// An absolute path on a local disk made of plain names: no `\\?\`, no device or
/// network prefix, no drive-relative or rooted-only form, no `.` or `..`.
fn plain_path(path: &Path) -> bool {
    let mut parts = path.components();
    #[cfg(windows)]
    let start = matches!(
        parts.next(),
        Some(Component::Prefix(prefix)) if matches!(prefix.kind(), std::path::Prefix::Disk(_))
    ) && matches!(parts.next(), Some(Component::RootDir));
    #[cfg(not(windows))]
    let start = matches!(parts.next(), Some(Component::RootDir));
    start && parts.all(|part| matches!(part, Component::Normal(_)))
}

/// Names Windows turns into devices (`CON` hangs a read, `NUL` swallows a write),
/// with or without an extension.
pub(super) fn device_name(name: &std::ffi::OsStr) -> bool {
    let name = name.to_string_lossy().to_ascii_uppercase();
    let stem = name.split('.').next().unwrap_or_default().trim_end();
    matches!(stem, "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$")
        || stem
            .strip_prefix("COM")
            .or_else(|| stem.strip_prefix("LPT"))
            .is_some_and(|number| {
                // Windows 11 also reserves the superscript digits
                let mut digits = number.chars();
                matches!(
                    (digits.next(), digits.next()),
                    (Some('1'..='9' | '\u{b9}' | '\u{b2}' | '\u{b3}'), None)
                )
            })
}

/// The copy of a damaged document lives in the data directory with this
/// extension; opening or writing it would lose the only copy.
fn quarantine_name(name: &std::ffi::OsStr) -> bool {
    name.to_string_lossy()
        .to_ascii_lowercase()
        .ends_with(".invalid")
}

/// What `files` refuses to read or write, as the host reports it.
fn environment_file(path: &Path) -> bool {
    path.components().any(|part| {
        part.as_os_str()
            .to_string_lossy()
            .to_ascii_lowercase()
            .starts_with(".env")
    })
}

/// The path as the main process could have chosen it, for opening and saving
/// alike: plain, on a local disk, with a name the view can carry, and neither a
/// device nor an environment file.
pub(super) fn checked_path(path: &str) -> Result<PathBuf, HostError> {
    let chosen = Path::new(path);
    if path.len() > STRATEGY_PICK_PATH_MAX
        || path.contains('\0')
        || !plain_path(chosen)
        || !crate::launcher::apps::unambiguous_path(chosen)
        || file_of(chosen).is_none()
        || environment_file(chosen)
        || chosen.file_name().is_some_and(quarantine_name)
        || chosen
            .components()
            .any(|part| matches!(part, Component::Normal(name) if device_name(name)))
    {
        return Err(HostError::StrategyFileUnavailable);
    }
    Ok(chosen.to_owned())
}

/// The path with its folder resolved, so that two spellings of one file compare
/// equal even when the file does not exist yet.
fn normalized(path: &Path) -> PathBuf {
    if let Ok(path) = std::fs::canonicalize(path) {
        return path;
    }
    match (path.parent().map(std::fs::canonicalize), path.file_name()) {
        (Some(Ok(parent)), Some(name)) => parent.join(name),
        _ => path.to_owned(),
    }
}

/// Without the `\\?\` prefix, with one kind of separator, and without case on
/// Windows.
fn comparable(path: &Path) -> String {
    let text = path.to_string_lossy();
    let text = text.strip_prefix(r"\\?\").unwrap_or(&text);
    if cfg!(windows) {
        text.replace('/', "\\")
            .trim_end_matches('\\')
            .to_lowercase()
    } else {
        text.to_string()
    }
}

/// By identity: the existing file is resolved, a new one by its resolved folder.
pub(super) fn same_file(a: &Path, b: &Path) -> bool {
    a == b || comparable(&normalized(a)) == comparable(&normalized(b))
}

/// The file is where the user chose it: no link, junction, `subst` drive or short
/// name on the way. Reading and writing use this one check; a file that does not
/// exist yet is judged by its folder.
pub(super) fn direct(path: &Path) -> bool {
    let real = match std::fs::canonicalize(path) {
        Ok(real) => real,
        Err(_) => match (path.parent().map(std::fs::canonicalize), path.file_name()) {
            (Some(Ok(folder)), Some(name)) => folder.join(name),
            _ => return false,
        },
    };
    comparable(&real) == comparable(&path.components().collect::<PathBuf>())
}

/// One read of a chosen file, never more than the document limit plus one byte.
pub(super) enum Read {
    Missing,
    Bytes(Vec<u8>),
    TooLarge,
    Unavailable,
}

fn read_regular(path: &Path) -> Read {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Read::Missing,
        Err(_) => return Read::Unavailable,
    };
    if !metadata.is_file() || metadata.file_type().is_symlink() || !direct(path) {
        return Read::Unavailable;
    }
    match files::read(path, u64::try_from(MAX_BYTES).unwrap_or(u64::MAX)) {
        Ok(bytes) => Read::Bytes(bytes),
        Err(files::Error::ReadTooLarge { .. }) => Read::TooLarge,
        Err(files::Error::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
            Read::Missing
        }
        Err(_) => Read::Unavailable,
    }
}

impl State {
    /// A document that is not read yet, at the same file as this one.
    pub(super) fn fresh(&self) -> Self {
        let mut current = Self::new(self.root.clone());
        current.path.clone_from(&self.path);
        current.opened = true;
        current
    }

    pub(super) fn file(&self) -> Option<StrategyFile> {
        self.opened.then(|| file_of(&self.path)).flatten()
    }

    /// Forgets the ticket: nobody can be served, so nobody can answer it.
    pub(crate) fn drop_ticket(&mut self) {
        self.ticket = None;
    }

    fn require_free(&self) -> Result<(), HostError> {
        if self.calculation.running() {
            Err(HostError::Busy)
        } else if self.dirty() {
            Err(HostError::StrategyDirty)
        } else if self.calculation.edit_pending() {
            Err(HostError::StrategyEditPending)
        } else {
            Ok(())
        }
    }

    /// Records the ticket of a dialog the main process is about to open and
    /// acknowledges with the current view. Nothing else changes.
    pub(crate) fn pick_file(
        &mut self,
        id: u32,
        mode: StrategyFileMode,
        revision: &str,
        now: Instant,
    ) -> Result<StrategyView, HostError> {
        if !INTERNAL_IDS.contains(&id) {
            return Err(HostError::Denied);
        }
        match mode {
            StrategyFileMode::Open => {
                self.require_revision(revision)?;
                self.require_free()?;
            }
            StrategyFileMode::SaveAs => {
                self.require_edit(revision)?;
                if self.doc.is_none() {
                    return Err(HostError::Rejected);
                }
            }
        }
        if self
            .ticket
            .as_ref()
            .is_some_and(|ticket| now < ticket.expires)
        {
            return Err(HostError::Busy);
        }
        self.ticket = Some(Ticket {
            id,
            kind: Kind::File(mode),
            revision: revision.to_owned(),
            expires: now + STRATEGY_PICK_LIFETIME,
        });
        Ok(self.view())
    }

    /// The answer of the main process. Only the ticket of that very request is
    /// honoured, once; anything else is denied and changes nothing.
    pub(crate) fn picked_file(
        &mut self,
        selection: &StrategyFileSelection,
        now: Instant,
    ) -> Result<StrategyView, HostError> {
        if !INTERNAL_IDS.contains(&selection.id)
            || self
                .ticket
                .as_ref()
                .is_none_or(|ticket| ticket.id != selection.id)
        {
            return Err(HostError::Denied);
        }
        // the ticket of an export is answered by `picked`, never as a file dialog
        if self
            .ticket
            .as_ref()
            .is_some_and(|ticket| matches!(ticket.kind, Kind::Export { .. }))
        {
            return Err(HostError::Denied);
        }
        let ticket = self.ticket.take().ok_or(HostError::Denied)?;
        let Kind::File(mode) = ticket.kind else {
            return Err(HostError::Denied);
        };
        if now >= ticket.expires {
            return Err(HostError::StrategyPickExpired);
        }
        let Some(path) = &selection.path else {
            return Ok(self.view());
        };
        self.require_open()?;
        if ticket.revision != self.revision {
            return Err(self.conflict());
        }
        let path = checked_path(path)?;
        match mode {
            StrategyFileMode::Open => {
                self.require_free()?;
                self.open_file(path)
            }
            StrategyFileMode::SaveAs => {
                self.require_edit(&ticket.revision)?;
                self.save_as_file(path)
            }
        }
    }

    fn open_file(&mut self, path: PathBuf) -> Result<StrategyView, HostError> {
        let read = read_regular(&path);
        match &read {
            Read::Missing | Read::Unavailable => return Err(HostError::StrategyFileUnavailable),
            Read::TooLarge => return Err(HostError::StrategyFileTooLarge),
            Read::Bytes(_) => {}
        }
        let mut current = self.fresh();
        current.path = path;
        // Damaged and future files are states of the new document, not errors;
        // a collection over the limits fails as it does for the primary file.
        current.apply_read(read)?;
        self.replace_document(current);
        Ok(self.view())
    }

    /// Reads the file the document lives in when it is not the primary one.
    pub(super) fn read_custom(&mut self) -> Result<(), HostError> {
        let read = read_regular(&self.path);
        self.apply_read(read)
    }

    /// The state of a document that is not the primary file. A damaged one keeps
    /// its copy inside the data directory, named by its content: nothing is
    /// ever written beside the file the user chose, and no text of the read
    /// (it carries paths) is kept.
    fn apply_read(&mut self, read: Read) -> Result<(), HostError> {
        let mut rejected = None;
        let (doc, observed, status, revision) = match read {
            Read::Missing => (None, None, StrategyState::Empty, hash(b"")),
            Read::TooLarge | Read::Unavailable => (None, None, StrategyState::Protected, hash(b"")),
            Read::Bytes(bytes) => {
                let revision = hash(&bytes);
                match parse_primary(&bytes) {
                    Ok(doc) => match validate_projection(&doc, HostError::Protected) {
                        Ok(()) => {
                            let status = document_state(&doc);
                            (Some(doc), Some(bytes), status, revision)
                        }
                        Err(error) => {
                            rejected = Some(error);
                            (None, None, StrategyState::Protected, revision)
                        }
                    },
                    // a future version and I/O failures stay untouched
                    Err(files::Error::Io(_) | files::Error::Unsupported(_)) => {
                        (None, None, StrategyState::Protected, revision)
                    }
                    Err(_) if self.keep_copy(&bytes) => {
                        (None, Some(bytes), StrategyState::Recovered, revision)
                    }
                    Err(_) => (None, None, StrategyState::Protected, revision),
                }
            }
        };
        self.revision = revision;
        self.status = status;
        self.set_doc(doc);
        self.observed = observed;
        rejected.map_or(Ok(()), Err)
    }

    /// The copy of a damaged document, in the data directory.
    fn keep_copy(&self, bytes: &[u8]) -> bool {
        let archive = self.root.join(format!(
            "strategy-invalid-{}.json.invalid",
            &hash(bytes)[..16]
        ));
        let limit = u64::try_from(MAX_BYTES).unwrap_or(u64::MAX);
        match files::read_optional(&archive, limit) {
            Ok(Some(existing)) => existing == bytes,
            Ok(None) => files::save(&archive, bytes, Mode::Observed(None), &OPTIONS).is_ok(),
            Err(_) => false,
        }
    }

    fn save_as_file(&mut self, path: PathBuf) -> Result<StrategyView, HostError> {
        if same_file(&path, &self.path) {
            // A real «Guardar»: a clean document also compares with the file
            // it observed, so a change made elsewhere is a conflict, not a silent
            // success.
            if !self.dirty() {
                let limit = u64::try_from(MAX_BYTES).unwrap_or(u64::MAX);
                if files::read_optional(&self.path, limit).ok().flatten() != self.observed {
                    let mut current = self.fresh();
                    current.read_current()?;
                    return Err(current.conflict());
                }
            }
            let revision = self.revision.clone();
            return self.save(&revision);
        }
        // Never overwrite an unobserved target, nor the primary file from
        // another document, whether it exists or not.
        if same_file(&path, &self.root.join(PRIMARY)) {
            return Err(HostError::StrategyTargetExists);
        }
        // the folder must be the one the user chose, as when the file is read
        // again: a link, junction or `subst` drive would leave a document that
        // cannot be opened
        if !direct(&path) || !path.parent().is_some_and(Path::is_dir) {
            return Err(HostError::StrategyFileUnavailable);
        }
        let bytes = self
            .doc
            .as_ref()
            .ok_or(HostError::Rejected)?
            .bytes()
            .to_vec();
        // `files::save` takes `<target>.lock` and leaves it behind; in a folder of
        // the user's that lock is only removed when it was this write that made it
        let lock = {
            let mut name = path.clone().into_os_string();
            name.push(".lock");
            PathBuf::from(name)
        };
        let lock_existed = lock.exists();
        let saved = files::save(&path, &bytes, Mode::Observed(None), &OPTIONS);
        if !lock_existed {
            let _ = std::fs::remove_file(&lock);
        }
        match saved {
            Ok(()) => {}
            Err(error) if error.kind().is_conflict() => {
                return Err(HostError::StrategyTargetExists);
            }
            Err(files::Error::Busy) => return Err(HostError::Busy),
            Err(files::Error::TooLarge { .. }) => return Err(HostError::StrategyFileTooLarge),
            Err(_) => return Err(HostError::StrategyFileUnavailable),
        }
        self.observed = Some(bytes);
        self.path = path;
        Ok(self.view())
    }
}
