//! One-time import of the frozen Hub's two local drafts. Original bytes survive.
use crate::{
    protocol::HostError,
    testing::{FIELD_LIMITS, LegacyMigration, Operation, ReportFields},
};
use serde::Deserialize;
use std::{
    fs,
    path::{Path, PathBuf},
    time::SystemTime,
};
use vantare_ipc::{
    files,
    services_protocol::{Command, Reply},
};

const EDITOR_LIMIT: u64 = 512 * 1024;
const LOCAL_LIMIT: u64 = 16 * 1024;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EditorDocument {
    version: u32,
    fields: ReportFields,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LocalDocument {
    schema_version: u32,
    module: String,
    fields: [String; 4],
}

struct Source {
    path: PathBuf,
    bytes: Vec<u8>,
    modified: SystemTime,
    fields: ReportFields,
    trimmed: bool,
}
#[derive(Clone, Copy)]
enum Failure {
    Invalid,
    Changed,
    Archive,
}
impl Failure {
    fn message(self) -> &'static str {
        match self {
            Self::Invalid => "Borrador antiguo inválido o no legible; se conserva el archivo",
            Self::Changed => "El borrador antiguo cambió; se conserva el archivo",
            Self::Archive => "No se pudo archivar el borrador antiguo; se conserva el archivo",
        }
    }
}
#[derive(Clone, Copy)]
enum ArchiveRetry {
    Allowed,
    NextLoad,
}
pub(crate) struct State {
    base: PathBuf,
    sources: Vec<Source>,
    selected: usize,
    warning: Option<Failure>,
    importing: bool,
    scanned: bool,
    surfaced: bool,
    archive_retry: ArchiveRetry,
    pub(crate) legacy: LegacyMigration,
}
pub(crate) enum Next {
    Import(Command),
    Complete(Reply),
}

