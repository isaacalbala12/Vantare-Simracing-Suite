//! Synthetic on-disk compatibility probe. Run only inside the script-owned fixture root.
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signer, SigningKey};
use std::{path::PathBuf, time::Duration};
use vantare_runtime::rights::{Devices, Owner};
use vantare_services::storage::Read as Stored;
use vantare_services::{
    account::{Account, OAuth},
    license::{Capability, ClaimsV1, CredentialV1},
    storage::Store,
};

#[derive(serde::Serialize)]
struct Payload<'a> {
    version: u8,
    algorithm: &'a str,
    key_id: &'a str,
    claims: &'a ClaimsV1,
}

fn main() {
    let args: Vec<_> = std::env::args().collect();
    assert_eq!(
        args.len(),
        4,
        "mode, isolated fixture root, account expectation"
    );
    let root = PathBuf::from(&args[2]);
    assert_eq!(
        std::fs::read(root.join("license-fixture-owned")).expect("owned fixture"),
        b"isa1827-p8"
    );
    let now = "2026-11-01T04:00:00Z"
        .parse::<chrono::DateTime<chrono::Utc>>()
        .expect("clock");
    let key = SigningKey::from_bytes(&[43; 32]); // Public, synthetic fixture seed; never a product key.
    let keys = format!(
        "fixture:{}",
        URL_SAFE_NO_PAD.encode(key.verifying_key().as_bytes())
    );
    let device =
        vantare_services::license::installation::legacy_fingerprint().expect("fixture machine");
    let devices = Devices {
        legacy: device.clone(),
    };
    let mut owner = Owner::open(&root.join("rights"), Some(&keys), devices, 11, now)
        .expect("generation opens durable data");
    if args[1] == "write" {
        let credential = signed_for("550e8400-e29b-41d4-a716-446655440000", &device);
        owner
            .install_online(
                serde_json::to_string(&credential).expect("credential"),
                now,
                Duration::ZERO,
            )
            .expect("durable online installation");
    } else {
        assert!(matches!(args[1].as_str(), "read" | "write-empty"));
    }
    let policy = owner
        .advance(&vantare_domain::Snapshot::default(), now, Duration::ZERO)
        .expect("policy");
    assert_eq!(
        policy.catalog,
        if args[3] == "empty" {
            vantare_ipc::control::CatalogAccess::Free
        } else {
            vantare_ipc::control::CatalogAccess::Pro
        },
        "rights survive across generations"
    );
    if args[1] == "write-empty" {
        retire_old_b_fixture(&root, &keys, &device);
    }
    let store =
        Store::open(&root.join("account"), "rollback-fixture-account-v1").expect("account store");
    let oauth: OAuth = serde_json::from_value(serde_json::json!({"issuer":"http://127.0.0.1:1/", "client_id":"fixture",
        "redirect":"http://127.0.0.1:0/callback", "authorization":"http://127.0.0.1:1/authorize", "token":"http://127.0.0.1:1/token", "userinfo":"http://127.0.0.1:1/userinfo"})).expect("public fixture OAuth");
    if args[1] == "write" {
        store.save("account", &serde_json::json!({"state":args[3],"version":1,"session":{"identity":{"issuer":"http://127.0.0.1:1/","subject":"fixture-user"},
            "client_id":"fixture","access":"fixture-access","refresh":"fixture-refresh","expires_at":9_999_999_999_u64}})).expect("fixture account");
    }
    let account =
        Account::restore(oauth, &store).expect("generation restores or archives unknown account");
    assert_eq!(
        account.identity().is_some(),
        args[3] != "absent" && args[3] != "empty",
        "expected session compatibility"
    );
    assert_eq!(
        account.refresh().is_ok(),
        args[3] == "SignedIn",
        "NeedsSignIn keeps identity but cannot reuse rejected tokens; absent has no refresh"
    );
    assert_previous_services_reader(&root, &keys, policy);
    println!("PASS: rights retained; expected account state {}", args[3]);
}

