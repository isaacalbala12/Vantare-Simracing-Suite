//! Hidden x64 PowerShell host. Its scripts remain the installation authority.
use crate::{
    QA, VERSION,
    args::Args,
    model::{Info, Mode, Progress},
    payload,
};
use serde::Serialize;
use std::{
    fs,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(clippy::struct_excessive_bools)] // Independent serialized identity/launch/options flags.
pub struct Request {
    pub operation: String,
    pub root: Option<PathBuf>,
    pub qa: bool,
    pub silent: bool,
    pub uninstall: bool,
    pub version: String,
    pub package_sha: String,
    pub size: u64,
    pub mode: Mode,
    pub desktop: bool,
    pub autostart: bool,
    pub process_id: u32,
    pub log_file: PathBuf,
}

impl Request {
    pub fn new(args: &Args, operation: &str) -> Self {
        Self {
            operation: operation.into(),
            root: args.root.clone(),
            qa: QA,
            silent: args.silent,
            uninstall: args.uninstall,
            version: VERSION.into(),
            package_sha: payload::PACKAGE_SHA.into(),
            size: payload::ARCHIVE.len() as u64,
            mode: Mode::Auto,
            desktop: !args.silent,
            autostart: false,
            process_id: std::process::id(),
            log_file: log_path().unwrap_or_else(|_| {
                std::env::temp_dir().join(format!("VantareSetup-{}.log", std::process::id()))
            }),
        }
    }
}

pub struct Session {
    directory: PathBuf,
    transferred: bool,
}

