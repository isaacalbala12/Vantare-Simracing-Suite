//! Installed root entrypoint. The session owns children and its shutdown
//! budget; this process only selects, confirms and, on failed boot, recovers.
use super::{log, object_name, win::Stop};
use std::sync::atomic::{AtomicBool, Ordering};
use std::{
    fs, io,
    path::{Path, PathBuf},
    process::{Command, ExitCode, Stdio},
    time::{Duration, Instant},
};
use vantare_installer::engine::{
    Installation,
    context::Context,
    operations::{self, BootRecovery},
    write_fs as disk,
};

fn io_error(error: impl std::fmt::Display) -> io::Error {
    io::Error::other(error.to_string())
}

fn parse(args: &[String], mode: &str) -> io::Result<(PathBuf, bool)> {
    let [flag, root_flag, value, rest @ ..] = args else {
        return Err(io_error("Se requiere modo, -Root y ruta absoluta"));
    };
    if flag != mode
        || root_flag != "-Root"
        || !Path::new(value).is_absolute()
        || !rest.is_empty() && rest != ["--background"]
    {
        return Err(io_error("Argumentos de instalación inválidos"));
    }
    Ok((PathBuf::from(value), !rest.is_empty()))
}
fn active(root: &Path) -> io::Result<(Installation, PathBuf)> {
    let view = Installation::read(root).map_err(io_error)?;
    let state = view
        .state
        .as_ref()
        .ok_or_else(|| io_error("Falta instalación activa"))?;
    let manifest = view
        .manifest
        .as_ref()
        .ok_or_else(|| io_error("Falta manifiesto activo"))?;
    if manifest.engine() != 2 {
        return Err(io_error(
            "Motor anterior: ejecuta Reparar con el Setup nuevo",
        ));
    }
    let generation = root.join("generations").join(&state.active.generation);
    Ok((view, generation))
}

pub(super) fn root(args: &[String]) -> io::Result<ExitCode> {
    let (requested, background) = parse(args, "--root")?;
    let context = installed_context(&requested).map_err(io_error)?;
    let root = disk::open_root(&requested, false).map_err(io_error)?;
    let Ok(_bootstrap) = disk::lock(&root, ".bootstrap.lock") else {
        let _ = Stop::signal(&object_name("launcher-open-hub", "native-beta"));
        return Ok(ExitCode::SUCCESS);
    };
    for entry in fs::read_dir(&root)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let generated = name
            .strip_prefix("Vantare-")
            .and_then(|n| n.strip_suffix(".old"));
        if name == "Vantare.exe.old"
            || generated
                .is_some_and(|id| id.len() == 32 && id.bytes().all(|byte| byte.is_ascii_hexdigit()))
        {
            let _ = fs::remove_file(entry.path());
        }
    }
    for _ in 0..3 {
        if root.join("staging/pending.json").try_exists()?
            && let Err(error) = apply(&root)
        {
            log(format_args!("actualización pendiente: {error}"));
            let _ = fs::remove_file(root.join("staging/pending.json"));
        }
        let (_, generation) = active(&root).inspect_err(|_| {
            let _ = super::win::offer_repair();
        })?;
        let image = generation.join("bin/vantare.exe");
        let _ = fs::remove_file(root.join("hub-ready"));
        let mut session = Command::new(&image);
        session.args(["--session", "-Root"]).arg(&root);
        if background {
            session.arg("--background");
        }
        session
            .env("VANTARE_BETA_ROOT", &root)
            .env("VANTARE_NATIVE_DATA_ROOT", generation.join("data"))
            .env(
                "VANTARE_APPEARANCE_FILE",
                generation.join("data/hub/appearance.json"),
            )
            .stdin(Stdio::null());
        if background {
            session.env("VANTARE_BACKGROUND_STARTUP", "1");
        } else {
            session.env("VANTARE_INTERACTIVE_STARTUP", "1");
        }
        let pending = root.join("boot-pending.json").try_exists()?;
        let mut child = match session.spawn() {
            Ok(child) => child,
            Err(error) if pending => {
                log(format_args!("sesión nueva: {error}"));
                recover_boot(&root, &context)?;
                continue;
            }
            Err(error) => return Err(error),
        };
        let opened = if pending {
            ready(&root, &mut child, Duration::from_secs(45)).unwrap_or_else(|error| {
                log(format_args!("confirmar ventana: {error}"));
                false
            })
        } else {
            true
        };
        if pending {
            let confirmed = opened
                && operations::confirm(&root)
                    .inspect_err(|error| {
                        log(format_args!("confirmar generación: {error}"));
                    })
                    .is_ok();
            if !confirmed {
                let _ = Stop::signal(&object_name("launcher-stop", "native-beta"));
                if !wait_for_exit(&mut child, Duration::from_secs(15)).unwrap_or(false) {
                    let _ = child.kill();
                    let _ = child.wait();
                }
                recover_boot(&root, &context)?;
                continue;
            }
        }
        sync_registration(&root, &context);
        let status = child.wait()?;
        if status.code() == Some(10) {
            continue;
        }
        return Ok(if status.success() {
            ExitCode::SUCCESS
        } else {
            ExitCode::FAILURE
        });
    }
    Err(io_error(
        "Demasiados reinicios consecutivos; ejecuta Reparar",
    ))
}

