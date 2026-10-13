use std::{ffi::OsString, path::PathBuf};
use vantare_installer::{
    args::Args,
    model::{Info, Mode, error_text, version},
};

fn parse(values: &[&str], uninstall: bool) -> Result<Args, String> {
    Args::parse(values.iter().map(OsString::from), uninstall)
}

#[test]
fn silent_and_unicode_roots_preserve_the_entire_path() {
    let args = parse(&["/S", "/D=C:\\tmp\\QA instalación con espacios"], false).expect("arguments");
    assert!(args.silent);
    assert_eq!(
        args.root,
        Some(PathBuf::from("C:\\tmp\\QA instalación con espacios"))
    );
    assert!(!parse(&[], false).expect("defaults").silent);
}
#[test]
fn invalid_arguments_cannot_select_another_operation_or_identity() {
    for values in [
        &["/D="][..],
        &["/D=C:/qa", "/D=C:/other"],
        &["_?=C:/qa"],
        &["--qa"],
        &["/s"],
    ] {
        assert!(parse(values, false).is_err());
    }
    assert_eq!(
        parse(&["/S", "_?=C:/qa"], true)
            .expect("legacy uninstaller")
            .root,
        Some(PathBuf::from("C:/qa"))
    );
}
#[test]
fn repair_requires_the_exact_version_and_update_requires_a_newer_payload() {
    let mut info = Info {
        root: "C:/qa".into(),
        version: "0.0.977".into(),
        installed_version: Some("0.0.976".into()),
        data_path: "C:/qa/data".into(),
        desktop: true,
        autostart: false,
        size: 1,
        reduced_motion: false,
    };
    assert!(info.allows(Mode::Update));
    assert!(!info.allows(Mode::Repair));
    info.installed_version = Some(info.version.clone());
    assert!(info.allows(Mode::Repair));
    assert!(!info.allows(Mode::Update));
    info.installed_version = Some("0.0.978".into());
    assert!(!info.allows(Mode::Repair));
    assert!(!info.allows(Mode::Update));
}
#[test]
fn invalid_versions_and_typed_errors_are_not_confused() {
    for value in ["01.0.0", "65536.0.0", "0.0", "0.0.1-beta", "0.0.0.0"] {
        assert!(version(value).is_err());
    }
    assert_ne!(error_text(2), error_text(3));
    assert_ne!(error_text(3), error_text(4));
}