impl Session {
    pub fn new() -> Result<Self, String> {
        let parent = std::env::temp_dir();
        reject_links(&parent)?;
        for counter in 0..10 {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_nanos();
            let directory = parent.join(format!(
                "VantareSetup-{}-{stamp}-{counter}",
                std::process::id()
            ));
            match fs::create_dir(&directory) {
                Ok(()) => {
                    let session = Self {
                        directory,
                        transferred: false,
                    };
                    for (name, bytes) in [
                        ("candidate.ps1", payload::CANDIDATE),
                        ("beta.ps1", payload::BETA),
                        ("installer-driver.ps1", payload::DRIVER),
                        ("installer-notices.txt", payload::FONT_LICENSES.as_bytes()),
                    ] {
                        session.write(name, bytes)?;
                    }
                    return Ok(session);
                }
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error.to_string()),
            }
        }
        Err("No se pudo crear un temporal exclusivo".into())
    }

    fn write(&self, name: &str, bytes: &[u8]) -> Result<(), String> {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(self.directory.join(name))
            .map_err(|e| e.to_string())?;
        file.write_all(bytes)
            .and_then(|()| file.sync_all())
            .map_err(|e| e.to_string())
    }

    pub fn probe(&self, request: &Request) -> Result<Info, String> {
        let path = self.directory.join("probe.json");
        self.write(
            "probe.json",
            &serde_json::to_vec(request).map_err(|e| e.to_string())?,
        )?;
        let output = self.command(&path)?.output().map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
        }
        if output.stdout.len() > 65536 {
            return Err("Estado del instalador demasiado grande".into());
        }
        serde_json::from_slice(&output.stdout).map_err(|e| format!("Estado del instalador: {e}"))
    }

    fn command(&self, request: &Path) -> Result<Command, String> {
        let windows = std::env::var_os("WINDIR").ok_or("Windows no está disponible")?;
        let mut command = Command::new(
            Path::new(&windows).join("System32/WindowsPowerShell/v1.0/powershell.exe"),
        );
        command
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(self.directory.join("installer-driver.ps1"))
            .arg("-RequestFile")
            .arg(request);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }
        Ok(command)
    }

    /// The cleanup process owns its private temporary directory after spawning.
    pub fn schedule_cleanup(args: &Args) -> Result<(), String> {
        let mut session = Self::new()?;
        let request = Request::new(args, "Cleanup");
        session.write(
            "request.json",
            &serde_json::to_vec(&request).map_err(|e| e.to_string())?,
        )?;
        let log = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(log_path()?)
            .map_err(|e| e.to_string())?;
        session
            .command(&session.directory.join("request.json"))?
            .stdout(Stdio::null())
            .stderr(Stdio::from(log))
            .spawn()
            .map_err(|e| e.to_string())?;
        session.transferred = true;
        Ok(())
    }

    fn extract(
        &self,
        request: &Request,
        cancel: &AtomicBool,
        progress: &mut impl FnMut(Progress),
    ) -> Result<u8, String> {
        if payload::ARCHIVE.is_empty() || payload::UNINSTALLER.is_empty() {
            return Err("Esta build no contiene el paquete de instalación".into());
        }
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(self.directory.join("package.zip"))
            .map_err(|e| e.to_string())?;
        let mut written = 0_u64;
        for block in payload::ARCHIVE.chunks(65536) {
            if cancel.load(Ordering::Acquire) {
                return Ok(5);
            }
            file.write_all(block).map_err(|e| e.to_string())?;
            written += block.len() as u64;
            progress(Progress {
                step: "extract".into(),
                percent: 6 + u8::try_from(written * 34 / request.size.max(1))
                    .map_err(|e| e.to_string())?,
                done: written,
                total: request.size,
                can_cancel: true,
            });
        }
        file.sync_all().map_err(|e| e.to_string())?;
        self.write("Uninstall.exe", payload::UNINSTALLER)?;
        Ok(0)
    }

    pub fn run(
        &self,
        request: &Request,
        cancel: &AtomicBool,
        mut progress: impl FnMut(Progress),
    ) -> Result<u8, String> {
        if request.operation == "Install" && self.extract(request, cancel, &mut progress)? == 5 {
            return Ok(5);
        }
        if cancel.load(Ordering::Acquire) {
            return Ok(5);
        }
        self.write(
            "request.json",
            &serde_json::to_vec(request).map_err(|e| e.to_string())?,
        )?;
        let log = request.log_file.clone();
        let stderr = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&log)
            .map_err(|e| e.to_string())?;
        let mut child = self
            .command(&self.directory.join("request.json"))?
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::from(stderr))
            .spawn()
            .map_err(|e| e.to_string())?;
        let stdout = child.stdout.take().ok_or("Falta salida del host")?;
        let mut input = child.stdin.take().ok_or("Falta entrada del host")?;
        let mut reader = BufReader::new(stdout);
        let mut bytes = Vec::new();
        let mut protocol_error = false;
        loop {
            bytes.clear();
            let read = reader.by_ref().take(8193).read_until(b'\n', &mut bytes);
            let Ok(count) = read else {
                protocol_error = true;
                break;
            };
            if count == 0 {
                break;
            }
            if count > 8192 {
                protocol_error = true;
                continue;
            }
            if let Ok(event) = serde_json::from_slice::<Progress>(&bytes) {
                if event.percent <= 100 && event.done <= event.total {
                    if event.step == "copy" && event.can_cancel {
                        let decision = if cancel.load(Ordering::Acquire) {
                            b"cancel\n".as_slice()
                        } else {
                            b"continue\n".as_slice()
                        };
                        if input
                            .write_all(decision)
                            .and_then(|()| input.flush())
                            .is_err()
                        {
                            protocol_error = true;
                        }
                    }
                    progress(event);
                } else {
                    protocol_error = true;
                }
            } else {
                protocol_error = true;
            }
        }
        drop(input);
        let status = child.wait().map_err(|e| e.to_string())?;
        let code = status
            .code()
            .and_then(|c| u8::try_from(c).ok())
            .unwrap_or(1);
        if protocol_error {
            return Err(format!(
                "El host devolvió eventos inválidos. Registro: {}",
                log.display()
            ));
        }
        Ok(code)
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        if !self.transferred && reject_links(&self.directory).is_ok() {
            let _ = fs::remove_dir_all(&self.directory);
        }
    }
}

pub fn reject_links(path: &Path) -> Result<(), String> {
    for ancestor in path.ancestors() {
        if let Ok(metadata) = fs::symlink_metadata(ancestor) {
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if metadata.file_attributes() & 0x400 != 0 {
                    return Err("No se permiten enlaces ni puntos de reanálisis".into());
                }
            }
            if metadata.file_type().is_symlink() {
                return Err("No se permiten enlaces".into());
            }
        }
    }
    Ok(())
}

pub fn log_path() -> Result<PathBuf, String> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    Ok(std::env::temp_dir().join(format!("VantareSetup-{}-{stamp}.log", std::process::id())))
}

pub fn headless(args: &Args) -> Result<u8, String> {
    if !args.silent {
        return Err("La interfaz interactiva todavía no está conectada".into());
    }
    let session = Session::new()?;
    let info = session.probe(&Request::new(args, "Probe"))?;
    let mut request = Request::new(
        args,
        if args.uninstall {
            "Uninstall"
        } else {
            "Install"
        },
    );
    request.root = Some(info.root);
    request.desktop = info.desktop;
    request.autostart = info.autostart;
    let code = session.run(&request, &Arc::new(AtomicBool::new(false)), |_| {})?;
    if code == 0 && args.uninstall {
        Session::schedule_cleanup(&Args {
            silent: true,
            uninstall: true,
            root: request.root.clone(),
            ..Args::default()
        })?;
    }
    Ok(code)
}
