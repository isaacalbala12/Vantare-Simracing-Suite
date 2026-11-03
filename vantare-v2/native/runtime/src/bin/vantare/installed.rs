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
    for _ in 0..3 {
        if root.join("staging/pending.json").try_exists()? {
            let _ = apply(&root)?;
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
        let mut child = session.spawn()?;
        let pending = root.join("boot-pending.json").try_exists()?;
        let opened = !pending || ready(&root, &mut child, Duration::from_secs(45))?;
        if pending {
            if opened {
                operations::confirm(&root).map_err(io_error)?;
            } else {
                let _ = Stop::signal(&object_name("launcher-stop", "native-beta"));
                // The session owns the single shutdown budget, including kills.
                let _ = child.wait()?;
                match operations::rollback(&root).map_err(io_error)? {
                    BootRecovery::Restored => {
                        sync_registration(&root, &context);
                        continue;
                    }
                    BootRecovery::RepairRequired => {
                        let _ = super::win::offer_repair();
                        return Ok(ExitCode::FAILURE);
                    }
                }
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
    let found = super::update_feed::check(&current.version, &staging, cancelled)?;
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
        operations::status(root, "current", "Estás al día", &current.version).map_err(io_error)?;
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
            "version":download.offer.version,"notes":download.offer.notes}),
    )
    .map_err(io_error)
}