fn recover_boot(root: &Path, context: &Context) -> io::Result<()> {
    let recovery = operations::rollback(root).map_err(|error| {
        let _ = super::win::offer_repair();
        io_error(error)
    })?;
    match recovery {
        BootRecovery::Restored => sync_registration(root, context),
        BootRecovery::RepairRequired => {
            let _ = super::win::offer_repair();
            return Err(io_error("Falló el arranque; ejecuta Reparar"));
        }
    }
    Ok(())
}

fn wait_for_exit(child: &mut std::process::Child, limit: Duration) -> io::Result<bool> {
    let deadline = Instant::now() + limit;
    while child.try_wait()?.is_none() {
        if Instant::now() >= deadline {
            return Ok(false);
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    Ok(true)
}

fn sync_registration(root: &Path, context: &Context) {
    let status = root.join("registration-status.json");
    let Err(error) =
        vantare_installer::engine::shell::sync_running_with_context(root, context, None)
    else {
        let _ = fs::remove_file(status);
        return;
    };
    let message = error.to_string();
    log(format_args!("registro: {message}"));
    if disk::publish_json(
        &status,
        &serde_json::json!({"schema":1,"state":"warning","message":message}),
    )
    .is_err()
    {
        log("no se pudo registrar el aviso de Windows");
    }
}

fn installed_context(root: &Path) -> vantare_installer::engine::write_fs::Result<Context> {
    #[cfg(feature = "installer-qa")]
    {
        Context::from_qa_env(root)
    }
    #[cfg(not(feature = "installer-qa"))]
    {
        let _ = root;
        Context::system()
    }
}

fn ready(root: &Path, child: &mut std::process::Child, limit: Duration) -> io::Result<bool> {
    let deadline = Instant::now() + limit;
    loop {
        if child.try_wait()?.is_some() {
            return Ok(false);
        }
        if fs::read_to_string(root.join("hub-ready"))
            .is_ok_and(|pid| pid.trim().parse::<u32>().is_ok())
        {
            return Ok(true);
        }
        if Instant::now() >= deadline {
            return Ok(false);
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

pub(super) fn data(root: &Path) -> io::Result<(PathBuf, PathBuf)> {
    let (view, generation) = active(root)?;
    let image = generation.join("bin/vantare.exe");
    if !vantare_installer::engine::context::same_path(&std::env::current_exe()?, &image)
        .map_err(io_error)?
    {
        return Err(io_error("La sesión no es la generación activa"));
    }
    Ok((view.data_path.clone(), image))
}

pub(super) fn session(args: &[String]) -> io::Result<ExitCode> {
    let (root, _background) = parse(args, "--session")?;
    let (data, image) = data(&root)?;
    if std::env::var_os("VANTARE_NATIVE_DATA_ROOT").as_deref() != Some(data.as_os_str()) {
        return Err(io_error("Raíz de datos de sesión incompatible"));
    }
    let bin = image
        .parent()
        .ok_or_else(|| io_error("Falta bin de la sesión"))?;
    let command = vec![
        "--instancia".into(),
        "native-beta".into(),
        "--launcher-file".into(),
        data.join("Vantare/native/launcher.json")
            .to_string_lossy()
            .into_owned(),
        "--".into(),
        "--live".into(),
        "--".into(),
        "--start-hidden".into(),
    ];
    let mut config = super::parse(&command, bin).map_err(io_error)?;
    config.installation = Some(root);
    super::run(config)
}

pub(super) fn apply(root: &Path) -> io::Result<ExitCode> {
    let pending = root.join("staging/pending.json");
    let bytes = fs::read(&pending)?;
    if bytes.len() > 65536 {
        return Err(io_error("Oferta pendiente demasiado grande"));
    }
    let offer = super::update_feed::Offer::verify(&bytes)?;
    let (view, _) = active(root)?;
    let current = view.manifest.as_ref().expect("active manifest");
    if pending_obsolete(
        &offer.version,
        current.version_parts,
        root.join("boot-pending.json").try_exists()?,
    )? {
        fs::remove_file(pending)?;
        return Ok(ExitCode::SUCCESS);
    }
    let archive = root.join("staging").join(format!("{}.zip", offer.sha256));
    let package = operations::Package {
        archive: &archive,
        sha256: &offer.sha256,
        version: &offer.version,
    };
    let cancel = AtomicBool::new(false);
    let mut control = operations::Control {
        cancel: &cancel,
        progress: &mut |_| {},
        checkpoint: &mut |_| Ok(()),
        warning: &mut |message| log(message),
    };
    operations::update(root, &package, false, &mut control).map_err(io_error)?;
    fs::remove_file(pending)?;
    Ok(ExitCode::from(10))
}

fn pending_obsolete(version: &str, active: [u16; 3], boot_pending: bool) -> io::Result<bool> {
    Ok(boot_pending
        || vantare_installer::engine::validation::version(version).map_err(io_error)? <= active)
}
pub(super) fn stage(root: &Path, cancelled: &AtomicBool) -> io::Result<()> {
    let (view, _) = active(root)?;
    let current = view.manifest.as_ref().expect("active manifest");
    if current.channel != "beta" {
        return Err(io_error("Feed requiere canal beta"));
    }
    let staging = root.join("staging");
    disk::path(&staging).map_err(io_error)?;
    if staging.join("pending.json").try_exists()? {
        return Ok(());
    }
    if root.join("boot-pending.json").try_exists()? {
        return Ok(());
    }
    let rejected = disk::read_optional(&root.join("update-status.json"), Some(65536))
        .map_err(io_error)?
        .and_then(|status| status["rejectedVersion"].as_str().map(str::to_owned));
    let found =
        super::update_feed::check(&current.version, &staging, cancelled, rejected.as_deref())?;
    if cancelled.load(Ordering::Acquire) {
        return Ok(());
    }
    let _operation = disk::lock(root, ".operation.lock").map_err(io_error)?;
    let refreshed = Installation::read(root).map_err(io_error)?;
    if refreshed
        .state
        .as_ref()
        .map(|state| &state.active.generation)
        != view.state.as_ref().map(|state| &state.active.generation)
    {
        return Err(io_error("La generación cambió durante la consulta"));
    }
    let Some(download) = found else {
        if rejected.is_none() {
            operations::status(root, "current", "Estás al día", &current.version)
                .map_err(io_error)?;
        }
        return Ok(());
    };
    let archive = staging.join(format!("{}.zip", download.offer.sha256));
    let check = staging.join(format!("check-{}", disk::id().map_err(io_error)?));
    let validated = vantare_installer::engine::package::expand(
        &archive,
        &download.offer.sha256,
        &check,
        "beta",
    )
    .map_err(io_error);
    let _ = disk::remove_owned_tree(root, &check);
    let validated = validated?;
    if validated.version != download.offer.version || validated.engine() != 2 {
        return Err(io_error("Paquete del feed incompatible"));
    }
    let temporary = staging.join(format!("offer-{}.tmp", disk::id().map_err(io_error)?));
    disk::write_new(&temporary, &download.signed).map_err(io_error)?;
    disk::replace_temporary(&temporary, &staging.join("pending.json")).map_err(io_error)?;
    disk::publish_json(
        &root.join("update-status.json"),
        &serde_json::json!({"schema":1,"state":"ready",
            "message":"Actualización lista; se aplicará al reiniciar",
            "version":download.offer.version,"notes":download.offer.notes,
            "rejectedVersion":rejected}),
    )
    .map_err(io_error)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn staging_989_then_setup_989_is_obsolete_at_next_start() {
        assert!(!pending_obsolete("0.0.989", [0, 0, 988], false).unwrap());
        assert!(pending_obsolete("0.0.989", [0, 0, 989], false).unwrap());
        assert!(pending_obsolete("0.0.990", [0, 0, 989], true).unwrap());
    }
    #[test]
    fn failed_ready_child_is_reaped_before_rollback() {
        let mut child = Command::new(std::env::var("COMSPEC").unwrap())
            .args(["/D", "/C", "ping -n 5 127.0.0.1 >NUL"])
            .spawn()
            .unwrap();
        assert!(!wait_for_exit(&mut child, Duration::from_millis(1)).unwrap());
        child.kill().unwrap();
        assert!(wait_for_exit(&mut child, Duration::from_secs(5)).unwrap());
    }
}
