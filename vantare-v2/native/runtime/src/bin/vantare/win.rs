//! Win32 del launcher: Job Object, instancia única, señal de parada y cierre
//! cortés de un hijo. Único fichero del launcher con `unsafe`.

use std::ffi::c_void;
use std::io;
use std::mem::{size_of, zeroed};
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::ptr::null;
use std::sync::atomic::{AtomicPtr, Ordering};
use std::time::Duration;

use windows_sys::Win32::Foundation::{
    ERROR_ACCESS_DENIED, ERROR_ALREADY_EXISTS, HANDLE, WAIT_OBJECT_0, WAIT_TIMEOUT,
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
use windows_sys::Win32::UI::WindowsAndMessaging::{IDYES, MB_ICONERROR, MB_YESNO, MessageBoxW};

const INFINITE: u32 = u32::MAX;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain([0]).collect()
}

pub fn offer_repair() -> io::Result<()> {
    let title = wide("Vantare · Reparar");
    let message = wide(
        "Vantare no ha podido abrir esta versión. Tus datos anteriores siguen en disco. ¿Abrir la página de descargas para ejecutar Reparar con el Setup nuevo?",
    );
    // SAFETY: punteros a cadenas UTF-16 terminadas en NUL, válidos durante la llamada.
    let choice = unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            message.as_ptr(),
            title.as_ptr(),
            MB_ICONERROR | MB_YESNO,
        )
    };
    if choice == 0 {
        return Err(io::Error::last_os_error());
    }
    if choice == IDYES {
        std::process::Command::new("explorer.exe")
            .arg("https://github.com/isaacalbala12/Vantare-Downloads/releases")
            .spawn()?;
    }
    Ok(())
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

pub struct OpenHub(OwnedHandle);
fn named_event(name: &str, manual: bool) -> io::Result<OwnedHandle> {
    let name = wide(name);
    // SAFETY: NUL-terminated name; the caller owns the returned event.
    owned(unsafe { CreateEventW(null(), i32::from(manual), 0, name.as_ptr()) })
}

impl OpenHub {
    pub fn create(name: &str) -> io::Result<Self> {
        Ok(Self(named_event(name, false)?))
    }
    pub fn signaled(&self) -> io::Result<bool> {
        Ok(wait_any(&[self.0.as_raw_handle()], Some(Duration::ZERO))?.is_some())
    }
}

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
        let event = named_event(name, true)?;
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

/// Primitiva de espera: ni política por hijo ni reloj de cierre propio.
pub(super) fn wait(
    stop: &Stop,
    _instance: &Instance,
    children: &[super::Service],
    timeout: Duration,
    listen_stop: bool,
) -> io::Result<bool> {
    let mut handles = Vec::new();
    if listen_stop {
        handles.push(stop.raw());
    }
    handles.extend(
        children
            .iter()
            .filter_map(|service| service.child.as_ref().map(AsRawHandle::as_raw_handle)),
    );
    if handles.is_empty() {
        std::thread::sleep(timeout);
        return Ok(false);
    }
    Ok(wait_any(&handles, Some(timeout))? == Some(0) && listen_stop)
}

#[cfg(test)]
pub(super) fn retain_process(pid: u32) -> io::Result<OwnedHandle> {
    use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_SYNCHRONIZE};
    // SAFETY: PID de un hijo observado por el test, acceso sólo de espera.
    owned(unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid) })
}

#[cfg(test)]
pub(super) fn process_finished(handle: &OwnedHandle) -> bool {
    matches!(
        wait_any(&[handle.as_raw_handle()], Some(Duration::ZERO)),
        Ok(Some(_))
    )
}

#[cfg(test)]
mod launcher_job_tests {
    use super::*;
    use std::io::{BufRead, Write};
    use std::process::{Command, Stdio};
    use std::sync::{Arc, Mutex, mpsc};
    use vantare_launcher::{
        Document, Profile, Step,
        chain::Chain,
        discovery::{Discovery, Sources},
        processes::Processes,
    };

    #[test]
    fn app_waits_for_its_test_owner() {
        if std::env::var_os("VANTARE_R12_JOB_ROOT").is_some() {
            // Watchdog only: the owner normally terminates this isolated app by its retained handle.
            std::thread::park_timeout(Duration::from_secs(60));
        }
    }

    #[test]
    fn chain_helper() {
        let Some(root) = std::env::var_os("VANTARE_R12_JOB_ROOT") else {
            return;
        };
        let root = std::path::PathBuf::from(root);
        let mut line = String::new();
        std::io::stdin()
            .read_line(&mut line)
            .expect("operación aislada del arnés Job");
        assert_eq!(line.trim(), "start"); // Parent has assigned this process to its Job.
        let executable = root.join("app.exe");
        std::fs::copy(
            std::env::current_exe().expect("operación aislada del arnés Job"),
            &executable,
        )
        .expect("operación aislada del arnés Job");
        let mut document = Document::default();
        let app_id = document
            .add_app("QA".into(), executable)
            .expect("operación aislada del arnés Job");
        document
            .apps
            .last_mut()
            .expect("operación aislada del arnés Job")
            .args = vec![
            "--exact".into(),
            "win::launcher_job_tests::app_waits_for_its_test_owner".into(),
            "--nocapture".into(),
        ];
        let mut profile = Profile::new("qa".into(), "QA".into());
        profile.steps.push(Step {
            app_id,
            delay_seconds: 0,
            args_override: None,
        });
        let found = Discovery::scan(&document.apps, Sources::default());
        let processes = Arc::new(Mutex::new(Processes::default()));
        let chain = if std::env::var_os("VANTARE_R12_DETACHED").is_some() {
            Chain::start_detached(document, profile, found, processes.clone())
        } else {
            Chain::start_selected(document, profile, found, processes.clone(), vec![0])
        }
        .expect("operación aislada del arnés Job");
        let mut pid = None;
        loop {
            let event = chain
                .progress
                .recv_timeout(Duration::from_secs(15))
                .expect("operación aislada del arnés Job");
            pid = event.pid.or(pid);
            if event.status == vantare_launcher::chain::Status::Done {
                assert!(event.success, "{}", event.message);
                break;
            }
        }
        println!("APP_PID={}", pid.expect("operación aislada del arnés Job"));
        std::io::stdout()
            .flush()
            .expect("operación aislada del arnés Job");
        line.clear();
        let _read = std::io::stdin().read_line(&mut line);
        processes
            .lock()
            .expect("operación aislada del arnés Job")
            .close_profile("qa")
            .expect("operación aislada del arnés Job");
    }

