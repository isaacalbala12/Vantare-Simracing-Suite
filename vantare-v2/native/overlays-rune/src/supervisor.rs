//! El supervisor conserva el extremo escritor de stdin. EOF cierra todo el host.
//! Solo se leen bytes ya disponibles; el cierre local cancela la espera antes del join.
use crate::host::{CloseReason, OBSERVE_INTERVAL, Shared};
use std::{
    fs::File,
    io::{self, Read},
    sync::Arc,
    thread::JoinHandle,
};

pub struct Supervisor {
    shared: Arc<Shared>,
    worker: Option<JoinHandle<()>>,
}
impl Supervisor {
    pub fn stdin(shared: Arc<Shared>) -> io::Result<Self> {
        #[cfg(windows)]
        let file = {
            use std::os::windows::io::AsHandle;
            File::from(io::stdin().as_handle().try_clone_to_owned()?)
        };
        #[cfg(unix)]
        let file = {
            use std::os::fd::AsFd;
            File::from(io::stdin().as_fd().try_clone_to_owned()?)
        };
        Self::start(file, shared)
    }

    pub(crate) fn start(mut input: File, shared: Arc<Shared>) -> io::Result<Self> {
        let bus = shared.clone();
        let worker = std::thread::Builder::new()
            .name("rune-supervisor".into())
            .spawn(move || {
                let mut bytes = [0; 4096];
                while bus.close_reason().is_none() {
                    let result = match ready(&input) {
                        Ok(Ready::Pending) => {
                            if bus.wait_stop(OBSERVE_INTERVAL) {
                                break;
                            }
                            continue;
                        }
                        Ok(Ready::Eof) => Ok(0),
                        Ok(Ready::Read(count)) => input.read(&mut bytes[..count]),
                        Err(error) => Err(error),
                    };
                    match result {
                        Ok(0) => {
                            bus.close(CloseReason::SupervisorEof);
                            break;
                        }
                        Ok(_) => {} // Mismo protocolo que GPUI: el contenido no es una orden.
                        Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
                        Err(error) => {
                            eprintln!("overlays-rune: stdin del supervisor: {:?}", error.kind());
                            bus.close(CloseReason::SupervisorError);
                            break;
                        }
                    }
                }
            })?;
        Ok(Self {
            shared,
            worker: Some(worker),
        })
    }
}
impl Drop for Supervisor {
    fn drop(&mut self) {
        self.shared.close(CloseReason::Window);
        if let Some(worker) = self.worker.take()
            && worker.join().is_err()
        {
            eprintln!("overlays-rune: lector del supervisor terminó con panic");
        }
    }
}

enum Ready {
    Pending,
    Read(usize),
    Eof,
}

#[cfg(windows)]
fn ready(input: &File) -> io::Result<Ready> {
    use std::{ffi::c_void, os::windows::io::AsRawHandle, ptr};
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn PeekNamedPipe(
            pipe: *mut c_void,
            buffer: *mut c_void,
            size: u32,
            read: *mut u32,
            available: *mut u32,
            left: *mut u32,
        ) -> i32;
    }
    let mut available = 0;
    // SAFETY: File posee el pipe de stdin duplicado; los únicos bytes escritos
    // aquí son el contador local. Este es su único lector: leer hasta available
    // nunca espera más datos. El supervisor solo conserva el extremo escritor.
    let result = unsafe {
        PeekNamedPipe(
            input.as_raw_handle(),
            ptr::null_mut(),
            0,
            ptr::null_mut(),
            &mut available,
            ptr::null_mut(),
        )
    };
    if result == 0 {
        let error = io::Error::last_os_error();
        return if error.raw_os_error() == Some(109) {
            Ok(Ready::Eof)
        } else {
            Err(error)
        };
    }
    Ok(if available == 0 {
        Ready::Pending
    } else {
        Ready::Read((available as usize).min(4096))
    })
}

