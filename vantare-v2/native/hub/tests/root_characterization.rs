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
