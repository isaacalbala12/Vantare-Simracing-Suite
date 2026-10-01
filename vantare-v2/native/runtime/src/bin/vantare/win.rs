//! Win32 del launcher: Job Object, instancia única, señal de parada y cierre
//! cortés de un hijo. Único fichero del launcher con `unsafe`.

use std::ffi::c_void;
use std::io;
use std::mem::{size_of, zeroed};
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::process::Child;
use std::ptr::null;
use std::sync::atomic::{AtomicPtr, Ordering};
use std::time::Duration;

use windows_sys::Win32::Foundation::{
    ERROR_ACCESS_DENIED, ERROR_ALREADY_EXISTS, HANDLE, HWND, LPARAM, WAIT_OBJECT_0, WAIT_TIMEOUT,
};
use windows_sys::Win32::System::Console::SetConsoleCtrlHandler;
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_BREAKAWAY_OK,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JobObjectExtendedLimitInformation, SetInformationJobObject,
};
use windows_sys::Win32::System::Threading::{
    CreateEventW, CreateMutexW, EVENT_MODIFY_STATE, GetCurrentProcess, OpenEventW, SetEvent,
    WaitForMultipleObjects,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowThreadProcessId, PostMessageW, WM_CLOSE,
};

const INFINITE: u32 = u32::MAX;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain([0]).collect()
}

fn millis(d: Duration) -> u32 {
    u32::try_from(d.as_millis()).map_or(INFINITE - 1, |ms| ms.min(INFINITE - 1))
}

