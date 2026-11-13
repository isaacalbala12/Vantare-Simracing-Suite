//! Event-driven overlapped pipe. All operations are cancelled and drained before buffers drop.
use std::{
    cell::UnsafeCell,
    fs::{File, OpenOptions},
    io::{self, Read, Write},
    os::windows::{
        fs::OpenOptionsExt,
        io::{AsRawHandle, FromRawHandle, OwnedHandle},
    },
    sync::{Arc, Mutex, MutexGuard},
    time::Duration,
};
use windows_sys::Win32::{
    Foundation::{ERROR_IO_INCOMPLETE, ERROR_IO_PENDING, WAIT_OBJECT_0, WAIT_TIMEOUT},
    Storage::FileSystem::{FILE_FLAG_OVERLAPPED, ReadFile, WriteFile},
    System::{
        IO::{CancelIoEx, GetOverlappedResult, OVERLAPPED},
        Threading::{
            CreateEventW, INFINITE, ResetEvent, SetEvent, WaitForMultipleObjects,
            WaitForSingleObject,
        },
    },
};
fn event() -> io::Result<OwnedHandle> {
    // SAFETY: unnamed manual-reset event, owned by the returned handle.
    let raw = unsafe { CreateEventW(std::ptr::null(), 1, 0, std::ptr::null()) };
    if raw.is_null() {
        return Err(io::Error::last_os_error());
    }
    Ok(unsafe { OwnedHandle::from_raw_handle(raw) })
}
pub struct Signal(OwnedHandle);
impl Signal {
    pub fn new() -> io::Result<Arc<Self>> {
        Ok(Arc::new(Self(event()?)))
    }
    pub fn signal(&self) -> io::Result<()> {
        if unsafe { SetEvent(self.0.as_raw_handle()) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
    pub fn reset(&self) -> io::Result<()> {
        if unsafe { ResetEvent(self.0.as_raw_handle()) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
}
pub struct Connection {
    file: File,
    stopped: Mutex<bool>,
}
impl Connection {
    pub fn open(name: &str) -> io::Result<Arc<Self>> {
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .custom_flags(FILE_FLAG_OVERLAPPED)
            .open(format!(r"\\.\pipe\{name}"))?;
        Ok(Arc::new(Self {
            file,
            stopped: Mutex::new(false),
        }))
    }
    fn active(&self) -> io::Result<MutexGuard<'_, bool>> {
        let guard = self.stopped.lock().unwrap();
        if *guard {
            // write_all retries Interrupted forever. Stopping is terminal for this link.
            return Err(io::ErrorKind::ConnectionAborted.into());
        }
        Ok(guard)
    }
    pub fn cancel(&self) {
        let mut stopped = self.stopped.lock().unwrap();
        *stopped = true;
        // SAFETY: the file stays owned by this connection until all operations are drained.
        // Serializing cancellation with issuing I/O prevents an operation starting after cancel.
        unsafe {
            CancelIoEx(self.file.as_raw_handle(), std::ptr::null());
        }
    }
    fn completion_error(&self) -> io::Error {
        let error = io::Error::last_os_error();
        if *self.stopped.lock().unwrap() {
            io::ErrorKind::ConnectionAborted.into()
        } else {
            error
        }
    }
}
#[derive(Debug, PartialEq, Eq)]
pub enum Ready {
    Read,
    Signal,
    Timeout,
}
struct PendingRead {
    // Windows writes these asynchronously. Cells prevent shared Rust borrows from freezing them.
    bytes: Box<UnsafeCell<[u8; 16 * 1024]>>,
    overlapped: Box<UnsafeCell<OVERLAPPED>>,
    event: OwnedHandle,
    pending: bool,
    filled: usize,
    consumed: usize,
}
pub struct Pipe {
    connection: Arc<Connection>,
    read: PendingRead,
}
impl Pipe {
    #[cfg(test)]
    pub fn open(name: &str) -> io::Result<Self> {
        Self::new(Connection::open(name)?)
    }
    pub fn new(connection: Arc<Connection>) -> io::Result<Self> {
        let event = event()?;
        let mut overlapped: OVERLAPPED = unsafe { std::mem::zeroed() };
        overlapped.hEvent = event.as_raw_handle();
        Ok(Self {
            connection,
            read: PendingRead {
                bytes: Box::new(UnsafeCell::new([0; 16 * 1024])),
                overlapped: Box::new(UnsafeCell::new(overlapped)),
                event,
                pending: false,
                filled: 0,
                consumed: 0,
            },
        })
    }
    pub fn wait(&self, signal: &Signal, timeout: Option<Duration>) -> io::Result<Ready> {
        let handles = [self.read.event.as_raw_handle(), signal.0.as_raw_handle()];
        let timeout = timeout.map_or(INFINITE, |d| {
            d.as_millis().min(u128::from(INFINITE - 1)) as u32
        });
        // SAFETY: both owned events outlive this wait. No periodic wakeup in a connected session.
        match unsafe { WaitForMultipleObjects(2, handles.as_ptr(), 0, timeout) } {
            WAIT_OBJECT_0 => Ok(Ready::Read),
            n if n == WAIT_OBJECT_0 + 1 => Ok(Ready::Signal),
            WAIT_TIMEOUT => Ok(Ready::Timeout),
            _ => Err(io::Error::last_os_error()),
        }
    }
    fn start_read(&mut self) -> io::Result<()> {
        let _guard = self.connection.active()?;
        // SAFETY: boxed buffer/OVERLAPPED stay at fixed addresses until completion or cancel+drain.
        unsafe {
            if ResetEvent(self.read.event.as_raw_handle()) == 0 {
                return Err(io::Error::last_os_error());
            }
            let ok = ReadFile(
                self.connection.file.as_raw_handle(),
                self.read.bytes.get().cast(),
                16 * 1024,
                std::ptr::null_mut(),
                self.read.overlapped.get(),
            );
            if ok == 0 {
                let error = io::Error::last_os_error();
                if error.raw_os_error() != Some(ERROR_IO_PENDING as i32) {
                    return Err(error);
                }
            }
        }
        self.read.pending = true;
        Ok(())
    }
    fn write_chunk(&self, buffer: &[u8]) -> io::Result<usize> {
        if buffer.is_empty() {
            return Ok(0);
        }
        let event = event()?;
        let mut value: OVERLAPPED = unsafe { std::mem::zeroed() };
        value.hEvent = event.as_raw_handle();
        let ov = UnsafeCell::new(value);
        let handle = self.connection.file.as_raw_handle();
        // SAFETY: operation registered under the cancellation lock. The stack object and input
        // remain alive through completion; all timeout/cancel paths drain before returning.
        unsafe {
            let pending = {
                let _guard = self.connection.active()?;
                let ok = WriteFile(
                    handle,
                    buffer.as_ptr(),
                    buffer.len().min(u32::MAX as usize) as u32,
                    std::ptr::null_mut(),
                    ov.get(),
                );
                if ok == 0 {
                    let error = io::Error::last_os_error();
                    if error.raw_os_error() != Some(ERROR_IO_PENDING as i32) {
                        return Err(error);
                    }
                    true
                } else {
                    false
                }
            };
            let mut count = 0;
            if pending && WaitForSingleObject(event.as_raw_handle(), 5_000) != WAIT_OBJECT_0 {
                CancelIoEx(handle, ov.get());
                if GetOverlappedResult(handle, ov.get(), &mut count, 1) != 0 {
                    return Ok(count as usize);
                }
                return Err(io::ErrorKind::TimedOut.into());
            }
            if GetOverlappedResult(handle, ov.get(), &mut count, 0) == 0 {
                return Err(self.connection.completion_error());
            }
            Ok(count as usize)
        }
    }
}
impl Drop for Pipe {
    fn drop(&mut self) {
        self.connection.cancel();
        if self.read.pending {
            let mut count = 0;
            // SAFETY: retain the read buffer and OVERLAPPED until Windows acknowledges cancellation.
            unsafe {
                GetOverlappedResult(
                    self.connection.file.as_raw_handle(),
                    self.read.overlapped.get(),
                    &mut count,
                    1,
                );
            }
        }
    }
}
impl Read for Pipe {
    fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
        if output.is_empty() {
            return Ok(0);
        }
        if self.read.consumed == self.read.filled {
            if !self.read.pending {
                self.start_read()?;
            }
            let mut count = 0;
            // SAFETY: pending operation owns a stable buffer and OVERLAPPED; this does not wait.
            if unsafe {
                GetOverlappedResult(
                    self.connection.file.as_raw_handle(),
                    self.read.overlapped.get(),
                    &mut count,
                    0,
                )
            } == 0
            {
                let error = io::Error::last_os_error();
                if error.raw_os_error() == Some(ERROR_IO_INCOMPLETE as i32) {
                    return Err(io::ErrorKind::WouldBlock.into());
                }
                self.read.pending = false;
                return Err(error);
            }
            self.read.pending = false;
            self.read.filled = count as usize;
            self.read.consumed = 0;
        }
        let size = output.len().min(self.read.filled - self.read.consumed);
        // SAFETY: GetOverlappedResult confirmed completion before reading the buffer.
        let bytes = unsafe { &*self.read.bytes.get() };
        output[..size].copy_from_slice(&bytes[self.read.consumed..self.read.consumed + size]);
        self.read.consumed += size;
        Ok(size)
    }
}
impl Write for Pipe {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        self.write_chunk(buffer)
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::{sync::mpsc, time::Duration};
    use vantare_hub_host::frame;
    use windows_sys::Win32::{
        Foundation::{ERROR_PIPE_CONNECTED, INVALID_HANDLE_VALUE},
        Storage::FileSystem::PIPE_ACCESS_DUPLEX,
        System::Pipes::{ConnectNamedPipe, CreateNamedPipeW, PIPE_TYPE_BYTE, PIPE_WAIT},
    };
    pub fn server() -> (String, File) {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let name = format!(
            "vantare-hub-rune-test-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        );
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
        (name, unsafe { File::from_raw_handle(raw) })
    }
    pub fn connected_pair() -> (File, Arc<Connection>) {
        let (name, server) = server();
        let connection = Connection::open(&name).unwrap();
        // SAFETY: synchronous server handle; client already connected.
        if unsafe { ConnectNamedPipe(server.as_raw_handle(), std::ptr::null_mut()) } == 0 {
            assert_eq!(
                io::Error::last_os_error().raw_os_error(),
                Some(ERROR_PIPE_CONNECTED as i32)
            );
        }
        (server, connection)
    }
    #[test]
    fn pending_read_and_outgoing_signal_wake_the_same_wait() {
        let (mut server, connection) = connected_pair();
        let mut pipe = Pipe::new(connection).unwrap();
        let signal = Signal::new().unwrap();
        let mut byte = [0];
        assert_eq!(
            pipe.read(&mut byte).unwrap_err().kind(),
            io::ErrorKind::WouldBlock
        );
        assert_eq!(
            pipe.wait(&signal, Some(Duration::ZERO)).unwrap(),
            Ready::Timeout
        );
        signal.signal().unwrap();
        assert_eq!(
            pipe.wait(&signal, Some(Duration::from_secs(1))).unwrap(),
            Ready::Signal
        );
        signal.reset().unwrap();
        server.write_all(b"x").unwrap();
        assert_eq!(
            pipe.wait(&signal, Some(Duration::from_secs(1))).unwrap(),
            Ready::Read
        );
        assert_eq!(pipe.read(&mut byte).unwrap(), 1);
        assert_eq!(byte, [b'x']);
    }
    #[test]
    fn cancellation_wakes_a_pending_read_and_prevents_new_io() {
        let (_server, connection) = connected_pair();
        let mut pipe = Pipe::new(connection.clone()).unwrap();
        let signal = Signal::new().unwrap();
        let mut byte = [0];
        assert_eq!(
            pipe.read(&mut byte).unwrap_err().kind(),
            io::ErrorKind::WouldBlock
        );
        connection.cancel();
        assert_eq!(
            pipe.wait(&signal, Some(Duration::from_secs(1))).unwrap(),
            Ready::Read
        );
        assert!(pipe.read(&mut byte).is_err());
        assert_eq!(
            pipe.write(b"after cancel").unwrap_err().kind(),
            io::ErrorKind::ConnectionAborted
        );
    }
    #[test]
    fn cancellation_releases_a_write_held_by_a_slow_reader() {
        let (mut server, connection) = connected_pair();
        let worker_connection = connection.clone();
        let (completed, result) = mpsc::channel();
        let writer = std::thread::spawn(move || {
            let mut pipe = Pipe::new(worker_connection).unwrap();
            completed
                .send(pipe.write_all(&vec![42; 256 * 1024]))
                .unwrap();
        });
        // Receiving a body byte proves the oversized write was issued. The server's
        // 1 KiB buffer cannot hold it, so cancellation must release the pending operation.
        let mut byte = [0];
        server.read_exact(&mut byte).unwrap();
        connection.cancel();
        assert!(
            result
                .recv_timeout(Duration::from_secs(1))
                .unwrap()
                .is_err()
        );
        writer.join().unwrap();
    }
    #[test]
    fn slow_reader_keeps_the_complete_frame_and_the_next_frame() {
        let (name, mut server) = server();
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
