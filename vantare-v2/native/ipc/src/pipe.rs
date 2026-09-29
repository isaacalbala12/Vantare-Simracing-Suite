//! Named pipes de Windows: única parte del crate con `unsafe`. E/S solapada
//! con plazo y cancelación (un hilo bloqueado en un par mudo o muerto siempre
//! puede soltarse), ACL restringida al usuario actual, rechazo de clientes
//! remotos e identificación del par (PID e imagen).

#![allow(unsafe_code)]

use std::ffi::{OsString, c_void};
use std::io::{self, Read, Write};
use std::mem::{size_of, zeroed};
use std::os::windows::ffi::OsStringExt;
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::path::PathBuf;
use std::ptr::{null, null_mut};
use std::sync::Arc;
use std::time::Duration;

use windows_sys::Win32::Foundation::{
    ERROR_BROKEN_PIPE, ERROR_IO_PENDING, ERROR_OPERATION_ABORTED, ERROR_PIPE_CONNECTED,
    GENERIC_READ, GENERIC_WRITE, HANDLE, INVALID_HANDLE_VALUE, LocalFree, WAIT_OBJECT_0,
    WAIT_TIMEOUT,
};
use windows_sys::Win32::Security::Authorization::{
    ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
};
use windows_sys::Win32::Security::{
    GetTokenInformation, PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES, TOKEN_QUERY, TOKEN_USER,
    TokenUser,
};
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, FILE_FLAG_FIRST_PIPE_INSTANCE, FILE_FLAG_OVERLAPPED, OPEN_EXISTING,
    PIPE_ACCESS_DUPLEX, ReadFile, SECURITY_ANONYMOUS, SECURITY_SQOS_PRESENT, WriteFile,
};
use windows_sys::Win32::System::IO::{CancelIoEx, GetOverlappedResult, OVERLAPPED};
use windows_sys::Win32::System::Pipes::{
    ConnectNamedPipe, CreateNamedPipeW, GetNamedPipeClientProcessId, GetNamedPipeServerProcessId,
    PIPE_READMODE_BYTE, PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_BYTE, PIPE_UNLIMITED_INSTANCES,
    PIPE_WAIT,
};
use windows_sys::Win32::System::Threading::{
    CreateEventW, GetCurrentProcess, OpenProcess, OpenProcessToken,
    PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW, ResetEvent, SetEvent,
    WaitForMultipleObjects, WaitForSingleObject,
};

const BUFFER: u32 = 64 * 1024;
/// Plazo por operación de E/S; también rige el saludo y el silencio del productor.
pub(crate) const IO_TIMEOUT: Duration = Duration::from_secs(5);
const INFINITE: u32 = u32::MAX;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain([0]).collect()
}

/// # Safety
/// `text` apunta a una cadena UTF-16 terminada en NUL, válida durante la llamada.
unsafe fn from_wide(text: *const u16) -> String {
    let mut len = 0;
    // SAFETY: por el contrato, hay un NUL tras los `len` elementos leídos.
    while unsafe { *text.add(len) } != 0 {
        len += 1;
    }
    // SAFETY: los `len` elementos anteriores son válidos.
    String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(text, len) })
}

fn millis(d: Duration) -> u32 {
    u32::try_from(d.as_millis()).map_or(INFINITE - 1, |ms| ms.min(INFINITE - 1))
}

/// Identidad del otro extremo, para que el dueño decida si lo admite.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Peer {
    pub pid: u32,
    /// Ruta completa del ejecutable del proceso.
    pub image: PathBuf,
}

