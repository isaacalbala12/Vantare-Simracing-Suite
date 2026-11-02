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
    io::Write,
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
        if context.is_isolated() && !cfg!(feature = "test-installer") {
            return Err("El transporte aislado requiere una build test-installer".into());
        }
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
                        ("installer-cleanup.ps1", payload::CLEANUP),
                        ("installer-notices.txt", payload::FONT_LICENSES.as_bytes()),
                    ] {
                        session.write(name, bytes)?;
                    }
                    #[cfg(feature = "test-installer")]
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
            .arg(self.directory.join("installer-cleanup.ps1"))
            .arg("-RequestFile")
            .arg(self.directory.join("shell.json"));
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }
        Ok(command)
    }
    fn cleanup_contract(&self, request: &Request) -> WriteResult<()> {
        let root = request
            .root
            .as_deref()
            .ok_or_else(|| WriteError::new(1, "Falta raíz Cleanup"))?;
        self.context.validate_root(root)?;
        disk::ensure(
            !root.join("state.json").try_exists()? && !self.context.has_registration(request)?,
            "La instalación se ha renovado; se conserva el desinstalador",
        )?;
        let marker = disk::read_json(&root.join("installer-cleanup.json"), Some(1024))?;
        disk::ensure(
            marker["schema"] == 1
                && marker["sha256"]
                    .as_str()
                    .is_some_and(|hash| super::validation::hex(hash, 64)),
            "Marker de limpieza inválido",
        )?;
        let exe = root.join("Uninstall.exe");
        if exe.try_exists()? {
            disk::ensure(
                marker["sha256"] == super::installation::hash_file(&exe)?,
                "El desinstalador cambió; se conserva",
            )?;
        }
        disk::write_json(
            &self.directory.join("shell.json"),
            &serde_json::json!({"operation":"Cleanup","root":root,"parentId":request.process_id,"qa":self.context.is_isolated()}),
        )
    }
    /// Permanent, file-only exception. The exit code is the authority; all output is diagnostic.
    fn cleanup(&self, request: &Request) -> WriteResult<()> {
        self.cleanup_contract(request)?;
        let log = fs::OpenOptions::new()
            .append(true)
            .open(&request.log_file)?;
        let status = self
            .command()
            .map_err(|cause| WriteError::new(1, cause))?
            .stdout(Stdio::from(log.try_clone()?))
            .stderr(Stdio::from(log))
            .status()?;
        disk::ensure(
            status.success(),
            "No se pudo completar Cleanup; consulta el registro",
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
                    |control, restoring| self.sync(request, previous, restoring, control.warning),
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
                    self.sync(request, previous, false, control.warning)
                })
            }
            "Cleanup" => self.cleanup(request),
            _ => Err(WriteError::new(1, "Operación del instalador no permitida")),
        }
    }
    fn sync(
        &self,
        request: &Request,
        previous: Option<&super::context::Options>,
        restoring: bool,
        warning: &mut dyn FnMut(&str),
    ) -> WriteResult<()> {
        let root = request
            .root
            .as_deref()
            .ok_or_else(|| WriteError::new(1, "Falta raíz"))?;
        #[cfg(windows)]
        {
            // Uninstall already owns the operation lock through its callback.
            // Setup reacquires it after generation activation, as the old finalizer did.
            let _operation = if request.uninstall {
                None
            } else {
                Some(disk::lock(root, ".operation.lock")?)
            };
            let view = super::Installation::read(
                root,
                if request.uninstall {
                    super::ReadProfile::Uninstall
                } else {
                    super::ReadProfile::Probe
                },
            )?;
            super::shell::sync(
                root,
                &self.context,
                view.state.as_ref(),
                &super::shell::Options {
                    request,
                    previous,
                    payload: &self.directory,
                    restoring,
                },
                warning,
            )
        }
        #[cfg(not(windows))]
        {
            let _ = (root, previous, restoring, warning);
            Err(WriteError::new(1, "Shell requiere Windows"))
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
    /// Permanent, guarded PowerShell cleanup; no native self-delete workaround.
    pub fn schedule_cleanup(args: &Args) -> Result<(), String> {
        let mut session = Self::new()?;
        let mut request = Request::new(args, "Cleanup");
        request.root = Some(session.probe(&request)?.root);
        session
            .cleanup_contract(&request)
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

#[cfg(all(test, windows))]
mod tests {
    use super::{Request, Session};
    use crate::{
        args::Args,
        engine::{
            context::{Context, qa_path},
            write_fs as disk,
        },
    };
    use std::{fs, path::PathBuf};

    #[test]
    fn warning_stdout_does_not_override_the_owned_finalizer_exit_status() {
        for code in [0, 7] {
            let parent = if std::env::var("CI").as_deref() == Ok("true") {
                PathBuf::from(std::env::var_os("RUNNER_TEMP").expect("CI root"))
            } else {
                PathBuf::from("D:/VantareServer/qa/isa-1840")
            };
            let id = disk::id().expect("ID");
            let root = parent.join("p4-finalizer-tests").join(&id);
            qa_path(&root).expect("QA guard");
            let directory = root.join("transport");
            fs::create_dir_all(&directory).expect("owned transport");
            let context = Context::isolated(
                root.join("LocalAppData"),
                format!("Software\\VantareInstallerMatrix\\{id}"),
                root.join("shell"),
            )
            .expect("isolated context");
            // This script only emits diagnostics/progress; it never runs product
            // shell code or touches registry. The session owns/reaps its child.
            let session = Session {
                directory,
                context,
                transferred: false,
            };
            let script = r#"Write-Warning 'injected cosmetic warning'
[Console]::WriteLine('{"step":"register","percent":93,"done":0,"total":0,"can_cancel":false}')
[Console]::WriteLine('{"step":"bad","percent":255,"done":0,"total":0,"can_cancel":false}')
exit EXIT_CODE
"#
            .replace("EXIT_CODE", &code.to_string());
            fs::write(session.directory.join("installer-cleanup.ps1"), script)
                .expect("injected finalizer");
            let mut request = Request::new(
                &Args {
                    root: Some(root.join("install")),
                    ..Args::default()
                },
                "Cleanup",
            );
            request.log_file = root.join("diagnostics.log");
            fs::write(&request.log_file, []).expect("owned log");
            fs::create_dir_all(root.join("install")).expect("owned install root");
            fs::write(root.join("install/Uninstall.exe"), b"owned fixture").expect("owned EXE");
            let hash = crate::engine::installation::hash_file(&root.join("install/Uninstall.exe"))
                .expect("hash");
            disk::write_json(
                &root.join("install/installer-cleanup.json"),
                &serde_json::json!({"schema":1,"sha256":hash}),
            )
            .expect("marker");
            let result = session.cleanup(&request);
            assert_eq!(result.is_ok(), code == 0);
            let log = fs::read_to_string(&request.log_file).expect("diagnostics");
            assert!(log.contains("injected cosmetic warning"));
            assert!(log.contains("\"percent\":255"));
        }
    }
}