#[cfg(unix)]
fn ready(input: &File) -> io::Result<Ready> {
    use std::os::{fd::AsRawFd, raw::c_int};
    #[repr(C)]
    struct PollFd {
        fd: c_int,
        events: i16,
        revents: i16,
    }
    #[cfg(target_os = "macos")]
    type Count = u32;
    #[cfg(not(target_os = "macos"))]
    type Count = usize;
    unsafe extern "C" {
        fn poll(fds: *mut PollFd, count: Count, timeout: c_int) -> c_int;
    }
    let mut descriptor = PollFd {
        fd: input.as_raw_fd(),
        events: 1,
        revents: 0,
    };
    // SAFETY: un descriptor poseído por File y un único pollfd inicializado;
    // timeout cero. Solo este hilo lee el extremo, por lo que read no bloquea.
    let result = unsafe { poll(&mut descriptor, 1, 0) };
    if result < 0 {
        return Err(io::Error::last_os_error());
    }
    if descriptor.revents & 0x20 != 0 {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    if descriptor.revents & 0x10 != 0 && descriptor.revents & 1 == 0 {
        return Ok(Ready::Eof);
    }
    Ok(if result == 0 {
        Ready::Pending
    } else {
        Ready::Read(4096)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{io::Write, sync::mpsc, time::Duration};

    #[cfg(windows)]
    fn pipe() -> (File, File) {
        use std::{
            ffi::c_void,
            os::windows::io::{FromRawHandle, OwnedHandle},
            ptr,
        };
        #[link(name = "kernel32")]
        unsafe extern "system" {
            fn CreatePipe(
                read: *mut *mut c_void,
                write: *mut *mut c_void,
                attributes: *const c_void,
                size: u32,
            ) -> i32;
        }
        let (mut read, mut write) = (ptr::null_mut(), ptr::null_mut());
        // SAFETY: dos slots válidos; handles nuevos y distintos, poseídos una vez.
        assert_ne!(
            unsafe { CreatePipe(&mut read, &mut write, ptr::null(), 0) },
            0
        );
        unsafe {
            (
                File::from(OwnedHandle::from_raw_handle(read)),
                File::from(OwnedHandle::from_raw_handle(write)),
            )
        }
    }
    #[cfg(unix)]
    fn pipe() -> (File, File) {
        use std::{os::fd::OwnedFd, os::unix::net::UnixStream};
        let (read, write) = UnixStream::pair().expect("pipe local de test");
        (
            File::from(OwnedFd::from(read)),
            File::from(OwnedFd::from(write)),
        )
    }

    #[test]
    fn supervisor_eof_is_not_a_command_and_wakes_the_host() {
        let (input, mut writer) = pipe();
        let shared = Shared::new(false);
        let (send, receive) = mpsc::channel();
        shared.install_waker(Arc::new(move || {
            let _ = send.send(());
        }));
        receive.recv().expect("setup");
        let reader = Supervisor::start(input, shared.clone()).expect("lector CPU");
        writer
            .write_all(b"quit\n")
            .expect("contenido no interpretado");
        assert_eq!(shared.close_reason(), None);
        drop(writer);
        // Cota de sincronización de E/S, sin sleeps ni cuenta real.
        receive
            .recv_timeout(Duration::from_secs(5))
            .expect("EOF observado");
        assert_eq!(shared.close_reason(), Some(CloseReason::SupervisorEof));
        drop(reader);
    }

    #[test]
    fn local_shutdown_cancels_reader_and_joins_while_parent_keeps_pipe_open() {
        let (input, writer) = pipe();
        let shared = Shared::new(false);
        let reader = Supervisor::start(input, shared.clone()).expect("lector");
        let (send, receive) = mpsc::channel();
        let join = std::thread::spawn(move || {
            drop(reader);
            send.send(()).expect("fin");
        });
        let stopped = receive.recv_timeout(Duration::from_secs(5));
        drop(writer); // También desbloquea el test si una regresión dejó un read pendiente.
        join.join().expect("join del test");
        assert!(stopped.is_ok(), "debe cerrar con el padre aún vivo");
        assert_eq!(shared.close_reason(), Some(CloseReason::Window));
    }

    #[cfg(windows)]
    #[test]
    fn non_pipe_input_fails_closed_instead_of_leaving_a_hidden_process() {
        let input =
            File::open(std::env::current_exe().expect("test exe")).expect("archivo, no pipe");
        let shared = Shared::new(false);
        let (send, receive) = mpsc::channel();
        shared.install_waker(Arc::new(move || {
            let _ = send.send(());
        }));
        receive.recv().expect("setup");
        let reader = Supervisor::start(input, shared.clone()).expect("lector");
        receive
            .recv_timeout(Duration::from_secs(5))
            .expect("error observado");
        assert_eq!(shared.close_reason(), Some(CloseReason::SupervisorError));
        drop(reader);
    }
}