fn peer(pid: u32) -> io::Result<Peer> {
    // SAFETY: `OpenProcess` no toma punteros; el resultado se comprueba y se envuelve.
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if process.is_null() {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: `process` es un HANDLE válido que solo nosotros poseemos.
    let process = unsafe { OwnedHandle::from_raw_handle(process) };
    let mut buf = vec![0_u16; 32 * 1024];
    let mut len = u32::try_from(buf.len()).unwrap_or(u32::MAX);
    // SAFETY: `buf` tiene `len` elementos y `len` es un puntero válido a u32.
    let ok = unsafe {
        QueryFullProcessImageNameW(process.as_raw_handle(), 0, buf.as_mut_ptr(), &raw mut len)
    };
    if ok == 0 {
        return Err(io::Error::last_os_error());
    }
    let image = PathBuf::from(OsString::from_wide(&buf[..len as usize]));
    Ok(Peer { pid, image })
}

/// Evento manual del kernel. Con él se para todo lo que espera en un pipe.
pub(crate) struct Event(OwnedHandle);

impl Event {
    pub fn new() -> io::Result<Self> {
        // SAFETY: sin punteros de entrada; el resultado se comprueba.
        let handle = unsafe { CreateEventW(null(), 1, 0, null()) };
        if handle.is_null() {
            return Err(io::Error::last_os_error());
        }
        // SAFETY: HANDLE recién creado y único dueño.
        Ok(Self(unsafe { OwnedHandle::from_raw_handle(handle) }))
    }

    fn raw(&self) -> HANDLE {
        self.0.as_raw_handle()
    }

    pub fn set(&self) {
        // SAFETY: el handle es válido mientras `self` vive.
        unsafe { SetEvent(self.raw()) };
    }

    pub fn is_set(&self) -> bool {
        self.wait(Duration::ZERO)
    }

    /// Espera hasta `timeout`; `true` si el evento está activado.
    pub fn wait(&self, timeout: Duration) -> bool {
        // SAFETY: el handle es válido mientras `self` vive.
        unsafe { WaitForSingleObject(self.raw(), millis(timeout)) == WAIT_OBJECT_0 }
    }
}

// SAFETY: los handles de evento del kernel se pueden usar desde cualquier hilo.
unsafe impl Send for Event {}
unsafe impl Sync for Event {}

/// Un extremo de pipe con E/S solapada. `Read`/`Write` esperan como mucho
/// `timeout` por operación y terminan antes con `ConnectionAborted` si `stop` se activa.
pub(crate) struct Pipe {
    handle: OwnedHandle,
    /// Señal de fin de cada operación solapada (una operación a la vez: `&mut self`).
    done: Event,
    stop: Arc<Event>,
    timeout: Duration,
}

impl Pipe {
    fn new(handle: HANDLE, stop: Arc<Event>, timeout: Duration) -> io::Result<Self> {
        Ok(Self {
            // SAFETY: HANDLE recién creado por el llamador, que cede su propiedad.
            handle: unsafe { OwnedHandle::from_raw_handle(handle) },
            done: Event::new()?,
            stop,
            timeout,
        })
    }

    #[cfg(test)]
    pub fn set_timeout(&mut self, timeout: Duration) {
        self.timeout = timeout;
    }

    /// Lanza una operación solapada con `start` y espera su final, el plazo o
    /// `stop`. Nunca vuelve con la operación en vuelo: el kernel sigue usando
    /// el `OVERLAPPED` y los búferes hasta que termina o se cancela.
    fn overlapped(
        &self,
        timeout: Option<Duration>,
        start: impl FnOnce(*mut OVERLAPPED) -> i32,
    ) -> io::Result<u32> {
        let handle = self.handle.as_raw_handle();
        // SAFETY: OVERLAPPED es un struct C plano; todo ceros es válido.
        let mut ov: OVERLAPPED = unsafe { zeroed() };
        ov.hEvent = self.done.raw();
        // SAFETY: `done` es un evento válido.
        unsafe { ResetEvent(ov.hEvent) };
        if start(&raw mut ov) == 0 {
            let error = io::Error::last_os_error();
            match error.raw_os_error().map(i64::from) {
                Some(code) if code == i64::from(ERROR_IO_PENDING) => {}
                // `ConnectNamedPipe`: el cliente llegó antes de la llamada.
                Some(code) if code == i64::from(ERROR_PIPE_CONNECTED) => return Ok(0),
                _ => return Err(error),
            }
        }
        let events = [self.done.raw(), self.stop.raw()];
        // SAFETY: `events` son dos handles válidos.
        let waited = unsafe {
            WaitForMultipleObjects(2, events.as_ptr(), 0, timeout.map_or(INFINITE, millis))
        };
        let finished = waited == WAIT_OBJECT_0;
        if !finished {
            // SAFETY: `ov` es la operación lanzada sobre `handle` arriba.
            unsafe { CancelIoEx(handle, &raw const ov) };
        }
        let mut transferred = 0;
        // SAFETY: `ov` sigue vivo; con `bwait` no volvemos hasta que el kernel termine con él.
        let ok = unsafe { GetOverlappedResult(handle, &raw const ov, &raw mut transferred, 1) };
        if ok != 0 {
            return Ok(transferred); // también si terminó justo al cancelar
        }
        let error = io::Error::last_os_error();
        if !finished
            && error.raw_os_error().map(i64::from) == Some(i64::from(ERROR_OPERATION_ABORTED))
        {
            return Err(if waited == WAIT_TIMEOUT {
                io::ErrorKind::TimedOut.into()
            } else {
                // No `Interrupted`: `read_exact` y `write_all` lo reintentan.
                io::ErrorKind::ConnectionAborted.into()
            });
        }
        Err(error)
    }

    /// Espera al cliente en una instancia del servidor; solo `stop` la interrumpe.
    pub fn accept(&mut self) -> io::Result<()> {
        let handle = self.handle.as_raw_handle();
        // SAFETY: `handle` es una instancia servidor solapada; `ov` lo aporta `overlapped`.
        self.overlapped(None, |ov| unsafe { ConnectNamedPipe(handle, ov) })
            .map(drop)
    }

    /// Identidad del cliente conectado a esta instancia servidor.
    pub fn client_peer(&self) -> io::Result<Peer> {
        let mut pid = 0;
        // SAFETY: handle válido y puntero a u32 válido.
        if unsafe { GetNamedPipeClientProcessId(self.handle.as_raw_handle(), &raw mut pid) } == 0 {
            return Err(io::Error::last_os_error());
        }
        peer(pid)
    }

    /// Identidad del servidor al que está conectado este cliente.
    pub fn server_peer(&self) -> io::Result<Peer> {
        let mut pid = 0;
        // SAFETY: handle válido y puntero a u32 válido.
        if unsafe { GetNamedPipeServerProcessId(self.handle.as_raw_handle(), &raw mut pid) } == 0 {
            return Err(io::Error::last_os_error());
        }
        peer(pid)
    }
}

// SAFETY: el pipe lo usa un hilo a la vez (`&mut self`); los handles del kernel no
// están atados a un hilo.
unsafe impl Send for Pipe {}

impl Read for Pipe {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let handle = self.handle.as_raw_handle();
        let len = u32::try_from(buf.len()).unwrap_or(u32::MAX);
        let ptr = buf.as_mut_ptr();
        // SAFETY: `ptr` apunta a `len` bytes de `buf`, que sigue prestado hasta que
        // `overlapped` vuelve (y con él, la operación ha terminado).
        let read = self.overlapped(Some(self.timeout), |ov| unsafe {
            ReadFile(handle, ptr, len, null_mut(), ov)
        });
        match read {
            Ok(n) => Ok(n as usize),
            // El otro extremo cerró: fin de flujo, como en `std`.
            Err(e) if e.raw_os_error().map(i64::from) == Some(i64::from(ERROR_BROKEN_PIPE)) => {
                Ok(0)
            }
            Err(e) => Err(e),
        }
    }
}

