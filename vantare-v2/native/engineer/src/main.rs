#![deny(unsafe_code)]

use vantare_ipc::product;

use std::ffi::OsString;
use std::io;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use vantare_engineer::{Engineer, control, local::Local, radio::Locale, worker::RadioWorker};
use vantare_runtime::flows::wire;

#[derive(Default)]
struct Options {
    stream: bool,
    cursor: Option<PathBuf>,
    pipe: Option<String>,
    locale: Locale,
    clips: Option<PathBuf>,
    core_image: Option<PathBuf>,
    settings: Option<PathBuf>,
}

fn options(arguments: impl IntoIterator<Item = OsString>) -> Result<Options, &'static str> {
    let mut arguments = arguments.into_iter();
    let mut options = Options::default();
    let mut mode = false;
    while let Some(argument) = arguments.next() {
        match argument.to_str() {
            Some("--stream" | "--pipe") if !mode => {
                mode = true;
                options.stream = argument == "--stream";
            }
            Some("--cursor") => {
                options.cursor = Some(arguments.next().ok_or("falta ruta de cursor")?.into());
            }
            Some("--settings") if options.settings.is_none() => {
                options.settings = Some(arguments.next().ok_or("falta ruta de ajustes")?.into());
            }
            Some("--clips") => {
                options.clips = Some(arguments.next().ok_or("falta carpeta de clips")?.into());
            }
            Some("--core-image") => {
                options.core_image = Some(arguments.next().ok_or("falta imagen de Core")?.into());
            }
            Some("--pipe-name") => {
                options.pipe = Some(
                    arguments
                        .next()
                        .ok_or("falta nombre de pipe")?
                        .into_string()
                        .map_err(|_| "nombre de pipe no UTF-8")?,
                );
            }
            Some("--locale") => {
                options.locale = Locale::parse(
                    arguments
                        .next()
                        .ok_or("falta locale")?
                        .to_str()
                        .ok_or("locale no UTF-8")?,
                )
                .ok_or("locale: es|en|it|pt-BR")?;
            }
            _ => {
                return Err(
                    "uso: --pipe | --stream; --cursor R [--pipe-name N] [--core-image R] [--locale es|en|it|pt-BR] [--clips CARPETA] [--settings RUTA]",
                );
            }
        }
    }
    if options.cursor.is_none() {
        return Err("ambos modos requieren --cursor R");
    }
    Ok(options)
}