    #[test]
    fn selected_chain_dies_with_job_but_detached_chain_survives() {
        for detached in [false, true] {
            assert_eq!(survives_job_close(detached), detached);
        }
    }

    #[test]
    #[ignore = "P1: Hub start_selected inherits KILL_ON_JOB_CLOSE"]
    fn hub_selected_chain_survives_job_close() {
        assert!(survives_job_close(false));
    }

    fn survives_job_close(detached: bool) -> bool {
        use windows_sys::Win32::System::Threading::{
            OpenProcess, PROCESS_SYNCHRONIZE, PROCESS_TERMINATE, TerminateProcess,
        };
        struct App(OwnedHandle);
        impl Drop for App {
            fn drop(&mut self) {
                // SAFETY: retained handle belongs exclusively to the app created by this test.
                unsafe {
                    TerminateProcess(self.0.as_raw_handle(), 1);
                }
                wait_any(&[self.0.as_raw_handle()], Some(Duration::from_secs(10)))
                    .expect("operación aislada del arnés Job");
            }
        }
        let root = std::env::temp_dir().join(format!(
            "r12-job-{}",
            vantare_services::random_id().expect("operación aislada del arnés Job")
        ));
        std::fs::create_dir(&root).expect("operación aislada del arnés Job");
        // SAFETY: unnamed Job, zeroed SDK structure with its exact size; no real session is touched.
        let job = owned(unsafe { CreateJobObjectW(null(), null()) })
            .expect("operación aislada del arnés Job");
        // SAFETY: this SDK structure permits zero initialization.
        let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { zeroed() };
        limits.BasicLimitInformation.LimitFlags =
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_BREAKAWAY_OK;
        // SAFETY: live Job and SDK buffer, valid for this call.
        assert_ne!(
            unsafe {
                SetInformationJobObject(
                    job.as_raw_handle(),
                    JobObjectExtendedLimitInformation,
                    (&raw const limits).cast(),
                    u32::try_from(size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>())
                        .expect("operación aislada del arnés Job"),
                )
            },
            0
        );
        let mut command =
            Command::new(std::env::current_exe().expect("operación aislada del arnés Job"));
        command
            .args([
                "--exact",
                "win::launcher_job_tests::chain_helper",
                "--nocapture",
            ])
            .env("VANTARE_R12_JOB_ROOT", &root)
            .env_remove("VANTARE_R12_DETACHED")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        if detached {
            command.env("VANTARE_R12_DETACHED", "1");
        }
        let mut helper = command.spawn().expect("operación aislada del arnés Job");
        // SAFETY: both handles are live and owned by this test; helper waits for the start handshake.
        assert_ne!(
            unsafe { AssignProcessToJobObject(job.as_raw_handle(), helper.as_raw_handle()) },
            0
        );
        helper
            .stdin
            .as_mut()
            .expect("operación aislada del arnés Job")
            .write_all(b"start\n")
            .expect("operación aislada del arnés Job");
        let stdout = helper
            .stdout
            .take()
            .expect("operación aislada del arnés Job");
        let (send, receive) = mpsc::channel();
        let reader = std::thread::spawn(move || {
            for line in std::io::BufReader::new(stdout).lines() {
                let line = line.expect("operación aislada del arnés Job");
                if let Some((_, pid)) = line.split_once("APP_PID=") {
                    send.send(pid.parse::<u32>().expect("operación aislada del arnés Job"))
                        .expect("operación aislada del arnés Job");
                    return;
                }
            }
        });
        let pid = receive
            .recv_timeout(Duration::from_secs(30))
            .expect("operación aislada del arnés Job");
        reader.join().expect("operación aislada del arnés Job");
        // SAFETY: PID was published by our isolated helper; retain identity before closing the Job.
        let app =
            App(
                owned(unsafe { OpenProcess(PROCESS_SYNCHRONIZE | PROCESS_TERMINATE, 0, pid) })
                    .expect("operación aislada del arnés Job"),
            );
        assert!(!process_finished(&app.0));
        drop(job);
        helper.wait().expect("operación aislada del arnés Job");
        // Timed wait observes OS termination after Job closure; no scheduling sleep or PID re-open.
        let survived = wait_any(&[app.0.as_raw_handle()], Some(Duration::from_secs(1)))
            .expect("operación aislada del arnés Job")
            .is_none();
        drop(app);
        std::fs::remove_dir_all(root).expect("operación aislada del arnés Job");
        survived
    }
}