impl Write for Pipe {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let handle = self.handle.as_raw_handle();
        let len = u32::try_from(buf.len()).unwrap_or(u32::MAX);
        let ptr = buf.as_ptr();
        // SAFETY: como en `read`, `buf` sigue prestado hasta que la operación termina.
        let written = self.overlapped(Some(self.timeout), |ov| unsafe {
            WriteFile(handle, ptr, len, null_mut(), ov)
        })?;
        Ok(written as usize)
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

/// Descriptor de seguridad con un único permiso: control total al usuario actual.
struct Acl(PSECURITY_DESCRIPTOR);

// SAFETY: memoria propia, inmutable tras crearse.
unsafe impl Send for Acl {}

impl Acl {
    fn current_user_only() -> io::Result<Self> {
        let sddl = wide(&format!("D:P(A;;GA;;;{})", current_user_sid()?));
        let mut descriptor = null_mut();
        // SAFETY: `sddl` termina en NUL; `descriptor` es un puntero de salida válido.
        let ok = unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                sddl.as_ptr(),
                SDDL_REVISION_1,
                &raw mut descriptor,
                null_mut(),
            )
        };
        if ok == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(Self(descriptor))
    }
}

impl Drop for Acl {
    fn drop(&mut self) {
        // SAFETY: lo reservó `ConvertString...` con LocalAlloc y solo se libera aquí.
        unsafe { LocalFree(self.0) };
    }
}

/// Nombre de pipe por defecto del núcleo de este usuario: lleva el SID, así que
/// dos usuarios de la misma máquina no comparten nombre. Núcleo y overlays lo
/// calculan igual.
pub fn default_pipe_name() -> io::Result<String> {
    Ok(format!("vantare-core-{}", current_user_sid()?))
}

