#![deny(unsafe_code)]

use std::io;
use std::path::PathBuf;

use vantare_engineer::Engineer;
use vantare_runtime::flows::wire;

fn main() {
    if let Err(error) = run() {
        eprintln!("Engineer: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let arguments: Vec<_> = std::env::args_os().skip(1).collect();
    let [mode, option, path] = arguments.as_slice() else {
        return Err(
            "uso: vantare-engineer --stream --cursor <ruta> (banco IPC, no pipe de producto)"
                .into(),
        );
    };
    if mode != "--stream" || option != "--cursor" {
        return Err("opción desconocida".into());
    }
    let checkpoint = PathBuf::from(path);
    let mut engineer = Engineer::resume(&checkpoint)?;
    let (mut input, mut output) = (io::stdin().lock(), io::stdout().lock());
    wire::write_hello(&mut output, engineer.cursor())?;
    while let Some(frame) = wire::read_frame(&mut input)? {
        let applied = engineer.apply(&frame, &checkpoint)?;
        eprintln!(
            "Engineer: evento={} hueco={:?} recording={:?}",
            applied.event.is_some(),
            applied.gap,
            frame.recording
        );
        let cursor = engineer
            .cursor()
            .ok_or("falta cursor después de procesar")?;
        wire::write_ack(&mut output, cursor)?;
    }
    Ok(()) // EOF: cierre ordenado del proceso.
}
