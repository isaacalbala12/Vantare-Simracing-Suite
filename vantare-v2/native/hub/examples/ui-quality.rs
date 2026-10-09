//! Banco explícito de UI: shell productiva y protocolo IPC real contra replies
//! de contrato locales. No se distribuye ni abre servicios, red o credenciales.
use std::{fs, io::Write, path::PathBuf, sync::Arc, time::Duration};
use vantare_hub::{
    demo::{CaptureState, DemoData},
    orbit::theme::AppearanceSettings,
    services::protocol::{self, Command, Reply, Request, Response, SupervisorHello},
    shell::{self, Options, navigation::Access},
};
use vantare_ipc::{
    control,
    transport::{Event, Listener},
};

fn argument(args: &[String], key: &str) -> Option<String> {
    args.windows(2)
        .find(|pair| pair[0] == key)
        .map(|pair| pair[1].clone())
}

/// Inyección explícita de fotos de contrato por el IPC del banco, nunca el de usuario.
fn qa_telemetry(
    root: PathBuf,
    name: &str,
    stop: Arc<Event>,
) -> Result<std::thread::JoinHandle<Result<(), String>>, String> {
    let mut publisher = vantare_ipc::Publisher::new(name, |_| true)
        .map_err(|error| format!("publicador QA: {error}"))?;
    Ok(std::thread::spawn(move || {
        let mut previous = None;
        while !stop.is_set() {
            let bytes = match fs::read(root.join("telemetry.snapshot.json")) {
                Ok(bytes) => Some(bytes),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
                Err(error) => return Err(format!("leer foto QA: {error}")),
            };
            if let Some(bytes) = bytes.filter(|bytes| previous.as_ref() != Some(bytes)) {
                let photo = vantare_ipc::snapshot_from_json(
                    std::str::from_utf8(&bytes).map_err(|error| error.to_string())?,
                )
                .map_err(|error| format!("foto QA inválida: {error}"))?;
                let revision = format!("{},{}", photo.epoch, photo.sequence);
                publisher
                    .publish(Arc::new(photo))
                    .map_err(|error| format!("publicar foto QA: {error}"))?;
                fs::write(root.join("telemetry-published.txt"), revision)
                    .map_err(|error| error.to_string())?;
                previous = Some(bytes);
            }
            stop.wait(Duration::from_millis(100));
        }
        Ok(())
    }))
}

fn serve(root: &std::path::Path, name: &str, stop: Arc<Event>) -> Result<(), String> {
    let mut listener = Listener::new(name, stop.clone(), Duration::from_secs(300))
        .map_err(|error| format!("listener QA: {error}"))?;
    let mut log = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(root.join("requests.jsonl"))
        .map_err(|error| error.to_string())?;
    fs::write(root.join("ready"), b"QA local IPC").map_err(|error| error.to_string())?;
    let mut draft = None;
    while !stop.is_set() {
        let mut pipe = listener.instance().map_err(|error| error.to_string())?;
        if pipe.accept().is_err() {
            continue;
        }
        control::write(
            &mut pipe,
            &SupervisorHello {
                version: protocol::VERSION,
                nonce: "a".repeat(64),
            },
        )
        .map_err(|error| error.to_string())?;
        while !stop.is_set() {
            let request: Request = match protocol::read(&mut pipe) {
                Ok(request) => request,
                Err(_) => break,
            };
            if request.version != protocol::VERSION || request.nonce != "a".repeat(64) {
                return Err("request QA fuera del contrato".into());
            }
            let command =
                serde_json::to_value(&request.command).map_err(|error| error.to_string())?;
            writeln!(
                log,
                "{}",
                serde_json::json!({"sequence": request.sequence, "command": command})
            )
            .map_err(|error| error.to_string())?;
            log.flush().map_err(|error| error.to_string())?;
            let script: serde_json::Value = serde_json::from_slice(
                &fs::read(root.join("replies.json")).map_err(|error| error.to_string())?,
            )
            .map_err(|error| error.to_string())?;
            let key = command["command"].as_str().ok_or("comando QA sin nombre")?;
            if let Some(delay) = script["delay_ms"][key].as_u64() {
                stop.wait(Duration::from_millis(delay.min(10_000)));
            }
            let mut reply = match &request.command {
                Command::DraftSave { fields } => {
                    let saved = protocol::report_document::Draft {
                        schema_version: 1,
                        idempotency_key: "b".repeat(64),
                        fields: fields.clone(),
                        screenshots: vec![],
                    };
                    fs::write(
                        root.join("draft.json"),
                        serde_json::to_vec(&saved).map_err(|error| error.to_string())?,
                    )
                    .map_err(|error| error.to_string())?;
                    draft = Some(saved);
                    Reply::Draft {
                        draft: draft.clone(),
                        message: "QA · borrador local guardado".into(),
                    }
                }
                Command::DraftLoad => {
                    if draft.is_none() && root.join("draft.json").exists() {
                        draft = Some(
                            serde_json::from_slice(
                                &fs::read(root.join("draft.json"))
                                    .map_err(|error| error.to_string())?,
                            )
                            .map_err(|error| error.to_string())?,
                        );
                    }
                    Reply::Draft {
                        draft: draft.clone(),
                        message: "QA · borrador local recuperado".into(),
                    }
                }
                Command::DraftDiscard => {
                    draft = None;
                    match fs::remove_file(root.join("draft.json")) {
                        Ok(()) => {}
                        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                        Err(error) => return Err(error.to_string()),
                    }
                    Reply::Draft {
                        draft: None,
                        message: "QA · borrador descartado".into(),
                    }
                }
                _ => serde_json::from_value(script[key].clone())
                    .map_err(|error| format!("reply QA {key}: {error}"))?,
            };
            if script["fresh_policy"].as_bool() == Some(true)
                && let Reply::License { policy, .. } = &mut reply
            {
                policy.checked_at_ms = control::wall_ms().map_err(|error| error.to_string())?;
            }
            if protocol::write(
                &mut pipe,
                &Response {
                    version: protocol::VERSION,
                    sequence: request.sequence,
                    reply,
                },
            )
            .is_err()
            {
                break;
            }
        }
    }
    Ok(())
}

