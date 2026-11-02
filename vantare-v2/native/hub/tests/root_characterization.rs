//! Paso 0.i: contratos de rutas con el override absoluto de la beta instalada.
#![cfg(windows)]

#[test]
fn beta_absolute_root_characterization_for_hub_overlay_services_and_engineer() {
    let base = std::path::PathBuf::from(
        std::env::var_os("VANTARE_NATIVE_DATA_ROOT").expect("override QA obligatorio"),
    );
    assert!(base.is_absolute(), "solo raíces QA absolutas");
    let native = base.join("Vantare/native");
    assert_eq!(vantare_ui::paths::default_data_dir().expect("base"), base);
    assert_eq!(
        vantare_ui::layout::default_path().expect("layout"),
        native.join("layout.json")
    );
    assert_eq!(
        vantare_hub::launcher::default_path().expect("launcher"),
        native.join("launcher.json")
    );
    assert_eq!(
        vantare_ipc::engineer_control::default_path().expect("engineer"),
        native.join("engineer.json")
    );
    assert_eq!(
        vantare_services::diagnostics::data_root().expect("privacy, recorder and sender"),
        native
    );
    assert_eq!(
        vantare_services::app::default_root().expect("services"),
        native.join("services")
    );
}

#[test]
fn common_root_dependency_rejects_missing_empty_and_relative_qa_overrides() {
    let qa = std::env::temp_dir().join("vantare-1869-common-root-guard");
    for mode in ["missing", "empty", "relative", "qa"] {
        let mut child =
            std::process::Command::new(std::env::current_exe().expect("test executable"));
        child
            .args(["--exact", "common_root_guard_child", "--nocapture"])
            .env("VANTARE_1869_COMMON_ROOT_GUARD", mode)
            .env("LOCALAPPDATA", &qa)
            .env("XDG_DATA_HOME", &qa)
            .env("HOME", &qa);
        match mode {
            "missing" => {
                child.env_remove("VANTARE_NATIVE_DATA_ROOT");
            }
            "empty" => {
                child.env("VANTARE_NATIVE_DATA_ROOT", "");
            }
            "relative" => {
                child.env("VANTARE_NATIVE_DATA_ROOT", "relative-qa");
            }
            _ => {
                child.env("VANTARE_NATIVE_DATA_ROOT", &qa);
            }
        }
        let output = child.output().expect("QA subprocess");
        assert!(
            output.status.success(),
            "{mode}: {}",
            String::from_utf8_lossy(&output.stdout)
        );
    }
}

#[test]
fn common_root_guard_child() {
    let Ok(mode) = std::env::var("VANTARE_1869_COMMON_ROOT_GUARD") else {
        return;
    };
    if mode == "qa" {
        let root = vantare_ipc::paths::Root::from_env().expect("QA root");
        assert_eq!(
            root.native(),
            vantare_services::diagnostics::data_root().expect("diagnostics")
        );
    } else {
        assert_eq!(
            vantare_ipc::paths::Root::from_env(),
            Err(vantare_ipc::paths::Error::QaOverrideRequired)
        );
        assert!(vantare_services::diagnostics::data_root().is_err());
    }
}
