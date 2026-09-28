//! One retained LMU process and mapping feed the canonical Rust assembler.
//! Pipe delivery and scheduling are owned by the later child runtime.

use std::io;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use super::cadence::TickCadence;
use super::process::RunningSource;
use super::rest::poller::Poller;
use super::{OBJECT_OUT_SIZE, admit_v13};
use crate::assembly::{Assembler, AssemblyError, FactReplay};
use crate::ipc::queue::{QueueError, WriterQueue};
use crate::ipc::{self, Kind};

#[derive(Debug)]
pub enum AcquisitionError {
    Io(io::Error),
    UnsupportedBuild,
    Clock,
    Assembly(AssemblyError),
    Queue(QueueError),
    InvalidControl,
}

pub struct Acquisition {
    source: RunningSource,
    assembler: Assembler,
    rest: Poller,
    frame: Vec<u8>,
    scratch: Vec<u8>,
    started: Instant,
}

impl Acquisition {
    /// The process, exact build and mapping are retained for this entire run.
    /// Unknown builds never reach the parser or the REST worker.
    pub fn open(slot_grace_frames: u64, fact_stream_id: u64) -> Result<Self, AcquisitionError> {
        let source = RunningSource::open().map_err(AcquisitionError::Io)?;
        if source.build.evidence.exact_supported_build().is_none() {
            return Err(AcquisitionError::UnsupportedBuild);
        }
        let assembler = Assembler::new(slot_grace_frames, fact_stream_id)
            .map_err(AcquisitionError::Assembly)?;
        let started = Instant::now();
        Ok(Self {
            source,
            assembler,
            rest: Poller::start(started),
            frame: vec![0; OBJECT_OUT_SIZE],
            scratch: vec![0; OBJECT_OUT_SIZE],
            started,
        })
    }

    pub fn configure(&mut self, frame: &[u8]) -> Result<(), AcquisitionError> {
        self.assembler
            .configure(frame)
            .map_err(AcquisitionError::Assembly)
    }

    /// Applies only host-to-child control frames. Replay is queued as one
    /// ordered event; saturation is fatal to this instance, not a lost Fact.
    pub fn handle_control_frame(
        &mut self,
        frame: &[u8],
        queue: &mut WriterQueue,
    ) -> Result<(), AcquisitionError> {
        handle_control_frame(&mut self.assembler, frame, queue)
    }

    pub fn source_health(&self) -> Option<(u64, bool)> {
        self.assembler
            .engine()
            .source_health(elapsed_ns(self.started))
    }

    /// One SHM tick. REST is consumed only from the last completed poll; a
    /// slow endpoint cannot delay this read. The caller owns bounded delivery.
    pub fn tick(&mut self) -> Result<Vec<Vec<u8>>, AcquisitionError> {
        let build = self
            .source
            .build
            .evidence
            .exact_supported_build()
            .ok_or(AcquisitionError::UnsupportedBuild)?;
        self.rest.take_into(self.assembler.rest_cache_mut());
        let source = &self.source;
        acquire_tick(
            &mut self.assembler,
            &mut self.frame,
            &mut self.scratch,
            build,
            |frame, scratch| source.read_stable(frame, scratch),
            || elapsed_ns(self.started),
            utc_ns,
        )
    }

    /// At most one SHM read per due slot. A delayed pipe consumer cannot
    /// cause a burst of old samples when the caller resumes this loop.
    pub fn tick_if_due(
        &mut self,
        cadence: &mut TickCadence,
        now: Instant,
    ) -> Result<Option<Vec<Vec<u8>>>, AcquisitionError> {
        if !cadence.take_due(now) {
            return Ok(None);
        }
        self.tick().map(Some)
    }

    /// A full writer queue is an explicit failure after canonical commit;
    /// the owner must restart/resync instead of losing a Fact silently.
    pub fn tick_into_queue_if_due(
        &mut self,
        cadence: &mut TickCadence,
        now: Instant,
        queue: &mut WriterQueue,
    ) -> Result<bool, AcquisitionError> {
        let Some(frames) = self.tick_if_due(cadence, now)? else {
            return Ok(false);
        };
        queue.push_batch(frames).map_err(AcquisitionError::Queue)?;
        Ok(true)
    }

    pub fn shutdown(&mut self) -> Result<(), AcquisitionError> {
        self.rest.shutdown().map_err(|_| {
            AcquisitionError::Io(io::Error::other("REST poller panicked during shutdown"))
        })
    }
}