fn assert_previous_services_reader(
    root: &std::path::Path,
    keys: &str,
    policy: vantare_ipc::control::Policy,
) {
    use std::sync::Arc;
    use vantare_ipc::{
        control,
        transport::{Event, Listener},
    };
    use vantare_services::{
        app::App,
        config::BuildConfig,
        protocol::{Command, Reply},
    };
    // The same fixture compiles with actual old sources. The new schema has no such command.
    let Ok(command) =
        serde_json::from_value::<Command>(serde_json::json!({"command":"TransferRights"}))
    else {
        println!("PASS: current generation has no disk-transfer command");
        return;
    };
    let name = format!(
        "generation-read-{}",
        &vantare_services::random_id().expect("id")[..12]
    );
    let nonce = vantare_services::random_id().expect("nonce");
    let link = control::CoreLink {
        pipe: name.clone(),
        image: std::env::current_exe().expect("image"),
        nonce: nonce.clone(),
    };
    let mut listener = Listener::new(
        &name,
        Arc::new(Event::new().expect("stop")),
        Duration::from_secs(3),
    )
    .expect("listener");
    let mut pipe = listener.instance().expect("instance");
    let expected = policy.catalog;
    let reader = std::thread::spawn(move || {
        pipe.accept().expect("old helper connection");
        let request: control::Request = control::read(&mut pipe).expect("read request");
        assert_eq!(request.nonce, nonce);
        assert!(
            matches!(request.command, control::Command::Read),
            "old generation must read the new binding, never install or invalidate"
        );
        control::write(
            &mut pipe,
            &control::Response {
                version: control::VERSION,
                sequence: request.sequence,
                policy,
                error: None,
            },
        )
        .expect("read response");
    });
    let mut app = App::with_clock(
        BuildConfig {
            supabase: None,
            anon_key: None,
            license_keys: Some(Box::leak(keys.to_owned().into_boxed_str())),
            channel: Some("fixture"),
            native_oauth: None,
        },
        root.join("services"),
        || Ok(100),
    );
    app.attach_core(link);
    assert!(
        matches!(app.handle(command), Reply::License { policy, .. } if policy.catalog == expected)
    );
    reader.join().expect("actual previous App: only Read");
}

fn signed_for(subject: &str, device: &str) -> CredentialV1 {
    let key = SigningKey::from_bytes(&[43; 32]);
    let claims = ClaimsV1 {
        issuer: "vantare-license".into(),
        subject: subject.into(),
        device_fingerprint: device.into(),
        issued_at: "2026-11-01T03:59:00Z".into(),
        capabilities: vec![Capability {
            key: "vantare.plan.pro".into(),
            paid_through: "2026-12-01T04:00:00Z".into(),
            perpetual: false,
            scope_version: String::new(),
        }],
    };
    let payload = serde_json::to_vec(&Payload {
        version: 1,
        algorithm: "Ed25519",
        key_id: "fixture",
        claims: &claims,
    })
    .expect("canonical fixture");
    CredentialV1 {
        version: 1,
        algorithm: "Ed25519".into(),
        key_id: "fixture".into(),
        claims,
        signature: URL_SAFE_NO_PAD.encode(key.sign(&payload).to_bytes()),
    }
}
fn retire_old_b_fixture(root: &std::path::Path, keys: &str, device: &str) {
    use vantare_services::{Error, app::App, config::BuildConfig};
    let service_root = root.join("services");
    let context = "license-v1|unconfigured|fixture";
    let store = Store::open(&service_root, context).expect("old namespace");
    let credential = signed_for("550e8400-e29b-41d4-a716-446655440001", device);
    store.save("license-candidate", &serde_json::json!({"account_id":credential.claims.subject,"device":device,"credential":credential})).expect("old signed B, same PC");
    store
        .save("license-transfer-pending", &true)
        .expect("old marker");
    drop(store);
    drop(App::with_clock(
        BuildConfig {
            supabase: None,
            anon_key: None,
            license_keys: Some(Box::leak(keys.to_owned().into_boxed_str())),
            channel: Some("fixture"),
            native_oauth: None,
        },
        service_root.clone(),
        || Ok(100),
    ));
    let store = Store::open(&service_root, context).expect("retired namespace");
    for name in ["license-candidate", "license-transfer-pending"] {
        assert!(
            matches!(
                store
                    .read::<serde_json::Value>(name)
                    .and_then(Stored::required),
                Err(Error::NotFound)
            ),
            "v18 must retire old B before downgrade"
        );
    }
}
