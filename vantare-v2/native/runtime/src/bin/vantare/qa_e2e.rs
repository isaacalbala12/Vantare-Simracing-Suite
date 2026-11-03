//! Thin process conductor. All account, renewal, authority and Feed code is real.
use std::{
    io::{self, BufRead, Write},
    sync::Arc,
    time::{Duration, Instant},
};
use vantare_ipc::{
    control::{self, CoreLink, Feed},
    services_protocol as protocol,
    transport::{Event, Pipe, connect},
};

#[derive(serde::Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
enum Request {
    Service { command: protocol::Command },
    Feed,
    Exit,
}

fn json_line(value: &impl serde::Serialize) -> io::Result<()> {
    let mut out = io::stdout().lock();
    serde_json::to_writer(&mut out, value)?;
    writeln!(out)?;
    out.flush()
}
fn connect_host(name: &str, child: &mut std::process::Child) -> io::Result<Pipe> {
    let stop = Arc::new(Event::new()?);
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        match connect(name, Arc::clone(&stop), Duration::from_secs(15)) {
            Ok(pipe) => return Ok(pipe),
            Err(_) if Instant::now() < deadline && child.try_wait()?.is_none() => {
                std::thread::sleep(Duration::from_millis(20))
            }
            Err(error) => return Err(error),
        }
    }
}
pub(super) fn run() -> io::Result<()> {
    super::platform::adopt_self_in_job()?;
    let image = std::env::current_exe()?;
    let bins = image
        .parent()
        .ok_or(io::ErrorKind::InvalidInput)?
        .to_path_buf();
    let core_image = bins.join("vantare-core.exe");
    let nonce = vantare_services::random_id().map_err(|_| io::ErrorKind::Other)?;
    let photo = format!(
        "qa-e2e-{}",
        vantare_services::random_id().map_err(|_| io::ErrorKind::Other)?
    );
    let mut core = std::process::Command::new(&core_image)
        .args(["--managed-rights", "--replay"])
        .arg(vantare_ipc::qa::root().join("replay.bin"))
        .args(["--build", "1.3.0.0", "--pipe", &photo])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .spawn()?;
    let result = (|| {
        control::write(
            core.stdin.as_mut().ok_or(io::ErrorKind::BrokenPipe)?,
            &control::Bootstrap {
                nonce: nonce.clone(),
            },
        )?;
        let host = vantare_runtime::services::Host::start(
            &photo,
            vantare_runtime::services::Options {
                binary: bins.join("vantare-services.exe"),
                hub: image,
                core: CoreLink {
                    pipe: control::pipe_name(&photo),
                    image: core_image.clone(),
                    nonce,
                },
                root: Some(vantare_ipc::paths::Root::from_env()?.services()),
            },
        )?;
        let feed = Feed::connect(&photo, core_image)?;
        let mut pipe = connect_host(&vantare_runtime::services::pipe_name(&photo), &mut core)?;
        let hello: protocol::SupervisorHello = protocol::read(&mut pipe)?;
        if hello.version != protocol::VERSION {
            return Err(io::ErrorKind::InvalidData.into());
        }
        json_line(&serde_json::json!({"ready":true,"core_pid":core.id()}))?;
        let mut sequence = 0;
        for line in io::stdin().lock().lines() {
            let line = line?;
            if line.len() > 4096 {
                return Err(io::ErrorKind::InvalidData.into());
            }
            let request: Request =
                serde_json::from_str(&line).map_err(|_| io::ErrorKind::InvalidData)?;
            match request {
                Request::Exit => break,
                Request::Feed => json_line(&serde_json::json!({"policy":feed.policy()}))?,
                Request::Service { command } => {
                    sequence += 1;
                    protocol::write(
                        &mut pipe,
                        &protocol::Request {
                            version: protocol::VERSION,
                            sequence,
                            nonce: hello.nonce.clone(),
                            command,
                        },
                    )?;
                    let response: protocol::Response = protocol::read(&mut pipe)?;
                    if response.sequence != sequence || response.version != protocol::VERSION {
                        return Err(io::ErrorKind::InvalidData.into());
                    }
                    // stdout is a private runner channel; it must never be logged verbatim.
                    // In particular AccountCopyLink contains transient OAuth state, not evidence.
                    json_line(&response.reply)?;
                }
            }
        }
        drop(pipe);
        drop(host);
        drop(feed);
        Ok(())
    })();
    drop(core.stdin.take());
    let deadline = Instant::now() + Duration::from_secs(6);
    while core.try_wait()?.is_none() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
    if core.try_wait()?.is_none() {
        core.kill()?;
        core.wait()?;
        return Err(io::Error::other("qa-e2e core required kill"));
    }
    if !core.wait()?.success() {
        return Err(io::Error::other("qa-e2e core failed"));
    }
    result
}