fn main() {
    if product::print_version() {
        return;
    }
    vantare_services::diagnostics::install_panic_hook("vantare-engineer");
    if let Err(error) = run() {
        eprintln!("Engineer: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let options = options(std::env::args_os().skip(1))?;
    let clips = options
        .clips
        .clone()
        .or_else(vantare_engineer::voice::default_cache_root);
    let mut radio = RadioWorker::new(options.locale, clips.as_deref())?;
    let settings_path = match options.settings {
        Some(path) => Some(path),
        None if !options.stream => Some(control::default_path()?),
        None => None, // El banco stream no toca ajustes de producto salvo opt-in.
    };
    let seed = control::Settings {
        locale: options.locale.code().into(),
        voice: options.clips.is_some(),
        ..Default::default()
    };
    radio.configure(&seed)?;
    let mut local = settings_path.map(|path| Local::new(path, seed, clips));
    let result = if options.stream {
        run_stream(
            options.pipe,
            options.core_image,
            options.cursor.as_deref().ok_or("falta cursor")?,
            &mut radio,
            local.as_mut(),
        )
    } else {
        run_pipe(
            options.pipe,
            options.cursor.as_deref().ok_or("falta cursor")?,
            options.core_image,
            &mut radio,
            local.as_mut(),
        )
    };
    let stopped = radio.clear();
    if let Some(local) = &mut local {
        let error = result
            .as_ref()
            .err()
            .map(ToString::to_string)
            .or_else(|| stopped.as_ref().err().map(ToString::to_string));
        local.publish(&radio, false, error.as_deref());
    }
    result?;
    stopped?;
    Ok(())
}

fn run_stream(
    name: Option<String>,
    core_image: Option<PathBuf>,
    checkpoint: &std::path::Path,
    radio: &mut RadioWorker,
    mut local: Option<&mut Local>,
) -> Result<(), Box<dyn std::error::Error>> {
    // El transporte del banco no concede derechos: usa la misma autoridad
    // autenticada que el modo pipe, independiente de las fotos por stdin.
    let name = name.map_or_else(vantare_ipc::default_pipe_name, Ok)?;
    let expected =
        core_image.unwrap_or(std::env::current_exe()?.with_file_name("vantare-core.exe"));
    let rights = vantare_ipc::control::Feed::connect(&name, expected)?;
    // Sincronizar con el primer resultado del Feed antes de decidir: un
    // arranque lento no es una denegación. El plazo explícito cubre un ciclo
    // de lectura (IO_TIMEOUT) más el arranque del publicador; el timeout se
    // diagnostica como tal en vez de confundirse con falta de licencia.
    if !rights.wait_initial(vantare_ipc::transport::IO_TIMEOUT + Duration::from_secs(5)) {
        return Err(io::Error::new(
            io::ErrorKind::TimedOut,
            "derechos sin respuesta inicial en 10 s; reintentar con el núcleo visible",
        )
        .into());
    }
    require_stream_rights(&rights)?;
    let mut engineer = Engineer::resume(checkpoint)?;
    let mut output = io::stdout().lock();
    wire::write_hello(&mut output, engineer.cursor())?;
    // Cola de uno: lectura del banco fuera de los plazos de voz. EOF cierra
    // el canal; un error de main acaba el proceso y su lector de stdin.
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    let _input = std::thread::Builder::new()
        .name("engineer-stream".into())
        .spawn(move || {
            let mut input = io::stdin().lock();
            loop {
                let frame = wire::read_frame(&mut input);
                let end = !matches!(frame, Ok(Some(_)));
                if sender.send(frame).is_err() || end {
                    return;
                }
            }
        })?;
    let start = Instant::now();
    let mut presentation = io::stderr().lock();
    loop {
        require_stream_rights(&rights)?;
        if let Some(local) = &mut local {
            local.poll(radio, &mut presentation)?;
        }
        match receiver.recv_timeout(Duration::from_millis(50)) {
            Ok(Ok(Some(frame))) => {
                require_stream_rights(&rights)?;
                let applied = engineer.apply(&frame, checkpoint)?;
                radio.ingest(
                    &frame.snapshot,
                    &applied,
                    start.elapsed(),
                    &mut presentation,
                )?;
                eprintln!(
                    "Engineer: evento={} hueco={:?} recording={:?}",
                    applied.event.is_some(),
                    applied.gap,
                    frame.recording
                );
                wire::write_ack(
                    &mut output,
                    engineer.cursor().ok_or("falta cursor tras procesar")?,
                )?;
            }
            Ok(Ok(None)) | Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            Ok(Err(error)) => return Err(error.into()),
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                require_stream_rights(&rights)?;
                radio.tick(start.elapsed(), &mut presentation)?;
            }
        }
        if let Some(local) = &mut local {
            local.publish(radio, true, None);
        }
    }
    Ok(())
}

fn require_stream_rights(rights: &vantare_ipc::control::Feed) -> io::Result<()> {
    if rights.policy().engineer {
        Ok(())
    } else {
        Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "la radio requiere una licencia válida de Engineer",
        ))
    }
}

