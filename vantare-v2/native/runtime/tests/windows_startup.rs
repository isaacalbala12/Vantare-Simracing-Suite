//! El supervisor distribuido y el núcleo no pueden crear una consola al abrirse.
#![cfg(windows)]

#[test]
fn cli_output_does_not_panic_when_the_stdout_reader_is_already_closed() {
    use std::os::windows::io::{FromRawHandle, OwnedHandle, RawHandle};
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn CreatePipe(
            read: *mut RawHandle,
            write: *mut RawHandle,
            attributes: *const std::ffi::c_void,
            size: u32,
        ) -> i32;
    }
    for (binary, argument, stderr, expected) in [
        (env!("CARGO_BIN_EXE_vantare"), "--version", false, 0),
        (env!("CARGO_BIN_EXE_vantare-core"), "--version", false, 0),
        (env!("CARGO_BIN_EXE_vantare-grabar-lmu"), "--help", false, 0),
        (env!("CARGO_BIN_EXE_vantare"), "--invalid-option", true, 2),
        (
            env!("CARGO_BIN_EXE_vantare-core"),
            "--invalid-option",
            true,
            2,
        ),
    ] {
        let mut read = std::ptr::null_mut();
        let mut write = std::ptr::null_mut();
        // SAFETY: punteros de salida válidos; atributos nulos y tamaño por defecto.
        assert_ne!(
            unsafe { CreatePipe(&raw mut read, &raw mut write, std::ptr::null(), 0) },
            0
        );
        // SAFETY: CreatePipe acaba de entregar dos handles distintos y propios.
        let (read, write) = unsafe {
            (
                OwnedHandle::from_raw_handle(read),
                OwnedHandle::from_raw_handle(write),
            )
        };
        // Cerrar ANTES de crear el hijo: el BrokenPipe no depende del scheduler.
        drop(read);
        let mut command = Command::new(binary);
        command.arg(argument).stdin(Stdio::null());
        if stderr {
            command.stderr(Stdio::from(write));
        } else {
            command.stdout(Stdio::from(write));
        }
        let output = command
            .creation_flags(0x0800_0000)
            .output()
            .expect("CLI with a broken output pipe");
        assert_eq!(
            output.status.code(),
            Some(expected),
            "{binary} {argument}: {:?}",
            output.stderr
        );
    }
}

