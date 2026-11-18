use vantare_runtime::rights::verifier::Verifier;
use vantare_services::Error;

#[test]
fn registry_reserves_qa_ids_for_opt_in_builds() {
    // Integration tests link the runtime as a normal library, without cfg(test).
    let key = "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo";
    let production = format!("production:{key}");
    assert!(Verifier::public_keys(&production).is_ok());
    for id in ["qa-a1b2c3d4", "QA-a1b2c3d4", "Qa-a1b2c3d4"] {
        let registry = format!("{production},{id}:{key}");
        let result = Verifier::public_keys(&registry);
        if cfg!(feature = "qa-license") {
            assert!(result.is_ok(), "{id}");
        } else {
            assert!(matches!(result, Err(Error::Unconfigured)), "{id}");
        }
    }
}

use std::process::Command;

#[test]
fn rejected_qa_registry_logs_once_without_key_details() {
    const CHILD: &str = "VANTARE_QA_REGISTRY_DIAGNOSTIC_CHILD";
    const KEY: &str = "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo";
    const ID: &str = "qa-a1b2c3d4";

    if std::env::var_os(CHILD).is_some() {
        let result = Verifier::public_keys(&format!("{ID}:{KEY}"));
        if cfg!(feature = "qa-license") {
            assert!(result.is_ok());
        } else {
            assert!(matches!(result, Err(Error::Unconfigured)));
        }
        return;
    }

    // Let the child write directly to stderr instead of libtest's capture.
    let output = Command::new(std::env::current_exe().expect("integration test executable"))
        .args([
            "--exact",
            "rejected_qa_registry_logs_once_without_key_details",
            "--nocapture",
        ])
        .env(CHILD, "1")
        .output()
        .expect("registry probe");
    assert!(output.status.success(), "registry probe failed");
    let stderr = std::str::from_utf8(&output.stderr).expect("UTF-8 diagnostic");
    assert!(!stderr.contains(KEY));
    assert!(!stderr.contains(ID));
    let expected: &[&str] = if cfg!(feature = "qa-license") {
        &[]
    } else {
        &["clave QA ignorada en build sin qa-license"]
    };
    assert_eq!(stderr.lines().collect::<Vec<_>>(), expected);
}

#[test]
fn qa_license_binary_requires_opt_in() {
    let manifest =
        std::env::var_os("CARGO_MANIFEST_DIR").unwrap_or_else(|| env!("CARGO_MANIFEST_DIR").into());
    let output = Command::new(env!("CARGO"))
        .current_dir(manifest)
        .args([
            "metadata",
            "--offline",
            "--no-deps",
            "--format-version",
            "1",
        ])
        .output()
        .expect("cargo metadata");
    assert!(output.status.success());
    let metadata: serde_json::Value = serde_json::from_slice(&output.stdout).expect("metadata");
    let runtime = metadata["packages"]
        .as_array()
        .expect("packages")
        .iter()
        .find(|package| package["name"] == "vantare-runtime")
        .expect("runtime package");
    let binary = runtime["targets"]
        .as_array()
        .expect("targets")
        .iter()
        .find(|target| target["name"] == "vantare-qa-license" && target["kind"][0] == "bin")
        .expect("QA binary target");
    assert_eq!(
        binary["required-features"],
        serde_json::json!(["qa-license"])
    );
    assert!(
        runtime["features"]["default"]
            .as_array()
            .is_none_or(|features| !features.iter().any(|feature| feature == "qa-license"))
    );
}

#[cfg(all(windows, feature = "qa-license"))]
mod cli {
    include!("../src/bin/vantare-qa-license/cli.rs");
}

