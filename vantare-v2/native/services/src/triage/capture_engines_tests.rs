//! Ejecuta el script real con procesos y hardware simulados; no consulta el PC.
use super::run_process;
use std::os::windows::process::CommandExt;
use std::{
    process::Command,
    time::{Duration, Instant},
};

const MOCKS: &str = r#"
function Get-CimInstance {
    param([string]$ClassName)
    [pscustomobject]@{Caption='fixture';Version='1';BuildNumber='1';Name='fixture';NumberOfCores=1;TotalVisibleMemorySize=1048576;DriverVersion='1'}
}

function Get-Process {
    param([string[]]$Name)
    foreach ($item in $Name) {
        if (($env:VANTARE_TEST_RUNNING -split ',') -contains $item) { [pscustomobject]@{Name=$item} }
    }
}

"#;

#[test]
fn capture_recognizes_either_engine_and_deduplicates_vantare_when_both_run() {
    let script = format!("{MOCKS}{}", include_str!("capture.ps1"));
    for running in [
        "",
        "vantare-overlays",
        "vantare-overlays-rune",
        "vantare-overlays,vantare-overlays-rune",
    ] {
        let mut command = Command::new("powershell.exe");
        command
            .args(["-NoProfile", "-NonInteractive", "-Command", "-"])
            .env("VANTARE_TRIAGE_SYSTEM", "1")
            .env("VANTARE_TEST_RUNNING", running)
            .creation_flags(0x0800_0000);
        let began = Instant::now();
        let output = run_process(
            &mut command,
            script.as_bytes(),
            Duration::from_secs(15),
            || began.elapsed(),
        )
        .unwrap();
        let document: serde_json::Value = serde_json::from_slice(&output).unwrap();
        let expected = if running.is_empty() {
            serde_json::json!([])
        } else {
            serde_json::json!(["Vantare"])
        };
        assert_eq!(document["system"]["overlays_active"], expected, "{running}");
        assert_eq!(document["game"], "none");
    }
}
