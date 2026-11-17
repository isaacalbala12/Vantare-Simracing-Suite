//! One session-owned worker, bounded channels, and no bridge-thread Reader ownership.
use super::{AnalysisLap, AnalysisSignal, AnalysisState, map_error};
use crate::{
    analysis::{Cancel, Reader, Stamp, Summary, stamp},
    protocol::{HostError, Reply},
};
use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver, SyncSender},
    },
    thread::JoinHandle,
    time::{Duration, Instant, SystemTime},
};

pub(super) enum Operation {
    Inspect {
        id: String,
        path: PathBuf,
        created: SystemTime,
    },
    Open {
        path: PathBuf,
        token: String,
        created: SystemTime,
    },
    Close,
}
pub(super) struct Job {
    pub id: u32,
    pub operation: Operation,
    pub cancel: Cancel,
}
pub(super) enum Command {
    Job(Job),
    Close,
}
#[derive(Debug)]
pub(super) struct Completion {
    pub id: u32,
    pub result: Result<Reply, HostError>,
}
pub(super) struct Worker {
    pub commands: SyncSender<Command>,
    pub results: Receiver<Completion>,
    pub reset: Arc<AtomicBool>,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}
impl Worker {
    pub fn start(helper: PathBuf) -> Result<Self, HostError> {
        let (commands, input) = mpsc::sync_channel(1);
        let (output, results) = mpsc::sync_channel(1);
        let reset = Arc::new(AtomicBool::new(false));
        let stop = Arc::new(AtomicBool::new(false));
        let reset_worker = reset.clone();
        let stop_worker = stop.clone();
        let thread = std::thread::Builder::new()
            .name("host-analysis".into())
            .spawn(move || {
                run(&helper, &input, &output, &reset_worker, &stop_worker);
            })
            .map_err(|_| HostError::AnalysisUnreadable)?;
        Ok(Self {
            commands,
            results,
            reset,
            stop,
            thread: Some(thread),
        })
    }
    #[cfg(test)]
    pub fn from_channels(commands: SyncSender<Command>, results: Receiver<Completion>) -> Self {
        Self {
            commands,
            results,
            reset: Arc::new(AtomicBool::new(false)),
            stop: Arc::new(AtomicBool::new(false)),
            thread: None,
        }
    }
}
impl Drop for Worker {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        let _ = self.commands.try_send(Command::Close);
        if let Some(thread) = self.thread.take() {
            let deadline = Instant::now() + Duration::from_millis(250);
            // Shutdown only (never tick): allow C1's 20 ms cancellation poll to reap the helper.
            while !thread.is_finished() && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(2));
            }
            if thread.is_finished() {
                if thread.join().is_err() {
                    eprintln!("host-analysis: worker panicked during shutdown");
                }
            } else {
                eprintln!(
                    "host-analysis: shutdown exceeded 250 ms; abandoning worker after cancellation"
                );
            }
        }
    }
}
fn run(
    helper: &std::path::Path,
    input: &Receiver<Command>,
    output: &SyncSender<Completion>,
    reset: &AtomicBool,
    stop: &AtomicBool,
) {
    let mut reader: Option<(Reader, Cancel)> = None;
    let mut cache: BTreeMap<String, (Stamp, Reply)> = BTreeMap::new();
    loop {
        if stop.load(Ordering::Acquire) {
            break;
        }
        if reset.swap(false, Ordering::AcqRel) {
            reader = None;
            cache.clear();
        }
        if reader
            .as_ref()
            .is_some_and(|(_, cancel)| cancel.load(Ordering::Acquire))
        {
            reader = None;
        }
        let job = match input.recv_timeout(Duration::from_millis(20)) {
            Ok(Command::Close) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Ok(Command::Job(job)) => job,
        };
        let result = if job.cancel.load(Ordering::Acquire) {
            Err(HostError::AnalysisCancelled)
        } else {
            execute(helper, &job, &mut reader, &mut cache)
        };
        let result = if job.cancel.load(Ordering::Acquire) {
            reader = None;
            Err(HostError::AnalysisCancelled)
        } else {
            result
        };
        if output.try_send(Completion { id: job.id, result }).is_err() {
            break;
        }
    }
}
fn execute(
    helper: &std::path::Path,
    job: &Job,
    reader: &mut Option<(Reader, Cancel)>,
    cache: &mut BTreeMap<String, (Stamp, Reply)>,
) -> Result<Reply, HostError> {
    match &job.operation {
        Operation::Close => {
            *reader = None;
            Ok(Reply::AnalysisClose {})
        }
        Operation::Inspect { id, path, created } => {
            let before = stamp(path).map_err(|e| map_error(e.code))?;
            if before.created != *created {
                return Err(HostError::AnalysisChanged);
            }
            if let Some((cached, reply)) = cache.get(id)
                && *cached == before
            {
                return Ok(reply.clone());
            }
            // Inspecting the already-open file uses a temporary reader; the session remains intact.
            let result = read(helper, path, *created, job.cancel.clone());
            let reply = match result {
                Ok((_, summary)) => Reply::AnalysisInspect {
                    state: if summary.finished {
                        AnalysisState::Complete
                    } else {
                        AnalysisState::Unconfirmed
                    },
                    laps: u32::try_from(summary.total).map_err(|_| HostError::AnalysisTooLarge)?,
                    best_lap_approx_ms: summary.laps.iter().filter_map(approx_ms).min(),
                },
                Err(HostError::AnalysisLocked) => inspect_state(AnalysisState::Locked),
                Err(HostError::AnalysisIncompatible) => inspect_state(AnalysisState::Incompatible),
                Err(HostError::AnalysisUnreadable) => inspect_state(AnalysisState::Unreadable),
                Err(error) => return Err(error),
            };
            // Locks are transient even when the DB stamp has not changed.
            if !matches!(
                reply,
                Reply::AnalysisInspect {
                    state: AnalysisState::Locked,
                    ..
                }
            ) && stamp(path).is_ok_and(|after| after == before)
            {
                if cache.len() >= 256 {
                    cache.clear();
                }
                cache.insert(id.clone(), (before, reply.clone()));
            }
            Ok(reply)
        }
        Operation::Open {
            path,
            token,
            created,
        } => {
            *reader = None;
            let (opened, summary) = read(helper, path, *created, job.cancel.clone())?;
            let laps = summary
                .laps
                .iter()
                .enumerate()
                .map(|(index, lap)| {
                    Ok(AnalysisLap {
                        index: u32::try_from(index).map_err(|_| HostError::AnalysisTooLarge)?,
                        lap: lap.lap,
                        car: lap.car,
                        sealed: lap.sealed,
                        gap: lap.gap,
                        samples: lap.samples,
                        lap_time_approx_ms: approx_ms(lap),
                        speed: signal(&lap.speed),
                        throttle: signal(&lap.throttle),
                        brake: signal(&lap.brake),
                    })
                })
                .collect::<Result<Vec<_>, HostError>>()?;
            *reader = Some((opened, job.cancel.clone()));
            Ok(Reply::AnalysisOpen {
                session: token.clone(),
                watermark: summary.watermark.to_string(),
                finished: summary.finished,
                attempted: summary.attempted.to_string(),
                total: summary.total.to_string(),
                laps,
            })
        }
    }
}
fn read(
    helper: &std::path::Path,
    path: &std::path::Path,
    created: SystemTime,
    cancel: Cancel,
) -> Result<(Reader, Summary), HostError> {
    let result = (|| {
        if !crate::analysis::recordings(
            path.parent()
                .ok_or_else(|| crate::analysis::invalid("Missing parent"))?,
        )?
        .contains(&path.to_path_buf())
        {
            return Err(crate::analysis::error(
                crate::analysis::ErrorCode::Changed,
                "Recording root changed",
            ));
        }
        let mut reader = Reader::open(helper, path, cancel)?;
        if reader.stamp.created != created {
            return Err(crate::analysis::error(
                crate::analysis::ErrorCode::Changed,
                "Recording replaced before opening",
            ));
        }
        let summary = reader.summaries()?;
        Ok::<_, crate::analysis::Error>((reader, summary))
    })();
    result.map_err(|error| {
        eprintln!("host-analysis: {:?}: {}", error.code, error.diagnostic);
        map_error(error.code)
    })
}
fn inspect_state(state: AnalysisState) -> Reply {
    Reply::AnalysisInspect {
        state,
        laps: 0,
        best_lap_approx_ms: None,
    }
}
#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "finite, rounded and bounded to u32 before casting"
)]
fn approx_ms(lap: &crate::analysis::Lap) -> Option<u32> {
    let ms = (lap.lap_time_approx_s()? * 1000.0).round();
    if ms.is_finite() && (0.0..=f64::from(u32::MAX)).contains(&ms) {
        Some(ms as u32)
    } else {
        None
    }
}
fn signal(value: &crate::analysis::Signal) -> AnalysisSignal {
    AnalysisSignal {
        reliable: value.reliable,
        estimated: value.estimated,
        stale: value.stale,
        unavailable: value.unavailable,
        min: value.min.and_then(serde_json::Number::from_f64),
        mean: value.mean.and_then(serde_json::Number::from_f64),
        max: value.max.and_then(serde_json::Number::from_f64),
    }
}
