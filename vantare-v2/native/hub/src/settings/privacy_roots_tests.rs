//! Paso 0.ii: argumentos de la beta y decisión leída por el grabador/emisor.
use super::*;

fn qa() -> PathBuf {
    std::env::temp_dir().join(format!(
        "vantare-1869-privacy-{}",
        vantare_services::random_id().expect("QA id")
    ))
}

#[test]
fn hub_test_dependency_rejects_missing_override_and_accepts_explicit_qa_root() {
    let root = qa();
    for mode in ["missing", "qa"] {
        let mut child =
            std::process::Command::new(std::env::current_exe().expect("test executable"));
        child
            .args([
                "--exact",
                "shell::settings::privacy::roots_tests::root_guard_child",
                "--nocapture",
            ])
            .env("VANTARE_1869_ROOT_TEST", mode)
            // Incluso un guard roto solo resolvería este fallback QA; no se escribe nada.
            .env("LOCALAPPDATA", &root)
            .env("HOME", &root)
            .env("XDG_DATA_HOME", &root);
        if mode == "missing" {
            child.env_remove("VANTARE_NATIVE_DATA_ROOT");
        } else {
            child.env("VANTARE_NATIVE_DATA_ROOT", &root);
        }
        let output = child.output().expect("isolated child");
        assert!(
            output.status.success(),
            "{mode}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    assert!(!root.exists(), "root resolution performs no writes");
}

#[test]
fn root_guard_child() {
    let Ok(mode) = std::env::var("VANTARE_1869_ROOT_TEST") else {
        return;
    };
    // Services es aquí una dependencia, sin cfg(test): exige la feature test-support.
    if mode == "missing" {
        assert!(matches!(
            vantare_services::diagnostics::data_root(),
            Err(vantare_services::Error::Storage)
        ));
    } else {
        let expected =
            PathBuf::from(std::env::var_os("VANTARE_NATIVE_DATA_ROOT").expect("QA override"));
        assert_eq!(
            vantare_services::diagnostics::data_root().expect("QA root"),
            expected.join("Vantare/native")
        );
    }
}

// Fixtures producidas por el Store actual, incluida una revocación (generation=1).
fn choice_at(root: &Path, allowed: bool) -> (Privacy, Vec<u8>) {
    let mut store = Store::load(root).expect("fixture store");
    store
        .save(Privacy {
            crashes: true,
            usage: true,
            crashes_decided: true,
            usage_decided: true,
            ..Privacy::default()
        })
        .expect("accept");
    if !allowed {
        let mut next = store.value;
        next.crashes = false;
        next.usage = false;
        store.save(next).expect("revoke");
    }
    (
        store.value,
        std::fs::read(root.join(PRIVACY_FILE)).expect("fixture bytes"),
    )
}

#[test]
fn hub_only_choice_is_adopted_byte_for_byte_once_without_touching_the_original() {
    for allowed in [false, true] {
        let qa = qa();
        let hub = qa.join("data/hub");
        let shared = qa.join("data/Vantare/native");
        let (choice, original) = choice_at(&hub, allowed);
        assert_eq!(adopt(&hub, shared.clone()).expect("adopt"), shared);
        assert_eq!(Store::load(&shared).expect("shared restart").value, choice);
        assert_eq!(
            std::fs::read(shared.join(PRIVACY_FILE)).expect("adopted bytes"),
            original
        );
        assert_eq!(
            std::fs::read(hub.join(PRIVACY_FILE)).expect("original"),
            original
        );
        adopt(&hub, shared.clone()).expect("idempotent restart");
        assert_eq!(
            std::fs::read(shared.join(PRIVACY_FILE)).expect("same bytes"),
            original
        );
        std::fs::remove_dir_all(qa).expect("QA cleanup");
    }
}

#[test]
fn shared_revocation_wins_over_an_old_hub_acceptance_without_rewriting_either() {
    let qa = qa();
    let hub = qa.join("hub");
    let shared = qa.join("Vantare/native");
    let (_, hub_bytes) = choice_at(&hub, true);
    let (revoked, shared_bytes) = choice_at(&shared, false);
    assert_eq!(revoked.generation, 1);
    adopt(&hub, shared.clone()).expect("shared wins");
    assert_eq!(
        Store::load(&shared).expect("shared decision").value,
        revoked
    );
    assert_eq!(
        std::fs::read(hub.join(PRIVACY_FILE)).expect("Hub bytes"),
        hub_bytes
    );
    assert_eq!(
        std::fs::read(shared.join(PRIVACY_FILE)).expect("shared bytes"),
        shared_bytes
    );
    std::fs::remove_dir_all(qa).expect("QA cleanup");
}

#[test]
fn no_saved_choice_keeps_both_permissions_disabled_and_does_not_invent_a_document() {
    let qa = qa();
    let hub = qa.join("hub");
    let shared = qa.join("Vantare/native");
    adopt(&hub, shared.clone()).expect("no migration");
    assert_eq!(
        Store::load(&shared).expect("no choice").value,
        Privacy::default()
    );
    assert!(!shared.join(PRIVACY_FILE).exists());
    assert!(!hub.exists());
    std::fs::remove_dir_all(qa).expect("QA cleanup");
}

#[test]
fn malformed_or_oversized_hub_copy_never_creates_a_shared_choice() {
    for bytes in [b"invalid".to_vec(), vec![b'x'; 1025]] {
        let qa = qa();
        let hub = qa.join("hub");
        let shared = qa.join("Vantare/native");
        std::fs::create_dir_all(&hub).expect("QA root");
        std::fs::write(hub.join(PRIVACY_FILE), &bytes).expect("bad copy");
        assert!(adopt(&hub, shared.clone()).is_err());
        assert!(!shared.join(PRIVACY_FILE).exists());
        assert_eq!(
            std::fs::read(hub.join(PRIVACY_FILE)).expect("original"),
            bytes
        );
        std::fs::remove_dir_all(qa).expect("QA cleanup");
    }
}

#[test]
fn adopting_a_legacy_implicit_yes_does_not_grant_consent() {
    let qa = qa();
    let hub = qa.join("hub");
    let shared = qa.join("Vantare/native");
    let legacy = br#"{"crashes":true,"usage":true}"#;
    std::fs::create_dir_all(&hub).expect("QA root");
    std::fs::write(hub.join(PRIVACY_FILE), legacy).expect("legacy fixture");
    adopt(&hub, shared.clone()).expect("adopt legacy bytes");
    assert_eq!(
        Store::load(&shared).expect("legacy decision").value,
        Privacy::default()
    );
    assert_eq!(
        std::fs::read(hub.join(PRIVACY_FILE)).expect("original"),
        legacy
    );
    assert_eq!(
        std::fs::read(shared.join(PRIVACY_FILE)).expect("adopted"),
        legacy
    );
    std::fs::remove_dir_all(qa).expect("QA cleanup");
}

#[test]
fn capture_loads_only_its_explicit_qa_privacy_root() {
    let qa = qa();
    let (choice, _) = choice_at(&qa, true);
    let store = load(&qa, true).expect("isolated capture");
    assert_eq!(store.path, qa.join(PRIVACY_FILE));
    assert_eq!(store.value, choice);
    drop(store);
    std::fs::remove_dir_all(qa).expect("QA cleanup");
}

#[test]
fn beta_privacy_choice_characterization() {
    let qa = std::env::temp_dir().join(format!(
        "vantare-1869-privacy-{}",
        vantare_services::random_id().expect("QA id")
    ));
    // beta.ps1: DATA_ROOT=<generation>/data, --data-dir=<generation>/data/hub.
    let base = qa.join("data");
    let hub = base.join("hub");
    let shared = base.join("Vantare/native");
    let selected = adopt(&hub, shared.clone()).expect("shared privacy root");
    let mut store = Store::load(&selected).expect("Hub");
    let choice = Privacy {
        crashes: true,
        usage: true,
        crashes_decided: true,
        usage_decided: true,
        ..Privacy::default()
    };
    store.save(choice).expect("explicit choice");
    assert_eq!(Privacy::load(&selected).expect("Hub restart"), choice);
    // Regresión P1: los lectores reales usan diagnostics::data_root().
    assert_eq!(Privacy::load(&shared).expect("recorder/sender"), choice);
    drop(store);
    std::fs::remove_dir_all(qa).expect("QA cleanup");
}
