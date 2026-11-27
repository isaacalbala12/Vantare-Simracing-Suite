//! UI de pega de la matriz instalada (#2849, P7-3). EXE de pruebas **sin ventana** que
//! `packaging/matrix/electron-boot-tests.ps1` instala como `hub-ui/vantare-hub-ui.exe`
//! y que habla el pipe real del anfitrión: autenticación, `hello`, `ready` y cierre.
//! Nunca se distribuye (es un ejemplo; `build-candidate.ps1` construye `--bins`).
//!
//! Solo actúa en una generación instalada cuya raíz tiene `qa-ui-peer-owned` y un
//! `qa-ui-peer-mode` conocido; si no, sale con 5 sin abrir el pipe. El anfitrión le
//! borra el entorno, así que el guard va por archivos. Escribe una traza por arranque
//! en `<raíz>/qa-ui-peer/<versión>-<pid>.log`, nunca dentro de `generations/`.
#![cfg_attr(windows, windows_subsystem = "windows")]

#[cfg(windows)]
fn main() -> std::process::ExitCode {
    std::process::ExitCode::from(peer::run())
}
#[cfg(not(windows))]
fn main() {}

#[cfg(windows)]
mod peer {
    use std::{
        fs,
        io::{self, Write as _},
        path::{Path, PathBuf},
        sync::Arc,
        time::{Duration, Instant},
    };
    use vantare_hub_host::{
        frame,
        protocol::{HostToUi, UiToHost, VERSION},
        ready::canonical_executable,
    };
    use vantare_ipc::transport::{Event, connect};

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    enum Mode {
        Bien,
        SinReady,
        CaeAntes,
        CaeTrasConfirm,
        Version,
        Token,
        Reinicio,
    }
    impl Mode {
        fn parse(text: &str) -> Option<Self> {
            Some(match text.trim() {
                "bien" => Self::Bien,
                "sin-ready" => Self::SinReady,
                "cae-antes" => Self::CaeAntes,
                "cae-tras-confirm" => Self::CaeTrasConfirm,
                "version" => Self::Version,
                "token" => Self::Token,
                "reinicio" => Self::Reinicio,
                _ => return None,
            })
        }
    }

    struct Trace(fs::File);
    impl Trace {
        fn line(&mut self, text: &str) {
            let _ = writeln!(self.0, "{text}");
            let _ = self.0.flush();
        }
    }

    /// `<raíz>/generations/<32 hex>/hub-ui/vantare-hub-ui.exe`: la raíz y la generación.
    fn installed() -> Option<(PathBuf, PathBuf)> {
        let executable = canonical_executable(&std::env::current_exe().ok()?).ok()?;
        let named = |path: &Path, name: &str| {
            path.file_name()
                .is_some_and(|found| found.eq_ignore_ascii_case(name))
        };
        let hub_ui = executable.parent()?;
        let generation = hub_ui.parent()?;
        let generations = generation.parent()?;
        let id = generation.file_name()?.to_str()?;
        let hex = id.len() == 32 && id.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'));
        let layout = named(&executable, "vantare-hub-ui.exe")
            && named(hub_ui, "hub-ui")
            && named(generations, "generations")
            && hex;
        layout.then_some((
            generations.parent()?.to_path_buf(),
            generation.to_path_buf(),
        ))
    }

