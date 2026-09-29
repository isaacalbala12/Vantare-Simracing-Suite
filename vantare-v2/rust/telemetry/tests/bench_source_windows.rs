#![cfg(all(windows, feature = "bench-harness"))]

use std::ffi::c_void;
use std::io;

use vantare_telemetry::ipc::{self, Kind};
use vantare_telemetry::lmu::OBJECT_OUT_SIZE;
use vantare_telemetry::lmu::acquisition::{Acquisition, AcquisitionError};

type Handle = *mut c_void;
const PAGE_READWRITE: u32 = 0x04;
const FILE_MAP_WRITE: u32 = 0x0002;
const CONFIG: &[u8] = include_bytes!("../testdata/configuration-frame-go-v1.bin");
const REAL_44: &[u8] = include_bytes!("../../../testdata/lmu-fixture.bin");

#[link(name = "kernel32")]
unsafe extern "system" {
    fn CreateFileMappingW(
        file: Handle,
        attributes: *const c_void,
        protect: u32,
        maximum_high: u32,
        maximum_low: u32,
        name: *const u16,
    ) -> Handle;
    fn MapViewOfFile(
        mapping: Handle,
        access: u32,
        offset_high: u32,
        offset_low: u32,
        bytes_to_map: usize,
    ) -> *mut c_void;
    fn UnmapViewOfFile(view: *const c_void) -> i32;
    fn CloseHandle(handle: Handle) -> i32;
}

struct PrivateMapping {
    handle: Handle,
    view: *mut c_void,
}

impl PrivateMapping {
    fn create(name: &str, bytes: &[u8]) -> io::Result<Self> {
        if bytes.len() != OBJECT_OUT_SIZE {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "wrong frame size",
            ));
        }
        let name: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
        // SAFETY: a pagefile-backed mapping is local, sized exactly to the LMU frame.
        let handle = unsafe {
            CreateFileMappingW(
                usize::MAX as Handle,
                std::ptr::null(),
                PAGE_READWRITE,
                0,
                OBJECT_OUT_SIZE as u32,
                name.as_ptr(),
            )
        };
        if handle.is_null() {
            return Err(io::Error::last_os_error());
        }
        // SAFETY: the valid handle stays owned until this view is unmapped.
        let view = unsafe { MapViewOfFile(handle, FILE_MAP_WRITE, 0, 0, OBJECT_OUT_SIZE) };
        if view.is_null() {
            let error = io::Error::last_os_error();
            unsafe { CloseHandle(handle) };
            return Err(error);
        }
        // SAFETY: both ranges have exactly OBJECT_OUT_SIZE bytes and do not overlap.
        unsafe { std::ptr::copy_nonoverlapping(bytes.as_ptr(), view.cast(), OBJECT_OUT_SIZE) };
        Ok(Self { handle, view })
    }
}

impl Drop for PrivateMapping {
    fn drop(&mut self) {
        // SAFETY: this test owns the writable view and its mapping handle.
        unsafe {
            UnmapViewOfFile(self.view);
            CloseHandle(self.handle);
        }
    }
}

#[test]
fn isolated_mapping_reaches_production_reader_and_assembler() {
    let name = format!("vantare-telemetry-bench-{}-reader", std::process::id());
    let _mapping = PrivateMapping::create(&name, REAL_44).unwrap();
    assert!(matches!(
        Acquisition::open_bench("LMU_Data", 1, 30, 15),
        Err(AcquisitionError::Io(error)) if error.kind() == io::ErrorKind::InvalidInput
    ));
    let mut acquisition = Acquisition::open_bench(&name, 1, 30, 15).unwrap();
    acquisition.configure(CONFIG).unwrap();
    let frames = acquisition.tick().unwrap();
    assert!(
        frames
            .iter()
            .any(|frame| ipc::decode(frame).unwrap().kind == Kind::Snapshot)
    );
    assert!(
        acquisition
            .source_health()
            .is_some_and(|(age, stale)| age < 1_000_000_000 && !stale)
    );
    acquisition.shutdown().unwrap();
}
