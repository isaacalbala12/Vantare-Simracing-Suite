//! Sockets locales con la misma frontera que el transporte Win32.
//! Directorio privado, socket 0600 y credenciales del kernel en ambos extremos.
//! El nonce y la negociación pertenecen al protocolo común, no al transporte.
#![allow(unsafe_code)] // Solo llamadas de sistema; cada uso documenta su contrato.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd, RawFd};
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::{DirBuilderExt, FileTypeExt, MetadataExt, OpenOptionsExt, PermissionsExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

pub const IO_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Peer {
    pub pid: u32,
    pub image: PathBuf,
}
impl Peer {
    pub fn is_image(&self, expected: &Path) -> bool {
        match (self.image.canonicalize(), expected.canonicalize()) {
            (Ok(image), Ok(expected)) => image == expected,
            _ => false,
        }
    }
}

fn uid() -> libc::uid_t {
    // SAFETY: geteuid no recibe punteros ni tiene precondiciones.
    unsafe { libc::geteuid() }
}

fn temporary_root() -> PathBuf {
    // TMPDIR de macOS suele superar el límite de sockaddr_un al añadir el nombre.
    // /tmp aloja el mismo directorio privado 0700 por UID, con una ruta corta.
    #[cfg(target_os = "macos")]
    {
        PathBuf::from("/tmp")
    }
    #[cfg(not(target_os = "macos"))]
    {
        std::env::temp_dir()
    }
}

fn socket_path(name: &str) -> io::Result<PathBuf> {
    if name.is_empty()
        || !name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c))
        || name == "."
        || name == ".."
    {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    let root = std::env::var_os("XDG_RUNTIME_DIR").map_or_else(temporary_root, PathBuf::from);
    if !root.is_absolute() {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    let directory = root.join(format!("vantare-ipc-{}", uid()));
    match fs::DirBuilder::new().mode(0o700).create(&directory) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
        Err(error) => return Err(error),
    }
    let metadata = fs::symlink_metadata(&directory)?;
    if !metadata.is_dir() || metadata.uid() != uid() || metadata.mode() & 0o777 != 0o700 {
        return Err(io::ErrorKind::PermissionDenied.into());
    }
    let path = directory.join(format!("{name}.sock"));
    // sockaddr_un tiene 108 bytes en Linux y 104 en macOS, incluido el NUL.
    // SAFETY: sockaddr_un es una estructura C plana y cero es una base válida.
    let address: libc::sockaddr_un = unsafe { std::mem::zeroed() };
    if path.as_os_str().as_bytes().len() >= address.sun_path.len() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "nombre de socket Unix demasiado largo",
        ));
    }
    Ok(path)
}

pub fn default_pipe_name() -> io::Result<String> {
    Ok(format!("vantare-core-{}", uid()))
}

