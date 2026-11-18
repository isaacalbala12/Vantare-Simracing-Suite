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
    use ed25519_dalek::{Signer, SigningKey};
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
    use vantare_services::{
        Error,
        license::{Capability, ClaimsV1, CredentialV1},
        storage::Store,
    };

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

    const TRANSFER_DEVICE: &str =
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const TRUST_REGISTRY: &str = "VANTARE_LICENSE_PUBLIC_KEYS";

    fn sign_args(private: &Path, out: &Path) -> [OsString; 7] {
        [
            "sign".into(),
            "--key".into(),
            private.into(),
            "--fingerprint".into(),
            TRANSFER_DEVICE.into(),
            "--out".into(),
            out.into(),
        ]
    }

    fn sign_transfer(
        private: &Path,
        out: &Path,
        env: impl Fn(&str) -> Option<OsString>,
    ) -> cli::Result<Option<String>> {
        cli::run(
            &sign_args(private, out),
            env,
            || unreachable!("sign uses only the requested fingerprint"),
            now,
        )
    }

    fn transfer_args(credential: &Path, root: &Path) -> [OsString; 5] {
        [
            "install-credential".into(),
            "--credential".into(),
            credential.into(),
            "--qa-root".into(),
            root.into(),
        ]
    }

    fn install_transfer(
        credential: &Path,
        root: &Path,
        registry: Option<&str>,
        device: &str,
        clock: DateTime<Utc>,
    ) -> cli::Result<Option<String>> {
        cli::run(
            &transfer_args(credential, root),
            |name| {
                if name == TRUST_REGISTRY {
                    registry.map(Into::into)
                } else {
                    None
                }
            },
            || Ok(device.into()),
            || clock,
        )
    }

    #[test]
    fn fingerprint_only_reports_the_local_value() {
        let fixture = Fixture::new();
        let value = cli::run(
            &["fingerprint".into()],
            |_| None,
            || Ok(TRANSFER_DEVICE.into()),
            || unreachable!("fingerprint does not need a clock"),
        )
        .expect("read-only fingerprint");
        assert_eq!(value.as_deref(), Some(TRANSFER_DEVICE));
        assert_eq!(fs::read_dir(&fixture.0).expect("empty fixture").count(), 0);
    }

    #[test]
    fn sign_uses_the_requested_fingerprint_and_limits_validity() {
        let fixture = Fixture::new();
        let (public, private) = fixture.keygen();
        let out = fixture.0.join("credential.json");
        assert!(
            sign_transfer(&private, &out, |_| None)
                .expect("sign")
                .is_none()
        );
        let encoded = fs::read_to_string(&out).expect("signed credential");
        let credential: CredentialV1 = serde_json::from_str(&encoded).expect("credential JSON");
        let verifier = Verifier::public_keys(&public).expect("QA key");
        let subject = &credential.claims.subject;
        assert!(verifier.v1(&credential, subject, TRANSFER_DEVICE).is_ok());
        assert!(matches!(
            verifier.v1(&credential, subject, DEVICE),
            Err(Error::InvalidCredential)
        ));
        let [grant] = credential.claims.capabilities.as_slice() else {
            panic!("one Owner grant")
        };
        assert_eq!(grant.key, OWNER);
        assert!(!grant.perpetual);
        assert_eq!(
            grant.paid_through,
            (now() + TimeDelta::hours(24)).to_rfc3339()
        );
        assert!(sign_transfer(&private, &out, |_| None).is_err());
        assert_eq!(
            fs::read_to_string(&out).expect("unchanged credential"),
            encoded
        );
    }

    #[test]
    fn sign_refuses_git_private_and_real_output_paths() {
        let fixture = Fixture::new();
        let (_, private) = fixture.keygen();
        let git = fixture.0.join("worktree");
        let nested = git.join("nested");
        fs::create_dir_all(&nested).expect("repository fixture");
        fs::write(git.join(".git"), "gitdir: elsewhere").expect("worktree marker");
        let private_parent = private.parent().expect("private key directory");
        let prohibited = private_parent.join("nested");
        fs::create_dir(&prohibited).expect("nested private directory");
        for out in [
            nested.join("credential.json"),
            prohibited.join("credential.json"),
        ] {
            assert!(sign_transfer(&private, &out, |_| None).is_err());
            assert!(!out.exists());
        }
        for variable in ["LOCALAPPDATA", "APPDATA", "VANTARE_NATIVE_DATA_ROOT"] {
            let real = fixture.0.join(variable);
            fs::create_dir(&real).expect("real root fixture");
            let out = real.join("credential.json");
            assert!(
                sign_transfer(&private, &out, |name| (name == variable)
                    .then(|| real.clone().into_os_string()))
                .is_err()
            );
            assert!(!out.exists());
        }
    }

    #[test]
    fn credential_install_checks_signature_device_and_expiry_without_private_key() {
        let fixture = Fixture::new();
        let (public, private) = fixture.keygen();
        let credential = fixture.0.join("credential.json");
        sign_transfer(&private, &credential, |_| None).expect("sign transfer");
        fs::remove_file(&private).expect("private key unavailable on the receiving PC");
        let root = fixture.0.join("qa-core");
        let (id, _) = public.split_once(':').expect("QA registry");
        let other = format!("{id}:{}", different_public());
        for (registry, device, clock) in [
            (Some(public.as_str()), DEVICE, now()),
            (Some(other.as_str()), TRANSFER_DEVICE, now()),
            (
                Some(public.as_str()),
                TRANSFER_DEVICE,
                now() + TimeDelta::hours(24),
            ),
            (None, TRANSFER_DEVICE, now()),
        ] {
            assert!(install_transfer(&credential, &root, registry, device, clock).is_err());
            assert!(
                !root.exists(),
                "invalid credential must be rejected before touching the profile"
            );
        }
        let mut args = transfer_args(&credential, &root).to_vec();
        args.extend([OsString::from("--key"), private.into_os_string()]);
        assert!(
            cli::run(
                &args,
                |name| (name == TRUST_REGISTRY).then(|| public.clone().into()),
                || unreachable!("unexpected --key must be rejected before installation"),
                now
            )
            .is_err()
        );
        assert!(!root.exists());
        assert!(
            install_transfer(&credential, &root, Some(&public), TRANSFER_DEVICE, now())
                .expect("install signed credential without private key")
                .is_none()
        );
        let binding = Owner::open(
            &root.join("Vantare/native/rights/nightly"),
            Some(&public),
            Devices {
                legacy: TRANSFER_DEVICE.into(),
            },
            2,
            now(),
        )
        .expect("reopen transfer binding");
        assert!(binding.account_generation().is_some());
    }

    fn transfer_template() -> (SigningKey, CredentialV1) {
        let mut seed = [0; 32];
        getrandom::fill(&mut seed).expect("ephemeral signing key");
        let key = SigningKey::from_bytes(&seed);
        let credential = CredentialV1 {
            version: 1,
            algorithm: "Ed25519".into(),
            key_id: "qa-a1b2c3d4".into(),
            claims: ClaimsV1 {
                issuer: "vantare-license".into(),
                subject: "5a5a5a5a-0000-4000-8000-51414c494345".into(),
                device_fingerprint: TRANSFER_DEVICE.into(),
                issued_at: now().to_rfc3339(),
                capabilities: vec![Capability {
                    key: OWNER.into(),
                    paid_through: (now() + TimeDelta::hours(24)).to_rfc3339(),
                    perpetual: false,
                    scope_version: String::new(),
                }],
            },
            signature: String::new(),
        };
        (key, credential)
    }

    fn write_transfer(path: &Path, key: &SigningKey, mut credential: CredentialV1) -> String {
        credential.signature = URL_SAFE_NO_PAD.encode(
            key.sign(&credential.signing_bytes().expect("signable credential"))
                .to_bytes(),
        );
        fs::write(
            path,
            serde_json::to_vec(&credential).expect("credential JSON"),
        )
        .expect("save ephemeral credential");
        format!(
            "{}:{}",
            credential.key_id,
            URL_SAFE_NO_PAD.encode(key.verifying_key().as_bytes())
        )
    }

    #[test]
    fn install_rejects_out_of_range_issuance_before_creating_profile() {
        let fixture = Fixture::new();
        let (key, template) = transfer_template();
        let path = fixture.0.join("credential.json");
        let root = fixture.0.join("profile");
        for issued in [
            now() + TimeDelta::minutes(5) + TimeDelta::seconds(1),
            now() - TimeDelta::hours(24) - TimeDelta::seconds(1),
        ] {
            let mut credential = template.clone();
            credential.claims.issued_at = issued.to_rfc3339();
            credential.claims.capabilities[0].paid_through =
                (issued + TimeDelta::hours(24)).to_rfc3339();
            let registry = write_transfer(&path, &key, credential);
            let error = install_transfer(&path, &root, Some(&registry), TRANSFER_DEVICE, now())
                .expect_err("out-of-range issue time");
            assert!(
                !root.exists(),
                "rejected issue time must not create the profile"
            );
            assert!(matches!(error.downcast_ref::<Error>(), Some(Error::Clock)));
        }
    }

    #[test]
    fn install_accepts_issuance_at_future_limit_and_just_inside_past_limit() {
        let fixture = Fixture::new();
        let (key, template) = transfer_template();
        let path = fixture.0.join("credential.json");
        for (name, issued) in [
            ("future", now() + TimeDelta::minutes(5)),
            ("past", now() - TimeDelta::hours(24) + TimeDelta::seconds(1)),
        ] {
            let mut credential = template.clone();
            credential.claims.issued_at = issued.to_rfc3339();
            credential.claims.capabilities[0].paid_through =
                (issued + TimeDelta::hours(24)).to_rfc3339();
            let registry = write_transfer(&path, &key, credential);
            install_transfer(
                &path,
                &fixture.0.join(name),
                Some(&registry),
                TRANSFER_DEVICE,
                now(),
            )
            .expect("valid signed credential within issue time limits");
        }
    }

    #[test]
    fn rejected_credential_claims_leave_qa_profiles_untouched() {
        let fixture = Fixture::new();
        let (key, template) = transfer_template();
        let path = fixture.0.join("credential.json");
        let missing = fixture.0.join("missing");
        let marked = fixture.0.join("marked");
        fs::create_dir(&marked).expect("marker-only profile");
        let marker = marked.join(".vantare-qa-license");
        let marker_bytes = b"vantare-qa-license-v1";
        fs::write(&marker, marker_bytes).expect("write marker");

        let mut wrong_subject = template.clone();
        wrong_subject.claims.subject = "11111111-2222-4333-8444-555555555555".into();
        let mut wrong_id = template.clone();
        wrong_id.key_id = "production-fixture".into();
        let mut too_long = template.clone();
        too_long.claims.capabilities[0].paid_through =
            (now() + TimeDelta::hours(24) + TimeDelta::seconds(1)).to_rfc3339();
        let mut perpetual = template.clone();
        perpetual.claims.capabilities[0].perpetual = true;
        perpetual.claims.capabilities[0].paid_through.clear();
        let mut extra = template;
        let mut grant = extra.claims.capabilities[0].clone();
        grant.key = "vantare.plan.pro".into();
        extra.claims.capabilities.push(grant);

        for (name, credential) in [
            ("non-QA subject", wrong_subject),
            ("non-QA key ID", wrong_id),
            ("validity over 24 hours", too_long),
            ("perpetual Owner", perpetual),
            ("extra capability", extra),
        ] {
            let registry = write_transfer(&path, &key, credential);
            for root in [&missing, &marked] {
                assert!(
                    install_transfer(&path, root, Some(&registry), TRANSFER_DEVICE, now()).is_err(),
                    "{name}"
                );
            }
            assert!(!missing.exists(), "{name} created the profile");
            assert_eq!(
                fs::read_dir(&marked)
                    .expect("inspect marked profile")
                    .count(),
                1,
                "{name} changed the profile"
            );
            assert_eq!(
                fs::read(&marker).expect("marker intact").as_slice(),
                marker_bytes,
                "{name} changed the marker"
            );
        }
    }

    fn create_junction(link: &Path, target: &Path) {
        let dos_path = |path: &Path| {
            path.to_str()
                .expect("test path")
                .trim_start_matches(r"\\?\")
                .to_owned()
        };
        let output = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command",
                "$ErrorActionPreference='Stop'; New-Item -ItemType Junction -Path $env:VANTARE_TEST_LINK -Target $env:VANTARE_TEST_TARGET | Out-Null"])
            .env("VANTARE_TEST_LINK", dos_path(link))
            .env("VANTARE_TEST_TARGET", dos_path(target))
            .output().expect("create a Windows directory junction");
        assert!(
            output.status.success(),
            "junction creation failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(
            link.canonicalize().expect("resolve junction"),
            target.canonicalize().expect("resolve target")
        );
    }

    #[test]
    fn sign_refuses_aliases_of_git_and_private_directories() {
        let fixture = Fixture::new();
        let (_, private) = fixture.keygen();
        let git = fixture.0.join("git-repo");
        let nested = git.join("nested");
        fs::create_dir_all(git.join(".git")).expect("git directory");
        fs::create_dir(&nested).expect("nested repo directory");
        let key_dir = private.parent().expect("private key directory");
        let git_link = fixture.0.join("git-alias");
        let key_link = fixture.0.join("key-alias");
        create_junction(&git_link, &nested);
        create_junction(&key_link, key_dir);
        let mixed_case = PathBuf::from(key_dir.to_str().expect("key path").to_ascii_uppercase());
        for out in [
            git_link.join("credential.json"),
            key_link.join("credential.json"),
            nested.join("credential.json"),
            mixed_case.join("credential.json"),
            key_dir.to_owned(),
        ] {
            let error = sign_transfer(&private, &out, |_| None).expect_err("protected output path");
            assert_eq!(
                error
                    .downcast_ref::<std::io::Error>()
                    .map(std::io::Error::kind),
                Some(std::io::ErrorKind::InvalidInput),
                "{}",
                out.display()
            );
        }
        assert!(!nested.join("credential.json").exists());
        assert!(!key_dir.join("credential.json").exists());
        fs::remove_dir(git_link).expect("retire git junction");
        fs::remove_dir(key_link).expect("retire key junction");
    }

    #[test]
    fn sign_requires_exact_lowercase_legacy_hex() {
        let fixture = Fixture::new();
        let (_, private) = fixture.keygen();
        let out = fixture.0.join("credential.json");
        for value in [
            "not-a-fingerprint".to_owned(),
            TRANSFER_DEVICE.to_ascii_uppercase(),
        ] {
            let mut args = sign_args(&private, &out);
            args[4] = value.into();
            assert!(
                cli::run(
                    &args,
                    |_| None,
                    || unreachable!("sign uses the supplied fingerprint"),
                    now
                )
                .is_err()
            );
            assert!(!out.exists());
        }
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
