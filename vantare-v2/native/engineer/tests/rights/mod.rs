//! Autoridad real de la biblioteca, claves generadas y DPAPI aislada; sin red.
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signer, SigningKey};
use std::path::PathBuf;
use std::sync::{Arc, Condvar, Mutex};
use vantare_ipc::control::{self, CoreLink};
use vantare_runtime::rights::{Devices, host};
use vantare_services::license::{Capability, ClaimsV1, CredentialV1};

pub struct Fixture {
    pub host: Option<host::Host>,
    root: PathBuf,
    reads: Arc<(Mutex<bool>, Condvar)>,
}
impl Fixture {
    pub fn new(photo: &str) -> Self {
        let fixture = Self::with_pending_reads(photo, || {});
        fixture.release_reads();
        fixture
    }
    /// La autoridad existe y la instalación es durable, pero el primer Read
    /// permanece pendiente hasta que el banco lo libere explícitamente.
    pub fn with_pending_reads(photo: &str, on_read: impl Fn() + Send + Sync + 'static) -> Self {
        let root = std::env::temp_dir().join(format!(
            "ve-{}",
            vantare_services::random_id().expect("root")
        ));
        let now = vantare_runtime::rights::wall_now().timestamp();
        let mut seed = [0; 32];
        getrandom::fill(&mut seed).expect("entropía test");
        let key = SigningKey::from_bytes(&seed);
        let claims = ClaimsV1 {
            issuer: "vantare-license".into(),
            subject: "550e8400-e29b-41d4-a716-446655440000".into(),
            device_fingerprint: "fixture-legacy".into(),
            issued_at: chrono::DateTime::from_timestamp(now - 10, 0)
                .expect("iat")
                .to_rfc3339(),
            capabilities: vec![Capability {
                key: "vantare.module.engineer".into(),
                paid_through: String::new(),
                perpetual: true,
                scope_version: String::new(),
            }],
        };
        // Sign the exact ordered v1 contract.
        let payload = format!(
            r#"{{"version":1,"algorithm":"Ed25519","key_id":"test","claims":{}}}"#,
            serde_json::to_string(&claims).expect("claims")
        );
        let credential = serde_json::to_string(&CredentialV1 {
            version: 1,
            algorithm: "Ed25519".into(),
            key_id: "test".into(),
            claims,
            signature: URL_SAFE_NO_PAD.encode(key.sign(payload.as_bytes()).to_bytes()),
        })
        .expect("credential");
        let keys = format!(
            "test:{}",
            URL_SAFE_NO_PAD.encode(key.verifying_key().as_bytes())
        );
        let nonce = vantare_services::random_id().expect("bootstrap");
        let pid = std::process::id();
        let engineer = PathBuf::from(env!("CARGO_BIN_EXE_vantare-engineer"));
        let reads = Arc::new((Mutex::new(false), Condvar::new()));
        let gate = Arc::clone(&reads);
        let host = host::Host::start(
            photo,
            host::Options {
                root: root.clone(),
                keys: Some(keys),
                devices: Devices {
                    legacy: "fixture-legacy".into(),
                },
                epoch: 1,
                nonce: Some(nonce.clone()),
            },
            move |peer, mutate| {
                if mutate {
                    peer.pid == pid
                } else {
                    if !peer.is_image(&engineer) {
                        return false;
                    }
                    on_read();
                    let (released, changed) = &*gate;
                    let mut released = released.lock().expect("barrera de derechos");
                    while !*released {
                        released = changed.wait(released).expect("barrera de derechos");
                    }
                    true
                }
            },
        )
        .expect("host derechos");
        let link = CoreLink {
            pipe: control::pipe_name(photo),
            image: std::env::current_exe().expect("imagen test"),
            nonce,
        };
        let policy = control::request(&link, control::Command::Install { credential })
            .expect("ACK firmado durable");
        assert!(policy.current() && policy.engineer);
        Self {
            host: Some(host),
            root,
            reads,
        }
    }
    pub fn release_reads(&self) {
        let (released, changed) = &*self.reads;
        *released.lock().expect("barrera de derechos") = true;
        changed.notify_all();
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.release_reads(); // También libera el servidor durante un panic.
        drop(self.host.take());
        // Solo la raíz aleatoria del test; cleanup no oculta el assert original.
        let _cleaned = std::fs::remove_dir_all(&self.root);
    }
}
