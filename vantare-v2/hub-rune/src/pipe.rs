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
                // A short read cancellation must never interrupt a frame's write_all.
                // Slow host readers get five seconds to drain a full frame.
                let timeout = if write { 5_000 } else { 200 };
                if WaitForSingleObject(ov.hEvent, timeout) != WAIT_OBJECT_0 {
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
#[cfg(test)]
mod tests {
    use super::*;
    use std::{sync::mpsc, time::Duration};
    use vantare_hub_host::frame;
    use windows_sys::Win32::{
        Foundation::{ERROR_PIPE_CONNECTED, INVALID_HANDLE_VALUE},
        Storage::FileSystem::PIPE_ACCESS_DUPLEX,
        System::Pipes::{ConnectNamedPipe, CreateNamedPipeW, PIPE_TYPE_BYTE, PIPE_WAIT},
    };
    #[test]
    fn slow_reader_keeps_the_complete_frame_and_the_next_frame() {
        let name = format!("vantare-hub-rune-test-{}", std::process::id());
        let path: Vec<u16> = format!(r"\\.\pipe\{name}")
            .encode_utf16()
            .chain(Some(0))
            .collect();
        // SAFETY: terminated name, null security attributes, owned synchronous server handle.
        let raw = unsafe {
            CreateNamedPipeW(
                path.as_ptr(),
                PIPE_ACCESS_DUPLEX,
                PIPE_TYPE_BYTE | PIPE_WAIT,
                1,
                1024,
                1024,
                0,
                std::ptr::null(),
            )
        };
        assert_ne!(raw, INVALID_HANDLE_VALUE);
        let mut server = unsafe { File::from_raw_handle(raw) };
        let value = serde_json::json!({"data": "x".repeat(256 * 1024)});
        let expected = value.clone();
        let (sent, completed) = mpsc::channel();
        let writer = std::thread::spawn(move || {
            let result = (|| -> io::Result<()> {
                let mut pipe = Pipe::open(&name)?;
                frame::write(&mut pipe, &value)?;
                frame::write(&mut pipe, &serde_json::json!({"next": true}))
            })();
            sent.send(result).unwrap();
        });
        // SAFETY: valid server handle, synchronous connect; client may have connected already.
        if unsafe { ConnectNamedPipe(server.as_raw_handle(), std::ptr::null_mut()) } == 0 {
            assert_eq!(
                io::Error::last_os_error().raw_os_error(),
                Some(ERROR_PIPE_CONNECTED as i32)
            );
        }
        // Deliberately hold back reads past the old 200 ms write deadline. This bounded wait
        // models backpressure, rather than using timing to synchronize the connection.
        assert!(matches!(
            completed.recv_timeout(Duration::from_millis(350)),
            Err(mpsc::RecvTimeoutError::Timeout)
        ));
        let mut reader = frame::Reader::default();
        let mut next = || loop {
            if let Some(value) = reader.next::<serde_json::Value>(&mut server).unwrap() {
                break value;
            }
        };
        assert_eq!(next(), expected);
        assert_eq!(next(), serde_json::json!({"next": true}));
        completed
            .recv_timeout(Duration::from_secs(5))
            .unwrap()
            .unwrap();
        writer.join().unwrap();
    }
}