fn handle_control_frame(
    assembler: &mut Assembler,
    frame: &[u8],
    queue: &mut WriterQueue,
) -> Result<(), AcquisitionError> {
    let kind = ipc::decode(frame)
        .map_err(|_| AcquisitionError::InvalidControl)?
        .kind;
    match kind {
        Kind::Configuration => assembler
            .configure(frame)
            .map_err(AcquisitionError::Assembly),
        Kind::FactAck => assembler
            .acknowledge_fact_frame(frame)
            .map(|_| ())
            .map_err(AcquisitionError::Assembly),
        Kind::FactReplayRequest => {
            let replay = assembler
                .replay_fact_request_frame(frame)
                .map_err(AcquisitionError::Assembly)?;
            let frames = match replay {
                FactReplay::Frames(frames) => frames.into_iter().map(<[u8]>::to_vec).collect(),
                FactReplay::Resync(frame) => vec![frame],
            };
            queue.push_batch(frames).map_err(AcquisitionError::Queue)
        }
        _ => Err(AcquisitionError::InvalidControl),
    }
}

fn acquire_tick(
    assembler: &mut Assembler,
    frame: &mut [u8],
    scratch: &mut [u8],
    build: &str,
    read: impl FnOnce(&mut [u8], &mut [u8]) -> io::Result<()>,
    elapsed_ns: impl Fn() -> u64,
    occurred_utc_ns: impl Fn() -> Result<i64, AcquisitionError>,
) -> Result<Vec<Vec<u8>>, AcquisitionError> {
    read(frame, scratch).map_err(AcquisitionError::Io)?;
    // A real LMU menu has no session to map. Keep the last committed state
    // untouched so the source-age gate can mark it stale after leaving track.
    // Validate this narrow shape before suppressing it; malformed frames fail.
    if idle_menu_frame(frame, build) {
        return Ok(Vec::new());
    }
    let shared_received_ns = elapsed_ns();
    let now_ns = elapsed_ns();
    assembler
        .apply(frame, build, shared_received_ns, now_ns, occurred_utc_ns()?)
        .map_err(AcquisitionError::Assembly)
}

fn idle_menu_frame(frame: &[u8], build: &str) -> bool {
    if frame.len() < OBJECT_OUT_SIZE
        || i32::from_le_bytes(frame[1_736..1_740].try_into().unwrap()) != 0
        || i32::from_le_bytes(frame[1_696..1_700].try_into().unwrap()) != 0
        || f64::from_le_bytes(frame[1_700..1_708].try_into().unwrap()) != 0.0
    {
        return false;
    }
    admit_v13(frame, build)
        .is_ok_and(|grid| grid.vehicles.is_empty() && grid.player_index.is_none())
}

fn elapsed_ns(start: Instant) -> u64 {
    start.elapsed().as_nanos().min(u128::from(u64::MAX)) as u64
}