fn module_id(value: &str) -> Option<&'static str> {
    Some(match value {
        "hub" => "hub",
        "launcher" => "launcher",
        "studio" => "overlay_studio",
        "calendar" => "calendar",
        "strategy" => "strategy",
        "engineer" => "engineer",
        "analysis" => "telemetry_analysis",
        "testing_center" => "testing_center",
        "workshop" | "notifications" => "unknown",
        _ => return None,
    })
}
// Frozen GPUI store::clean_field parity, without adding a domain dependency.
fn clean_field(text: &str, limit: usize) -> String {
    let mut out = String::with_capacity(text.len().min(limit));
    for ch in text.chars() {
        match ch {
            '\n' | '\t' => out.push(ch),
            '\u{202a}'..='\u{202e}'
            | '\u{061c}'
            | '\u{200b}'..='\u{200f}'
            | '\u{2060}'..='\u{2064}'
            | '\u{2066}'..='\u{2069}'
            | '\u{feff}' => {}
            c if c.is_control() => out.push(' '),
            _ => out.push(ch),
        }
    }
    let mut end = out.len().min(limit);
    while !out.is_char_boundary(end) {
        end -= 1;
    }
    out.truncate(end);
    out
}
fn source(path: PathBuf, editor: bool) -> Result<Option<Source>, Failure> {
    let info = match fs::symlink_metadata(&path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Ok(info) if info.is_file() && !info.file_type().is_symlink() => info,
        _ => return Err(Failure::Invalid),
    };
    let modified = info.modified().map_err(|_| Failure::Invalid)?;
    let bytes = files::read(&path, if editor { EDITOR_LIMIT } else { LOCAL_LIMIT })
        .map_err(|_| Failure::Invalid)?;
    let mut fields = if editor {
        let document: EditorDocument =
            serde_json::from_slice(&bytes).map_err(|_| Failure::Invalid)?;
        if document.version != 1 {
            return Err(Failure::Invalid);
        }
        document.fields
    } else {
        let document: LocalDocument =
            serde_json::from_slice(&bytes).map_err(|_| Failure::Invalid)?;
        if document.schema_version != 1 {
            return Err(Failure::Invalid);
        }
        let module = module_id(&document.module).ok_or(Failure::Invalid)?;
        let [action_text, expected_text, observed_text, context_text] = document.fields;
        ReportFields {
            action_text,
            expected_text,
            observed_text,
            context_text,
            module: module.into(),
        }
    };
    let original = fields.clone();
    for (text, limit) in [
        &mut fields.action_text,
        &mut fields.expected_text,
        &mut fields.observed_text,
        &mut fields.context_text,
    ]
    .into_iter()
    .zip(FIELD_LIMITS)
    {
        *text = clean_field(text, limit);
    }
    let trimmed = fields != original;
    if !fields.valid() {
        return Err(Failure::Invalid);
    }
    let after = fs::symlink_metadata(&path).map_err(|_| Failure::Changed)?;
    if !after.is_file()
        || after.file_type().is_symlink()
        || after.modified().ok() != Some(modified)
        || after.len() != bytes.len() as u64
    {
        return Err(Failure::Changed);
    }
    Ok(Some(Source {
        path,
        bytes,
        modified,
        fields,
        trimmed,
    }))
}
impl Source {
    fn archive(&self) -> PathBuf {
        self.path.with_extension("json.imported")
    }
    fn unchanged(&self) -> bool {
        fs::symlink_metadata(&self.path).ok().is_some_and(|info| {
            info.is_file()
                && !info.file_type().is_symlink()
                && info.modified().ok() == Some(self.modified)
        }) && files::read(&self.path, self.bytes.len() as u64)
            .ok()
            .as_deref()
            == Some(self.bytes.as_slice())
    }
    fn archived(&self) -> bool {
        fs::symlink_metadata(self.archive())
            .ok()
            .is_some_and(|info| info.is_file() && !info.file_type().is_symlink())
            && files::read(&self.archive(), self.bytes.len() as u64)
                .ok()
                .as_deref()
                == Some(self.bytes.as_slice())
    }
}
impl State {
    pub(crate) fn new(data: &Path) -> Self {
        Self {
            base: data.join("testing-center"),
            sources: vec![],
            selected: 0,
            warning: None,
            importing: false,
            scanned: false,
            surfaced: false,
            archive_retry: ArchiveRetry::Allowed,
            legacy: LegacyMigration::None,
        }
    }
    pub(crate) fn begin(&mut self, operation: Operation) {
        self.importing = false;
        if !matches!(operation, Operation::Load) {
            return;
        }
        if self.scanned {
            return;
        }
        self.scanned = true;
        for (name, editor) in [("editor-draft.json", true), ("report-draft.json", false)] {
            match source(self.base.join(name), editor) {
                Ok(Some(source)) => self.sources.push(source),
                Ok(None) => {}
                Err(error) => self.warning = Some(error),
            }
        }
        if !self.sources.is_empty() || self.warning.is_some() {
            self.legacy = LegacyMigration::Preserved;
        }
        self.selected = usize::from(
            self.sources.len() == 2 && self.sources[1].modified > self.sources[0].modified,
        );
    }
    fn archive(&self) -> Result<(), Failure> {
        for source in &self.sources {
            if !source.unchanged() {
                return Err(Failure::Changed);
            }
            if !matches!(fs::symlink_metadata(source.archive()),Err(error) if error.kind()==std::io::ErrorKind::NotFound)
                && !source.archived()
            {
                return Err(Failure::Archive);
            }
        }
        // Retire the selected source last so an interrupted archive remains recoverable.
        for index in (0..self.sources.len())
            .filter(|index| *index != self.selected)
            .chain(std::iter::once(self.selected).filter(|index| *index < self.sources.len()))
        {
            let source = &self.sources[index];
            if !source.archive().exists() {
                fs::hard_link(&source.path, source.archive()).map_err(|_| Failure::Archive)?;
            }
            if !source.archived() || !source.unchanged() {
                return Err(Failure::Changed);
            }
            fs::remove_file(&source.path).map_err(|_| Failure::Archive)?;
        }
        Ok(())
    }
    pub(crate) fn complete(
        &mut self,
        operation: Operation,
        mut reply: Reply,
    ) -> Result<Next, HostError> {
        if !matches!(
            operation,
            Operation::Load | Operation::Save | Operation::Discard
        ) {
            return Ok(Next::Complete(reply));
        }
        if let Reply::Draft { draft, message } = &mut reply {
            if matches!(operation, Operation::Load)
                && draft.is_none()
                && !self.importing
                && let Some(selected) = self.sources.get(self.selected)
            {
                self.importing = true;
                return Ok(Next::Import(Command::DraftSave {
                    fields: selected.fields.core(),
                }));
            }
            if self.importing
                && !draft.as_ref().is_some_and(|saved| {
                    self.sources
                        .get(self.selected)
                        .is_some_and(|source| ReportFields::from(&saved.fields) == source.fields)
                })
            {
                self.importing = false;
                return Err(HostError::Rejected);
            }
            let imported = self.importing;
            self.importing = false;
            if matches!(operation, Operation::Load) && draft.is_some() {
                self.surfaced = true;
            }
            if self.surfaced
                && (matches!(self.archive_retry, ArchiveRetry::Allowed)
                    || matches!(operation, Operation::Load))
                && !self.sources.is_empty()
                && (draft.is_some() || matches!(operation, Operation::Discard))
            {
                match self.archive() {
                    Ok(()) => {
                        self.archive_retry = ArchiveRetry::Allowed;
                        self.legacy = if imported {
                            if self.sources[self.selected].trimmed {
                                LegacyMigration::ImportedTrimmed
                            } else {
                                LegacyMigration::Imported
                            }
                        } else {
                            LegacyMigration::Preserved
                        };
                        self.sources.clear();
                        message
                            .push_str(" · borradores antiguos archivados; prevalece el protegido");
                    }
                    Err(error) => {
                        self.archive_retry = ArchiveRetry::NextLoad;
                        self.warning = Some(error);
                    }
                }
            }
            if let Some(warning) = self.warning {
                self.legacy = LegacyMigration::Preserved;
                message.push_str(" · ");
                message.push_str(warning.message());
            }
        }
        Ok(Next::Complete(reply))
    }
}

#[cfg(all(test, windows))]
#[path = "testing_legacy_tests.rs"]
mod tests;
