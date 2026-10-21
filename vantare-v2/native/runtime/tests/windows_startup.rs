//! El supervisor distribuido y el núcleo no pueden crear una consola al abrirse.
#![cfg(windows)]

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
fn gui_bootstrap_returns_while_its_consoleless_engine_finishes_independently() {
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
[IO.File]::WriteAllText((Join-Path $Root 'finished'),$console.ToString())
"#;
    std::fs::write(root.join("beta.ps1"), script).expect("fixture engine");
    let status = Command::new(env!("CARGO_BIN_EXE_vantare"))
        .args(["--beta", "-Root"])
        .arg(&root)
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
    let log = std::fs::read_to_string(root.join("logs/bootstrap.log")).expect("diagnostic log");
    assert!(log.contains("bootstrap fixture stderr"));
}