fn owned(handle: HANDLE) -> io::Result<OwnedHandle> {
    if handle.is_null() {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: HANDLE recién creado por el sistema y con un único dueño.
    Ok(unsafe { OwnedHandle::from_raw_handle(handle) })
}

/// Mete al propio launcher en un Job Object que mata a todos sus miembros al
/// cerrarse. Los hijos lo heredan al nacer (sin ventana de carrera entre
/// arrancarlos y asignarlos), y si el launcher muere por cualquier causa el
/// sistema cierra el job y se lleva a los hijos con él. El handle se deja vivo
/// hasta el final del proceso a propósito: cerrarlo antes mataría también al
/// launcher, con un código de salida que no es el suyo.
pub fn adopt_self_in_job() -> io::Result<()> {
    // SAFETY: sin atributos ni nombre.
    let job = owned(unsafe { CreateJobObjectW(null(), null()) })?;
    // SAFETY: struct C plano; todo ceros es válido.
    let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { zeroed() };
    limits.BasicLimitInformation.LimitFlags =
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_BREAKAWAY_OK;
    // SAFETY: `limits` es del tipo que pide la clase de información y tiene ese tamaño.
    let ok = unsafe {
        SetInformationJobObject(
            job.as_raw_handle(),
            JobObjectExtendedLimitInformation,
            (&raw const limits).cast(),
            u32::try_from(size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>()).unwrap_or(0),
        )
    };
    if ok == 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: seudo-handle del proceso actual y job válido.
    if unsafe { AssignProcessToJobObject(job.as_raw_handle(), GetCurrentProcess()) } == 0 {
        return Err(io::Error::last_os_error());
    }
    std::mem::forget(job);
    Ok(())
}

/// Mutex con nombre: mientras exista un dueño, `acquire` devuelve `None`.
pub struct Instance(#[allow(dead_code)] OwnedHandle);

impl Instance {
    pub fn acquire(name: &str) -> io::Result<Option<Self>> {
        let name = wide(name);
        // SAFETY: `name` termina en NUL; sin atributos de seguridad.
        let handle = unsafe { CreateMutexW(null(), 0, name.as_ptr()) };
        let already = io::Error::last_os_error().raw_os_error();
        let handle = match owned(handle) {
            Ok(handle) => handle,
            // Existe y no podemos abrirlo: es de otro contexto, luego hay instancia.
            Err(_) if already == i32::try_from(ERROR_ACCESS_DENIED).ok() => return Ok(None),
            Err(e) => return Err(e),
        };
        Ok((already != i32::try_from(ERROR_ALREADY_EXISTS).ok()).then_some(Self(handle)))
    }
}

/// Evento con nombre que pide la parada del launcher: lo activan Ctrl+C, el
/// cierre de la consola y `vantare --parar`.
pub struct Stop(OwnedHandle);

/// El manejador de consola corre en un hilo del sistema y solo ve esto.
static CONSOLE_STOP: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());

unsafe extern "system" fn on_console_event(_kind: u32) -> i32 {
    let event = CONSOLE_STOP.load(Ordering::Acquire);
    if !event.is_null() {
        // SAFETY: el evento vive hasta el final del proceso (ver `create`).
        unsafe { SetEvent(event) };
    }
    1 // atendido: el cierre ordenado lo hace el bucle principal
}

impl Stop {
    /// Crea el evento y hace que Ctrl+C, Ctrl+Break y el cierre de la consola lo activen.
    pub fn create(name: &str) -> io::Result<Self> {
        let name = wide(name);
        // SAFETY: `name` termina en NUL; evento manual, no señalado.
        let event = owned(unsafe { CreateEventW(null(), 1, 0, name.as_ptr()) })?;
        // El evento no se libera antes de acabar el proceso: `Stop` vive en `main`
        // y el manejador solo se ejecuta mientras el proceso vive.
        CONSOLE_STOP.store(event.as_raw_handle(), Ordering::Release);
        // SAFETY: `on_console_event` tiene la firma de `PHANDLER_ROUTINE`.
        if unsafe { SetConsoleCtrlHandler(Some(on_console_event), 1) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(Self(event))
    }

    /// Pide la parada a un launcher en marcha (`vantare --parar`).
    pub fn signal(name: &str) -> io::Result<()> {
        let name = wide(name);
        // SAFETY: `name` termina en NUL.
        let event = owned(unsafe { OpenEventW(EVENT_MODIFY_STATE, 0, name.as_ptr()) })?;
        // SAFETY: handle válido con permiso de modificación.
        if unsafe { SetEvent(event.as_raw_handle()) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }

    pub fn raw(&self) -> HANDLE {
        self.0.as_raw_handle()
    }
}

/// Espera hasta `timeout` (sin plazo si `None`) a que se señale alguno de los
/// handles; devuelve su índice.
pub fn wait_any(handles: &[HANDLE], timeout: Option<Duration>) -> io::Result<Option<usize>> {
    let count = u32::try_from(handles.len()).unwrap_or(u32::MAX);
    // SAFETY: `handles` son handles válidos que el llamador mantiene vivos.
    let waited = unsafe {
        WaitForMultipleObjects(count, handles.as_ptr(), 0, timeout.map_or(INFINITE, millis))
    };
    let index = waited.wrapping_sub(WAIT_OBJECT_0) as usize;
    if index < handles.len() {
        Ok(Some(index))
    } else if waited == WAIT_TIMEOUT {
        Ok(None)
    } else {
        Err(io::Error::last_os_error())
    }
}

/// Espera a que el hijo termine, hasta `timeout`.
pub fn wait_child(child: &Child, timeout: Duration) -> bool {
    matches!(
        wait_any(&[child.as_raw_handle()], Some(timeout)),
        Ok(Some(_))
    )
}

/// Pide al hijo que termine por las buenas: `WM_CLOSE` a sus ventanas (overlays
/// se cierra al cerrarse la última) y fin de su stdin (contrato de los procesos
/// sin ventana: leer stdin hasta EOF y salir). Un hijo que no atienda ninguna
/// de las dos acabará muerto por el plazo.
pub fn request_close(child: &mut Child) {
    drop(child.stdin.take());
    let pid = isize::try_from(child.id()).unwrap_or(-1);
    // SAFETY: la callback tiene la firma de `WNDENUMPROC`; el PID viaja por valor en `lparam`.
    unsafe { EnumWindows(Some(close_if_owned), pid) };
}

unsafe extern "system" fn close_if_owned(window: HWND, pid: LPARAM) -> i32 {
    let mut owner = 0;
    // SAFETY: `window` lo entrega `EnumWindows`; `owner` es un puntero válido.
    unsafe { GetWindowThreadProcessId(window, &raw mut owner) };
    if u32::try_from(pid) == Ok(owner) {
        // SAFETY: `window` es un HWND válido; el mensaje no lleva punteros.
        unsafe { PostMessageW(window, WM_CLOSE, 0, 0) };
    }
    1 // seguir enumerando
}
