//! QA only, never packaged. The product Session uses the same in-process writer.
use serde::Deserialize;
use std::{
    io::{self, Write},
    path::PathBuf,
    sync::atomic::AtomicBool,
};
use vantare_installer::engine::{
    Request, Session,
    context::{Context, qa_path},
};

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Input {
    request: Request,
    context: Context,
    payload_directory: PathBuf,
}
fn run() -> Result<u8, Box<dyn std::error::Error>> {
    let mut args = std::env::args_os().skip(1);
    let path = PathBuf::from(args.next().ok_or("request path required")?);
    if args.next().is_some() {
        return Err("one request path required".into());
    }
    qa_path(&path)?;
    if std::fs::metadata(&path)?.len() > 65536 {
        return Err("request too large".into());
    }
    let raw = std::fs::read(&path)?;
    let input: Input = serde_json::from_slice(raw.strip_prefix(b"\xef\xbb\xbf").unwrap_or(&raw))?;
    let context = Context::isolated(
        input.context.local_app_data,
        input.context.registry_prefix,
        input
            .context
            .shell_root
            .ok_or("injected shell folders required")?,
    )?;
    if input.request.operation == "Probe" {
        println!(
            "{}",
            serde_json::to_string(&context.probe(&input.request)?)?
        );
        return Ok(0);
    }
    qa_path(&input.payload_directory)?;
    let session = Session::with_context(context)?;
    let result = session.run_files(
        &input.request,
        &input.payload_directory,
        &AtomicBool::new(false),
        &mut |event| {
            let output = serde_json::to_string(&event).expect("finite progress JSON");
            println!("{output}");
            io::stdout().flush().expect("QA stdout available");
        },
        &mut |_| Ok(()),
    )?;
    Ok(result)
}
fn main() -> std::process::ExitCode {
    match run() {
        Ok(code) => std::process::ExitCode::from(code),
        Err(error) => {
            eprintln!("{error}");
            std::process::ExitCode::from(1)
        }
    }
}