    pub fn run() -> u8 {
        let Some((root, generation)) = installed() else {
            return 5;
        };
        let Some(mode) = root
            .join("qa-ui-peer-owned")
            .is_file()
            .then(|| fs::read_to_string(root.join("qa-ui-peer-mode")).ok())
            .flatten()
            .and_then(|text| Mode::parse(&text))
        else {
            return 5;
        };
        let version = fs::read(generation.join("manifest.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
            .and_then(|manifest| manifest["version"].as_str().map(str::to_owned))
            .unwrap_or_else(|| "desconocida".into());
        let traces = root.join("qa-ui-peer");
        let pid = std::process::id();
        let Ok(file) = fs::create_dir_all(&traces).and_then(|()| {
            fs::OpenOptions::new()
                .create_new(true)
                .append(true)
                .open(traces.join(format!("{version}-{pid}.log")))
        }) else {
            return 5;
        };
        let mut trace = Trace(file);
        // Los fallos solo actúan en el arranque pendiente de confirmar: la vuelta de
        // después del rollback va bien. `reinicio` actúa siempre.
        let pending = root.join("boot-pending.json").is_file();
        let mode = match mode {
            Mode::Bien | Mode::Reinicio => mode,
            _ if pending => mode,
            _ => Mode::Bien,
        };
        trace.line(&format!(
            "started pid={pid} version={version} mode={mode:?} pending={pending}"
        ));
        let code = talk(&root, mode, &mut trace).unwrap_or_else(|error| {
            trace.line(&format!("error {:?}", error.kind()));
            4
        });
        trace.line(&format!("exit {code}"));
        code
    }

    fn talk(root: &Path, mode: Mode, trace: &mut Trace) -> io::Result<u8> {
        if mode == Mode::Reinicio {
            fs::write(root.join("restart-request"), b"1")?;
        }
        if mode == Mode::CaeAntes {
            return Ok(3);
        }
        let name = std::env::var("VANTARE_HUB_PIPE").map_err(|_| io::ErrorKind::NotFound)?;
        let mut token = std::env::var("VANTARE_HUB_TOKEN").map_err(|_| io::ErrorKind::NotFound)?;
        let stop = Arc::new(Event::new()?);
        let deadline = Instant::now() + Duration::from_mins(2);
        let connecting = Instant::now() + Duration::from_secs(5);
        let mut pipe = loop {
            match connect(&name, Arc::clone(&stop), Duration::from_millis(100)) {
                Ok(pipe) => break pipe,
                Err(_) if Instant::now() < connecting => {
                    std::thread::sleep(Duration::from_millis(20));
                }
                Err(error) => return Err(error),
            }
        };
        trace.line("connected");
        if mode == Mode::Token {
            let first = if token.starts_with('0') { "1" } else { "0" };
            token.replace_range(..1, first);
        }
        frame::write(
            &mut pipe,
            &serde_json::json!({"kind": "authenticate", "token": token}),
        )?;
        trace.line("auth-sent");
        let mut reader = frame::Reader::default();
        while Instant::now() < deadline {
            let message = match reader.next::<HostToUi>(&mut pipe) {
                Ok(Some(message)) => message,
                Ok(None) => continue,
                Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => {
                    trace.line("eof");
                    return Ok(0);
                }
                Err(error) => return Err(error),
            };
            match message {
                HostToUi::Hello {
                    version, window, ..
                } => {
                    trace.line(&format!(
                        "host-hello v={version} minimized={} zoom={}",
                        window.minimized, window.zoom
                    ));
                    let sent = if mode == Mode::Version {
                        VERSION - 1
                    } else {
                        VERSION
                    };
                    frame::write(&mut pipe, &UiToHost::Hello { version: sent })?;
                    trace.line(&format!("hello-sent v={sent}"));
                    if mode == Mode::SinReady {
                        continue;
                    }
                    frame::write(&mut pipe, &UiToHost::Ready {})?;
                    trace.line("ready-sent");
                    if mode == Mode::CaeTrasConfirm {
                        // El Confirm de la raíz retira el marcador; entonces cae sin responder.
                        while root.join("boot-pending.json").is_file() {
                            if Instant::now() >= deadline {
                                return Ok(4);
                            }
                            std::thread::sleep(Duration::from_millis(10));
                        }
                        trace.line("confirmed-crash");
                        return Ok(3);
                    }
                }
                HostToUi::CloseRequested { reason } => {
                    frame::write(&mut pipe, &UiToHost::CloseAnswer { allow: true })?;
                    trace.line(&format!("close-answered {reason:?}"));
                }
                HostToUi::Failure { error, .. } => trace.line(&format!("host-failure {error:?}")),
                _ => {}
            }
        }
        Ok(4)
    }
}