/// Evento manual: el byte no se consume, por lo que despierta a todos los poll.
pub struct Event {
    reader: UnixStream,
    writer: UnixStream,
    set: AtomicBool,
}
impl Event {
    pub fn new() -> io::Result<Self> {
        let (reader, writer) = UnixStream::pair()?;
        writer.set_nonblocking(true)?;
        Ok(Self {
            reader,
            writer,
            set: AtomicBool::new(false),
        })
    }
    pub fn set(&self) {
        if !self.set.swap(true, Ordering::SeqCst) {
            let mut writer = &self.writer;
            // Solo un byte durante toda la vida del evento: nunca llena el búfer.
            while let Err(error) = writer.write_all(&[1]) {
                if error.kind() != io::ErrorKind::Interrupted {
                    break;
                }
            }
        }
    }
    pub fn is_set(&self) -> bool {
        self.set.load(Ordering::SeqCst)
    }
    pub fn wait(&self, timeout: Duration) -> bool {
        let started = Instant::now();
        loop {
            if self.is_set() {
                return true;
            }
            let mut fd = libc::pollfd {
                fd: self.reader.as_raw_fd(),
                events: libc::POLLIN,
                revents: 0,
            };
            let remaining = timeout.saturating_sub(started.elapsed());
            // SAFETY: fd apunta a un pollfd válido durante la llamada.
            let result = unsafe { libc::poll(&raw mut fd, 1, poll_ms(remaining)) };
            if result > 0 {
                return true;
            }
            if result == 0 || io::Error::last_os_error().kind() != io::ErrorKind::Interrupted {
                return self.is_set();
            }
        }
    }
}
fn poll_ms(timeout: Duration) -> i32 {
    i32::try_from(
        timeout
            .as_millis()
            .saturating_add(u128::from(!timeout.is_zero())),
    )
    .unwrap_or(i32::MAX)
}
fn wait_fd(fd: RawFd, events: i16, stop: &Event, deadline: Option<Instant>) -> io::Result<()> {
    loop {
        if stop.is_set() {
            return Err(io::ErrorKind::ConnectionAborted.into());
        }
        let timeout = match deadline {
            Some(end) => {
                let remaining = end.saturating_duration_since(Instant::now());
                if remaining.is_zero() {
                    return Err(io::ErrorKind::TimedOut.into());
                }
                poll_ms(remaining)
            }
            None => -1,
        };
        let mut fds = [
            libc::pollfd {
                fd,
                events,
                revents: 0,
            },
            libc::pollfd {
                fd: stop.reader.as_raw_fd(),
                events: libc::POLLIN,
                revents: 0,
            },
        ];
        // SAFETY: fds contiene exactamente dos pollfd, válidos durante poll.
        let result = unsafe { libc::poll(fds.as_mut_ptr(), 2, timeout) };
        if result < 0 {
            let error = io::Error::last_os_error();
            if error.kind() == io::ErrorKind::Interrupted {
                continue;
            }
            return Err(error);
        }
        if stop.is_set() {
            return Err(io::ErrorKind::ConnectionAborted.into());
        }
        if result > 0 {
            return Ok(());
        }
    }
}

struct Endpoint {
    listener: UnixListener,
    path: PathBuf,
    // Flock persiste mientras vive el endpoint. El fichero nunca se desvincula:
    // unlink permitiría a otro proceso bloquear un inode distinto con igual nombre.
    _lock: File,
}

/// Lock exclusivo durante toda la vida del endpoint. El directorio debe ser
/// privado del usuario; no borrar el fichero al cerrar (conserva su inode).
/// Rechaza symlinks, permisos ajenos y devuelve [`io::ErrorKind::WouldBlock`]
/// si ya tiene dueño.
pub fn lock_endpoint(path: &Path) -> io::Result<File> {
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(path)?;
    let metadata = lock.metadata()?;
    if !metadata.is_file() || metadata.uid() != uid() || metadata.mode() & 0o777 != 0o600 {
        return Err(io::ErrorKind::PermissionDenied.into());
    }
    lock.try_lock().map_err(|error| match error {
        fs::TryLockError::WouldBlock => io::ErrorKind::WouldBlock.into(),
        fs::TryLockError::Error(error) => error,
    })?;
    Ok(lock)
}
impl Drop for Endpoint {
    fn drop(&mut self) {
        // Seguimos teniendo el lock al retirar nuestro socket.
        let _removed = fs::remove_file(&self.path);
    }
}