#[cfg(all(windows, feature = "qa-license"))]
mod windows {
    use super::cli;
    use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
    use chrono::{DateTime, TimeDelta, Utc};
    use ed25519_dalek::SigningKey;
    use std::{
        ffi::OsString,
        fs,
        io::{Seek, SeekFrom, Write},
        path::{Path, PathBuf},
        time::Duration,
    };
    use vantare_domain::Snapshot;
    use vantare_ipc::control::CatalogAccess;
    use vantare_runtime::rights::{
        Devices, Owner,
        verifier::{CacheIssue, Verifier},
    };
    use vantare_services::{Error, license::CredentialV1, storage::Store};

    const DEVICE: &str = "qa-local-device";
    const OWNER: &str = "vantare.operational.owner";

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "vantare-qa-license-{}",
                vantare_services::random_id().expect("temporary path")
            ));
            fs::create_dir(&path).expect("temporary directory");
            Self(path.canonicalize().expect("absolute path"))
        }

        fn keygen(&self) -> (String, PathBuf) {
            let public = cli::run(
                &[
                    "keygen".into(),
                    "--out".into(),
                    self.0.join("keys").into_os_string(),
                ],
                |_| None,
                || unreachable!("keygen never reads the device"),
                || unreachable!("keygen does not read the clock"),
            )
            .expect("keygen")
            .expect("public registry entry");
            let (id, key) = public.split_once(':').expect("registry entry");
            assert!(id.starts_with("qa-"));
            assert_eq!(id.len(), 11);
            assert!(id[3..].bytes().all(|b| b.is_ascii_hexdigit()));
            assert_eq!(URL_SAFE_NO_PAD.decode(key).expect("public key").len(), 32);
            let private = self.0.join("keys").join(id).join("qa-license.key");
            assert!(private.is_file());
            (public, private)
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).expect("remove temporary QA profile and key");
        }
    }

    fn now() -> DateTime<Utc> {
        DateTime::from_timestamp(1_790_800_000, 0).expect("fixture time")
    }

    fn install_args(private: &Path, root: &Path) -> [OsString; 7] {
        [
            "install".into(),
            "--key".into(),
            private.into(),
            "--qa-root".into(),
            root.into(),
            "--channel".into(),
            "nightly".into(),
        ]
    }

    fn install(
        private: &Path,
        root: &Path,
        env: impl Fn(&str) -> Option<OsString>,
    ) -> cli::Result<Option<String>> {
        cli::run(&install_args(private, root), env, || Ok(DEVICE.into()), now)
    }

    fn different_public() -> String {
        let mut bytes = [0; 32];
        getrandom::fill(&mut bytes).expect("ephemeral test key");
        URL_SAFE_NO_PAD.encode(SigningKey::from_bytes(&bytes).verifying_key().as_bytes())
    }

    #[test]
    fn qa_binding_reopens_and_distribution_rejects_it() {
        let fixture = Fixture::new();
        let (public, private) = fixture.keygen();
        let root = fixture.0.join("qa-core");
        assert!(
            install(&private, &root, |_| None)
                .expect("install")
                .is_none()
        );

        let paths = vantare_ipc::paths::Root::resolve_fixture("windows", |name| {
            (name == "VANTARE_NATIVE_DATA_ROOT").then(|| root.clone().into_os_string())
        })
        .expect("production paths");
        let rights = paths.rights().join("nightly");
        let store = Store::open(&rights, "core-rights-v1").expect("production rights store");
        let binding = store
            .read::<serde_json::Value>("binding")
            .expect("binding")
            .required()
            .expect("saved binding");
        let text = binding["credential"].as_str().expect("signed credential");
        let credential: CredentialV1 =
            serde_json::from_str(text).expect("decode signed credential");
        assert_eq!(credential.claims.capabilities[0].key, OWNER);
        let subject = &credential.claims.subject;
        let verifier = Verifier::public_keys(&public).expect("QA registry");
        assert!(verifier.v1(&credential, subject, DEVICE).is_ok());
        assert!(matches!(
            verifier.v1(&credential, subject, "other-device"),
            Err(Error::InvalidCredential)
        ));

        let other = different_public();
        let wrong_signature = Verifier::public_keys(&format!("{}:{other}", credential.key_id))
            .expect("same ID, wrong signature key");
        assert!(matches!(
            wrong_signature.v1(&credential, subject, DEVICE),
            Err(Error::InvalidCredential)
        ));

        let distribution =
            Verifier::public_keys(&format!("release:{other}")).expect("distribution registry");
        assert!(matches!(
            distribution.decode_cached(text),
            Err(CacheIssue::UnknownKey)
        ));
        assert!(matches!(
            distribution.v1(&credential, subject, DEVICE),
            Err(Error::InvalidCredential)
        ));
        drop(store);

        let mut owner = Owner::open(
            &rights,
            Some(&public),
            Devices {
                legacy: DEVICE.into(),
            },
            2,
            now(),
        )
        .expect("reopen with QA trust");
        assert!(owner.account_generation().is_some());
        let deadline = now() + TimeDelta::hours(24);
        let initial = owner
            .advance_observed_session(&Snapshot::default(), None, now(), now(), Duration::ZERO)
            .expect("Owner access");
        assert!(initial.tester && initial.engineer);
        assert_eq!(initial.catalog, CatalogAccess::Pro);
        assert_eq!(
            initial.signed_until_ms,
            Some(u64::try_from(deadline.timestamp_millis()).expect("deadline"))
        );

        let expired = owner
            .advance_observed_session(
                &Snapshot::default(),
                None,
                now(),
                deadline,
                Duration::from_hours(24),
            )
            .expect("policy at paid_through");
        assert!(!expired.tester && !expired.engineer);
        assert_eq!(expired.catalog, CatalogAccess::Free);
    }

    #[test]
    fn install_refuses_real_roots_nonempty_roots_and_roots_without_marker() {
        let fixture = Fixture::new();
        let (_, private) = fixture.keygen();
        let empty = fixture.0.join("existing-empty");
        fs::create_dir(&empty).expect("empty directory");
        assert!(install(&private, &empty, |_| None).is_err());
        assert_eq!(
            fs::read_dir(&empty)
                .expect("untouched empty directory")
                .count(),
            0
        );

        let nonempty = fixture.0.join("nonempty");
        fs::create_dir(&nonempty).expect("nonempty directory");
        fs::write(nonempty.join("other-data"), b"preserve").expect("existing data");
        assert!(install(&private, &nonempty, |_| None).is_err());
        assert_eq!(
            fs::read_dir(&nonempty)
                .expect("untouched directory")
                .count(),
            1
        );

        for variable in ["LOCALAPPDATA", "APPDATA", "VANTARE_NATIVE_DATA_ROOT"] {
            let real = fixture.0.join(variable);
            assert!(
                install(&private, &real, |name| (name == variable)
                    .then(|| real.clone().into_os_string()))
                .is_err()
            );
            assert!(!real.exists());
        }

        let root = fixture.0.join("qa-core");
        assert!(
            install(&private, &root, |name| {
                (name == "VANTARE_BETA_ROOT").then(OsString::new)
            })
            .is_err()
        );
        assert!(!root.exists());
        let mut args = install_args(&private, &root).to_vec();
        args.drain(3..5);
        assert!(cli::run(&args, |_| None, || Ok(DEVICE.into()), now).is_err());
        assert!(!root.exists());

        install(&private, &root, |_| None).expect("initialize and install in a new profile");
        assert!(install(&private, &root, |_| None).is_err());
    }

    #[test]
    fn install_refuses_key_id_without_qa_prefix_before_creating_profile() {
        let fixture = Fixture::new();
        let (_, private) = fixture.keygen();
        let mut key = fs::OpenOptions::new()
            .write(true)
            .open(&private)
            .expect("ephemeral test key");
        key.seek(SeekFrom::Start(0)).expect("key ID offset");
        key.write_all(b"xx-").expect("change prefix");
        drop(key);
        let root = fixture.0.join("qa-core");
        assert!(install(&private, &root, |_| None).is_err());
        assert!(!root.exists());
    }
}