#[cfg(windows)]
fn run_pipe(
    name: Option<String>,
    checkpoint: &std::path::Path,
    core_image: Option<PathBuf>,
    radio: &mut RadioWorker,
    mut local: Option<&mut Local>,
) -> Result<(), Box<dyn std::error::Error>> {
    use std::io::{Read as _, Write as _};
    use std::sync::atomic::Ordering;
    let stop = vantare_runtime::shutdown::install()?;
    let _stdin = std::thread::Builder::new()
        .name("engineer-stop".into())
        .spawn(|| {
            let mut input = io::stdin().lock();
            let mut discard = [0; 128];
            loop {
                match input.read(&mut discard) {
                    Ok(0) | Err(_) => {
                        vantare_runtime::shutdown::request();
                        return;
                    }
                    Ok(_) => {}
                }
            }
        })?;
    let name = name.map_or_else(vantare_ipc::default_pipe_name, Ok)?;
    // Paquete local: core hermano de Engineer. ipc aplica ACL y consulta PID/
    // imagen; este consumidor además fija la imagen de servidor esperada.
    let expected =
        core_image.unwrap_or(std::env::current_exe()?.with_file_name("vantare-core.exe"));
    let rights = vantare_ipc::control::Feed::connect(&name, expected.clone())?;
    let mut engineer = Engineer::resume(checkpoint)?;
    let client = vantare_runtime::flows::client::EventClient::connect(
        &vantare_runtime::flows::host::pipe_name(&name),
        engineer.cursor(),
        move |peer| peer.is_image(&expected),
    )?;
    let start = Instant::now();
    let (mut last_photo, mut source_lost) = (Instant::now(), true);
    let mut revision = None;
    let mut output = io::stdout().lock();
    writeln!(
        output,
        "{{\"version\":\"vantare.radio.status.v1\",\"events\":\"connecting\",\"spotter\":\"waiting_spatial\"}}"
    )?;
    output.flush()?;
    // El cursor no debe consumir los primeros hechos antes de la política.
    // Espera inicial acotada fuera de UI; un timeout mantiene la denegación.
    rights.wait_initial(Duration::from_secs(1));
    while !stop.load(Ordering::Relaxed) {
        if let Some(local) = &mut local {
            local.poll(radio, &mut output)?;
        }
        if let Some(frame) = client.next(Duration::from_millis(50))? {
            let applied = engineer.apply(&frame, checkpoint)?;
            if rights.policy().engineer {
                radio.ingest(&frame.snapshot, &applied, start.elapsed(), &mut output)?;
            } else {
                radio.clear()?;
            }
            let current = (frame.snapshot.epoch, frame.snapshot.sequence);
            if revision != Some(current) {
                revision = Some(current);
                last_photo = Instant::now();
                source_lost = false;
            }
            if applied.event.is_some() || applied.fact.is_some() || applied.gap.is_some() {
                writeln!(
                    output,
                    "{}",
                    serde_json::json!({"version":"vantare.radio.status.v1", "cursor":engineer.cursor().map(|c| [c.epoch,c.index]), "event":applied.event.is_some(), "fact":format!("{:?}",applied.fact.map(|f| f.kind)), "gap":format!("{:?}",applied.gap), "recording":format!("{:?}",frame.recording)})
                )?;
                output.flush()?;
            }
            client.ack(engineer.cursor().ok_or("falta cursor tras procesar")?)?;
        }
        {
            if !source_lost && last_photo.elapsed() >= Duration::from_millis(500) {
                radio.clear()?;
                source_lost = true;
                writeln!(
                    output,
                    "{{\"version\":\"vantare.radio.status.v1\",\"source\":\"stale\",\"clear\":true}}"
                )?;
                output.flush()?;
            }
            if rights.policy().engineer {
                radio.tick(start.elapsed(), &mut output)?;
            } else {
                radio.clear()?;
            }
        }
        if let Some(local) = &mut local {
            local.publish(
                radio,
                true,
                if source_lost {
                    Some("fuente ausente/obsoleta; esperando fotos y eventos")
                } else {
                    None
                },
            );
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn run_pipe(
    _name: Option<String>,
    _checkpoint: &std::path::Path,
    _core_image: Option<PathBuf>,
    _radio: &mut RadioWorker,
    _local: Option<&mut Local>,
) -> Result<(), Box<dyn std::error::Error>> {
    Err("named pipe de producto requiere Windows".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn parse(args: &[&str]) -> Result<Options, &'static str> {
        options(args.iter().map(OsString::from))
    }
    #[test]
    fn modes_locale_and_opt_in_clips_are_explicit() {
        assert!(
            !parse(&["--pipe", "--cursor", "cursor.json"])
                .unwrap()
                .stream
        );
        let parsed = parse(&[
            "--stream",
            "--cursor",
            "cursor.json",
            "--locale",
            "pt-BR",
            "--clips",
            "clips",
            "--settings",
            "engineer.json",
            "--pipe-name",
            "core-test",
            "--core-image",
            "core.exe",
        ])
        .unwrap();
        assert!(parsed.stream && parsed.clips.is_some());
        assert_eq!(parsed.locale, Locale::PtBr);
        assert_eq!(parsed.settings, Some(PathBuf::from("engineer.json")));
        assert_eq!(parsed.pipe.as_deref(), Some("core-test"));
        assert_eq!(parsed.core_image, Some(PathBuf::from("core.exe")));
        for args in [
            &["--stream"][..],
            &[],
            &["--locale", "zz"],
            &["--pipe", "--stream"],
            &["--clips"],
            &["--pipe", "--cursor", "cursor.json", "--settings"],
            &[
                "--pipe",
                "--cursor",
                "cursor.json",
                "--settings",
                "a",
                "--settings",
                "b",
            ],
        ] {
            assert!(parse(args).is_err());
        }
    }
}