#[test]
fn powershell_captures_a_real_gui_executable_with_the_shared_packaging_helper() {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    let script =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../packaging/process-tests.ps1");
    let version = format!(
        "Vantare Native {} ({})",
        vantare_ipc::product::VERSION,
        vantare_ipc::product::CHANNEL
    );
    let windows = std::env::var_os("WINDIR").expect("Windows directory");
    let legacy =
        std::path::Path::new(&windows).join("System32/WindowsPowerShell/v1.0/powershell.exe");
    for host in [legacy, std::path::PathBuf::from("pwsh.exe")] {
        let output = Command::new(&host)
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(&script)
            .args([
                "-GuiExecutable",
                env!("CARGO_BIN_EXE_vantare"),
                "-ExpectedVersion",
                &version,
            ])
            .creation_flags(0x0800_0000)
            .output()
            .expect("PowerShell packaging regression");
        assert!(
            output.status.success(),
            "{}: {} {}",
            host.display(),
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }
}

#[test]
fn background_entry_points_are_windows_gui_executables() {
    for binary in [
        env!("CARGO_BIN_EXE_vantare"),
        env!("CARGO_BIN_EXE_vantare-core"),
    ] {
        let bytes = std::fs::read(binary).expect("built executable");
        let pe = u32::from_le_bytes(bytes[60..64].try_into().expect("PE offset")) as usize;
        let offset = pe + 24 + 68;
        let subsystem =
            u16::from_le_bytes(bytes[offset..offset + 2].try_into().expect("subsystem"));
        assert_eq!(subsystem, 2, "{binary} must use the Windows GUI subsystem");
    }
}

#[test]
fn bootstrap_signal_releases_its_image_and_timeout_preserves_the_guard() {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    let id = vantare_services::random_id().expect("test id");
    let root = std::env::temp_dir().join(format!("vantare-bootstrap-signal-{id}"));
    let script = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../packaging/bootstrap-signal-tests.ps1");
    let host = std::path::PathBuf::from(std::env::var_os("WINDIR").expect("Windows"))
        .join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let output = Command::new(host)
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(script)
        .arg("-EvidenceDirectory")
        .arg(root)
        .creation_flags(0x0800_0000)
        .output()
        .expect("real invisible bootstrap fixture");
    assert!(
        output.status.success(),
        "{} {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn root_capability_controls_the_actual_indicator_and_releases_the_image_guard() {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    let id = vantare_services::random_id().expect("test id");
    let root = std::env::temp_dir().join(format!("vantare-bootstrap-capability-{id}"));
    let script = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../packaging/bootstrap-capability-tests.ps1");
    let host = std::path::PathBuf::from(std::env::var_os("WINDIR").expect("Windows"))
        .join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let output = Command::new(host)
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(script)
        .arg("-GuiExecutable")
        .arg(env!("CARGO_BIN_EXE_vantare"))
        .arg("-EvidenceDirectory")
        .arg(root)
        .creation_flags(0x0800_0000)
        .output()
        .expect("real bootstrap on a private desktop");
    assert!(
        output.status.success(),
        "{} {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn gui_bootstrap_returns_while_its_hidden_engine_finishes_independently() {
    use std::{
        process::{Command, Stdio},
        time::{Duration, Instant},
    };
    let id = vantare_services::random_id().expect("test id");
    let root = std::env::temp_dir().join(format!("vantare-bootstrap-{id}"));
    std::fs::create_dir_all(&root).expect("isolated root");
    let script = r#"param([string]$Root)
Add-Type 'using System; using System.Runtime.InteropServices; public static class BootstrapConsole { [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow(); }'
$console=[BootstrapConsole]::GetConsoleWindow().ToInt64()
[Console]::Error.WriteLine('bootstrap fixture stderr')
[IO.File]::WriteAllText((Join-Path $Root 'startup-environment'),(@{
    window=$env:VANTARE_STARTUP_WINDOW;pid=$env:VANTARE_STARTUP_PID
    interactive=$env:VANTARE_INTERACTIVE_STARTUP;background=$env:VANTARE_BACKGROUND_STARTUP
} | ConvertTo-Json))
[IO.File]::WriteAllText((Join-Path $Root 'finished'),$console.ToString())
"#;
    std::fs::write(root.join("beta.ps1"), script).expect("fixture engine");
    let status = Command::new(env!("CARGO_BIN_EXE_vantare"))
        .args(["--beta", "-Root"])
        .arg(&root)
        .arg("--background")
        .env("VANTARE_STARTUP_WINDOW", "42")
        .env("VANTARE_STARTUP_PID", "42")
        .env("VANTARE_INTERACTIVE_STARTUP", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .expect("GUI bootstrap");
    assert!(status.success());
    // El marcador sincroniza el motor independiente. El límite evita colgar la suite
    // si el bootstrap termina sin crear el motor o este falla al cargar PowerShell.
    let deadline = Instant::now() + Duration::from_secs(15);
    let console = loop {
        if let Ok(console) = std::fs::read_to_string(root.join("finished")) {
            break console;
        }
        assert!(
            Instant::now() < deadline,
            "independent engine never completed"
        );
        std::thread::sleep(Duration::from_millis(20));
    };
    assert_eq!(console, "0", "the engine must have no console window");
    let environment: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(root.join("startup-environment")).unwrap())
            .unwrap();
    assert_eq!(environment["background"], "1");
    for field in ["window", "pid", "interactive"] {
        assert!(environment[field].is_null(), "background inherited {field}");
    }
    let log = std::fs::read_to_string(root.join("logs/bootstrap.log")).expect("diagnostic log");
    assert!(log.contains("bootstrap fixture stderr"));
}

#[test]
fn bootstrap_validation_and_missing_windows_host_are_logged() {
    use std::process::Command;
    for missing_windows in [false, true] {
        let id = vantare_services::random_id().expect("test id");
        let root = std::env::temp_dir().join(format!("vantare-bootstrap-error-{id}"));
        let mut command = Command::new(env!("CARGO_BIN_EXE_vantare"));
        command
            .args([
                "--beta",
                if missing_windows {
                    "-Root"
                } else {
                    "--wrong-root-flag"
                },
            ])
            .arg(&root)
            .arg("--background");
        if missing_windows {
            command.env_remove("WINDIR");
        }
        let output = command.output().expect("invalid bootstrap");
        assert!(!output.status.success());
        let log = std::fs::read_to_string(root.join("logs/bootstrap.log"))
            .expect("failure logged without a console");
        assert!(log.contains("bootstrap:"));
    }
}
