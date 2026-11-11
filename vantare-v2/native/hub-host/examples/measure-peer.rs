//! Read-only, local QA peers for the measurement driver. Never distributed.
use std::{fs, io, path::Path, sync::Arc, time::Duration};
use vantare_ipc::{
    control,
    services_protocol::{self as services, Reply, Request, Response, SupervisorHello},
    transport::{Event, Listener},
};

fn rights(root: &Path, name: &str, stop: Arc<Event>) -> io::Result<()> {
    let script: serde_json::Value = serde_json::from_slice(&fs::read(root.join("replies.json"))?)?;
    let host = root.join("bin/vantare-hub.exe");
    let mut listener = Listener::new(
        &control::pipe_name(name),
        stop.clone(),
        Duration::from_secs(30),
    )?;
    println!("ready");
    while !stop.is_set() {
        let mut pipe = listener.instance()?;
        if pipe.accept().is_err() {
            continue;
        }
        if !pipe.client_peer().is_ok_and(|peer| peer.is_image(&host)) {
            continue;
        }
        let request: control::Request = match control::read(&mut pipe) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if request.version != control::VERSION
            || !request.nonce.is_empty()
            || !matches!(request.command, control::Command::Read)
        {
            continue;
        }
        let mut policy: control::Policy = serde_json::from_value(script["core_policy"].clone())?;
        policy.checked_at_ms = control::wall_ms()?;
        let _delivered = control::write(
            &mut pipe,
            &control::Response {
                version: control::VERSION,
                sequence: request.sequence,
                policy,
                error: None,
            },
        );
    }
    Ok(())
}

fn service(root: &Path, name: &str, stop: Arc<Event>) -> io::Result<()> {
    let script: serde_json::Value = serde_json::from_slice(&fs::read(root.join("replies.json"))?)?;
    let host = root.join("bin/vantare-hub.exe");
    let mut listener = Listener::new(
        &format!("{name}-hub-services"),
        stop.clone(),
        Duration::from_secs(30),
    )?;
    println!("ready");
    while !stop.is_set() {
        let mut pipe = listener.instance()?;
        if pipe.accept().is_err() {
            continue;
        }
        if !pipe.client_peer().is_ok_and(|peer| peer.is_image(&host)) {
            continue;
        }
        if services::write(
            &mut pipe,
            &SupervisorHello {
                version: services::VERSION,
                nonce: "a".repeat(64),
            },
        )
        .is_err()
        {
            continue;
        }
        while !stop.is_set() {
            let request: Request = match services::read(&mut pipe) {
                Ok(value) => value,
                Err(_) => break,
            };
            if request.version != services::VERSION || request.nonce != "a".repeat(64) {
                break;
            }
            let command = serde_json::to_value(&request.command)?;
            let key = command["command"]
                .as_str()
                .ok_or(io::ErrorKind::InvalidData)?;
            let permitted = [
                "Probe",
                "Status",
                "AccountPoll",
                "AccountProfileRefresh",
                "LicenseStatus",
                "PilotLoad",
                "MailGet",
                "RoadmapGet",
                "TestingRefresh",
            ]
            .contains(&key);
            let mut reply = if permitted && !script[key].is_null() {
                serde_json::from_value::<Reply>(script[key].clone())?
            } else {
                Reply::Error {
                    message: "QA measurement permits read-only fixture queries".into(),
                }
            };
            if let Reply::LicenseStatus { policy, .. } | Reply::License { policy, .. } = &mut reply
            {
                policy.checked_at_ms = control::wall_ms()?;
            }
            if services::write(
                &mut pipe,
                &Response {
                    version: services::VERSION,
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

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let value = |key: &str| {
        args.windows(2)
            .find(|pair| pair[0] == key)
            .map(|pair| pair[1].clone())
            .ok_or(io::ErrorKind::InvalidInput)
    };
    let root = fs::canonicalize(value("--root")?)?;
    if !root.join("measurement-qa-owned").is_file() {
        return Err(io::ErrorKind::PermissionDenied.into());
    }
    let pipe = value("--pipe")?;
    if !pipe.starts_with("vantare-measure-")
        || !pipe
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    let stop = Arc::new(Event::new()?);
    let closed = stop.clone();
    std::thread::spawn(move || {
        let _eof = io::copy(&mut io::stdin(), &mut io::sink());
        closed.set();
    });
    match value("--role")?.as_str() {
        "rights" => rights(&root, &pipe, stop)?,
        "services" => service(&root, &pipe, stop)?,
        _ => return Err(io::ErrorKind::InvalidInput.into()),
    }
    Ok(())
}
