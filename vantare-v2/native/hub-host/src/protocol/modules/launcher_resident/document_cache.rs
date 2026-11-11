//! Cache only the public shortcut projection, never executable/argument data.
use super::{ResidentAction, ResidentChoice, ResidentQuestion, ResidentQuestionKind, ResidentView};
use crate::shortcuts::ProfileShortcut;
use std::{path::Path, time::SystemTime};
use vantare_ipc::files;
use vantare_launcher::Document;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Stamp {
    Missing,
    Present(SystemTime, u64),
}

#[derive(Default)]
pub(super) struct Cache {
    stamp: Option<Stamp>,
    protected: bool,
    profiles: Vec<ProfileShortcut>,
    #[cfg(test)]
    pub(super) reads: usize,
}
impl Cache {
    pub(super) fn read(&mut self, path: &Path) -> (bool, Vec<ProfileShortcut>) {
        let stamp = match std::fs::metadata(path) {
            Ok(metadata) => match metadata.modified() {
                Ok(modified) => Stamp::Present(modified, metadata.len()),
                Err(_) => return (true, Vec::new()),
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Stamp::Missing,
            Err(_) => return (true, Vec::new()),
        };
        if self.stamp != Some(stamp) {
            self.profiles.clear();
            self.protected = false;
            self.stamp = Some(stamp);
            #[cfg(test)]
            {
                self.reads += 1;
            }
            match files::read_optional(path, files::MAX_DOCUMENT) {
                Ok(None) => {}
                Ok(Some(bytes)) => match Document::from_bytes(&bytes) {
                    Ok(document) => {
                        self.profiles = crate::shortcuts::project(&document, None).profiles
                    }
                    Err(_) => self.protected = true,
                },
                Err(_) => {
                    self.protected = true;
                }
            }
            if !fits_frame(&self.profiles) {
                self.protected = true;
                self.profiles.clear();
            }
        }
        (self.protected, self.profiles.clone())
    }
}
// Budget once per document change with the largest possible mailbox metadata.
// "unconfirmed" is the longest registration state; false is longer than true.
// The real decision has <=8 distinct actions and <=20 decimal id characters.
fn fits_frame(profiles: &[ProfileShortcut]) -> bool {
    let value = ResidentView {
        decision: Some(ResidentQuestion {
            id: u64::MAX.to_string(),
            kind: ResidentQuestionKind::AlreadyRunning,
            actions: ResidentAction::ALL
                .into_iter()
                .map(|id| ResidentChoice {
                    id,
                    label: id.label().into(),
                })
                .collect(),
        }),
        registrations: profiles.to_vec(),
        ..Default::default()
    };
    let envelope = crate::protocol::HostToUi::Response {
        id: u32::MAX,
        result: crate::protocol::Reply::LauncherResidentGet { value },
    };
    serde_json::to_vec(&envelope).is_ok_and(|bytes| bytes.len() <= crate::frame::LIMIT)
}
