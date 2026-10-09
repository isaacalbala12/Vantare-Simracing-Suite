//! Diagnóstico compartido, activado solo con `VANTARE_PROFILE_PHASES=1`. No viaja por IPC.
//! Los ciclos son del hilo; las duraciones incluyen esperas. QPC permite correlacionar
//! procesos Windows, pero el pintado CPU no demuestra presentación en pantalla.

use std::sync::OnceLock;
use std::sync::atomic::{AtomicU64, Ordering::Relaxed};
use std::time::Instant;

#[derive(Clone, Copy)]
pub enum Stage {
    Poll,
    Observe,
    Publish,
    Feed,
    Project,
    Render,
    Paint,
    Shm,
    Rest,
    RestCache,
    Translate,
    Validation,
    Derive,
    Journal,
    Series,
    VmDiff,
    Layout,
    TextLayout,
    GpuSubmit,
    Present,
    Serialize,
    IpcWrite,
    Decode,
    Dto,
}

const NAMES: [&str; 24] = [
    "poll",
    "observe",
    "publish",
    "feed",
    "project",
    "render",
    "paint",
    "shm",
    "rest",
    "rest_cache",
    "translate",
    "validation",
    "derive",
    "journal",
    "series",
    "vm_diff",
    "layout",
    "text_layout",
    "gpu_submit",
    "present",
    "serialize",
    "ipc_write",
    "decode",
    "dto",
];
static COUNTS: [AtomicU64; NAMES.len() * 4] = [const { AtomicU64::new(0) }; NAMES.len() * 4];

pub fn enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| std::env::var("VANTARE_PROFILE_PHASES").is_ok_and(|value| value == "1"))
}

pub struct Span {
    stage: usize,
    start: Instant,
    cycles: Option<u64>,
    clock: Option<u64>,
}

pub fn begin(stage: Stage) -> Option<Span> {
    if !enabled() {
        return None;
    }
    Some(Span {
        stage: stage as usize,
        start: Instant::now(),
        cycles: cycles(false),
        clock: clock(),
    })
}

impl Drop for Span {
    fn drop(&mut self) {
        let offset = self.stage * 4;
        COUNTS[offset].fetch_add(1, Relaxed);
        let nanoseconds = self
            .clock
            .zip(clock())
            .and_then(|(before, after)| after.checked_sub(before))
            .zip(frequency())
            .filter(|(_, hz)| *hz > 0)
            .map_or_else(
                || self.start.elapsed().as_nanos(),
                |(ticks, hz)| u128::from(ticks) * 1_000_000_000 / u128::from(hz),
            );
        COUNTS[offset + 1].fetch_add(u64::try_from(nanoseconds).unwrap_or(u64::MAX), Relaxed);
        match self
            .cycles
            .zip(cycles(false))
            .and_then(|(before, after)| after.checked_sub(before))
        {
            Some(value) => {
                COUNTS[offset + 2].fetch_add(value, Relaxed);
            }
            None => {
                COUNTS[offset + 3].fetch_add(1, Relaxed);
            }
        }
    }
}

/// Una muestra por segundo; contadores acotados, sin guardar fotos ni cadenas.
pub fn report() {
    if !enabled() {
        return;
    }
    eprintln!(
        "perf process_cycles={:?} clock={:?} frequency={:?}",
        cycles(true),
        clock(),
        frequency()
    );
    for (stage, name) in NAMES.iter().enumerate() {
        let offset = stage * 4;
        let calls = COUNTS[offset].swap(0, Relaxed);
        let wall_ns = COUNTS[offset + 1].swap(0, Relaxed);
        let cpu_cycles = COUNTS[offset + 2].swap(0, Relaxed);
        let errors = COUNTS[offset + 3].swap(0, Relaxed);
        if calls > 0 {
            eprintln!(
                "perf stage={name} calls={calls} wall_ns={wall_ns} cpu_cycles={cpu_cycles} cycle_errors={errors}"
            );
        }
    }
}

/// El backend no depende de ui: comparte el mismo fichero de diagnóstico,
/// con contadores propios y una emisión acotada por segundo desde Present.
pub fn report_if_due() {
    static PREVIOUS: AtomicU64 = AtomicU64::new(0);
    if !enabled() {
        return;
    }
    if let Some((now, hz)) = clock().zip(frequency()) {
        let previous = PREVIOUS.load(Relaxed);
        if now.saturating_sub(previous) >= hz
            && PREVIOUS
                .compare_exchange(previous, now, Relaxed, Relaxed)
                .is_ok()
        {
            report();
        }
    }
}

