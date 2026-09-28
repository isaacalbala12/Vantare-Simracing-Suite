//! Read-only LMU_Data mapping owner. This module does not start polling or
//! publish observations; the future live driver owns one mapping per run.

use super::OBJECT_OUT_SIZE;
use std::ffi::c_void;
use std::io;
use std::ptr::NonNull;

type Handle = *mut c_void;
const FILE_MAP_READ: u32 = 0x0004;
pub const MAX_STABLE_COMPARISONS: usize = 3;

#[link(name = "kernel32")]
unsafe extern "system" {
    fn OpenFileMappingW(desired_access: u32, inherit_handle: i32, name: *const u16) -> Handle;
    fn MapViewOfFile(
        mapping: Handle,
        desired_access: u32,
        offset_high: u32,
        offset_low: u32,
        bytes_to_map: usize,
    ) -> *mut c_void;
    fn UnmapViewOfFile(address: *const c_void) -> i32;
    fn CloseHandle(handle: Handle) -> i32;
}

pub struct Mapping {
    handle: Handle,
    view: NonNull<u8>,
}

impl Mapping {
    pub fn open_lmu() -> io::Result<Self> {
        Self::open_named("LMU_Data")
    }

    fn open_named(name: &str) -> io::Result<Self> {
        if name.is_empty() || name.encode_utf16().any(|unit| unit == 0) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid mapping name",
            ));
        }
        let name: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
        // SAFETY: name is NUL-terminated and remains alive for the call.
        let handle = unsafe { OpenFileMappingW(FILE_MAP_READ, 0, name.as_ptr()) };
        if handle.is_null() {
            return Err(io::Error::last_os_error());
        }
        // Mapping exactly OBJECT_OUT_SIZE fails if the producer created a
        // smaller object, before snapshot() can touch bytes outside the view.
        // SAFETY: handle came from OpenFileMappingW and remains owned here.
        let view = unsafe { MapViewOfFile(handle, FILE_MAP_READ, 0, 0, OBJECT_OUT_SIZE) };
        let Some(view) = NonNull::new(view.cast::<u8>()) else {
            let error = io::Error::last_os_error();
            // SAFETY: no view was created; release the acquired mapping handle.
            unsafe { CloseHandle(handle) };
            return Err(error);
        };
        Ok(Self { handle, view })
    }

    pub fn snapshot(&self, destination: &mut [u8]) -> io::Result<()> {
        if destination.len() != OBJECT_OUT_SIZE {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "LMU snapshot destination has wrong size",
            ));
        }
        // SAFETY: view maps OBJECT_OUT_SIZE readable bytes until Drop, and
        // destination is a disjoint, mutable slice of exactly that size.
        unsafe {
            std::ptr::copy_nonoverlapping(
                self.view.as_ptr(),
                destination.as_mut_ptr(),
                OBJECT_OUT_SIZE,
            )
        };
        Ok(())
    }

    pub fn read_stable(
        &self,
        destination: &mut [u8],
        scratch: &mut [u8],
        comparisons: usize,
    ) -> io::Result<()> {
        read_stable_with(destination, scratch, comparisons, |target| {
            self.snapshot(target)
        })
    }
}

fn read_stable_with(
    destination: &mut [u8],
    scratch: &mut [u8],
    comparisons: usize,
    mut snapshot: impl FnMut(&mut [u8]) -> io::Result<()>,
) -> io::Result<()> {
    if destination.len() != OBJECT_OUT_SIZE
        || scratch.len() != OBJECT_OUT_SIZE
        || !(1..=MAX_STABLE_COMPARISONS).contains(&comparisons)
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "invalid LMU stable-read buffers or comparisons",
        ));
    }
    snapshot(destination)?;
    for _ in 0..comparisons {
        snapshot(scratch)?;
        if destination == scratch {
            return Ok(());
        }
        destination.copy_from_slice(scratch);
    }
    Err(io::Error::new(
        io::ErrorKind::WouldBlock,
        "LMU snapshot did not stabilize",
    ))
}

