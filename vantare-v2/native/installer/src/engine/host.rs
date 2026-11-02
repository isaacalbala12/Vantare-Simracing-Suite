//! Setup transport. Mutations run in-process; only shell finalization uses PS until p5.
use super::{
    context::Context,
    operations, reject_links,
    write_fs::{self as disk, Result as WriteResult, WriteError},
};
use crate::{
    QA, VERSION,
    args::Args,
    model::{Info, Mode, Progress},
    payload,
};
use serde::{Deserialize, Serialize};
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

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(clippy::struct_excessive_bools)] // Independent serialized identity/launch/options flags.
pub struct Request {
    pub operation: String,
    pub root: Option<PathBuf>,
    pub qa: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub qa_identity: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub qa_shortcut_folder: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub qa_legacy_shortcut_folder: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub qa_prefix: Option<String>,
    pub silent: bool,
    pub uninstall: bool,
    pub version: String,
    pub package_sha: String,
    pub size: u64,
    pub mode: Mode,
    pub desktop: bool,
    pub autostart: bool,
    pub process_id: u32,
    #[serde(default)]
    pub log_file: PathBuf,
}

fn qa_value(value: &str) -> Option<String> {
    QA.then(|| value.to_owned())
}

impl Request {
    pub fn new(args: &Args, operation: &str) -> Self {
        Self {
            operation: operation.into(),
            root: args.root.clone(),
            qa: QA,
            qa_identity: qa_value(env!("VANTARE_INSTALLER_QA_IDENTITY")),
            qa_shortcut_folder: qa_value(env!("VANTARE_INSTALLER_QA_SHORTCUT_FOLDER")),
            qa_legacy_shortcut_folder: qa_value(env!(
                "VANTARE_INSTALLER_QA_LEGACY_SHORTCUT_FOLDER"
            )),
            qa_prefix: qa_value(env!("VANTARE_INSTALLER_QA_PREFIX")),
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
    context: Context,
    transferred: bool,
}
impl Session {
    pub fn new() -> Result<Self, String> {
        Self::with_context(Context::system().map_err(|error| error.to_string())?)
    }
    pub fn with_context(context: Context) -> Result<Self, String> {
        let parent = std::env::temp_dir();
        reject_links(&parent)?;
        if context.is_isolated() {
            super::context::qa_path(&parent).map_err(|error| error.to_string())?;
        }
        for counter in 0..10 {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|error| error.to_string())?
                .as_nanos();
            let directory = parent.join(format!(
                "VantareSetup-{}-{stamp}-{counter}",
                std::process::id()
            ));
            match fs::create_dir(&directory) {
                Ok(()) => {
                    let session = Self {
                        directory,
                        context,
                        transferred: false,
                    };
                    for (name, bytes) in [
                        ("candidate.ps1", payload::CANDIDATE),
                        ("beta.ps1", payload::BETA),
                        ("installer-shell.ps1", payload::SHELL_FINALIZER),
                        ("installer-notices.txt", payload::FONT_LICENSES.as_bytes()),
                    ] {
                        session.write(name, bytes)?;
                    }
                    if session.context.is_isolated() {
                        session.write("qa-guard.ps1", payload::QA_GUARD)?;
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
        disk::write_new(&self.directory.join(name), bytes).map_err(|error| error.to_string())
    }
    pub fn probe(&self, request: &Request) -> Result<Info, String> {
        self.context
            .probe(request)
            .map_err(|error| error.to_string())
    }
    fn command(&self) -> Result<Command, String> {
        let windows = std::env::var_os("WINDIR").ok_or("Windows no está disponible")?;
        let mut command = Command::new(
            Path::new(&windows).join("System32/WindowsPowerShell/v1.0/powershell.exe"),
        );
        command
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(self.directory.join("installer-shell.ps1"))
            .arg("-RequestFile")
            .arg(self.directory.join("shell.json"));
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }
        Ok(command)
    }
    fn shell_contract(
        &self,
        operation: &str,
        request: &Request,
        previous: Option<&super::context::Options>,
    ) -> WriteResult<()> {
        self.context.validate_root(
            request
                .root
                .as_deref()
                .ok_or_else(|| WriteError::new(1, "NATIVE_ROOT_REQUIRED"))?,
        )?;
        let mut resolved = request.clone();
        if operation == "FinalizeInstall" {
            super::Installation::read(
                resolved
                    .root
                    .as_deref()
                    .ok_or_else(|| WriteError::new(1, "Raíz ausente"))?,
                super::ReadProfile::Probe,
            )?
            .installed_version()
            .ok_or_else(|| WriteError::new(1, "Falta versión instalada"))?
            .clone_into(&mut resolved.version);
        }
        disk::write_json(
            &self.directory.join("shell.json"),
            &serde_json::json!({
                "operation":operation,"request":resolved,"context":self.context,"previousUi":previous
            }),
        )
    }
    /// TODO(#1840 p5): one PS call per finalization operation. It cannot mutate
    /// generations/state/data; nonzero returns to the Rust metadata rollback.
    fn finalize(
        &self,
        operation: &str,
        request: &Request,
        previous: Option<&super::context::Options>,
        progress: &mut dyn FnMut(Progress),
    ) -> WriteResult<()> {
        self.shell_contract(operation, request, previous)?;
        let log = fs::OpenOptions::new()
            .append(true)
            .open(&request.log_file)?;
        let mut child = self
            .command()
            .map_err(|error| WriteError::new(1, error))?
            .stdout(Stdio::piped())
            .stderr(Stdio::from(log))
            .spawn()?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| WriteError::new(1, "Falta salida de finalización"))?;
        let mut reader = BufReader::new(stdout);
        let mut bytes = Vec::new();
        let mut invalid = false;
        loop {
            bytes.clear();
            match reader.by_ref().take(8193).read_until(b'\n', &mut bytes) {
                Ok(0) => break,
                Ok(count) if count <= 8192 => {
                    if let Ok(event) = serde_json::from_slice::<Progress>(&bytes) {
                        if event.percent <= 100 && event.done <= event.total {
                            progress(event);
                        } else {
                            invalid = true;
                        }
                    } else {
                        invalid = true;
                    }
                }
                Ok(_) => invalid = true,
                Err(_) => {
                    invalid = true;
                    break;
                }
            }
        }
        let status = child.wait()?;
        disk::ensure(!invalid, "La finalización devolvió eventos inválidos")?;
        disk::ensure(
            status.success(),
            "No se pudo finalizar la integración Windows; consulta el registro",
        )
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
            .map_err(|error| error.to_string())?;
        let mut written = 0_u64;
        for block in payload::ARCHIVE.chunks(65536) {
            if cancel.load(Ordering::Acquire) {
                return Ok(5);
            }
            file.write_all(block).map_err(|error| error.to_string())?;
            written += block.len() as u64;
            progress(Progress {
                step: "extract".into(),
                percent: 6 + u8::try_from(written * 34 / request.size.max(1))
                    .map_err(|error| error.to_string())?,
                done: written,
                total: request.size,
                can_cancel: true,
            });
        }
        file.sync_all().map_err(|error| error.to_string())?;
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
        self.run_files(request, &self.directory, cancel, &mut progress, &mut |_| {
            Ok(())
        })
        .map_err(|error| error.to_string())
    }
    /// Same product operations with an explicit QA package and OS context.
    /// The matrix supplies inert PE files; this does not add a product bridge.
    pub fn run_files(
        &self,
        request: &Request,
        payload_directory: &Path,
        cancel: &AtomicBool,
        progress: &mut dyn FnMut(Progress),
        checkpoint: &mut dyn FnMut(&str) -> WriteResult<()>,
    ) -> WriteResult<u8> {
        if cancel.load(Ordering::Acquire) {
            return Ok(5);
        }
        disk::ensure(
            request
                .root
                .as_ref()
                .is_some_and(|root| !root.as_os_str().is_empty()),
            "NATIVE_ROOT_REQUIRED",
        )?;
        if self.context.is_isolated() {
            super::context::qa_path(payload_directory)?;
        } else {
            disk::ensure(
                payload_directory == self.directory,
                "Payload externo solo en contexto QA",
            )?;
        }
        let info = self.context.probe(request)?;
        let root = info.root;
        let mut resolved = request.clone();
        resolved.root = Some(root.clone());
        if resolved.log_file.as_os_str().is_empty() {
            resolved.log_file = log_path().map_err(|error| WriteError::new(1, error))?;
        }
        if self.context.is_isolated() {
            super::context::qa_path(&resolved.log_file)?;
        }
        let mut log = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&resolved.log_file)?;
        if request.mode == Mode::Repair
            && info.installed_version.as_deref() != Some(request.version.as_str())
        {
            return Ok(3);
        }
        let previous = super::context::options(&root, request.uninstall)?;
        if request.operation == "Install" && payload_directory != self.directory {
            fs::copy(
                payload_directory.join("Uninstall.exe"),
                self.directory.join("Uninstall.exe"),
            )?;
            fs::copy(
                payload_directory.join("installer-notices.txt"),
                self.directory.join("installer-notices.txt"),
            )?;
        }
        let archive = payload_directory.join("package.zip");
        let package = operations::Package {
            archive: &archive,
            sha256: &request.package_sha,
            version: &request.version,
            candidate: payload::CANDIDATE,
            beta: payload::BETA,
        };
        let mut warning = |message: &str| {
            let _ = writeln!(log, "{message}");
        };
        let mut control = operations::Control {
            cancel,
            progress,
            checkpoint,
            warning: &mut warning,
        };
        (control.progress)(Progress {
            step: "prepare".into(),
            percent: 0,
            done: 0,
            total: 0,
            can_cancel: request.operation == "Install",
        });
        let result = self.execute(&resolved, &package, previous.as_ref(), &mut control);
        match result {
            Ok(()) => {
                (control.progress)(Progress {
                    step: "done".into(),
                    percent: 100,
                    done: 0,
                    total: 0,
                    can_cancel: false,
                });
                Ok(0)
            }
            Err(error) => {
                (control.warning)(&error.to_string());
                Ok(error.code)
            }
        }
    }
    fn execute(
        &self,
        request: &Request,
        package: &operations::Package<'_>,
        previous: Option<&super::context::Options>,
        control: &mut operations::Control<'_>,
    ) -> WriteResult<()> {
        let root = request
            .root
            .as_deref()
            .ok_or_else(|| WriteError::new(1, "NATIVE_ROOT_REQUIRED"))?;
        match request.operation.as_str() {
            "Install" => {
                (control.progress)(Progress {
                    step: "verify".into(),
                    percent: 40,
                    done: 0,
                    total: 0,
                    can_cancel: true,
                });
                operations::install(
                    root,
                    package,
                    request.mode,
                    control,
                    |control| self.finalize("FinalizeInstall", request, previous, control.progress),
                    || self.prepare_orphan(root, request),
                )
            }
            "Update" => operations::update(root, package, false, control),
            "Uninstall" => {
                if !self.context.has_registration(request)?
                    && !root.join("installer-cleanup.json").try_exists()?
                {
                    return Err(WriteError::new(1, "La instalación no está registrada"));
                }
                (control.progress)(Progress {
                    step: "copy".into(),
                    percent: 12,
                    done: 0,
                    total: 0,
                    can_cancel: false,
                });
                operations::uninstall(root, control, |control| {
                    self.finalize("FinalizeUninstall", request, previous, control.progress)
                })
            }
            "Cleanup" => self.finalize("Cleanup", request, previous, control.progress),
            _ => Err(WriteError::new(1, "Operación del instalador no permitida")),
        }
    }
    fn prepare_orphan(&self, root: &Path, request: &Request) -> WriteResult<()> {
        let marker = root.join("installer-cleanup.json");
        if !marker.try_exists()? {
            return Ok(());
        }
        if root.join("Uninstall.exe").try_exists()?
            || root.join("state.json").try_exists()?
            || self.context.has_registration(request)?
        {
            return Err(WriteError::new(
                2,
                "Espera a que termine la limpieza del desinstalador anterior",
            ));
        }
        disk::open_root(root, false)?;
        let identity = root.join("registration-identity.txt");
        if identity.try_exists()? {
            disk::ensure(
                fs::read_to_string(identity)?.trim() == super::context::identity(request)?,
                "La identidad de desinstalación no coincide",
            )?;
        }
        let cleanup = disk::read_json(&marker, Some(1024))?;
        disk::ensure(
            cleanup["schema"] == 1
                && cleanup["sha256"]
                    .as_str()
                    .is_some_and(|hash| super::validation::hex(hash, 64)),
            "Marker de limpieza inválido",
        )?;
        disk::remove_file(&marker)
    }
    /// Existing deferred self-removal stays in the shell boundary until p5.
    pub fn schedule_cleanup(args: &Args) -> Result<(), String> {
        let mut session = Self::new()?;
        let mut request = Request::new(args, "Cleanup");
        request.root = Some(session.probe(&request)?.root);
        session
            .shell_contract("Cleanup", &request, None)
            .map_err(|error| error.to_string())?;
        let log = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(log_path()?)
            .map_err(|error| error.to_string())?;
        session
            .command()?
            .stdout(Stdio::null())
            .stderr(Stdio::from(log))
            .spawn()
            .map_err(|error| error.to_string())?;
        session.transferred = true;
        Ok(())
    }
}
impl Drop for Session {
    fn drop(&mut self) {
        if !self.transferred && reject_links(&self.directory).is_ok() {
            let _ = fs::remove_dir_all(&self.directory);
        }
    }
}
pub fn log_path() -> Result<PathBuf, String> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
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
