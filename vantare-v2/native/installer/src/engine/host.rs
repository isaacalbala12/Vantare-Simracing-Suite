//! In-process Setup/Uninstall host; only deferred Cleanup uses PowerShell.
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
#[cfg(feature = "test-installer")]
use serde::{Deserialize, Serialize};
use std::os::windows::process::CommandExt;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "test-installer", derive(Serialize, Deserialize))]
pub enum Operation {
    Probe,
    Install,
    Update,
    Uninstall,
    Cleanup,
    #[cfg(feature = "test-installer")]
    Sync,
}

#[derive(Clone)]
#[cfg_attr(feature = "test-installer", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "test-installer", serde(rename_all = "camelCase"))]
#[allow(clippy::struct_excessive_bools)] // Independent serialized identity/launch/options flags.
pub struct Request {
    pub operation: Operation,
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
    #[cfg_attr(feature = "test-installer", serde(default))]
    pub log_file: PathBuf,
}

impl Request {
    pub fn new(args: &Args, operation: Operation) -> Self {
        Self {
            operation,
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

pub struct ShellOptions<'a> {
    pub request: &'a Request,
    pub previous: Option<&'a super::context::Options>,
    pub payload: &'a Path,
    pub restoring: bool,
}

pub struct Session {
    directory: PathBuf,
    context: Context,
    transferred: bool,
}
impl Session {
    /// Setup y Uninstall usan los nombres del canal de su paquete (#2812); una
    /// build sin canal no tiene producto y no instala ni desinstala nada.
    pub fn new() -> Result<Self, String> {
        Self::with_context(
            Context::system()
                .and_then(|context| context.for_channel(crate::CHANNEL))
                .map_err(|error| error.to_string())?,
        )
    }
    pub fn with_context(context: Context) -> Result<Self, String> {
        if context.is_isolated() && !cfg!(feature = "test-installer") {
            return Err("El transporte aislado requiere una build test-installer".into());
        }
        context.product().map_err(|error| error.to_string())?;
        let parent = std::env::temp_dir();
        reject_links(&parent)?;
        if context.is_isolated() {
            super::context::qa_path(&parent).map_err(|error| error.to_string())?;
        }
        let directory = parent.join(format!(
            "VantareSetup-{}",
            disk::id().map_err(|error| error.to_string())?
        ));
        fs::create_dir(&directory).map_err(|error| error.to_string())?;
        let session = Self {
            directory,
            context,
            transferred: false,
        };
        session.write("installer-cleanup.ps1", payload::CLEANUP)?;
        session.write("installer-notices.txt", payload::FONT_LICENSES.as_bytes())?;
        #[cfg(feature = "test-installer")]
        if session.context.is_isolated() {
            session.write("qa-guard.ps1", payload::QA_GUARD)?;
        }
        Ok(session)
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
        let mut command = Command::new(super::powershell()?);
        command
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(self.directory.join("installer-cleanup.ps1"))
            .arg("-RequestFile")
            .arg(self.directory.join("shell.json"));
        // Heredada de PowerShell 7 apunta a módulos que 5.1 no puede usar (#2824);
        // sin ella, 5.1 reconstruye su propia ruta.
        command.env_remove("PSModulePath");
        command.creation_flags(0x0800_0000);
        Ok(command)
    }
    fn cleanup_contract(&self, root: &Path, request: &Request) -> WriteResult<bool> {
        self.context.validate_root(root)?;
        // Observe renewal and the marker under the same exclusion as Cleanup.
        let _session = disk::lock(root, "beta-session.lock")?;
        disk::ensure(
            !root.join("state.json").try_exists()? && !self.context.has_registration()?,
            "La instalación se ha renovado; se conserva el desinstalador",
        )?;
        // Solo se limpian los restos de este canal (#2812).
        operations::residue_owned(root, self.context.product()?.channel)?;
        if super::context::cleanup_marker(root, None)?.is_none() {
            return Ok(false); // A legacy image without ownership proof is retained.
        }
        disk::write_json(
            &self.directory.join("shell.json"),
            &serde_json::json!({"operation":"Cleanup","root":root,"parentId":request.process_id,"qa":self.context.is_isolated()}),
        )?;
        Ok(true)
    }
    /// Permanent, file-only exception. Both modes log stdout/stderr; exit status
    /// remains authoritative. Scheduled cleanup owns its external process lifetime.
    fn start_cleanup(
        &self,
        root: &Path,
        request: &Request,
        mut log: &fs::File,
        wait: bool,
    ) -> WriteResult<bool> {
        if !self.cleanup_contract(root, request)? {
            writeln!(
                log,
                "Cleanup sin marcador; residuo conservado: {}",
                root.join("Uninstall.exe").display()
            )?;
            return Ok(false);
        }
        let mut child = self
            .command()
            .map_err(|error| WriteError::new(1, error))?
            .stdout(Stdio::from(log.try_clone()?))
            .stderr(Stdio::from(log.try_clone()?))
            .spawn()?;
        if wait {
            disk::ensure(
                child.wait()?.success(),
                "No se pudo completar Cleanup; consulta el registro",
            )?;
        }
        Ok(!wait)
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
        if request.operation == Operation::Install
            && self.extract(request, cancel, &mut progress)? == 5
        {
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
        let root = self.context.resolve_root(request)?;
        let _ = super::windows::registry_string(
            &self.context.registry_prefix,
            super::shell::RUN,
            "VantareNative.Hub",
            false,
        )?;
        if self.context.is_isolated() {
            super::context::qa_path(&request.log_file)?;
        }
        let log = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&request.log_file)?;
        let previous = super::context::options(&root, request.uninstall)?;
        let archive = payload_directory.join("package.zip");
        let package = self.package(&archive, request)?;
        let mut warning = |message: &str| {
            let _ = writeln!(&log, "{message}");
        };
        let mut control = operations::Control {
            cancel,
            progress,
            checkpoint,
            warning: &mut warning,
        };
        (control.progress)(Progress::step(
            "prepare",
            0,
            request.operation == Operation::Install,
        ));
        let result = if request.operation == Operation::Cleanup {
            self.start_cleanup(&root, request, &log, true).map(|_| ())
        } else {
            self.execute(
                &root,
                request,
                &package,
                previous.as_ref(),
                payload_directory,
                &mut control,
            )
        };
        match result {
            Ok(()) => {
                (control.progress)(Progress::step("done", 100, false));
                Ok(0)
            }
            Err(error) => {
                (control.warning)(&error.to_string());
                Ok(error.code)
            }
        }
    }
    /// El paquete embebido se autentica con el canal del producto de este Setup.
    fn package<'a>(
        &self,
        archive: &'a Path,
        request: &'a Request,
    ) -> WriteResult<operations::Package<'a>> {
        Ok(operations::Package {
            archive,
            sha256: &request.package_sha,
            version: &request.version,
            channel: self.context.product()?.channel,
        })
    }
    fn execute(
        &self,
        root: &Path,
        request: &Request,
        package: &operations::Package<'_>,
        previous: Option<&super::context::Options>,
        payload: &Path,
        control: &mut operations::Control<'_>,
    ) -> WriteResult<()> {
        let options = ShellOptions {
            request,
            previous,
            payload,
            restoring: false,
        };
        match request.operation {
            Operation::Install => {
                (control.progress)(Progress::step("verify", 40, true));
                operations::install(
                    root,
                    package,
                    request.mode,
                    control,
                    |control, restoring, projection| {
                        self.sync(
                            root,
                            &ShellOptions {
                                restoring,
                                ..options
                            },
                            projection,
                            control,
                        )
                    },
                    || prepare_orphan(&self.context, root),
                )
            }
            Operation::Update => operations::update(root, package, false, control),
            Operation::Uninstall => {
                if !self.context.has_registration()?
                    && !root.join("installer-cleanup.json").try_exists()?
                {
                    return Err(WriteError::new(1, "La instalación no está registrada"));
                }
                (control.progress)(Progress::step("copy", 12, false));
                let channel = self.context.product()?.channel;
                operations::uninstall(root, channel, control, |control| {
                    self.sync(root, &options, None, control)
                })
            }
            _ => Err(WriteError::new(1, "Operación del instalador no permitida")),
        }
    }
    fn sync(
        &self,
        root: &Path,
        options: &ShellOptions<'_>,
        projection: Option<(&super::State, &str)>,
        control: &mut operations::Control<'_>,
    ) -> WriteResult<()> {
        super::shell::sync(
            root,
            &self.context,
            projection,
            options,
            control.progress,
            control.warning,
        )
    }
    /// Permanent, guarded PowerShell cleanup; no native self-delete workaround.
    pub fn schedule_cleanup(args: &Args) -> Result<(), String> {
        let mut session = Self::new()?;
        let request = Request::new(args, crate::engine::Operation::Cleanup);
        let root = session
            .context
            .resolve_root(&request)
            .map_err(|error| error.to_string())?;
        let log = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&request.log_file)
            .map_err(|error| error.to_string())?;
        session.transferred = session
            .start_cleanup(&root, &request, &log, false)
            .map_err(|error| error.to_string())?;
        Ok(())
    }
}
/// Antes de instalar, con `beta-session.lock` tomado: retira los restos de una
/// limpieza diferida que no terminó. Sin proceso vivo que la termine, el Setup
/// no espera para siempre (#2829).
pub fn prepare_orphan(context: &Context, root: &Path) -> WriteResult<()> {
    let marker = root.join("installer-cleanup.json");
    if !marker.try_exists()? {
        return Ok(());
    }
    if root.join("state.json").try_exists()? || context.has_registration()? {
        return Err(WriteError::new(
            2,
            "Espera a que termine la limpieza del desinstalador anterior",
        ));
    }
    disk::open_root(root, false)?;
    let image = root.join("Uninstall.exe");
    if image.try_exists()? {
        retire_stale_uninstaller(context, root, &image)?;
    }
    super::context::cleanup_marker(root, None)?;
    disk::remove_file(&marker)
}
/// La limpieza diferida falló y nadie la va a terminar (#2829): sin proceso
/// vivo con esa imagen, el Setup retira el desinstalador marcado, solo si es
/// de su canal y es el del marcador. Nunca toca nada más de la raíz.
fn retire_stale_uninstaller(context: &Context, root: &Path, image: &Path) -> WriteResult<()> {
    operations::residue_owned(root, context.product()?.channel)?;
    if let Some(pid) = super::windows::running_image(image)? {
        return Err(WriteError::new(
            2,
            format!(
                "El desinstalador anterior sigue abierto (proceso {pid}). Ciérralo y vuelve a abrir el Setup"
            ),
        ));
    }
    let in_use = |cause: &dyn std::fmt::Display| {
        WriteError::new(
            2,
            format!(
                "El desinstalador anterior está en uso ({cause}). Ciérralo y vuelve a abrir el Setup"
            ),
        )
    };
    // En exclusiva: falla si alguien, de cualquier sesión, lo tiene abierto o
    // en ejecución, y mientras dura nadie puede arrancarlo.
    let mut file = disk::open_exclusive(image).map_err(|cause| in_use(&cause))?;
    let (_, sha256) = operations::fingerprint(&mut file)?;
    super::context::cleanup_marker(root, Some(&sha256))?;
    drop(file);
    // Una imagen arrancada justo ahora no se deja borrar: se detiene sin cambios.
    fs::remove_file(image).map_err(|cause| in_use(&cause))
}
impl Drop for Session {
    fn drop(&mut self) {
        if !self.transferred && reject_links(&self.directory).is_ok() {
            let _ = fs::remove_dir_all(&self.directory);
        }
    }
}
pub fn log_path() -> Result<PathBuf, String> {
    Ok(std::env::temp_dir().join(format!(
        "VantareSetup-{}.log",
        disk::id().map_err(|error| error.to_string())?
    )))
}
pub fn headless(args: &Args) -> Result<u8, String> {
    if !args.silent {
        return Err("La interfaz interactiva todavía no está conectada".into());
    }
    let session = Session::new()?;
    // The silent path needs discovery/preferences, not an extra state/manifest
    // Probe before the operation acquires its locks and reads them once.
    let probe = Request::new(args, Operation::Probe);
    let root = session
        .context
        .resolve_root(&probe)
        .map_err(|error| error.to_string())?;
    let mut request = Request::new(
        args,
        if args.uninstall {
            Operation::Uninstall
        } else {
            Operation::Install
        },
    );
    (request.desktop, request.autostart) =
        super::context::preferences(&root, args.uninstall, args.silent)
            .map_err(|error| error.to_string())?;
    request.root = Some(root);
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
    #[cfg(feature = "test-installer")]
    use super::Operation;
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
    fn the_embedded_package_is_authenticated_with_the_setup_channel() {
        let parent = if std::env::var("CI").as_deref() == Ok("true") {
            PathBuf::from(std::env::var_os("RUNNER_TEMP").expect("CI root"))
        } else {
            PathBuf::from("D:/VantareServer/qa/isa-1840")
        };
        let id = disk::id().expect("ID");
        let root = parent.join("p2812-package-channel").join(&id);
        qa_path(&root).expect("QA guard");
        let request = Request::new(&Args::default(), crate::engine::Operation::Install);
        let archive = root.join("package.zip");
        for channel in ["nightly", "beta"] {
            let session = Session {
                directory: root.join("transport"),
                context: Context::isolated(
                    root.join("LocalAppData"),
                    format!("Software\\VantareInstallerMatrix\\{id}"),
                    root.join("shell"),
                )
                .and_then(|context| context.for_channel(channel))
                .expect("isolated context"),
                transferred: false,
            };
            let package = session.package(&archive, &request).expect("package");
            assert_eq!(package.channel, channel);
        }
    }

    #[test]
    fn cleanup_exit_status_is_authoritative_and_missing_marker_retains_legacy_residue() {
        for code in [0, 7] {
            let parent = if std::env::var("CI").as_deref() == Ok("true") {
                PathBuf::from(std::env::var_os("RUNNER_TEMP").expect("CI root"))
            } else {
                PathBuf::from("D:/VantareServer/qa/isa-1840")
            };
            let id = disk::id().expect("ID");
            let root = parent.join("p5a-cleanup-tests").join(&id);
            qa_path(&root).expect("QA guard");
            let directory = root.join("write-engine");
            fs::create_dir_all(&directory).expect("owned transport");
            let isolated = |channel: &str| {
                Context::isolated(
                    root.join("LocalAppData"),
                    format!("Software\\VantareInstallerMatrix\\{id}"),
                    root.join("shell"),
                )
                .and_then(|context| context.for_channel(channel))
                .expect("isolated context")
            };
            // This script only emits diagnostics/progress; it never runs product
            // shell code or touches registry. The session owns/reaps its child.
            let session = Session {
                directory,
                context: isolated("beta"),
                transferred: false,
            };
            let command = session.command().expect("cleanup command");
            assert!(
                command
                    .get_envs()
                    .any(|(name, value)| name == "PSModulePath" && value.is_none())
            );
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
                crate::engine::Operation::Cleanup,
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
            let root = request.root.as_deref().unwrap();
            let log_file = fs::OpenOptions::new()
                .append(true)
                .open(&request.log_file)
                .unwrap();
            // El resto sin canal declarado es de beta: nightly no lo limpia (#2812).
            // Antes de la limpieza de beta: con shell.json ya escrito fallaría igual.
            let foreign = Session {
                directory: session.directory.clone(),
                context: isolated("nightly"),
                transferred: true,
            };
            assert!(foreign.cleanup_contract(root, &request).is_err());
            let result = session.start_cleanup(root, &request, &log_file, true);
            assert_eq!(result.is_ok(), code == 0);
            let log = fs::read_to_string(&request.log_file).expect("diagnostics");
            assert!(log.contains("injected cosmetic warning"));
            assert!(log.contains("\"percent\":255"));
            fs::remove_file(root.join("installer-cleanup.json")).expect("legacy marker absent");
            fs::write(&request.log_file, []).expect("clear log");
            assert!(
                session
                    .start_cleanup(root, &request, &log_file, true)
                    .is_ok()
            );
            assert!(root.join("Uninstall.exe").is_file());
            assert!(
                fs::metadata(&request.log_file)
                    .expect("residue diagnostic")
                    .len()
                    > 0
            );
            fs::write(root.join("state.json"), b"{}").expect("renewed installation");
            assert!(session.cleanup_contract(root, &request).is_err());
            assert!(root.join("Uninstall.exe").is_file());
        }
    }
    #[cfg(feature = "test-installer")]
    #[test]
    fn expand_string_in_root_or_run_fails_before_installation_mutation() {
        let id = disk::id().unwrap();
        let root = std::env::temp_dir().join(format!("p5b-expand-{id}"));
        qa_path(&root).unwrap();
        fs::create_dir_all(root.join("install")).unwrap();
        fs::write(root.join("install/sentinel"), b"preserve").unwrap();
        let prefix = format!("Software\\VantareInstallerMatrix\\{id}");
        let context = Context::isolated(root.join("local"), prefix.clone(), root.join("shell"))
            .and_then(|context| context.for_channel("beta"))
            .unwrap();
        let session = Session::with_context(context).unwrap();
        let mut request = Request::new(
            &Args {
                root: Some(root.join("install")),
                ..Args::default()
            },
            Operation::Install,
        );
        request.log_file = root.join("operation.log");
        let uninstall = format!("{prefix}\\{}", super::super::product::BETA.uninstall_key);
        let key = windows_registry::CURRENT_USER.create(&uninstall).unwrap();
        let run = windows_registry::CURRENT_USER
            .create(format!("{prefix}\\{}", super::super::shell::RUN))
            .unwrap();
        for root_value in [true, false] {
            if root_value {
                key.set_expand_string("InstallLocation", root.join("install").to_str().unwrap())
                    .unwrap();
            } else {
                key.set_string("InstallLocation", root.join("install").to_str().unwrap())
                    .unwrap();
                run.set_expand_string("VantareNative.Hub", "%LOCALAPPDATA%\\foreign.exe")
                    .unwrap();
            }
            let result = session.run_files(
                &request,
                &root.join("payload"),
                &std::sync::atomic::AtomicBool::new(false),
                &mut |_| {},
                &mut |_| Ok(()),
            );
            assert!(result.is_err());
            assert_eq!(
                fs::read(root.join("install/sentinel")).unwrap(),
                b"preserve"
            );
            assert_eq!(fs::read_dir(root.join("install")).unwrap().count(), 1);
            assert!(!request.log_file.exists());
        }
        drop(key);
        drop(run);
        windows_registry::CURRENT_USER.remove_tree(prefix).unwrap();
    }

    #[cfg(feature = "test-installer")]
    #[test]
    #[allow(unsafe_code)] // Own the named event; it acknowledges flushed child stdout.
    fn scheduled_cleanup_records_normal_stdout_in_its_log() {
        use std::os::windows::io::{FromRawHandle, OwnedHandle};
        use windows::{
            Win32::{
                Foundation::WAIT_OBJECT_0,
                System::Threading::{CreateEventW, WaitForSingleObject},
            },
            core::PCWSTR,
        };
        let id = disk::id().unwrap();
        let root = std::env::temp_dir().join(format!("p5b-cleanup-output-{id}"));
        qa_path(&root).unwrap();
        fs::create_dir_all(root.join("install")).unwrap();
        let context = Context::isolated(
            root.join("local"),
            format!("Software\\VantareInstallerMatrix\\{id}"),
            root.join("shell"),
        )
        .and_then(|context| context.for_channel("beta"))
        .unwrap();
        let mut session = Session::with_context(context).unwrap();
        let name = format!("Local\\VantareCleanupOutput{id}");
        let wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
        let event = unsafe { CreateEventW(None, true, false, PCWSTR(wide.as_ptr())) }.unwrap();
        let _owned = unsafe { OwnedHandle::from_raw_handle(event.0) };
        let script = format!(
            "param($RequestFile)\n$ErrorActionPreference='Stop'\n[Console]::Out.WriteLine('normal cleanup output')\n[Console]::Out.Flush()\n$event=[Threading.EventWaitHandle]::OpenExisting('{name}')\n$null=$event.Set()\n$event.Dispose()\n"
        );
        fs::write(session.directory.join("installer-cleanup.ps1"), script).unwrap();
        fs::write(root.join("install/Uninstall.exe"), b"owned fixture").unwrap();
        let hash =
            super::super::installation::hash_file(&root.join("install/Uninstall.exe")).unwrap();
        disk::write_json(
            &root.join("install/installer-cleanup.json"),
            &serde_json::json!({"schema":1,"sha256":hash}),
        )
        .unwrap();
        let request = Request::new(
            &Args {
                root: Some(root.join("install")),
                ..Args::default()
            },
            Operation::Cleanup,
        );
        let log = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(root.join("cleanup.log"))
            .unwrap();
        session.transferred = session
            .start_cleanup(&root.join("install"), &request, &log, false)
            .unwrap();
        assert!(session.transferred);
        assert_eq!(
            unsafe { WaitForSingleObject(event, 30000) },
            WAIT_OBJECT_0,
            "flushed stdout acknowledgement"
        );
        assert!(
            fs::read_to_string(root.join("cleanup.log"))
                .unwrap()
                .contains("normal cleanup output")
        );
    }

    /// Restos de una limpieza diferida que falló (#2829): `Uninstall.exe` (copia
    /// de `sort.exe`, que espera en stdin sin temporizadores), su marcador y
    /// datos del usuario que nunca se tocan.
    struct Stale {
        root: PathBuf,
        install: PathBuf,
        id: String,
    }
    impl Stale {
        fn new() -> Self {
            let parent = if std::env::var("CI").as_deref() == Ok("true") {
                PathBuf::from(std::env::var_os("RUNNER_TEMP").expect("CI root"))
            } else {
                PathBuf::from("D:/VantareServer/qa/isa-1840")
            };
            let id = disk::id().expect("ID");
            let root = parent.join("p2829-recovery").join(&id);
            qa_path(&root).expect("QA guard");
            let install = root.join("install");
            fs::create_dir_all(install.join("data")).expect("user data");
            fs::create_dir_all(install.join("recordings")).expect("recordings");
            fs::write(install.join(".vantare-native"), b"offline-candidate-v1").expect("root");
            fs::write(install.join("data/profile.json"), b"{\"user\":true}").expect("data");
            fs::write(install.join("recordings/series.duckdb"), b"rec").expect("recording");
            let image = install.join("Uninstall.exe");
            fs::copy(sort_exe(), &image).expect("uninstaller copy");
            let hash = crate::engine::installation::hash_file(&image).expect("hash");
            disk::write_json(
                &install.join("installer-cleanup.json"),
                &serde_json::json!({"schema":1,"sha256":hash}),
            )
            .expect("marker");
            Self { root, install, id }
        }
        fn context(&self, channel: &str) -> Context {
            Context::isolated(
                self.root.join("LocalAppData"),
                format!("Software\\VantareInstallerMatrix\\{}", self.id),
                self.root.join("shell"),
            )
            .and_then(|context| context.for_channel(channel))
            .expect("isolated context")
        }
        fn prepare(&self, channel: &str) -> disk::Result<()> {
            super::prepare_orphan(&self.context(channel), &self.install)
        }
        fn image(&self) -> PathBuf {
            self.install.join("Uninstall.exe")
        }
        fn marker(&self) -> PathBuf {
            self.install.join("installer-cleanup.json")
        }
        fn tree(&self) -> Vec<(PathBuf, Vec<u8>)> {
            let mut files = Vec::new();
            let mut pending = vec![self.install.clone()];
            while let Some(directory) = pending.pop() {
                for entry in fs::read_dir(directory).expect("tree") {
                    let path = entry.expect("entry").path();
                    if path.is_dir() {
                        pending.push(path);
                    } else {
                        let bytes = fs::read(&path).expect("bytes");
                        files.push((path, bytes));
                    }
                }
            }
            files.sort();
            files
        }
    }
    fn sort_exe() -> PathBuf {
        PathBuf::from(std::env::var_os("SystemRoot").expect("SystemRoot"))
            .join("System32")
            .join("sort.exe")
    }
    /// Proceso propio: se cierra por el handle de su PID, nunca por nombre.
    struct Running(std::process::Child);
    impl Running {
        fn start(image: &std::path::Path) -> Self {
            Self(
                std::process::Command::new(image)
                    .stdin(std::process::Stdio::piped())
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .spawn()
                    .expect("own child"),
            )
        }
    }
    impl Drop for Running {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }

    #[test]
    fn setup_retires_a_stale_uninstaller_and_keeps_every_user_file() {
        let stale = Stale::new();
        let kept: Vec<_> = stale
            .tree()
            .into_iter()
            .filter(|(path, _)| *path != stale.image() && *path != stale.marker())
            .collect();
        stale.prepare("beta").expect("recovers");
        assert!(!stale.image().exists(), "stale uninstaller retired");
        assert!(!stale.marker().exists(), "marker retired");
        assert_eq!(stale.tree(), kept, "data, recordings and root untouched");
    }

    #[test]
    fn a_live_uninstaller_of_that_root_keeps_blocking_and_names_its_process() {
        let stale = Stale::new();
        let before = stale.tree();
        let running = Running::start(&stale.image());
        let error = stale.prepare("beta").expect_err("still running");
        assert_eq!(error.code, 2);
        // El usuario ve qué proceso cerrar.
        assert!(
            error
                .to_string()
                .contains(&format!("proceso {}", running.0.id())),
            "{error}"
        );
        assert_eq!(stale.tree(), before);
    }

    #[test]
    fn an_uninstaller_with_the_same_name_in_another_folder_does_not_block() {
        let stale = Stale::new();
        let other = stale.root.join("other");
        fs::create_dir_all(&other).expect("other folder");
        fs::copy(sort_exe(), other.join("Uninstall.exe")).expect("same name elsewhere");
        let _running = Running::start(&other.join("Uninstall.exe"));
        stale
            .prepare("beta")
            .expect("another folder is not this uninstaller");
        assert!(!stale.image().exists());
        assert!(other.join("Uninstall.exe").exists());
    }

    #[test]
    fn an_uninstaller_held_open_by_anyone_is_kept() {
        let stale = Stale::new();
        let before = stale.tree();
        let held = fs::File::open(stale.image()).expect("held by another handle");
        let error = stale.prepare("beta").expect_err("in use");
        assert_eq!(error.code, 2);
        drop(held);
        assert_eq!(stale.tree(), before);
    }

    #[test]
    fn residue_of_another_channel_is_never_recovered() {
        let stale = Stale::new();
        let before = stale.tree();
        // Sin canal declarado, el resto es de beta: nightly no lo toca (#2814).
        assert!(stale.prepare("nightly").is_err());
        assert_eq!(stale.tree(), before);
        stale.prepare("beta").expect("its own channel recovers");
    }

    #[test]
    fn without_marker_or_with_another_hash_the_uninstaller_is_kept() {
        let stale = Stale::new();
        fs::remove_file(stale.marker()).expect("no marker");
        let before = stale.tree();
        stale.prepare("beta").expect("nothing to recover");
        assert_eq!(stale.tree(), before, "no marker: nothing is retired");
        disk::write_json(
            &stale.marker(),
            &serde_json::json!({"schema":1,"sha256":"0".repeat(64)}),
        )
        .expect("foreign marker");
        let before = stale.tree();
        assert!(stale.prepare("beta").is_err());
        assert_eq!(stale.tree(), before, "another hash: kept");
    }

    #[test]
    fn a_renewed_installation_keeps_waiting() {
        let stale = Stale::new();
        fs::write(stale.install.join("state.json"), b"{}").expect("renewed");
        let before = stale.tree();
        let error = stale.prepare("beta").expect_err("renewed");
        assert_eq!(error.code, 2);
        assert_eq!(stale.tree(), before);
    }
}
