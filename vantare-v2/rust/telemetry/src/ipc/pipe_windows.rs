//! Deadline-bound Windows named-pipe client I/O. Each pending operation owns
//! its event and buffer until Windows reports completion, even after cancel.

use std::io;
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
use windows_sys::Win32::System::Pipes::PeekNamedPipe;
use windows_sys::Win32::System::Threading::{CreateEventW, WaitForSingleObject};

use super::{HEADER_LEN, Kind, MAX_PAYLOAD_LEN, VERSION};

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

    /// Polls without reserving a payload while idle. Once any byte is
    /// available, the whole frame must arrive by `deadline` or this pipe is
    /// considered broken; callers must close it after an error.
    pub fn read_frame_if_available(&mut self, deadline: Instant) -> io::Result<Option<Vec<u8>>> {
        let mut available = 0;
        // SAFETY: only the out count is supplied; no payload is copied.
        if unsafe {
            PeekNamedPipe(
                self.0,
                null_mut(),
                0,
                null_mut(),
                &mut available,
                null_mut(),
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        if available == 0 {
            return Ok(None);
        }
        let mut header = [0_u8; HEADER_LEN];
        self.read_exact_until(&mut header, deadline)?;
        let length = u32::from_le_bytes(header[..4].try_into().expect("fixed header")) as usize;
        let version = u16::from_le_bytes(header[4..6].try_into().expect("fixed header"));
        let kind = Kind::try_from(u16::from_le_bytes(
            header[6..8].try_into().expect("fixed header"),
        ))
        .map_err(|_| io::ErrorKind::InvalidData)?;
        if version != VERSION || length > MAX_PAYLOAD_LEN || length > kind.max_payload() {
            return Err(io::ErrorKind::InvalidData.into());
        }
        let mut frame = Vec::with_capacity(HEADER_LEN + length);
        frame.extend_from_slice(&header);
        frame.resize(HEADER_LEN + length, 0);
        self.read_exact_until(&mut frame[HEADER_LEN..], deadline)?;
        Ok(Some(frame))
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
                let mut completed = 0;
                // Cancellation can race a successful transfer. Preserve its
                // byte count; discarding it would desynchronise framing.
                let reaped = unsafe { GetOverlappedResult(self.0, &overlapped, &mut completed, 1) };
                if reaped != 0 {
                    return Ok(completed as usize);
                }
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
