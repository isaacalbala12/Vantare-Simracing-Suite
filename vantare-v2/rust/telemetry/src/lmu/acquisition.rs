//! One retained LMU process and mapping feed the canonical Rust assembler.
//! Pipe delivery and scheduling are owned by the later child runtime.

use std::io;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use super::OBJECT_OUT_SIZE;
use super::process::RunningSource;
use super::rest::poller::Poller;
use crate::assembly::{Assembler, AssemblyError};

#[derive(Debug)]
pub enum AcquisitionError {
    Io(io::Error),
    UnsupportedBuild,
    Clock,
    Assembly(AssemblyError),
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

    pub fn shutdown(&mut self) -> Result<(), AcquisitionError> {
        self.rest.shutdown().map_err(|_| {
            AcquisitionError::Io(io::Error::other("REST poller panicked during shutdown"))
        })
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
    let shared_received_ns = elapsed_ns();
    let now_ns = elapsed_ns();
    assembler
        .apply(frame, build, shared_received_ns, now_ns, occurred_utc_ns()?)
        .map_err(AcquisitionError::Assembly)
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
    }

    #[test]
    fn installed_unknown_lmu_build_cannot_start_acquisition() {
        if std::env::var_os("VANTARE_LMU_LIVE_PROCESS_TEST").is_none() {
            return;
        }
        assert!(matches!(
            Acquisition::open(30, 15),
            Err(AcquisitionError::UnsupportedBuild)
        ));
    }
}
