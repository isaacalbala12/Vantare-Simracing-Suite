#[cfg(windows)]
mod platform {
    //! QA only, never packaged. The product Session uses the same in-process writer.
    use serde::Deserialize;
    use std::{
        io::{self, Write},
        path::PathBuf,
        process::{Command, Stdio},
        sync::atomic::AtomicBool,
    };
    use vantare_installer::engine::{
        Installation, Operation, Request, Session,
        context::{Context, qa_path},
        operations::{self, Control},
        package, write_fs as disk,
    };

    #[derive(Deserialize)]
    #[serde(deny_unknown_fields, rename_all = "camelCase")]
    struct Input {
        request: Request,
        context: Context,
        payload_directory: PathBuf,
        #[serde(default)]
        qa_action: Option<String>,
        #[serde(default)]
        verifier: Option<PathBuf>,
    }
    fn verify(
        verifier: &std::path::Path,
        bytes: &[u8],
        mode: &str,
    ) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        qa_path(verifier)?;
        let mut child = Command::new(verifier)
            .arg(mode)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        child
            .stdin
            .take()
            .ok_or("verifier stdin")?
            .write_all(bytes)?;
        let output = child.wait_with_output()?;
        if !output.status.success() {
            return Err("signed QA offer rejected".into());
        }
        Ok(output.stdout)
    }
    fn qa_action(
        input: &Input,
        context: &Context,
        action: &str,
    ) -> Result<u8, Box<dyn std::error::Error>> {
        let root = input
            .request
            .root
            .as_deref()
            .ok_or("explicit QA root required")?;
        qa_path(root)?;
        qa_path(&input.payload_directory)?;
        context.validate_root(root)?;
        if action == "SetStartupOn" || action == "SetStartupOff" {
            vantare_installer::engine::shell::sync_running_with_context(
                root,
                context,
                Some(action == "SetStartupOn"),
            )?;
            return Ok(0);
        }
        let verifier = input.verifier.as_deref().ok_or("QA verifier required")?;
        if !root.exists() {
            return Err("QA installation root missing".into());
        }
        let view = Installation::read(root)?;
        let staging = root.join("staging");
        let pending = staging.join("pending.json");
        match action {
            "Check" => {
                let state = view.state.as_ref().ok_or("active QA state required")?;
                let manifest = view.manifest.as_ref().ok_or("active manifest required")?;
                if manifest.engine() != 2 || state.channel != "beta" {
                    return Err("motor 2 beta required".into());
                }
                if pending.exists() || root.join("boot-pending.json").exists() {
                    return Ok(0);
                }
                let unsigned = std::fs::read(input.payload_directory.join("offer.json"))?;
                let signed = verify(verifier, &unsigned, "--matrix-sign")?;
                let payload = verify(verifier, &signed, "--verify-update")?;
                let offer: serde_json::Value = serde_json::from_slice(&payload)?;
                let sha = offer["sha256"].as_str().ok_or("offer sha")?;
                let version = offer["version"].as_str().ok_or("offer version")?;
                let archive = input.payload_directory.join("v989.zip");
                let check = staging.join(format!("check-{}", disk::id()?));
                let expanded = package::expand(&archive, sha, &check, "beta");
                let _ = disk::remove_owned_tree(root, &check);
                let expanded = expanded?;
                if expanded.version != version || expanded.engine() != 2 {
                    return Err("offer package mismatch".into());
                }
                std::fs::create_dir_all(&staging)?;
                std::fs::copy(&archive, staging.join(format!("{sha}.zip")))?;
                disk::write_json(
                    &pending,
                    &serde_json::from_slice::<serde_json::Value>(&signed)?,
                )?;
                disk::write_json(
                    &root.join("update-status.json"),
                    &serde_json::json!({"schema":1,"state":"ready","message":"QA offer ready",
                        "version":version,"notes":offer["notes"]}),
                )?;
                Ok(0)
            }
            "Apply" => {
                if !pending.exists() {
                    return Ok(0);
                }
                let signed = std::fs::read(&pending)?;
                let payload = verify(verifier, &signed, "--verify-update")?;
                let offer: serde_json::Value = serde_json::from_slice(&payload)?;
                let sha = offer["sha256"].as_str().ok_or("offer sha")?;
                let version = offer["version"].as_str().ok_or("offer version")?;
                let archive = staging.join(format!("{sha}.zip"));
                let cancel = AtomicBool::new(false);
                let mut control = Control {
                    cancel: &cancel,
                    progress: &mut |_| {},
                    checkpoint: &mut |_| Ok(()),
                    warning: &mut |message| eprintln!("{message}"),
                };
                operations::update(
                    root,
                    &operations::Package {
                        archive: &archive,
                        sha256: sha,
                        version,
                    },
                    false,
                    &mut control,
                )?;
                std::fs::remove_file(&pending)?;
                Ok(0)
            }
            "Confirm" => {
                if root.join("boot-pending.json").exists() {
                    operations::confirm(root)?;
                }
                Ok(0)
            }
            "Timeout" => {
                if !root.join("boot-pending.json").exists() {
                    return Err("no boot pending".into());
                }
                let _ = operations::rollback(root)?;
                Ok(0)
            }
            _ => Err("QA action rejected".into()),
        }
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
        let mut input: Input =
            serde_json::from_slice(raw.strip_prefix(b"\xef\xbb\xbf").unwrap_or(&raw))?;
        if input.request.log_file.as_os_str().is_empty() {
            input.request.log_file = vantare_installer::engine::log_path()?;
        }
        let context = Context::isolated(
            input.context.local_app_data.clone(),
            input.context.registry_prefix.clone(),
            input
                .context
                .shell_root
                .clone()
                .ok_or("injected shell folders required")?,
        )?;
        if let Some(action) = &input.qa_action {
            return qa_action(&input, &context, action);
        }
        if input.request.operation == Operation::Probe {
            println!(
                "{}",
                serde_json::to_string(&context.probe(&input.request)?)?
            );
            return Ok(0);
        }
        qa_path(&input.payload_directory)?;
        if input.request.operation == Operation::Sync {
            let root = input
                .request
                .root
                .as_deref()
                .ok_or("explicit QA root required")?;
            context.validate_root(root)?;
            let _session = vantare_installer::engine::write_fs::lock(root, "beta-session.lock")?;
            let _operation = vantare_installer::engine::write_fs::lock(root, ".operation.lock")?;
            let view = vantare_installer::engine::Installation::read(root)?;
            let previous = vantare_installer::engine::context::options(root, true)?;
            vantare_installer::engine::shell::sync(
                root,
                &context,
                view.state.as_ref().zip(view.installed_version()),
                &vantare_installer::engine::shell::Options {
                    request: &input.request,
                    previous: previous.as_ref(),
                    payload: &input.payload_directory,
                    restoring: false,
                },
                &mut |_| {},
                &mut |message| eprintln!("{message}"),
            )?;
            return Ok(0);
        }
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
    pub fn main() -> std::process::ExitCode {
        match run() {
            Ok(code) => std::process::ExitCode::from(code),
            Err(error) => {
                eprintln!("{error}");
                std::process::ExitCode::from(1)
            }
        }
    }
}
#[cfg(windows)]
fn main() -> std::process::ExitCode {
    platform::main()
}
#[cfg(not(windows))]
fn main() {}
