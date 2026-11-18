//! Session-local catalog tokens. No paths cross the bridge.
use crate::protocol::{HostError, Reply, Request};
use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    time::{Duration, Instant},
};
#[path = "worker.rs"]
mod worker;
struct Pending {
    id: u32,
    answered: bool,
    opening: bool,
    started: Instant,
    cancel: super::Cancel,
}
impl Pending {
    fn reply_id(&mut self) -> Option<u32> {
        if self.answered {
            None
        } else {
            self.answered = true;
            Some(self.id)
        }
    }
}
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::PathBuf, time::UNIX_EPOCH};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;

pub const CATALOG_MAX: u16 = 256;

pub struct State {
    root: PathBuf,
    paths: BTreeMap<String, PathBuf>,
    stamps: BTreeMap<String, super::Stamp>,
    worker: Option<worker::Worker>,
    pending: Option<Pending>,
    session: Option<String>,
    session_cancel: Option<super::Cancel>,
    helper: Option<PathBuf>,
    cancelled: bool,
    #[cfg(test)]
    test_result: Option<worker::Completion>,
    #[cfg(test)]
    pause_next: Option<worker::ReadPause>,
}
impl State {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            paths: BTreeMap::new(),
            stamps: BTreeMap::new(),
            worker: None,
            pending: None,
            session: None,
            session_cancel: None,
            helper: None,
            cancelled: false,
            #[cfg(test)]
            test_result: None,
            #[cfg(test)]
            pause_next: None,
        }
    }
    pub fn status(&self) -> Option<crate::analysis::status::AnalysisRecordingStatus> {
        crate::analysis::status::read(&self.root, &self.paths)
    }
    pub fn clear(&mut self) {
        self.paths.clear();
        self.stamps.clear();
        self.cancel();
        if let Some(cancel) = self.session_cancel.take() {
            cancel.store(true, Ordering::Release);
        }
        self.session = None;
        if let Some(worker) = &self.worker {
            worker.reset.store(true, Ordering::Release);
        }
    }
    pub fn catalog(&mut self) -> Result<Vec<AnalysisRow>, HostError> {
        if self.pending.is_some() {
            return Err(HostError::Busy);
        }
        self.paths.clear();
        self.stamps.clear();
        let paths =
            crate::analysis::recordings(&self.root).map_err(|e| map_catalog_error(e.code))?;
        let mut entries = Vec::new();
        for path in paths {
            let m = std::fs::symlink_metadata(&path).map_err(|_| HostError::AnalysisUnreadable)?;
            if !m.is_file() || super::reparse(&m) {
                return Err(HostError::AnalysisChanged);
            }
            let created = m.created().map_err(|_| HostError::AnalysisUnreadable)?;
            let ms = created
                .duration_since(UNIX_EPOCH)
                .map_err(|_| HostError::AnalysisUnreadable)?
                .as_millis();
            if ms >= (1_u128 << 53) || m.len() >= (1_u64 << 53) {
                return Err(HostError::AnalysisTooLarge);
            }
            entries.push((
                created,
                path,
                u64::try_from(ms).map_err(|_| HostError::AnalysisTooLarge)?,
                m.len(),
            ));
        }
        entries.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
        let mut tokens = BTreeMap::new();
        let mut rows = Vec::new();
        let recording_file = self.recording_file();
        for (_, path, started_at_ms, size_bytes) in entries {
            let id = vantare_services::random_id().map_err(|_| HostError::AnalysisUnreadable)?;
            self.stamps.insert(
                id.clone(),
                super::stamp(&path).map_err(|e| map_error(e.code))?,
            );
            let recording = recording_file
                .as_ref()
                .is_some_and(|file| path.file_name().is_some_and(|name| name == file.as_str()));
            tokens.insert(id.clone(), path);
            rows.push(AnalysisRow {
                id,
                started_at_ms,
                size_bytes,
                recording,
            });
        }
        self.paths = tokens;
        Ok(rows)
    }
    fn recording_file(&self) -> Option<String> {
        let status = self.root.join("recording-status.json");
        let metadata = std::fs::symlink_metadata(&status).ok()?;
        if !metadata.is_file() || super::reparse(&metadata) || metadata.len() > 16 * 1024 {
            return None;
        }
        let bytes = std::fs::read(status).ok()?;
        let value = serde_json::from_slice::<serde_json::Value>(&bytes).ok()?;
        if value["state"] != "recording" {
            return None;
        }
        // Un corte del Core deja el JSON en «recording»: solo vale una grabación
        // que un writer tenga realmente abierta.
        let file = value["file"].as_str()?;
        // Un `file` con ruta o `..` no se sondea (nada fuera del directorio): se
        // trata como dudoso, es decir, vivo; luego solo coincide con un nombre real.
        (!crate::analysis::status::plain_name(file)
            || crate::analysis::status::writer_alive(&self.root.join(file)))
        .then(|| file.to_owned())
    }
    pub fn start(
        &mut self,
        id: u32,
        request: &Request,
        now: Instant,
    ) -> Result<Option<Reply>, HostError> {
        if self.pending.is_some() {
            return Err(HostError::Busy);
        }
        let operation =
            match request {
                Request::AnalysisOpen { id } | Request::AnalysisInspect { id } => {
                    let path = self
                        .paths
                        .get(id)
                        .ok_or(HostError::AnalysisNotFound)?
                        .clone();
                    if !super::recordings(&self.root)
                        .map_err(|e| map_catalog_error(e.code))?
                        .contains(&path)
                        || self.stamps.get(id).map(|stamp| stamp.created)
                            != Some(super::stamp(&path).map_err(|e| map_error(e.code))?.created)
                    {
                        return Err(HostError::AnalysisChanged);
                    }
                    let created = self
                        .stamps
                        .get(id)
                        .ok_or(HostError::AnalysisNotFound)?
                        .created;
                    if self.recording_file().as_ref().is_some_and(|file| {
                        path.file_name().is_some_and(|name| name == file.as_str())
                    }) {
                        return Err(HostError::AnalysisLocked);
                    }
                    if matches!(request, Request::AnalysisOpen { .. }) {
                        self.session = None;
                        if let Some(cancel) = self.session_cancel.take() {
                            cancel.store(true, Ordering::Release);
                        }
                        worker::Operation::Open {
                            path,
                            created,
                            token: vantare_services::random_id()
                                .map_err(|_| HostError::AnalysisUnreadable)?,
                        }
                    } else {
                        worker::Operation::Inspect {
                            created,
                            id: id.clone(),
                            path,
                        }
                    }
                }
                Request::AnalysisCompare { session, a, b } => {
                    if self.session.as_ref() != Some(session) {
                        return Err(HostError::AnalysisNotFound);
                    }
                    worker::Operation::Compare { a: *a, b: *b }
                }
                Request::AnalysisClose { session } => {
                    if self.session.as_ref() != Some(session) {
                        return Err(HostError::AnalysisNotFound);
                    }
                    self.session = None;
                    worker::Operation::Close
                }
                _ => return Err(HostError::Rejected),
            };
        self.submit(id, operation, now)?;
        Ok(None)
    }
    fn submit(
        &mut self,
        id: u32,
        operation: worker::Operation,
        now: Instant,
    ) -> Result<(), HostError> {
        if self.pending.is_some() {
            return Err(HostError::Busy);
        }
        if self.worker.is_none() {
            let helper = match &self.helper {
                Some(path) => path.clone(),
                None => storage_helper_path()?,
            };
            self.worker = Some(worker::Worker::start(helper)?);
        }
        let cancel = Arc::new(AtomicBool::new(false));
        let opening = matches!(
            operation,
            worker::Operation::Open { .. } | worker::Operation::Compare { .. }
        );
        let job = worker::Command::Job(worker::Job {
            id,
            operation,
            cancel: cancel.clone(),
            deadline: now + Duration::from_secs(40),
            #[cfg(test)]
            pause: self.pause_next.take(),
        });
        match self
            .worker
            .as_ref()
            .ok_or(HostError::AnalysisUnreadable)?
            .commands
            .try_send(job)
        {
            Ok(()) => {
                self.pending = Some(Pending {
                    id,
                    answered: false,
                    opening,
                    started: now,
                    cancel,
                });
                Ok(())
            }
            Err(mpsc::TrySendError::Full(_)) => Err(HostError::Busy),
            Err(mpsc::TrySendError::Disconnected(_)) => {
                self.clear();
                self.cancelled = false;
                self.worker = None;
                Err(HostError::AnalysisUnreadable)
            }
        }
    }
    pub fn cancel(&mut self) -> bool {
        let Some(pending) = &self.pending else {
            return false;
        };
        if pending.answered {
            return false;
        }
        pending.cancel.store(true, Ordering::Release);
        if pending.opening {
            if let Some(cancel) = self.session_cancel.take() {
                cancel.store(true, Ordering::Release);
            }
            self.session = None;
        }
        self.cancelled = true;
        true
    }
    // The caller supplies a monotonic clock; tests advance it without waiting.
    pub fn poll(
        &mut self,
        now: Instant,
        allowed: bool,
        closing: bool,
    ) -> Option<(u32, Result<Reply, HostError>)> {
        let failure =
            if !allowed {
                Some(HostError::Denied)
            } else if closing {
                Some(HostError::AnalysisCancelled)
            } else if self.pending.as_ref().is_some_and(|p| {
                now.saturating_duration_since(p.started) >= Duration::from_secs(40)
            }) {
                Some(HostError::AnalysisTimeout)
            } else if self.cancelled {
                Some(HostError::AnalysisCancelled)
            } else {
                None
            };
        if let Some(error) = failure {
            if !allowed || closing {
                self.clear();
            } else {
                self.cancel();
            }
            self.cancelled = false;
            if let Some(id) = self.pending.as_mut().and_then(Pending::reply_id) {
                return Some((id, Err(error)));
            }
        }
        self.cancelled = false;
        #[cfg(test)]
        let buffered = self.test_result.take();
        #[cfg(not(test))]
        let buffered: Option<worker::Completion> = None;
        let completion = match buffered.map_or_else(
            || {
                self.worker
                    .as_ref()
                    .map_or(Err(mpsc::TryRecvError::Empty), |w| w.results.try_recv())
            },
            Ok,
        ) {
            Ok(completion) => completion,
            Err(mpsc::TryRecvError::Empty) => return None,
            Err(mpsc::TryRecvError::Disconnected) => {
                self.clear();
                self.cancelled = false;
                self.worker = None;
                let pending = self.pending.take();
                return pending.and_then(|mut p| {
                    p.reply_id()
                        .map(|id| (id, Err(HostError::AnalysisUnreadable)))
                });
            }
        };
        let mut pending = self.pending.take()?;
        if pending.id != completion.id {
            self.clear();
            self.cancelled = false;
            return pending
                .reply_id()
                .map(|id| (id, Err(HostError::AnalysisUnreadable)));
        }
        let id = pending.reply_id()?;
        if let Ok(Reply::AnalysisOpen { session, .. }) = &completion.result {
            self.session = Some(session.clone());
            self.session_cancel = Some(pending.cancel);
        }
        if matches!(
            completion.result,
            Err(HostError::AnalysisChanged
                | HostError::AnalysisCancelled
                | HostError::AnalysisTimeout
                | HostError::AnalysisUnreadable)
        ) && pending.opening
        {
            self.session = None;
            self.session_cancel = None;
        }
        Some((id, completion.result))
    }
    #[cfg(test)]
    pub(crate) fn pause_next_read_for_test(
        &mut self,
    ) -> (mpsc::Receiver<u32>, mpsc::SyncSender<()>) {
        let (ready, opened) = mpsc::sync_channel(1);
        let (resume, wait) = mpsc::sync_channel(1);
        self.pause_next = Some(worker::ReadPause { ready, wait });
        (opened, resume)
    }
    #[cfg(test)]
    pub(crate) fn helper_for_test(&mut self, helper: PathBuf) {
        self.helper = Some(helper);
    }
    #[cfg(test)]
    #[allow(clippy::unwrap_used, reason = "test-only explicit synchronization")]
    pub(crate) fn wait_for_test(&mut self) {
        self.test_result = Some(
            self.worker
                .as_ref()
                .unwrap()
                .results
                .recv_timeout(Duration::from_secs(10))
                .unwrap(),
        );
    }
}
pub(super) fn map_catalog_error(code: crate::analysis::ErrorCode) -> HostError {
    if code == crate::analysis::ErrorCode::Limit {
        HostError::AnalysisTooMany
    } else {
        map_error(code)
    }
}
/// C1's Limit means reader size; catalog translates it to `TooMany` at its call site.
/// C1's filesystem Io and malformed input both expose Unreadable, without diagnostics.
pub fn map_error(code: crate::analysis::ErrorCode) -> HostError {
    use crate::analysis::ErrorCode;
    match code {
        ErrorCode::Missing => HostError::AnalysisNotFound,
        ErrorCode::Locked => HostError::AnalysisLocked,
        ErrorCode::Incompatible => HostError::AnalysisIncompatible,
        ErrorCode::Unreadable | ErrorCode::Io => HostError::AnalysisUnreadable,
        ErrorCode::Changed => HostError::AnalysisChanged,
        ErrorCode::Limit => HostError::AnalysisTooLarge,
        ErrorCode::Cancelled => HostError::AnalysisCancelled,
        ErrorCode::Deadline => HostError::AnalysisTimeout,
    }
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisRow {
    pub id: String,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub started_at_ms: u64,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub size_bytes: u64,
    pub recording: bool,
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub enum AnalysisState {
    Complete,
    Unconfirmed,
    Locked,
    Incompatible,
    Unreadable,
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisSignal {
    pub reliable: u32,
    pub estimated: u32,
    pub stale: u32,
    pub unavailable: u32,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number | null"))]
    // JSON Number keeps the transport Eq and cannot represent NaN or infinity.
    pub min: Option<serde_json::Number>,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number | null"))]
    pub mean: Option<serde_json::Number>,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number | null"))]
    pub max: Option<serde_json::Number>,
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisLap {
    pub index: u32,
    pub lap: u32,
    pub car: u32,
    pub sealed: bool,
    pub gap: bool,
    pub samples: u32,
    pub lap_time_approx_ms: Option<u32>,
    pub session: Option<u32>,
    pub lap_time_ms: Option<u32>,
    pub sectors_ms: Option<Vec<u32>>,
    pub speed: AnalysisSignal,
    pub throttle: AnalysisSignal,
    pub brake: AnalysisSignal,
}

#[cfg(test)]
#[path = "tests.rs"]
mod tests;

#[cfg(test)]
#[path = "work_tests.rs"]
mod work_tests;

impl Drop for State {
    fn drop(&mut self) {
        self.clear();
    }
}
fn storage_helper_path() -> Result<PathBuf, HostError> {
    let host = std::env::current_exe().map_err(|_| HostError::AnalysisUnreadable)?;
    let helper = host
        .parent()
        .ok_or(HostError::AnalysisUnreadable)?
        .join(format!("vantare-storage{}", std::env::consts::EXE_SUFFIX));
    if !helper.is_file() {
        eprintln!("host-analysis: storage helper missing beside host");
        return Err(HostError::AnalysisUnreadable);
    }
    Ok(helper)
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AnalysisSessionKind {
    Practice,
    Qualifying,
    Race,
    Other,
    Unknown,
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AnalysisSessionEndReason {
    SessionChanged,
    CoreStopped,
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisSessionSummary {
    pub index: u32,
    pub kind: AnalysisSessionKind,
    pub kind_text: Option<String>,
    pub track_name: Option<String>,
    pub vehicle: Option<String>,
    pub class_name: Option<String>,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub started_at_ms: u64,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number | null"))]
    pub ended_at_ms: Option<u64>,
    pub sealed: bool,
    pub end_reason: Option<AnalysisSessionEndReason>,
    pub position_at_close: Option<u32>,
    pub class_position_at_close: Option<u32>,
    pub laps_completed: Option<u32>,
    pub best_lap_ms: Option<u32>,
}
