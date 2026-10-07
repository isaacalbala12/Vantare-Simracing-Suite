use super::*;

#[cfg(all(windows, feature = "network"))]
#[test]
fn beta_data_root_child() {
    if let Some(root) = std::env::var_os("VANTARE_TEST_BETA_ROOT") {
        let native = PathBuf::from(root).join("Vantare/native");
        assert_eq!(data_root().expect("diagnostics root"), native);
        assert_eq!(
            crate::app::default_root().expect("services root"),
            native.join("services")
        );
    }
}

#[cfg(all(windows, feature = "network"))]
#[test]
fn beta_diagnostics_and_drafts_use_the_same_generation() {
    let root = root();
    let status = std::process::Command::new(std::env::current_exe().expect("test exe"))
        .args(["--exact", "diagnostics::tests::beta_data_root_child"])
        .env("VANTARE_TEST_BETA_ROOT", &root)
        .env("VANTARE_NATIVE_DATA_ROOT", &root)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .expect("child");
    assert!(status.success());
    fs::remove_dir_all(root).expect("cleanup");
}

pub(super) fn sensitive_text() -> String {
    let mut text = r"C:\Users\WindowsUser\AppData\panic C:/Users/ForwardUser/src.rs /home/LinuxUser/src.rs /Users/MacUser/src.rs MailUser@example.test eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmaXh0dXJlIn0.c2lnbmF0dXJl Bearer fixture-token-123".to_owned();
    for name in ["USERPROFILE", "HOME"] {
        if let Some(profile) = std::env::var_os(name) {
            text.push(' ');
            text.push_str(profile.to_string_lossy().as_ref());
            text.push(std::path::MAIN_SEPARATOR);
            text.push_str("source.rs");
        }
    }
    text
}
pub(super) fn assert_redacted(text: &str) {
    for fragment in [
        "WindowsUser",
        "ForwardUser",
        "LinuxUser",
        "MacUser",
        "MailUser@example.test",
        "eyJhbGciOiJIUzI1NiJ9",
        "fixture-token-123",
    ] {
        assert!(
            !text.contains(fragment),
            "no debe conservar datos de la fixture"
        );
    }
    for name in ["USERPROFILE", "HOME"] {
        if let Some(profile) = std::env::var_os(name) {
            assert!(
                !text.contains(profile.to_string_lossy().as_ref()),
                "no debe conservar el perfil real"
            );
        }
    }
    assert!(text.contains("<usuario>"));
    assert!(text.contains("<redactado>"));
}
#[test]
fn personal_data_is_removed_before_writing_a_crash() {
    let root = root();
    write_crash(&root, "core", &sensitive_text(), &sensitive_text()).expect("crash");
    let crash: Crash =
        serde_json::from_slice(&fs::read(root.join("crashes/00.json")).expect("file"))
            .expect("json");
    assert_eq!(crash.message, "native_panic");
    assert!(crash.backtrace.is_empty());
    // La limpieza histórica sigue disponible para otros consumidores locales.
    assert_redacted(&clean_paths(&sensitive_text()));
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn usage_rejects_identifiers_outside_the_closed_catalog() {
    assert!(
        !Usage::LayoutWidgets {
            widget_types: vec!["personal-layout-name".into()]
        }
        .valid()
    );
    assert!(
        !Usage::LiveSessionStarted {
            simulator: "user@email.test".into()
        }
        .valid()
    );
    assert!(serde_json::from_str::<Usage>(r#"{"event":"app_started","properties":{"version":"1.0","channel":"beta","email":"private@example.test"}}"#).is_err());
}

pub(super) fn root() -> PathBuf {
    let path = std::env::temp_dir().join(format!("vantare-posthog-{}", uuid().expect("entropy")));
    fs::create_dir_all(&path).expect("test dir");
    path
}
#[test]
fn identifier_is_uuid_v4_stable_and_shared_by_concurrent_writers() {
    let root = root();
    let handles: Vec<_> = (0..8)
        .map(|_| {
            let path = root.clone();
            std::thread::spawn(move || anonymous_id(&path).expect("id"))
        })
        .collect();
    let id = anonymous_id(&root).expect("id");
    assert!(valid_uuid(&id));
    for handle in handles {
        assert_eq!(handle.join().expect("thread"), id);
    }
    fs::write(root.join("anonymous-id"), b"not-a-license-fingerprint").expect("corrupt");
    assert_eq!(anonymous_id(&root), Err(Error::Protocol));
    fs::remove_dir_all(root).expect("cleanup");
}
#[test]
fn paths_are_cleaned_case_insensitively_without_changing_other_frames() {
    assert_eq!(clean_paths("C:/Users/Alice/a.rs"), "<usuario>/a.rs");
    assert_eq!(
        clean_paths(r"C:\Users\Alice\a.rs D:\USERS\Bob\b.rs"),
        r"<usuario>\a.rs <usuario>\b.rs"
    );
    assert_eq!(clean_paths("frame 5: core::tick"), "frame 5: core::tick");
    assert_eq!(clean_paths(r"C:\\Users\\Alice\\a.rs"), r"<usuario>\a.rs");
}
#[test]
fn usage_rejects_paths_and_tokens_before_creating_a_file() {
    let root = root();
    fs::write(root.join(PRIVACY_FILE), br#"{"crashes":true,"usage":true}"#).expect("consent");
    for usage in [
        Usage::AppStarted {
            version: r"C:\Users\fixture\version".into(),
            channel: "beta".into(),
        },
        Usage::AppStarted {
            version: "eyJfixture.payload.signature".into(),
            channel: "beta".into(),
        },
        Usage::AppStarted {
            version: "1.0.0".into(),
            channel: "/home/fixture/channel".into(),
        },
        Usage::LiveSessionStarted {
            simulator: "Bearer fixture-token".into(),
        },
        Usage::LayoutWidgets {
            widget_types: vec!["/Users/fixture/widget".into()],
        },
    ] {
        assert_eq!(enqueue_usage(&root, &usage), Err(Error::Protocol));
    }
    assert!(!root.join("usage").exists());
    fs::remove_dir_all(root).expect("cleanup");
}
#[test]
fn queue_is_bounded_and_privacy_failures_are_closed() {
    let root = root();
    assert_eq!(Privacy::load(&root).expect("defaults"), Privacy::default());
    for _ in 0..QUEUE_LIMIT {
        write_crash(&root, "core", &"é".repeat(3000), &"trace".repeat(10000))
            .expect("bounded crash");
    }
    assert_eq!(
        write_crash(&root, "core", "panic", "trace"),
        Err(Error::TooLarge)
    );
    for slot in 0..QUEUE_LIMIT {
        assert!(
            fs::metadata(root.join(format!("crashes/{slot:02}.json")))
                .expect("file")
                .len()
                <= FILE_LIMIT
        );
    }
    fs::write(root.join(PRIVACY_FILE), b"invalid").expect("invalid config");
    assert_eq!(
        write_crash(&root, "core", "panic", "trace"),
        Err(Error::Protocol)
    );
    fs::remove_dir_all(root).expect("cleanup");
}
#[test]
fn panic_child() {
    if let Some(path) = std::env::var_os("VANTARE_TEST_CRASH_ROOT") {
        install_at(PathBuf::from(path), "test-child");
        panic!("test panic C:\\Users\\test-user\\file.rs");
    }
}
#[test]
fn real_hook_writes_a_small_sanitized_crash() {
    let root = root();
    let status = std::process::Command::new(std::env::current_exe().expect("test exe"))
        .args(["--exact", "diagnostics::tests::panic_child", "--nocapture"])
        .env("VANTARE_TEST_CRASH_ROOT", &root)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .expect("child");
    assert!(!status.success());
    let bytes = read_bounded(&root.join("crashes/00.json"), FILE_LIMIT).expect("hook file");
    let crash: Crash = serde_json::from_slice(&bytes).expect("crash");
    assert_eq!(crash.binary, "native");
    assert_eq!(crash.message, "native_panic");
    assert!(!crash.message.contains("test-user"));
    assert!(crash.backtrace.is_empty());
    #[cfg(windows)]
    assert!(!crash.frames.is_empty());
    assert!(crash.timestamp > 0);
    fs::remove_dir_all(root).expect("cleanup");
}
