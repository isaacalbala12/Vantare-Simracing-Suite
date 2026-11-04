//! QA-only root launcher probe; never included in the release inventory.
fn main() {
    let marker = std::path::PathBuf::from(
        std::env::var_os("VANTARE_STEP10_LAUNCH_PROBE").expect("probe marker"),
    );
    vantare_installer::engine::context::qa_path(&marker).expect("QA guard");
    let root = marker.parent().expect("QA marker").join("root");
    let args: Vec<_> = std::env::args().skip(1).collect();
    assert_eq!(args.len(), 3);
    assert_eq!(&args[..2], ["--root", "-Root"]);
    assert_eq!(
        std::path::Path::new(&args[2])
            .canonicalize()
            .expect("root argument"),
        root.canonicalize().expect("QA root")
    );
    assert_eq!(
        vantare_hub::canonical_executable(&std::env::current_dir().expect("current directory"))
            .expect("current directory"),
        vantare_hub::canonical_executable(&root).expect("QA root")
    );
    assert_eq!(std::env::var("VANTARE_HUB_REDIRECTED").as_deref(), Ok("1"));
    for name in [
        "VANTARE_NATIVE_DATA_ROOT",
        "VANTARE_BOOT_TOKEN",
        "VANTARE_BETA_ROOT",
        "VANTARE_APPEARANCE_FILE",
        "VANTARE_BACKGROUND_STARTUP",
        "VANTARE_INTERACTIVE_STARTUP",
    ] {
        assert!(std::env::var_os(name).is_none(), "inherited {name}");
    }
    std::fs::write(marker, b"started").expect("launcher probe");
}
