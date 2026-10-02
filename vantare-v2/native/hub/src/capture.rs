//! Orquesta una captura de ventana sin meter Win32 ni PNG en el binario normal.
use std::{
    fs,
    io::{BufRead, BufReader, Read},
    path::PathBuf,
    process::{Command, Stdio},
};

use crate::{demo::CaptureState, shell};
use shell::Options;

const CAPTURE_PROCESS: &str = include_str!("../reference/tools/capture-process.ps1");
const CAPTURE_WINDOW: &str = include_str!("../reference/tools/capture-window.ps1");

struct HelperScripts {
    directory: PathBuf,
    runner: PathBuf,
    window: PathBuf,
}

impl HelperScripts {
    fn new() -> Result<Self, String> {
        let pid = std::process::id();
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |duration| duration.as_nanos());
        let directory = std::env::temp_dir().join(format!("vantare-hub-capture-{pid}-{nonce}"));
        fs::create_dir(&directory).map_err(|error| format!("crear scripts de captura: {error}"))?;
        Ok(Self {
            runner: directory.join("capture-process.ps1"),
            window: directory.join("capture-window.ps1"),
            directory,
        })
    }
}

impl Drop for HelperScripts {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.runner);
        let _ = fs::remove_file(&self.window);
        let _ = fs::remove_dir(&self.directory);
    }
}

pub fn run(options: Options, state: CaptureState, output: PathBuf) -> Result<(), String> {
    let pid = std::process::id();
    let scripts = HelperScripts::new()?;
    fs::write(&scripts.runner, CAPTURE_PROCESS)
        .map_err(|error| format!("escribir capturador: {error}"))?;
    fs::write(&scripts.window, CAPTURE_WINDOW)
        .map_err(|error| format!("escribir captura de ventana: {error}"))?;
    let executable = std::env::current_exe().map_err(|error| format!("ruta del Hub: {error}"))?;
    let repository = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .ok_or("raíz Git no disponible en este build")?
        .to_path_buf();
    let mut command = Command::new("powershell.exe");
    command
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&scripts.runner)
        .arg("-ProcessId")
        .arg(pid.to_string())
        .arg("-ExpectedExecutable")
        .arg(&executable)
        .arg("-OutputPath")
        .arg(&output)
        .arg("-Screen")
        .arg(&state.name)
        .arg("-CaptureScript")
        .arg(&scripts.window)
        .arg("-RepositoryRoot")
        .arg(repository)
        .stdout(Stdio::piped());
    if let Some((width, height)) = options.capture_size {
        command.args(["-Width", &width.to_string(), "-Height", &height.to_string()]);
    }
    let mut helper = command
        .spawn()
        .map_err(|error| format!("iniciar capturador PowerShell: {error}"))?;

    let Some(stdout) = helper.stdout.take() else {
        let _ = helper.kill();
        return Err("el capturador no abrió stdout".into());
    };
    let mut stdout = BufReader::new(stdout);
    let mut ready = String::new();
    let read_ready = stdout
        .read_line(&mut ready)
        .map_err(|error| format!("esperar mutex de captura: {error}"));
    if !matches!(&read_ready, Ok(count) if *count > 0 && ready.trim() == "READY") {
        let _ = helper.kill();
        let _ = helper.wait();
        return Err(match read_ready {
            Err(error) => error,
            _ => "el capturador no confirmó el mutex global".into(),
        });
    }

    let result = shell::run_with_access(
        options,
        crate::shell::navigation::Access {
            plan: crate::shell::navigation::Plan::Suite,
            capture_locks: state.locked_sections(),
            ..Default::default()
        },
    );
    if result.is_err() {
        let _ = helper.kill();
    }
    let mut helper_output = String::new();
    let output_result = stdout
        .read_to_string(&mut helper_output)
        .map_err(|error| format!("leer resultado de captura: {error}"));
    let status = helper
        .wait()
        .map_err(|error| format!("esperar capturador: {error}"));
    result?;
    output_result?;
    let status = status?;
    if !status.success() {
        return Err(format!(
            "captura {} falló; véase el log del proceso llamante: {}",
            state.name,
            helper_output.trim()
        ));
    }
    Ok(())
}