impl Drop for Mapping {
    fn drop(&mut self) {
        // SAFETY: this object uniquely owns both resources; no snapshot can
        // borrow self while Drop runs. Windows releases the view and handle.
        unsafe {
            UnmapViewOfFile(self.view.as_ptr().cast());
            CloseHandle(self.handle);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    #[test]
    fn live_lmu_menu_snapshot_is_stable_but_unpinned_build_stays_closed() {
        if std::env::var_os("VANTARE_LMU_LIVE_READER_TEST").is_none() {
            return;
        }
        let mapping = Mapping::open_lmu().expect("LMU_Data mapping is open");
        let mut frame = vec![0; OBJECT_OUT_SIZE];
        let mut scratch = vec![0; OBJECT_OUT_SIZE];
        mapping
            .read_stable(&mut frame, &mut scratch, MAX_STABLE_COMPARISONS)
            .expect("LMU_Data stabilizes");
        let vehicle_count = i32::from_le_bytes(frame[1_736..1_740].try_into().unwrap());
        assert_eq!(vehicle_count, 0, "LMU must be at the main menu");
        assert_eq!(
            super::super::admit_v13(&frame, "1.4.2.0"),
            Err(super::super::AdmissionError::UnsupportedBuild)
        );
    }

    const PAGE_READWRITE: u32 = 0x04;
    const FILE_MAP_WRITE: u32 = 0x0002;
    static TEST_ID: AtomicU64 = AtomicU64::new(0);

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
    }

    #[test]
    fn opens_private_mapping_and_copies_stable_snapshot() {
        let name = format!(
            "vantare-rust-reader-test-{}-{}",
            std::process::id(),
            TEST_ID.fetch_add(1, Ordering::Relaxed)
        );
        let wide: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
        // SAFETY: INVALID_HANDLE_VALUE selects a pagefile-backed mapping;
        // name is NUL-terminated and live for this call.
        let owner = unsafe {
            CreateFileMappingW(
                usize::MAX as Handle,
                std::ptr::null(),
                PAGE_READWRITE,
                0,
                OBJECT_OUT_SIZE as u32,
                wide.as_ptr(),
            )
        };
        assert!(!owner.is_null(), "{}", io::Error::last_os_error());
        // SAFETY: owner is a valid pagefile mapping with writable protection.
        let writer = unsafe { MapViewOfFile(owner, FILE_MAP_WRITE, 0, 0, OBJECT_OUT_SIZE) };
        assert!(!writer.is_null(), "{}", io::Error::last_os_error());
        // SAFETY: the test owns this writable mapped view.
        unsafe { *writer.cast::<u8>().add(1_736) = 44 };
        let mapping = Mapping::open_named(&name).unwrap();
        let mut destination = vec![0; OBJECT_OUT_SIZE];
        let mut scratch = vec![0; OBJECT_OUT_SIZE];
        assert!(
            mapping
                .snapshot(&mut destination[..OBJECT_OUT_SIZE - 1])
                .is_err()
        );
        mapping
            .read_stable(&mut destination, &mut scratch, 3)
            .unwrap();
        assert_eq!(destination[1_736], 44);
        drop(mapping);
        // SAFETY: writer and owner were acquired in this test and are no
        // longer accessed after release.
        unsafe {
            UnmapViewOfFile(writer);
            CloseHandle(owner);
        }
    }

    #[test]
    fn bounded_stable_read_accepts_recovery_and_rejects_continuous_mutation() {
        let mut destination = vec![0; OBJECT_OUT_SIZE];
        let mut scratch = vec![0; OBJECT_OUT_SIZE];
        assert_eq!(
            read_stable_with(&mut destination, &mut scratch, 4, |_| Ok(()))
                .unwrap_err()
                .kind(),
            io::ErrorKind::InvalidInput
        );
        let mut snapshots = [1_u8, 2, 2].into_iter();
        read_stable_with(&mut destination, &mut scratch, 2, |target| {
            target[0] = snapshots.next().expect("three bounded snapshots");
            Ok(())
        })
        .unwrap();
        assert_eq!(destination[0], 2);

        let mut next = 0_u8;
        let error = read_stable_with(&mut destination, &mut scratch, 2, |target| {
            next += 1;
            target[0] = next;
            Ok(())
        })
        .unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::WouldBlock);
    }

    #[test]
    fn rejects_mapping_smaller_than_lmu_layout() {
        let name = format!(
            "vantare-rust-short-mapping-test-{}-{}",
            std::process::id(),
            TEST_ID.fetch_add(1, Ordering::Relaxed)
        );
        let wide: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
        // SAFETY: pagefile-backed, NUL-terminated private test mapping.
        let owner = unsafe {
            CreateFileMappingW(
                usize::MAX as Handle,
                std::ptr::null(),
                PAGE_READWRITE,
                0,
                4,
                wide.as_ptr(),
            )
        };
        assert!(!owner.is_null(), "{}", io::Error::last_os_error());
        assert!(Mapping::open_named(&name).is_err());
        // SAFETY: owner is the only remaining handle.
        unsafe { CloseHandle(owner) };
    }
}
