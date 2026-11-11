//! Discovery runs outside the UI loop. One owned worker, cancellation and join.
use super::{Discovery, Document, HostError, LauncherView, Path, files, mailbox, open, project};
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::JoinHandle,
    time::Instant,
};
use vantare_launcher::discovery::Sources;
fn initialize_missing(path: &Path) -> Result<(), HostError> {
    // GPUI shell.rs:1537 -> Store::load_production uses this same factory/writer.
    // The caller already observed absence; CAS preserves a racing writer's bytes.
    if path.is_absolute() && !vantare_launcher::is_local_path(path) {
        return Err(HostError::Denied);
    }
    let document = Document::fresh_install();
    let mut store = vantare_launcher::Store::in_memory(path.into(), document.clone())
        .map_err(|_| HostError::Io)?;
    match store.replace(document) {
        Ok(()) => Ok(()),
        Err(error) if error.kind().is_conflict() => Ok(()), // Observe the racing writer; never quarantine it.
        Err(error) if error.kind() == files::Kind::Busy => Err(HostError::Busy),
        Err(_) => Err(HostError::Io),
    }
}
struct Scan {
    cancel: Arc<AtomicBool>,
    worker: JoinHandle<Option<(String, Discovery)>>,
}
impl Scan {
    fn start(revision: String, apps: Vec<vantare_launcher::App>) -> std::io::Result<Self> {
        let cancel = Arc::new(AtomicBool::new(false));
        let stop = Arc::clone(&cancel);
        let worker = std::thread::Builder::new()
            .name("hub-launcher-discovery".into())
            .spawn(move || {
                // Existing discovery is bounded to local sources and entry budgets.
                // Cancellation is checked at source/scan boundaries; no result is
                // published after cancellation. The owner always collects the worker.
                if stop.load(Ordering::Acquire) {
                    return None;
                }
                let sources = Sources::system();
                if stop.load(Ordering::Acquire) {
                    return None;
                }
                let found = Discovery::scan(&apps, sources);
                (!stop.load(Ordering::Acquire)).then_some((revision, found))
            })?;
        Ok(Self { cancel, worker })
    }
}
pub struct Reader {
    path: PathBuf,
    opened: bool,
    resident: super::resident::Reader,
    found: Discovery,
    scanned_revision: Option<String>,
    scan: Option<Scan>,
    last_check: Option<Instant>,
    last_view: Option<LauncherView>,
}
impl Reader {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            opened: false,
            resident: super::resident::Reader::default(),
            found: Discovery::default(),
            scanned_revision: None,
            scan: None,
            last_check: None,
            last_view: None,
        }
    }
    fn open_document(&mut self) -> Result<Option<(Vec<u8>, Document)>, HostError> {
        let first = !std::mem::replace(&mut self.opened, true);
        let opened = open(&self.path)?;
        if first && opened.is_none() {
            initialize_missing(&self.path)?;
            return open(&self.path);
        }
        Ok(opened)
    }
    pub fn view(&mut self) -> LauncherView {
        if self
            .scan
            .as_ref()
            .is_some_and(|scan| scan.worker.is_finished())
        {
            let scan = self.scan.take().expect("finished scan");
            if let Ok(Some((revision, found))) = scan.worker.join() {
                self.scanned_revision = Some(revision);
                self.found = found;
            }
        }
        let Ok(Some((bytes, document))) = self.open_document() else {
            return LauncherView {
                protected: true,
                ..Default::default()
            };
        };
        let revision = vantare_services::content_hash(&bytes);
        if self.scanned_revision.as_ref() != Some(&revision) && self.scan.is_none() {
            // Never reuse availability for a different document revision.
            self.found = Discovery::default();
            self.scan = Scan::start(revision, document.apps.clone()).ok();
        }
        project(
            &bytes,
            &document,
            &self.found,
            mailbox::read_status(&self.path).as_ref(),
            self.scan.is_some(),
            &self.resident,
        )
    }
    pub fn answer(
        &mut self,
        core: &crate::protocol::CoreStatus,
        decision: &str,
        action: super::resident::LauncherAnswerAction,
    ) -> Result<bool, HostError> {
        self.resident.answer(&self.path, core, decision, action)
    }
    pub fn rescan(&mut self) {
        // An explicit reload refreshes availability without launching a second worker.
        self.scanned_revision = None;
    }
    pub fn scan(&mut self) -> Result<LauncherView, HostError> {
        if self.scan.is_some() {
            return Err(HostError::Busy);
        }
        self.scanned_revision = None;
        Ok(self.view())
    }
    pub fn discovered(&self, revision: &str) -> Option<&Discovery> {
        (self.scan.is_none() && self.scanned_revision.as_deref() == Some(revision))
            .then_some(&self.found)
    }
    pub fn changed(&mut self, subscribed: bool, now: Instant) -> Option<LauncherView> {
        if !subscribed {
            self.last_check = None;
            self.last_view = None;
            return None;
        }
        if self
            .last_check
            .is_some_and(|last| now.duration_since(last).as_millis() < 500)
        {
            return None;
        }
        self.last_check = Some(now);
        let view = self.view();
        if self.last_view.as_ref() == Some(&view) {
            return None;
        }
        self.last_view = Some(view.clone());
        Some(view)
    }
}
impl Drop for Reader {
    fn drop(&mut self) {
        if let Some(scan) = self.scan.take() {
            scan.cancel.store(true, Ordering::Release);
            let _ = scan.worker.join();
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn no_subscription_means_no_discovery_or_status_watch() {
        let mut reader = Reader::new(PathBuf::from("absent-launcher-fixture.json"));
        assert!(reader.changed(false, Instant::now()).is_none());
        assert!(reader.scan.is_none());
        assert!(reader.last_check.is_none());
    }
}

#[cfg(all(test, windows))]
mod initialization_tests {
    use super::*;
    #[test]
    fn first_open_seeds_once_but_later_reads_do_not_recreate_a_removed_document() {
        let root = crate::test_support::Root::new();
        let path = root.path.join("launcher.json");
        let mut reader = Reader::new(path.clone());
        let (bytes, document) = reader.open_document().unwrap().unwrap();
        assert_eq!(document.profiles.len(), 2);
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        std::fs::remove_file(&path).unwrap();
        assert!(reader.open_document().unwrap().is_none());
        assert!(reader.open_document().unwrap().is_none());
        assert!(!path.exists());
    }
    #[test]
    fn initialization_uses_the_same_local_path_guard_as_the_shared_store() {
        let path = Path::new(r"\\server\share\launcher.json");
        assert!(!vantare_launcher::is_local_path(path));
        assert_eq!(initialize_missing(path), Err(HostError::Denied));
        assert!(vantare_launcher::Store::load(path.into()).is_err());
    }
    #[test]
    fn launcher_is_seeded_on_first_open_but_existing_or_protected_bytes_are_never_replaced() {
        let root = crate::test_support::Root::new();
        let path = root.path.join("launcher.json");
        initialize_missing(&path).unwrap();
        let bytes = std::fs::read(&path).unwrap();
        assert_eq!(Document::from_bytes(&bytes).unwrap().profiles.len(), 2);
        initialize_missing(&path).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        let future = br#"{"version":999}"#;
        std::fs::write(&path, future).unwrap();
        initialize_missing(&path).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), future);
        assert!(std::fs::read_dir(&root.path).unwrap().all(|entry| {
            !entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .contains("invalid")
        }));
    }
}
