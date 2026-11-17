//! Probes CPU-only: --version returns before creating a window or device.
use std::process::Command;
use vantare_ipc::product;

#[test]
fn version_uses_the_shared_compile_time_identity() {
    let output = Command::new(env!("CARGO_BIN_EXE_vantare-overlays-rune"))
        .arg("--version")
        .env_remove("VANTARE_SIN_GRAFICOS")
        .output()
        .expect("version probe");
    assert!(output.status.success());
    assert_eq!(
        output.stdout,
        format!("Vantare Native {} ({})\n", product::VERSION, product::CHANNEL).as_bytes()
    );
    assert!(output.stderr.is_empty());
    if let Some(version) = option_env!("VANTARE_VERSION") {
        assert_eq!(product::VERSION, version);
    }
    if let Some(channel) = option_env!("VANTARE_BUILD_CHANNEL") {
        assert_eq!(product::CHANNEL, channel);
    }
}

#[test]
fn graphics_guard_wins_over_version_and_invalid_arguments() {
    for args in [vec!["--version"], vec!["--unknown-argument"]] {
        let output = Command::new(env!("CARGO_BIN_EXE_vantare-overlays-rune"))
            .args(args)
            .env("VANTARE_SIN_GRAFICOS", "1")
            .output()
            .expect("guard probe");
        assert_eq!(output.status.code(), Some(6));
        assert!(output.stdout.is_empty());
        assert!(
            String::from_utf8(output.stderr)
                .expect("UTF-8")
                .contains("GRAPHICS_DISABLED")
        );
    }
}