/// SID del usuario del proceso en texto (`S-1-5-21-...`).
fn current_user_sid() -> io::Result<String> {
    let mut token = null_mut();
    // SAFETY: pseudo-handle del proceso actual y puntero de salida válidos.
    if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &raw mut token) } == 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: `token` es un HANDLE válido y único.
    let token = unsafe { OwnedHandle::from_raw_handle(token) };
    let mut needed = 0;
    // Primera llamada solo para saber el tamaño: falla con "búfer insuficiente".
    // SAFETY: búfer nulo de longitud 0, permitido para consultar el tamaño.
    unsafe {
        GetTokenInformation(
            token.as_raw_handle(),
            TokenUser,
            null_mut(),
            0,
            &raw mut needed,
        )
    };
    // `u64` para que el búfer esté alineado como `TOKEN_USER`.
    let mut buf = vec![0_u64; (needed as usize).div_ceil(size_of::<u64>())];
    // SAFETY: `buf` tiene al menos `needed` bytes.
    let ok = unsafe {
        GetTokenInformation(
            token.as_raw_handle(),
            TokenUser,
            buf.as_mut_ptr().cast::<c_void>(),
            needed,
            &raw mut needed,
        )
    };
    if ok == 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: el sistema escribió un `TOKEN_USER` al inicio de `buf`, bien alineado.
    let sid = unsafe { (*buf.as_ptr().cast::<TOKEN_USER>()).User.Sid };
    let mut text = null_mut();
    // SAFETY: `sid` apunta dentro de `buf`, vivo; `text` es un puntero de salida válido.
    if unsafe { ConvertSidToStringSidW(sid, &raw mut text) } == 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: `text` es una cadena UTF-16 terminada en NUL reservada por el sistema.
    let sid = unsafe { from_wide(text) };
    // SAFETY: `text` se reservó con LocalAlloc y no se usa después.
    unsafe { LocalFree(text.cast()) };
    Ok(sid)
}

/// Fábrica de instancias servidor de un pipe. La primera se crea con
/// `FIRST_PIPE_INSTANCE`: si otro proceso ya tiene ese nombre, falla en lugar de
/// dejarnos servir junto a un impostor.
pub(crate) struct Listener {
    name: Vec<u16>,
    acl: Acl,
    stop: Arc<Event>,
    timeout: Duration,
    first: bool,
}

impl Listener {
    pub fn new(name: &str, stop: Arc<Event>, timeout: Duration) -> io::Result<Self> {
        Ok(Self {
            name: wide(&format!(r"\\.\pipe\{name}")),
            acl: Acl::current_user_only()?,
            stop,
            timeout,
            first: true,
        })
    }

    pub fn instance(&mut self) -> io::Result<Pipe> {
        let security = SECURITY_ATTRIBUTES {
            #[allow(clippy::cast_possible_truncation)] // tamaño de un struct fijo y pequeño
            nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: self.acl.0,
            bInheritHandle: 0,
        };
        let first = if self.first {
            FILE_FLAG_FIRST_PIPE_INSTANCE
        } else {
            0
        };
        // SAFETY: `name` termina en NUL y `security` vive durante la llamada.
        let handle = unsafe {
            CreateNamedPipeW(
                self.name.as_ptr(),
                PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED | first,
                PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
                PIPE_UNLIMITED_INSTANCES,
                BUFFER,
                BUFFER,
                0,
                &raw const security,
            )
        };
        if handle == INVALID_HANDLE_VALUE {
            return Err(io::Error::last_os_error());
        }
        self.first = false;
        Pipe::new(handle, Arc::clone(&self.stop), self.timeout)
    }
}

