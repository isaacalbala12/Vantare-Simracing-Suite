//! El parse real recibe el entorno heredado por session y registra el fallo
//! antes de arrancar núcleo/overlays. No se ejecuta ningún motor gráfico.
use std::{env, fs, path::PathBuf, process::Command};
struct Sandbox(PathBuf);
impl Drop for Sandbox {
    fn drop(&mut self) {
        for name in ["vantare", "vantare-overlays"] {
            let _ = fs::remove_file(self.0.join(format!("{name}{}", env::consts::EXE_SUFFIX)));
        }
        let _ = fs::remove_dir(&self.0);
    }
}
#[test]
fn inherited_rune_environment_reaches_parse_and_missing_image_is_logged_without_fallback() {
    let mut bytes = [0; 8];
    getrandom::fill(&mut bytes).unwrap();
    let nonce = u64::from_le_bytes(bytes);
    let sandbox = Sandbox(env::temp_dir().join(format!(
        "vantare-engine-process-{}-{nonce:016x}",
        std::process::id()
    )));
    fs::create_dir(&sandbox.0).unwrap();
    let launcher = sandbox
        .0
        .join(format!("vantare{}", env::consts::EXE_SUFFIX));
    fs::copy(env!("CARGO_BIN_EXE_vantare"), &launcher).unwrap();
    fs::write(
        sandbox
            .0
            .join(format!("vantare-overlays{}", env::consts::EXE_SUFFIX)),
        b"GPUI presente",
    )
    .unwrap();
    for flag in [false, true] {
        let mut command = Command::new(&launcher);
        command
            .env("VANTARE_SIN_GRAFICOS", "1")
            .env("VANTARE_OVERLAYS_ENGINE", "rune");
        if flag {
            command.args(["--overlays-engine", "rune"]);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }
        let output = command.output().unwrap();
        assert_eq!(output.status.code(), Some(2));
        let stderr = String::from_utf8(output.stderr).unwrap();
        assert!(stderr.contains("Rune"), "{stderr}");
        assert!(
            stderr.contains(
                &sandbox
                    .0
                    .join(format!("vantare-overlays-rune{}", env::consts::EXE_SUFFIX))
                    .display()
                    .to_string()
            ),
            "{stderr}"
        );
        assert!(
            !stderr.contains("en marcha"),
            "no debe arrancar hijos: {stderr}"
        );
    }
}