fn main() -> Result<(), String> {
    let args: Vec<_> = std::env::args().collect();
    let root = PathBuf::from(argument(&args, "--qa-root").ok_or("falta root QA explícito")?);
    if !root.is_absolute() || !root.join("replies.json").is_file() {
        return Err(
            "el root QA necesita replies.json de contrato; no se usan defaults personales".into(),
        );
    }
    // Client comprueba la imagen del peer contra el supervisor junto al Hub.
    if std::env::current_exe()
        .map_err(|error| error.to_string())?
        .file_name()
        .and_then(|name| name.to_str())
        != Some("vantare.exe")
    {
        return Err(
            "copia este banco a una carpeta QA como vantare.exe (identidad IPC aislada)".into(),
        );
    }
    let state =
        CaptureState::parse(&argument(&args, "--capture").unwrap_or_else(|| "studio-base".into()))?;
    let size = argument(&args, "--qa-size").unwrap_or_else(|| "1920x1080".into());
    let (width, height) = size.split_once('x').ok_or("tamaño QA inválido")?;
    let size = (
        width.parse().map_err(|_| "ancho QA inválido")?,
        height.parse().map_err(|_| "alto QA inválido")?,
    );
    let appearance = argument(&args, "--qa-appearance")
        .map(|path| {
            let bytes = fs::read(path).map_err(|error| error.to_string())?;
            serde_json::from_slice::<AppearanceSettings>(&bytes).map_err(|error| error.to_string())
        })
        .transpose()?;
    let catalog = match argument(&args, "--qa-catalog").as_deref() {
        None | Some("free") => control::CatalogAccess::Free,
        Some("launch") => control::CatalogAccess::LaunchV1,
        Some("pro") => control::CatalogAccess::Pro,
        Some(_) => return Err("catálogo QA inválido".into()),
    };
    let name = format!("vantare-ui-quality-{}", std::process::id());
    let stop = Arc::new(Event::new().map_err(|error| error.to_string())?);
    let telemetry = if args.iter().any(|arg| arg == "--qa-telemetry") {
        Some(qa_telemetry(root.clone(), &name, stop.clone())?)
    } else {
        None
    };
    let server_stop = stop.clone();
    let server_root = root.clone();
    let server_name = format!("{name}-hub-services");
    let server = std::thread::spawn(move || serve(&server_root, &server_name, server_stop));
    let options = Options {
        controlled: false,
        data_dir: root.clone(),
        scene: None,
        layout: root.join("layout.json"),
        engineer: root.join("engineer.json"),
        section: state.section,
        pipe: Some(name),
        recordings: None,
        launcher_file: root.join("launcher.json"),
        demo: if args.iter().any(|arg| arg == "--demo") {
            Some(DemoData::load()?)
        } else {
            None
        },
        capture: Some(state),
        capture_output: None,
        capture_appearance: appearance,
        capture_size: Some(size),
        capture_zoom: Some(100),
    };
    let result = shell::run_with_access(
        options,
        Access {
            verified: true,
            catalog,
            engineer: true,
            strategy: true,
            analysis: true,
            calendar: true,
            tester: true,
            ..Default::default()
        },
    );
    stop.set();
    let telemetry_result = telemetry.map_or(Ok(()), |thread| {
        thread
            .join()
            .map_err(|_| "publicador QA terminó con panic".to_owned())?
    });
    let server_result = server.join().map_err(|_| "servidor QA terminó con panic")?;
    result.and(server_result).and(telemetry_result)
}
