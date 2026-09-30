#![deny(unsafe_code)]

use std::ffi::OsString;
use std::io;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use vantare_engineer::{Applied, Engineer, radio::Locale, worker::RadioWorker};
use vantare_runtime::flows::wire;

#[derive(Default)]
struct Options {
    stream: bool,
    cursor: Option<PathBuf>,
    pipe: Option<String>,
    locale: Locale,
    clips: Option<PathBuf>,
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
            Some("--clips") => {
                options.clips = Some(arguments.next().ok_or("falta carpeta de clips")?.into());
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
                    "uso: --pipe [--pipe-name N] | --stream --cursor R; [--locale es|en|it|pt-BR] [--clips CARPETA]",
                );
            }
        }
    }
    if options.stream && (options.cursor.is_none() || options.pipe.is_some()) {
        return Err("stream requiere cursor y no acepta nombre de pipe");
    }
    if !options.stream && options.cursor.is_some() {
        return Err("pipe de fotos no ofrece cursor de eventos");
    }
    Ok(options)
}

fn main() {
    if let Err(error) = run() {
        eprintln!("Engineer: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let options = options(std::env::args_os().skip(1))?;
    let radio = RadioWorker::new(options.locale, options.clips.as_deref())?;
    if options.stream {
        run_stream(options.cursor.as_deref().ok_or("falta cursor")?, radio)
    } else {
        run_pipe(options.pipe, radio)
    }
}

fn run_stream(
    checkpoint: &std::path::Path,
    mut radio: RadioWorker,
) -> Result<(), Box<dyn std::error::Error>> {
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
        match receiver.recv_timeout(Duration::from_millis(50)) {
            Ok(Ok(Some(frame))) => {
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
                radio.tick(start.elapsed(), &mut presentation)?;
            }
        }
    }
    radio.clear()?;
    Ok(())
}

#[cfg(windows)]
fn run_pipe(
    name: Option<String>,
    mut radio: RadioWorker,
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
    let expected = std::env::current_exe()?
        .parent()
        .ok_or("falta directorio del binario")?
        .join("vantare-core.exe");
    let mut subscriber = vantare_ipc::Subscriber::connect(&name, move |peer| {
        peer.image
            .to_string_lossy()
            .eq_ignore_ascii_case(&expected.to_string_lossy())
    })?;
    let start = Instant::now();
    let (mut last_photo, mut source_lost) = (Instant::now(), true);
    let mut output = io::stdout().lock();
    writeln!(
        output,
        "{{\"version\":\"vantare.radio.status.v1\",\"events\":\"unavailable\",\"spotter\":\"unavailable_opponent_velocity\"}}"
    )?;
    output.flush()?;
    while !stop.load(Ordering::Relaxed) {
        if let Some(snapshot) = subscriber.next(Duration::from_millis(50)) {
            radio.ingest(
                &snapshot,
                &Applied {
                    baseline: source_lost,
                    ..Applied::default()
                },
                start.elapsed(),
                &mut output,
            )?;
            last_photo = Instant::now();
            source_lost = false;
        } else {
            if !source_lost && last_photo.elapsed() >= Duration::from_millis(500) {
                radio.clear()?;
                source_lost = true;
                writeln!(
                    output,
                    "{{\"version\":\"vantare.radio.status.v1\",\"source\":\"stale\",\"clear\":true}}"
                )?;
                output.flush()?;
            }
            radio.tick(start.elapsed(), &mut output)?;
        }
    }
    radio.clear()?;
    Ok(())
}

#[cfg(not(windows))]
fn run_pipe(_name: Option<String>, _radio: RadioWorker) -> Result<(), Box<dyn std::error::Error>> {
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
        assert!(!parse(&[]).unwrap().stream);
        let parsed = parse(&[
            "--stream",
            "--cursor",
            "cursor.json",
            "--locale",
            "pt-BR",
            "--clips",
            "clips",
        ])
        .unwrap();
        assert!(parsed.stream && parsed.clips.is_some());
        assert_eq!(parsed.locale, Locale::PtBr);
        for args in [
            &["--stream"][..],
            &["--cursor", "cursor.json"],
            &["--locale", "zz"],
            &["--pipe", "--stream"],
            &["--clips"],
        ] {
            assert!(parse(args).is_err());
        }
    }
}