/// Conecta con el servidor sin permitirle suplantarnos (`SECURITY_ANONYMOUS`).
pub(crate) fn connect(name: &str, stop: Arc<Event>, timeout: Duration) -> io::Result<Pipe> {
    let name = wide(&format!(r"\\.\pipe\{name}"));
    // SAFETY: `name` termina en NUL; el resto son valores por defecto.
    let handle = unsafe {
        CreateFileW(
            name.as_ptr(),
            GENERIC_READ | GENERIC_WRITE,
            0,
            null(),
            OPEN_EXISTING,
            FILE_FLAG_OVERLAPPED | SECURITY_SQOS_PRESENT | SECURITY_ANONYMOUS,
            null_mut(),
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        return Err(io::Error::last_os_error());
    }
    Pipe::new(handle, stop, timeout)
}

#[cfg(test)]
mod tests {
    use std::time::Instant;

    use windows_sys::Win32::Security::Authorization::{
        ConvertSecurityDescriptorToStringSecurityDescriptorW, GetSecurityInfo, SE_KERNEL_OBJECT,
    };
    use windows_sys::Win32::Security::DACL_SECURITY_INFORMATION;

    use super::*;

    const SHORT: Duration = Duration::from_millis(150);

    fn unique(tag: &str) -> String {
        format!("vantare-test-pipe-{tag}-{}", std::process::id())
    }

    /// Servidor conectado con su cliente; `stop` compartido.
    fn pair(tag: &str) -> (Pipe, Pipe, Arc<Event>) {
        let stop = Arc::new(Event::new().unwrap());
        let mut listener = Listener::new(&unique(tag), Arc::clone(&stop), SHORT).unwrap();
        let mut server = listener.instance().unwrap();
        let client = connect(&unique(tag), Arc::clone(&stop), SHORT).unwrap();
        server.accept().unwrap();
        (server, client, stop)
    }

    #[test]
    fn dacl_grants_only_the_current_user() {
        let stop = Arc::new(Event::new().unwrap());
        let server = Listener::new(&unique("acl"), stop, SHORT)
            .unwrap()
            .instance()
            .unwrap();
        let mut descriptor = null_mut();
        // SAFETY: handle válido con READ_CONTROL; el resto son punteros de salida.
        let status = unsafe {
            GetSecurityInfo(
                server.handle.as_raw_handle(),
                SE_KERNEL_OBJECT,
                DACL_SECURITY_INFORMATION,
                null_mut(),
                null_mut(),
                null_mut(),
                null_mut(),
                &raw mut descriptor,
            )
        };
        assert_eq!(status, 0);
        let mut text = null_mut();
        // SAFETY: `descriptor` lo devolvió `GetSecurityInfo`.
        let ok = unsafe {
            ConvertSecurityDescriptorToStringSecurityDescriptorW(
                descriptor,
                SDDL_REVISION_1,
                DACL_SECURITY_INFORMATION,
                &raw mut text,
                null_mut(),
            )
        };
        assert_ne!(ok, 0);
        // SAFETY: `text` es una cadena UTF-16 terminada en NUL reservada por el sistema.
        let sddl = unsafe { from_wide(text) };
        // SAFETY: ambos se reservaron con LocalAlloc y no se usan después.
        unsafe {
            LocalFree(text.cast());
            LocalFree(descriptor);
        }
        let sid = current_user_sid().unwrap();
        assert!(default_pipe_name().unwrap().ends_with(&sid));
        assert!(sddl.starts_with("D:P("), "DACL protegida: {sddl}");
        // Windows abrevia al escribir SDDL el SID del Administrador integrado
        // (RID 500) como `LA`; así corre el usuario del runner de CI.
        let trustee = sddl.rsplit(';').next().unwrap().trim_end_matches(')');
        assert!(
            trustee == sid || (trustee == "LA" && sid.ends_with("-500")),
            "{sddl} debe nombrar a {sid}"
        );
        assert_eq!(sddl.matches('(').count(), 1, "un único permiso: {sddl}");
    }

    #[test]
    fn peers_are_identified_by_pid_and_image() {
        let (server, client, _stop) = pair("peer");
        let me = std::env::current_exe().unwrap();
        for peer in [server.client_peer().unwrap(), client.server_peer().unwrap()] {
            assert_eq!(peer.pid, std::process::id());
            assert!(
                peer.image
                    .to_string_lossy()
                    .eq_ignore_ascii_case(&me.to_string_lossy()),
                "{:?} != {me:?}",
                peer.image
            );
        }
    }

    #[test]
    fn data_flows_and_close_is_end_of_stream() {
        let (mut server, mut client, _stop) = pair("flow");
        server.write_all(b"hola").unwrap();
        let mut buf = [0; 4];
        client.read_exact(&mut buf).unwrap();
        assert_eq!(&buf, b"hola");
        drop(server);
        assert_eq!(client.read(&mut buf).unwrap(), 0);
    }

    #[test]
    fn read_times_out_and_stop_interrupts() {
        let (_server, mut client, stop) = pair("timeout");
        let began = Instant::now();
        let error = client.read(&mut [0; 1]).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::TimedOut);
        assert!(began.elapsed() < Duration::from_secs(2));

        client.set_timeout(Duration::from_secs(30));
        stop.set();
        let began = Instant::now();
        let error = client.read(&mut [0; 1]).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::ConnectionAborted);
        assert!(began.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn write_to_a_peer_that_never_reads_times_out() {
        let (mut server, _client, _stop) = pair("stall");
        let chunk = vec![0; BUFFER as usize];
        let error = (0..100)
            .map(|_| server.write_all(&chunk))
            .find_map(Result::err)
            .expect("el búfer del pipe debe llenarse");
        assert_eq!(error.kind(), io::ErrorKind::TimedOut);
    }

    #[test]
    fn a_second_first_instance_is_refused() {
        let stop = Arc::new(Event::new().unwrap());
        let name = unique("squat");
        let _mine = Listener::new(&name, Arc::clone(&stop), SHORT)
            .unwrap()
            .instance()
            .unwrap();
        let squatter = Listener::new(&name, stop, SHORT).unwrap().instance();
        assert!(squatter.is_err());
    }
}