fn utc_ns() -> Result<i64, AcquisitionError> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| AcquisitionError::Clock)?
        .as_nanos();
    i64::try_from(nanos).map_err(|_| AcquisitionError::Clock)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ipc::{self, Kind};

    const REAL_44: &[u8] = include_bytes!("../../../../testdata/lmu-fixture.bin");
    const REAL_1420_MENU: &[u8] =
        include_bytes!("../../../../testdata/lmu-1.4.2.0-menu-fixture.bin");
    const CONFIG: &[u8] = include_bytes!("../../testdata/configuration-frame-go-v1.bin");

    #[test]
    fn real_frame_reaches_assembler_and_read_failure_does_not_commit() {
        let mut assembler = Assembler::new(30, 15).unwrap();
        assembler.configure(CONFIG).unwrap();
        let mut frame = vec![0; OBJECT_OUT_SIZE];
        let mut scratch = vec![0; OBJECT_OUT_SIZE];
        let error = acquire_tick(
            &mut assembler,
            &mut frame,
            &mut scratch,
            "1.3.0.0",
            |_, _| {
                Err(io::Error::new(
                    io::ErrorKind::WouldBlock,
                    "unstable mapping",
                ))
            },
            || 100,
            || Ok(1_000_000_000),
        )
        .unwrap_err();
        assert!(matches!(error, AcquisitionError::Io(_)));
        assert!(assembler.engine().current().is_none());

        let frames = acquire_tick(
            &mut assembler,
            &mut frame,
            &mut scratch,
            "1.3.0.0",
            |destination, _| {
                destination.copy_from_slice(REAL_44);
                Ok(())
            },
            || 200,
            || Ok(1_000_000_000),
        )
        .unwrap();
        assert_eq!(
            ipc::decode(&frames[0]).unwrap().kind,
            Kind::ConfigurationAck
        );
        assert_eq!(
            assembler.engine().current().unwrap().state.vehicles.len(),
            44
        );
        assert_eq!(assembler.engine().source_health(200), Some((0, false)));
        assert_eq!(
            assembler.engine().source_health(500_000_200),
            Some((500_000_000, true))
        );
    }

    #[test]
    fn installed_exact_lmu_build_can_start_acquisition() {
        if std::env::var_os("VANTARE_LMU_LIVE_PROCESS_TEST").is_none() {
            return;
        }
        assert!(Acquisition::open(30, 15).is_ok());
    }

    #[test]
    fn installed_exact_lmu_build_produces_configured_tick() {
        if std::env::var_os("VANTARE_LMU_LIVE_PROCESS_TEST").is_none() {
            return;
        }
        let mut acquisition = Acquisition::open(30, 15).unwrap();
        acquisition.configure(CONFIG).unwrap();
        let frames = acquisition.tick().unwrap();
        if idle_menu_frame(&acquisition.frame, "1.4.2.0") {
            assert!(frames.is_empty());
            assert!(acquisition.source_health().is_none());
        } else {
            assert_eq!(
                ipc::decode(&frames[0]).unwrap().kind,
                Kind::ConfigurationAck
            );
            assert!(
                frames
                    .iter()
                    .any(|frame| ipc::decode(frame).unwrap().kind == Kind::Snapshot)
            );
            assert!(acquisition.source_health().is_some());
        }
        acquisition.shutdown().unwrap();
    }

    #[test]
    fn genuine_menu_is_idle_without_committing_or_masking_invalid_frames() {
        let mut assembler = Assembler::new(30, 15).unwrap();
        assembler.configure(CONFIG).unwrap();
        let mut frame = vec![0; OBJECT_OUT_SIZE];
        let mut scratch = vec![0; OBJECT_OUT_SIZE];
        let frames = acquire_tick(
            &mut assembler,
            &mut frame,
            &mut scratch,
            "1.4.2.0",
            |destination, _| {
                destination.copy_from_slice(REAL_1420_MENU);
                Ok(())
            },
            || 100,
            || Ok(1_000_000_000),
        )
        .unwrap();
        assert!(frames.is_empty());
        assert!(assembler.engine().current().is_none());
        frame[1_632..1_696].fill(0xff);
        assert!(!idle_menu_frame(&frame, "1.4.2.0"));
    }

    #[test]
    fn host_control_replays_and_acknowledges_real_fact_in_order() {
        let mut assembler = Assembler::new(30, 15).unwrap();
        let mut queue = WriterQueue::new();
        handle_control_frame(&mut assembler, CONFIG, &mut queue).unwrap();
        let produced = assembler
            .apply(REAL_44, "1.3.0.0", 100, 100, 1_000_000_000)
            .unwrap();
        assert!(
            produced
                .iter()
                .any(|frame| ipc::decode(frame).unwrap().kind == Kind::Fact)
        );
        let request =
            ipc::encode(Kind::FactReplayRequest, br#"{"stream":15,"sequence":0}"#).unwrap();
        handle_control_frame(&mut assembler, &request, &mut queue).unwrap();
        let replay = queue.pop_batch().unwrap();
        assert_eq!(replay.len(), 1);
        assert_eq!(ipc::decode(&replay[0]).unwrap().kind, Kind::Fact);
        let ack = ipc::encode(Kind::FactAck, br#"{"stream":15,"sequence":1}"#).unwrap();
        handle_control_frame(&mut assembler, &ack, &mut queue).unwrap();
        handle_control_frame(&mut assembler, &request, &mut queue).unwrap();
        let resync = queue.pop_batch().unwrap();
        assert_eq!(resync.len(), 1);
        assert_eq!(ipc::decode(&resync[0]).unwrap().kind, Kind::ResyncRequired);
        assert!(matches!(
            handle_control_frame(
                &mut assembler,
                &ipc::encode(Kind::Stop, &[]).unwrap(),
                &mut queue
            ),
            Err(AcquisitionError::InvalidControl)
        ));
    }
}