pub struct Listener {
    endpoint: Arc<Endpoint>,
    stop: Arc<Event>,
    timeout: Duration,
}
impl Listener {
    pub fn new(name: &str, stop: Arc<Event>, timeout: Duration) -> io::Result<Self> {
        let path = socket_path(name)?;
        let lock = lock_endpoint(&path.with_extension("lock"))?;
        match fs::symlink_metadata(&path) {
            Ok(metadata) => {
                if !metadata.file_type().is_socket() || metadata.uid() != uid() {
                    return Err(io::ErrorKind::PermissionDenied.into());
                }
                // No retiramos un servidor vivo aunque no utilice nuestro lock.
                match connect_stream(&path, &stop, timeout) {
                    Ok(_) => return Err(io::ErrorKind::AddrInUse.into()),
                    Err(error) if error.kind() == io::ErrorKind::ConnectionRefused => {
                        fs::remove_file(&path)?;
                    }
                    Err(error) => return Err(error),
                }
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
        let listener = UnixListener::bind(&path)?;
        // Construir guard antes de cualquier operación falible limpia fallos parciales.
        let endpoint = Arc::new(Endpoint {
            listener,
            path,
            _lock: lock,
        });
        fs::set_permissions(&endpoint.path, fs::Permissions::from_mode(0o600))?;
        endpoint.listener.set_nonblocking(true)?;
        Ok(Self {
            endpoint,
            stop,
            timeout,
        })
    }
    pub fn instance(&mut self) -> io::Result<Pipe> {
        Ok(Pipe {
            listener: Some(Arc::clone(&self.endpoint)),
            stream: None,
            stop: Arc::clone(&self.stop),
            timeout: self.timeout,
        })
    }
}

pub struct Pipe {
    listener: Option<Arc<Endpoint>>,
    stream: Option<UnixStream>,
    stop: Arc<Event>,
    timeout: Duration,
}
impl Pipe {
    pub fn accept(&mut self) -> io::Result<()> {
        let endpoint = self.listener.as_ref().ok_or(io::ErrorKind::InvalidInput)?;
        loop {
            wait_fd(
                endpoint.listener.as_raw_fd(),
                libc::POLLIN,
                &self.stop,
                None,
            )?;
            match endpoint.listener.accept() {
                Ok((stream, _)) => {
                    stream.set_nonblocking(true)?;
                    peer(&stream)?; // UID del kernel: nunca confiamos en datos del cliente.
                    self.stream = Some(stream);
                    self.listener = None;
                    return Ok(());
                }
                Err(error)
                    if matches!(
                        error.kind(),
                        io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted
                    ) => {}
                Err(error) => return Err(error),
            }
        }
    }
    fn stream(&self) -> io::Result<&UnixStream> {
        self.stream
            .as_ref()
            .ok_or_else(|| io::ErrorKind::NotConnected.into())
    }
    pub fn client_peer(&self) -> io::Result<Peer> {
        peer(self.stream()?)
    }
    pub fn server_peer(&self) -> io::Result<Peer> {
        peer(self.stream()?)
    }
    fn io<T>(
        &self,
        events: i16,
        mut operation: impl FnMut(&UnixStream) -> io::Result<T>,
    ) -> io::Result<T> {
        let stream = self.stream()?;
        let deadline = Instant::now()
            .checked_add(self.timeout)
            .ok_or(io::ErrorKind::InvalidInput)?;
        loop {
            wait_fd(stream.as_raw_fd(), events, &self.stop, Some(deadline))?;
            match operation(stream) {
                Err(error)
                    if matches!(
                        error.kind(),
                        io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted
                    ) => {}
                result => return result,
            }
        }
    }
}
impl Read for Pipe {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if buf.is_empty() {
            return Ok(0);
        }
        self.io(libc::POLLIN, |mut stream| stream.read(buf))
    }
}
impl Write for Pipe {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        if buf.is_empty() {
            return Ok(0);
        }
        self.io(libc::POLLOUT, |mut stream| stream.write(buf))
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

pub fn connect(name: &str, stop: Arc<Event>, timeout: Duration) -> io::Result<Pipe> {
    let path = socket_path(name)?;
    let metadata = fs::symlink_metadata(&path)?;
    if !metadata.file_type().is_socket()
        || metadata.uid() != uid()
        || metadata.mode() & 0o777 != 0o600
    {
        return Err(io::ErrorKind::PermissionDenied.into());
    }
    let stream = connect_stream(&path, &stop, timeout)?;
    peer(&stream)?;
    Ok(Pipe {
        stream: Some(stream),
        listener: None,
        stop,
        timeout,
    })
}

fn connect_stream(path: &Path, stop: &Event, timeout: Duration) -> io::Result<UnixStream> {
    // SAFETY: socket no recibe punteros y comprobamos su resultado antes de poseerlo.
    let raw = unsafe { libc::socket(libc::AF_UNIX, libc::SOCK_STREAM, 0) };
    if raw < 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: raw es un fd nuevo; OwnedFd asume su única propiedad.
    let owned = unsafe { OwnedFd::from_raw_fd(raw) };
    // SAFETY: raw sigue vivo; los flags son válidos para este fd de socket.
    if unsafe { libc::fcntl(raw, libc::F_SETFD, libc::FD_CLOEXEC) } < 0 {
        return Err(io::Error::last_os_error());
    }
    let stream = UnixStream::from(owned);
    stream.set_nonblocking(true)?;
    // SAFETY: sockaddr_un es una estructura C plana; los ceros incluyen el NUL.
    let mut address: libc::sockaddr_un = unsafe { std::mem::zeroed() };
    address.sun_family =
        libc::sa_family_t::try_from(libc::AF_UNIX).map_err(|_| io::ErrorKind::InvalidInput)?;
    let bytes = path.as_os_str().as_bytes();
    // SAFETY: socket_path limitó bytes a sun_path.len()-1; los buffers no se solapan.
    unsafe {
        std::ptr::copy_nonoverlapping(
            bytes.as_ptr(),
            address.sun_path.as_mut_ptr().cast(),
            bytes.len(),
        );
    };
    let len = libc::socklen_t::try_from(
        std::mem::offset_of!(libc::sockaddr_un, sun_path) + bytes.len() + 1,
    )
    .map_err(|_| io::ErrorKind::InvalidInput)?;
    #[cfg(target_os = "macos")]
    {
        address.sun_len = u8::try_from(len).map_err(|_| io::ErrorKind::InvalidInput)?;
    }
    // SAFETY: address contiene una ruta terminada en NUL y len no supera su tamaño.
    let result = unsafe { libc::connect(raw, (&raw const address).cast(), len) };
    if result < 0 {
        let error = io::Error::last_os_error();
        if !matches!(error.raw_os_error(), Some(libc::EINPROGRESS | libc::EAGAIN)) {
            return Err(error);
        }
        // Linux AF_UNIX devuelve EAGAIN con backlog lleno: no indica conexión en vuelo.
        if error.raw_os_error() == Some(libc::EAGAIN) {
            return Err(error);
        }
        let deadline = Instant::now()
            .checked_add(timeout)
            .ok_or(io::ErrorKind::InvalidInput)?;
        wait_fd(raw, libc::POLLOUT, stop, Some(deadline))?;
        if let Some(error) = stream.take_error()? {
            return Err(error);
        }
    }
    if stop.is_set() {
        return Err(io::ErrorKind::ConnectionAborted.into());
    }
    Ok(stream)
}

#[cfg(target_os = "linux")]
fn peer(stream: &UnixStream) -> io::Result<Peer> {
    // SAFETY: ucred es una estructura C plana que getsockopt rellena.
    let mut credentials: libc::ucred = unsafe { std::mem::zeroed() };
    let mut len = libc::socklen_t::try_from(std::mem::size_of_val(&credentials))
        .map_err(|_| io::ErrorKind::InvalidData)?;
    // SAFETY: credenciales y len tienen el tamaño y la alineación exigidos.
    if unsafe {
        libc::getsockopt(
            stream.as_raw_fd(),
            libc::SOL_SOCKET,
            libc::SO_PEERCRED,
            (&raw mut credentials).cast(),
            &raw mut len,
        )
    } != 0
    {
        return Err(io::Error::last_os_error());
    }
    if credentials.uid != uid() || credentials.pid <= 0 {
        return Err(io::ErrorKind::PermissionDenied.into());
    }
    let pid = u32::try_from(credentials.pid).map_err(|_| io::ErrorKind::InvalidData)?;
    Ok(Peer {
        pid,
        image: fs::read_link(format!("/proc/{pid}/exe"))?,
    })
}

#[cfg(target_os = "macos")]
fn peer(stream: &UnixStream) -> io::Result<Peer> {
    let (mut user, mut group, mut pid) = (0, 0, 0_i32);
    // SAFETY: ambos punteros de salida son válidos y stream mantiene vivo su fd.
    if unsafe { libc::getpeereid(stream.as_raw_fd(), &raw mut user, &raw mut group) } != 0 {
        return Err(io::Error::last_os_error());
    }
    if user != uid() {
        return Err(io::ErrorKind::PermissionDenied.into());
    }
    let mut len = libc::socklen_t::try_from(std::mem::size_of_val(&pid))
        .map_err(|_| io::ErrorKind::InvalidData)?;
    // SAFETY: pid y len son buffers válidos para LOCAL_PEERPID.
    if unsafe {
        libc::getsockopt(
            stream.as_raw_fd(),
            0,
            libc::LOCAL_PEERPID,
            (&raw mut pid).cast(),
            &raw mut len,
        )
    } != 0
    {
        return Err(io::Error::last_os_error());
    }
    if pid <= 0 {
        return Err(io::ErrorKind::PermissionDenied.into());
    }
    let mut image = vec![
        0_u8;
        usize::try_from(libc::PROC_PIDPATHINFO_MAXSIZE)
            .map_err(|_| io::ErrorKind::InvalidData)?
    ];
    let size = u32::try_from(image.len()).map_err(|_| io::ErrorKind::InvalidData)?;
    // SAFETY: image contiene size bytes y proc_pidpath escribe como mucho ese tamaño.
    let written = unsafe { libc::proc_pidpath(pid, image.as_mut_ptr().cast(), size) };
    if written <= 0 {
        return Err(io::Error::last_os_error());
    }
    let end = image
        .iter()
        .position(|&c| c == 0)
        .ok_or(io::ErrorKind::InvalidData)?;
    let path = std::ffi::OsStr::from_bytes(&image[..end]);
    Ok(Peer {
        pid: u32::try_from(pid).map_err(|_| io::ErrorKind::InvalidData)?,
        image: PathBuf::from(path),
    })
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn peer(_stream: &UnixStream) -> io::Result<Peer> {
    Err(io::ErrorKind::Unsupported.into()) // Fail closed: ninguna identidad inventada.
}

#[cfg(test)]
mod tests {
    use super::*;

    fn name(tag: &str) -> String {
        format!("vantare-unix-{tag}-{}", std::process::id())
    }
    fn pair(tag: &str) -> (Listener, Pipe, Pipe, Arc<Event>) {
        let stop = Arc::new(Event::new().expect("evento"));
        let mut listener =
            Listener::new(&name(tag), Arc::clone(&stop), IO_TIMEOUT).expect("listener");
        let mut server = listener.instance().expect("instancia");
        let client = connect(&name(tag), Arc::clone(&stop), IO_TIMEOUT).expect("cliente");
        server.accept().expect("acepta");
        (listener, server, client, stop)
    }
    #[test]
    fn private_socket_and_lock_are_removed_or_reused_after_shutdown() {
        let name = name("permissions");
        let path = socket_path(&name).expect("ruta");
        let stop = Arc::new(Event::new().expect("evento"));
        let listener = Listener::new(&name, Arc::clone(&stop), IO_TIMEOUT).expect("listener");
        for path in [&path, &path.with_extension("lock")] {
            let metadata = fs::symlink_metadata(path).expect("metadata");
            assert_eq!(metadata.mode() & 0o777, 0o600);
            assert_eq!(metadata.uid(), uid());
        }
        assert_eq!(
            fs::metadata(path.parent().expect("directorio"))
                .expect("metadata")
                .mode()
                & 0o777,
            0o700
        );
        assert!(Listener::new(&name, Arc::clone(&stop), IO_TIMEOUT).is_err());
        drop(listener);
        assert!(!path.exists());
        Listener::new(&name, stop, IO_TIMEOUT).expect("nombre libre tras cierre");
    }
    #[test]
    fn stale_socket_is_recovered_but_files_and_symlinks_are_preserved() {
        let name = name("stale");
        let path = socket_path(&name).expect("ruta");
        drop(UnixListener::bind(&path).expect("socket huérfano"));
        let stop = Arc::new(Event::new().expect("evento"));
        drop(Listener::new(&name, Arc::clone(&stop), IO_TIMEOUT).expect("recuperación"));
        fs::write(&path, "conservar").expect("fichero ajeno");
        assert!(Listener::new(&name, Arc::clone(&stop), IO_TIMEOUT).is_err());
        assert_eq!(fs::read_to_string(&path).expect("intacto"), "conservar");
        fs::remove_file(&path).expect("limpieza");
        std::os::unix::fs::symlink("destino-inexistente", &path).expect("symlink");
        assert!(Listener::new(&name, stop, IO_TIMEOUT).is_err());
        assert!(
            fs::symlink_metadata(&path)
                .expect("intacto")
                .file_type()
                .is_symlink()
        );
        fs::remove_file(path).expect("limpieza");
    }
    #[test]
    fn unsafe_or_overlong_names_are_refused() {
        for name in [
            "",
            ".",
            "..",
            "../escape",
            "/escape",
            "with space",
            "null\0",
            &"x".repeat(200),
        ] {
            assert_eq!(
                socket_path(name).expect_err("nombre inseguro").kind(),
                io::ErrorKind::InvalidInput
            );
        }
    }
    #[test]
    fn cancelled_read_write_and_accept_finish_without_retrying() {
        let (_listener, mut server, mut client, stop) = pair("cancel");
        stop.set();
        assert_eq!(
            server
                .read_exact(&mut [0])
                .expect_err("lectura cancelada")
                .kind(),
            io::ErrorKind::ConnectionAborted
        );
        assert_eq!(
            client
                .write_all(&[1])
                .expect_err("escritura cancelada")
                .kind(),
            io::ErrorKind::ConnectionAborted
        );
        let mut listener =
            Listener::new(&name("cancel-accept"), stop, IO_TIMEOUT).expect("listener");
        assert_eq!(
            listener
                .instance()
                .expect("instancia")
                .accept()
                .expect_err("accept cancelado")
                .kind(),
            io::ErrorKind::ConnectionAborted
        );
    }
    #[test]
    fn silent_read_and_stalled_write_have_deadlines() {
        let (_listener, mut server, _client, _stop) = pair("timeout");
        server.timeout = Duration::from_millis(50);
        assert_eq!(
            server.read_exact(&mut [0]).expect_err("silencio").kind(),
            io::ErrorKind::TimedOut
        );
        assert_eq!(
            server
                .write_all(&vec![0; 4 * 1024 * 1024])
                .expect_err("cliente no lee")
                .kind(),
            io::ErrorKind::TimedOut
        );
    }
    #[test]
    fn event_wakes_all_waiters_and_remains_set() {
        let event = Arc::new(Event::new().expect("evento"));
        std::thread::scope(|scope| {
            let waiters: Vec<_> = (0..4)
                .map(|_| {
                    let event = Arc::clone(&event);
                    scope.spawn(move || event.wait(IO_TIMEOUT))
                })
                .collect();
            event.set();
            for waiter in waiters {
                assert!(waiter.join().expect("waiter"));
            }
        });
        assert!(event.wait(Duration::ZERO));
        event.set();
        assert!(event.wait(Duration::ZERO));
    }
}
