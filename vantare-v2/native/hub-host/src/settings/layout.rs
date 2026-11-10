//! Existing layout persistence only; this never constructs a GPUI application.
use std::path::PathBuf;
use vantare_ui::layout::{Document, Error};
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Change {
    Fallback,
    Saved,
    Conflict,
    Protected,
    Io,
}
pub struct Layout {
    path: PathBuf,
    document: Result<Document, Error>,
    pending: Option<bool>,
}
impl Layout {
    pub fn open(path: PathBuf) -> Self {
        let document = Document::open(path.clone());
        Self {
            path,
            document,
            pending: None,
        }
    }
    pub fn motion(&self) -> Option<bool> {
        self.document
            .as_ref()
            .ok()
            .and_then(|document| document.layout().reduced_motion)
    }
    pub fn pending(&self) -> bool {
        self.pending.is_some()
    }
    pub fn refresh(&mut self, discard: bool) {
        if discard || self.pending.is_none() {
            self.document = Document::open(self.path.clone());
            self.pending = None;
        }
    }
    pub fn set_motion(&mut self, enabled: bool) -> Change {
        let Ok(document) = &mut self.document else {
            return Change::Protected;
        };
        if document.layout().reduced_motion.is_none() {
            return if self.pending.is_some() {
                Change::Protected
            } else {
                Change::Fallback
            };
        }
        let mut next = document.layout().clone();
        next.reduced_motion = Some(enabled);
        match document.save(&next) {
            Ok(()) => {
                self.pending = None;
                Change::Saved
            }
            Err(Error::Conflict) => {
                self.pending = Some(enabled);
                self.document = Document::open(self.path.clone());
                Change::Conflict
            }
            Err(Error::Invalid(_) | Error::Unsupported(_) | Error::Json(_)) => Change::Protected,
            Err(Error::Io(_)) => Change::Io,
        }
    }
    pub fn retry(&mut self) -> Option<Change> {
        self.pending.map(|enabled| self.set_motion(enabled))
    }
}
