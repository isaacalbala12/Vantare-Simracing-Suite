//! Deadline-bound Windows named-pipe client I/O. Each pending operation owns
//! its event and buffer until Windows reports completion, even after cancel.

use std::io::{self, Read, Write};
use std::ptr::{null, null_mut};
use std::time::Instant;

use windows_sys::Win32::Foundation::{
    CloseHandle, ERROR_IO_PENDING, GENERIC_READ, GENERIC_WRITE, HANDLE, INVALID_HANDLE_VALUE,
    WAIT_OBJECT_0, WAIT_TIMEOUT,
};
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, FILE_FLAG_OVERLAPPED, OPEN_EXISTING, ReadFile, WriteFile,
};
use windows_sys::Win32::System::IO::{CancelIoEx, GetOverlappedResult, OVERLAPPED};
use windows_sys::Win32::System::Threading::{CreateEventW, WaitForSingleObject};

struct Event(HANDLE);

impl Event {
    fn new() -> io::Result<Self> {
        // SAFETY: null security/name pointers and valid BOOL arguments.
        let handle = unsafe { CreateEventW(null(), 1, 0, null()) };
        if handle.is_null() {
            Err(io::Error::last_os_error())
        } else {
            Ok(Self(handle))
        }
    }
}

impl Drop for Event {
    fn drop(&mut self) {
        // SAFETY: this wrapper uniquely owns the event handle.
        unsafe { CloseHandle(self.0) };
    }
}

pub struct DeadlinePipe(HANDLE);

impl DeadlinePipe {
    pub fn open(name: &str) -> io::Result<Self> {
        let path: Vec<u16> = name.encode_utf16().chain([0]).collect();
        // SAFETY: path is NUL terminated; no pointer is retained after call.
        let handle = unsafe {
            CreateFileW(
                path.as_ptr(),
                GENERIC_READ | GENERIC_WRITE,
                0,
                null(),
                OPEN_EXISTING,
                FILE_FLAG_OVERLAPPED,
                null_mut(),
            )
        };
        if handle == INVALID_HANDLE_VALUE {
            Err(io::Error::last_os_error())
        } else {
            Ok(Self(handle))
        }
    }

    pub fn read_exact_until(&mut self, mut output: &mut [u8], deadline: Instant) -> io::Result<()> {
        while !output.is_empty() {
            let count = self.transfer(output.as_mut_ptr(), output.len(), deadline, false)?;
            if count == 0 {
                return Err(io::ErrorKind::UnexpectedEof.into());
            }
            output = &mut output[count..];
        }
        Ok(())
    }

    pub fn write_all_until(&mut self, mut input: &[u8], deadline: Instant) -> io::Result<()> {
        while !input.is_empty() {
            let count = self.transfer(input.as_ptr().cast_mut(), input.len(), deadline, true)?;
            if count == 0 {
                return Err(io::ErrorKind::WriteZero.into());
            }
            input = &input[count..];
        }
        Ok(())
    }

    fn transfer(
        &self,
        buffer: *mut u8,
        length: usize,
        deadline: Instant,
        writing: bool,
    ) -> io::Result<usize> {
        if Instant::now() >= deadline {
            return Err(io::ErrorKind::TimedOut.into());
        }
        let event = Event::new()?;
        // SAFETY: OVERLAPPED is a C POD; hEvent is a live manual-reset event.
        let mut overlapped: OVERLAPPED = unsafe { std::mem::zeroed() };
        overlapped.hEvent = event.0;
        let length = u32::try_from(length.min(u32::MAX as usize)).unwrap();
        // SAFETY: buffer and overlapped remain live until completion is reaped.
        let started = unsafe {
            if writing {
                WriteFile(self.0, buffer, length, null_mut(), &mut overlapped)
            } else {
                ReadFile(self.0, buffer, length, null_mut(), &mut overlapped)
            }
        };
        if started == 0 {
            let error = io::Error::last_os_error();
            if error.raw_os_error() != Some(ERROR_IO_PENDING as i32) {
                return Err(error);
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            let milliseconds = remaining.as_millis().clamp(1, u128::from(u32::MAX - 1)) as u32;
            // SAFETY: event belongs to this pending operation.
            let wait = unsafe { WaitForSingleObject(event.0, milliseconds) };
            if wait != WAIT_OBJECT_0 {
                // SAFETY: cancelling is followed by a blocking reap, keeping
                // buffer, OVERLAPPED and event valid until the kernel is done.
                unsafe { CancelIoEx(self.0, &overlapped) };
                let mut discarded = 0;
                unsafe { GetOverlappedResult(self.0, &overlapped, &mut discarded, 1) };
                return if wait == WAIT_TIMEOUT {
                    Err(io::ErrorKind::TimedOut.into())
                } else {
                    Err(io::Error::other("named-pipe wait failed"))
                };
            }
        }
        let mut transferred = 0;
        // SAFETY: completion has been signalled (or completed immediately).
        if unsafe { GetOverlappedResult(self.0, &overlapped, &mut transferred, 0) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(transferred as usize)
    }
}

impl Drop for DeadlinePipe {
    fn drop(&mut self) {
        // SAFETY: all operations finish before each method returns.
        unsafe { CloseHandle(self.0) };
    }
}

pub struct PipeReadUntil<'a> {
    pub pipe: &'a mut DeadlinePipe,
    pub deadline: Instant,
}

impl Read for PipeReadUntil<'_> {
    fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
        if output.is_empty() {
            return Ok(0);
        }
        self.pipe
            .transfer(output.as_mut_ptr(), output.len(), self.deadline, false)
    }
}

impl Write for PipeReadUntil<'_> {
    fn write(&mut self, input: &[u8]) -> io::Result<usize> {
        if input.is_empty() {
            return Ok(0);
        }
        self.pipe
            .transfer(input.as_ptr().cast_mut(), input.len(), self.deadline, true)
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
