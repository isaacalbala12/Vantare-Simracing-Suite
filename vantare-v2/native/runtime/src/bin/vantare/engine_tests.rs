//! Contrato M1: elección del ejecutable sin cambiar el motor por defecto.
use super::*;
use std::{ffi::OsStr, fs};
struct BinDir(PathBuf);
impl BinDir {
    fn new(rune: bool) -> Self {
        let mut bytes = [0; 8];
        getrandom::fill(&mut bytes).unwrap();
        let nonce = u64::from_le_bytes(bytes);
        let root = env::temp_dir().join(format!("vantare-engine-{}-{nonce:016x}", std::process::id()));
        fs::create_dir(&root).unwrap();
        fs::write(root.join(binary_name("vantare-overlays")), b"GPUI presente").unwrap();
        if rune {
            fs::write(
                root.join(binary_name("vantare-overlays-rune")),
                b"Rune presente",
            )
            .unwrap();
        }
        Self(root)
    }
    fn parse(&self, args: &[&str], environment: Option<&str>) -> Result<Config, String> {
        parse_with_engine_env(
            &args.iter().map(|s| (*s).into()).collect::<Vec<_>>(),
            &self.0,
            environment.map(OsStr::new),
        )
    }
}
impl Drop for BinDir {
    fn drop(&mut self) {
        for name in ["vantare-overlays", "vantare-overlays-rune"] {
            let _ = fs::remove_file(self.0.join(binary_name(name)));
        }
        let _ = fs::remove_dir(&self.0);
    }
}
#[test]
fn no_flag_and_no_environment_keep_gpui_as_the_only_default() {
    assert_eq!(Engine::default(), Engine::Gpui);
    let dir = BinDir::new(false);
    assert_eq!(
        dir.parse(&[], None).unwrap().overlays.path,
        dir.0.join(binary_name("vantare-overlays"))
    );
}
#[test]
fn flag_and_environment_select_the_rune_image() {
    let dir = BinDir::new(true);
    let rune = dir.0.join(binary_name("vantare-overlays-rune"));
    assert_eq!(
        dir.parse(&["--overlays-engine", "rune"], None)
            .unwrap()
            .overlays
            .path,
        rune
    );
    assert_eq!(dir.parse(&[], Some("rune")).unwrap().overlays.path, rune);
    assert_eq!(
        dir.parse(&[], Some("gpui")).unwrap().overlays.path,
        dir.0.join(binary_name("vantare-overlays"))
    );
}
#[test]
fn flag_beats_environment_in_both_directions() {
    let dir = BinDir::new(true);
    for (flag, environment, name) in [
        ("gpui", "rune", "vantare-overlays"),
        ("rune", "gpui", "vantare-overlays-rune"),
    ] {
        assert_eq!(
            dir.parse(&["--overlays-engine", flag], Some(environment))
                .unwrap()
                .overlays
                .path,
            dir.0.join(binary_name(name))
        );
    }
    assert!(
        dir.parse(&["--overlays-engine", "gpui"], Some("invalid"))
            .is_ok()
    );
}
#[test]
fn explicit_overlay_path_beats_engine_and_environment_in_either_argument_order() {
    let dir = BinDir::new(false);
    let path = dir.0.join("personalizado.exe");
    let path = path.to_str().unwrap();
    for args in [
        vec!["--overlays-bin", path, "--overlays-engine", "rune"],
        vec!["--overlays-engine", "rune", "--overlays-bin", path],
    ] {
        assert_eq!(
            dir.parse(&args, Some("rune")).unwrap().overlays.path,
            Path::new(path)
        );
    }
    assert_eq!(
        dir.parse(&["--overlays-bin", path], Some("invalid"))
            .unwrap()
            .overlays
            .path,
        Path::new(path)
    );
}
#[test]
fn unknown_engine_values_are_argument_errors() {
    let dir = BinDir::new(true);
    for value in ["", "GPUI", "Rune", "rune ", "other"] {
        let error = dir.parse(&["--overlays-engine", value], None).unwrap_err();
        assert!(error.contains("--overlays-engine"), "{error}");
        let error = dir.parse(&[], Some(value)).unwrap_err();
        assert!(error.contains("VANTARE_OVERLAYS_ENGINE"), "{error}");
    }
    assert!(
        dir.parse(&["--overlays-engine"], None)
            .unwrap_err()
            .contains("pide un valor")
    );
}
#[test]
fn missing_rune_is_an_error_even_with_gpui_present_and_never_falls_back() {
    let dir = BinDir::new(false);
    assert!(dir.0.join(binary_name("vantare-overlays")).is_file());
    for (args, environment) in [
        (vec!["--overlays-engine", "rune"], None),
        (vec![], Some("rune")),
    ] {
        let error = dir.parse(&args, environment).unwrap_err();
        assert!(error.contains("Rune"), "{error}");
        assert!(
            error.contains(
                &dir.0
                    .join(binary_name("vantare-overlays-rune"))
                    .display()
                    .to_string()
            ),
            "{error}"
        );
    }
}
#[test]
fn stopping_does_not_require_either_overlay_image() {
    let dir = BinDir::new(false);
    assert!(dir.parse(&["--parar"], Some("rune")).unwrap().stop_only);
}
#[test]
fn every_argument_after_the_separators_is_identical_with_both_engines() {
    let dir = BinDir::new(true);
    let tail = [
        "--",
        "--replay",
        "entrada con espacios.jsonl",
        "--pipe",
        "p",
        "--",
        "22",
        "--fuente",
        "pipe:p",
        "--overlays-engine",
        "sin interpretar",
        "--engineer",
        "literal",
    ];
    let mut gpui = vec!["--overlays-engine", "gpui"];
    gpui.extend(tail);
    let mut rune = vec!["--overlays-engine", "rune"];
    rune.extend(tail);
    let a = dir.parse(&gpui, None).unwrap();
    let b = dir.parse(&rune, None).unwrap();
    assert_eq!(a.core, b.core);
    assert_eq!(a.overlays.args, b.overlays.args);
    assert_eq!(
        a.overlays.args,
        tail[6..]
            .iter()
            .map(|v| (*v).to_owned())
            .collect::<Vec<_>>()
    );
}