pub fn photo(stage: &str, epoch: u64, sequence: u64) {
    photo_at(stage, epoch, sequence, clock());
}

pub fn photo_at(stage: &str, epoch: u64, sequence: u64, clock: Option<u64>) {
    if !enabled() {
        return;
    }
    eprintln!("perf photo={stage} epoch={epoch} seq={sequence} clock={clock:?}");
}

#[cfg(windows)]
pub use win::{clock, cycles, frequency};

#[cfg(windows)]
#[allow(unsafe_code)] // Únicamente consultas Win32 de reloj/CPU del proceso propio.
mod win {
    use std::ffi::c_void;
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn QueryThreadCycleTime(handle: *mut c_void, cycles: *mut u64) -> i32;
        fn QueryProcessCycleTime(handle: *mut c_void, cycles: *mut u64) -> i32;
        fn QueryPerformanceCounter(value: *mut i64) -> i32;
        fn QueryPerformanceFrequency(value: *mut i64) -> i32;
    }

    pub fn cycles(process: bool) -> Option<u64> {
        let mut value = 0;
        // SAFETY: -1/-2 son pseudohandles Win32 del proceso/hilo actual; el
        // puntero de salida es válido y no se retiene después de la llamada.
        let ok = unsafe {
            if process {
                QueryProcessCycleTime((-1_isize) as *mut c_void, &raw mut value)
            } else {
                QueryThreadCycleTime((-2_isize) as *mut c_void, &raw mut value)
            }
        };
        (ok != 0).then_some(value)
    }

    pub fn clock() -> Option<u64> {
        let mut value = 0;
        // SAFETY: QPC escribe exclusivamente en el i64 local válido.
        let ok = unsafe { QueryPerformanceCounter(&raw mut value) };
        (ok != 0).then(|| u64::try_from(value).ok()).flatten()
    }

    pub fn frequency() -> Option<u64> {
        let mut value = 0;
        // SAFETY: la frecuencia se escribe en el i64 local válido.
        let ok = unsafe { QueryPerformanceFrequency(&raw mut value) };
        (ok != 0).then(|| u64::try_from(value).ok()).flatten()
    }
}

#[cfg(not(windows))]
pub fn cycles(_: bool) -> Option<u64> {
    None
}
#[cfg(not(windows))]
pub fn clock() -> Option<u64> {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .and_then(|value| u64::try_from(value.as_nanos()).ok())
}
#[cfg(not(windows))]
#[allow(clippy::unnecessary_wraps)] // Misma firma que la versión Windows, que puede fallar.
pub fn frequency() -> Option<u64> {
    Some(1_000_000_000)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn span_records_one_completed_call_and_qpc_duration() {
        assert_eq!(Stage::Dto as usize + 1, NAMES.len());
        let offset = Stage::VmDiff as usize * 4;
        let before = COUNTS[offset].load(Relaxed);
        let wall_before = COUNTS[offset + 1].load(Relaxed);
        let span = Span {
            stage: Stage::VmDiff as usize,
            start: Instant::now(),
            cycles: cycles(false),
            clock: clock(),
        };
        std::hint::black_box((0_u64..1000).sum::<u64>());
        drop(span);
        assert_eq!(COUNTS[offset].load(Relaxed), before + 1);
        assert!(COUNTS[offset + 1].load(Relaxed) > wall_before);
    }

    #[test]
    fn common_clock_is_monotonic_and_has_a_positive_frequency() {
        let before = clock().expect("reloj disponible");
        assert!(frequency().expect("frecuencia disponible") > 0);
        assert!(clock().expect("segunda lectura") >= before);
    }

    #[cfg(windows)]
    #[test]
    fn own_thread_and_process_cycle_queries_succeed() {
        let thread = cycles(false).expect("ciclos del hilo");
        let process = cycles(true).expect("ciclos del proceso");
        assert!(cycles(false).expect("segunda lectura de hilo") >= thread);
        assert!(cycles(true).expect("segunda lectura de proceso") >= process);
    }
}
