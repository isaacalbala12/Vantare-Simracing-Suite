//! Overlapped local pipe with bounded I/O; the GUI never waits for a pipe operation.
use std::{
    fs::{File, OpenOptions},
    io::{self, Read, Write},
    os::windows::{
        fs::OpenOptionsExt,
        io::{AsRawHandle, FromRawHandle, OwnedHandle},
    },
};
use windows_sys::Win32::{
    Foundation::{ERROR_IO_PENDING, WAIT_OBJECT_0},
    Storage::FileSystem::{FILE_FLAG_OVERLAPPED, ReadFile, WriteFile},
    System::{
        IO::{CancelIoEx, GetOverlappedResult, OVERLAPPED},
        Pipes::PeekNamedPipe,
        Threading::{CreateEventW, WaitForSingleObject},
    },
};
pub struct Pipe(File);
impl Pipe {
    pub fn open(name: &str) -> io::Result<Self> {
        OpenOptions::new()
            .read(true)
            .write(true)
            .custom_flags(FILE_FLAG_OVERLAPPED)
            .open(format!(r"\\.\pipe\{name}"))
            .map(Self)
    }
    fn transfer(&self, buffer: *mut u8, length: u32, write: bool) -> io::Result<usize> {
        // SAFETY: the event and overlapped object outlive the operation. Every pending
        // operation is completed or cancelled-and-drained before either buffer is released.
        unsafe {
            let raw = CreateEventW(std::ptr::null(), 1, 0, std::ptr::null());
            if raw.is_null() {
                return Err(io::Error::last_os_error());
            }
            let event = OwnedHandle::from_raw_handle(raw);
            let mut ov: OVERLAPPED = std::mem::zeroed();
            ov.hEvent = event.as_raw_handle();
            let handle = self.0.as_raw_handle();
            let mut count = 0;
            let ok = if write {
                WriteFile(
                    handle,
                    buffer.cast_const(),
                    length,
                    std::ptr::null_mut(),
                    &mut ov,
                )
            } else {
                ReadFile(handle, buffer, length, std::ptr::null_mut(), &mut ov)
            };
            if ok == 0 {
                let error = io::Error::last_os_error();
                if error.raw_os_error() != Some(ERROR_IO_PENDING as i32) {
                    return Err(error);
                }
                if WaitForSingleObject(ov.hEvent, 200) != WAIT_OBJECT_0 {
                    CancelIoEx(handle, &ov);
                    GetOverlappedResult(handle, &ov, &mut count, 1);
                    return Err(io::ErrorKind::TimedOut.into());
                }
            }
            if GetOverlappedResult(handle, &ov, &mut count, 0) == 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(count as usize)
        }
    }
}
impl Read for Pipe {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        let mut available = 0;
        // SAFETY: owned pipe handle, no buffer requested; available points to a u32.
        if unsafe {
            PeekNamedPipe(
                self.0.as_raw_handle(),
                std::ptr::null_mut(),
                0,
                std::ptr::null_mut(),
                &mut available,
                std::ptr::null_mut(),
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        if available == 0 {
            return Err(io::ErrorKind::WouldBlock.into());
        }
        let size = buffer.len().min(available as usize).min(u32::MAX as usize) as u32;
        self.transfer(buffer.as_mut_ptr(), size, false)
    }
}
impl Write for Pipe {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        self.transfer(
            buffer.as_ptr().cast_mut(),
            buffer.len().min(u32::MAX as usize) as u32,
            true,
        )
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
