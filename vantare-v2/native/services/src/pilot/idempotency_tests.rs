use super::*;
use crate::{bridge::Config, http::Http};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct Backend {
    current: Option<serde_json::Value>,
    receipts: HashMap<String, serde_json::Value>,
    pending: Option<serde_json::Value>,
    saves: Vec<serde_json::Value>,
    loads: Vec<serde_json::Value>,
    photos: HashMap<String, Vec<u8>>,
    photo_duplicates: usize,
    photo_reads: usize,
    lose_first: bool,
    lose_third: bool,
    reject_photo: bool,
}
impl Backend {
    fn http_reply(&mut self, bytes: &[u8]) -> (u16, Vec<u8>) {
        let split = bytes
            .windows(4)
            .position(|v| v == b"\r\n\r\n")
            .expect("headers");
        let headers = String::from_utf8_lossy(&bytes[..split]);
        let mut line = headers.split_whitespace();
        let method = line.next().expect("method");
        let path = line.next().expect("path");
        if path.starts_with("/storage/") {
            let key = path.rsplit('/').next().expect("key");
            if method == "POST" {
                if self.photos.contains_key(key) {
                    self.photo_duplicates += 1;
                    return (400, br#"{"error":"Duplicate","statusCode":"409"}"#.to_vec());
                }
                self.photos.insert(key.into(), bytes[split + 4..].to_vec());
                return (200, b"{}".to_vec());
            }
            self.photo_reads += 1;
            return (200, self.photos.get(key).expect("uploaded photo").clone());
        }
        let (status, body) = self.reply(&String::from_utf8_lossy(bytes));
        (status, body.into_bytes())
    }
    fn apply(&mut self, request: &serde_json::Value) -> (u16, String) {
        let id = request["p_op_id"].as_str();
        if let Some(receipt) = id.and_then(|id| self.receipts.get(id)) {
            return (200, receipt.to_string());
        }
        if self.reject_photo && !request["p_photo_hash"].is_null() {
            return (
                400,
                r#"{"code":"22023","message":"invalid profile"}"#.into(),
            );
        }
        let revision = self
            .current
            .as_ref()
            .map_or(0, |v| v["revision"].as_u64().expect("revision"));
        if request["p_expected_revision"] != revision {
            return (409, r#"{"code":"PT409"}"#.into());
        }
        let result = serde_json::json!({"profile":request["p_profile"],
            "photo_hash":request["p_photo_hash"], "revision":revision+1});
        self.current = Some(result.clone());
        if let Some(id) = id {
            self.receipts.insert(id.to_owned(), result.clone());
        }
        (200, result.to_string())
    }
    fn reply(&mut self, request: &str) -> (u16, String) {
        if request.starts_with("POST /functions/") {
            return (200, serde_json::json!({"version":1,"account_id":"550e8400-e29b-41d4-a716-446655440000","data_access_token":"data-fixture","expires_at":160}).to_string());
        }
        if request.starts_with("POST /rest/v1/rpc/pilot_profile_load ") {
            let value = self.current.clone().unwrap_or(serde_json::Value::Null);
            self.loads.push(value.clone());
            return (200, value.to_string());
        }
        assert!(request.starts_with("POST /rest/v1/rpc/pilot_profile_save "));
        let body: serde_json::Value =
            serde_json::from_str(request.split_once("\r\n\r\n").expect("body").1).expect("JSON");
        self.saves.push(body.clone());
        if self.lose_first || (self.lose_third && self.saves.len() == 3) {
            self.lose_first = false;
            self.pending = Some(body);
            return (200, "confirmation lost".into());
        }
        // A termina DESPUÉS de cualquier load del reintento, justo antes de su CAS.
        if let Some(pending) = self.pending.take() {
            assert_eq!(self.apply(&pending).0, 200);
        }
        self.apply(&body)
    }
}

fn description_profile(description: &str) -> PilotProfile {
    PilotProfile {
        description: description.into(),
        ..Default::default()
    }
}

#[test]
fn definitive_rejection_retires_a_and_corrected_b_can_commit_after_restart() {
    let fixture = Fixture::new();
    let remote = PilotProfile {
        extensions: [("future".into(), serde_json::json!("x".repeat(17000)))].into(),
        ..Default::default()
    };
    {
        let mut backend = fixture.backend.lock().expect("state");
        backend.lose_first = false;
        backend.reject_photo = true;
        backend.current =
            Some(serde_json::json!({"profile":remote,"revision":4,"photo_hash":null}));
    }
    let (root, store) = crate::test_store("pilot-rejected-a");
    let account = crate::account::fixture(&fixture.base, &store);
    let http = Http::default();
    let config = Config {
        authorize: fixture
            .base
            .join("functions/v1/native-account-authorize")
            .expect("URL"),
        supabase: fixture.base.clone(),
        anon_key: "public-fixture".into(),
    };
    let session = config.authorize(&http, &account, 100).expect("session");
    let request = session.request(&http, &config, &account, 100);
    let mut local = Local::open(&root, None, None).expect("local");
    synchronize(&mut local, &request).expect("load remote");
    let a = PilotProfile {
        photo: Some(super::tests::colored_photo([200, 0, 0])),
        ..remote.clone()
    };
    assert!(a.validate());
    assert_eq!(
        local.save(a.clone(), local.state().revision),
        Err(Error::TooLarge)
    );
    assert!(
        local.operation.is_none(),
        "incompatible photo budget must not create A"
    );
    // Reproduce el blob durable de r4: el lector debe permitir corregirlo.
    let state = crate::protocol::pilot_document::PilotState {
        profile: a.clone(),
        pending: true,
        ..local.state().clone()
    };
    let operation = super::super::Operation::new(a, 4).expect("A");
    let id = operation.op_id.clone();
    local.persist(state, Some(operation)).expect("r4 pending A");
    fixture
        .backend
        .lock()
        .expect("state")
        .current
        .as_mut()
        .expect("remote")["revision"] = serde_json::json!(6);
    assert_eq!(synchronize(&mut local, &request), Err(Error::PilotRejected));
    assert!(
        local.operation.is_none(),
        "definitive rejection must retire A"
    );
    assert_eq!(local.state().remote_revision, 6);
    drop(local);
    let mut local = Local::open(&root, None, None).expect("reopen rejection");
    assert!(
        local.operation.is_none(),
        "reopen must not resurrect rejected A"
    );
    let b = PilotProfile {
        description: "B corregido".into(),
        ..remote
    };
    local
        .save(b.clone(), local.state().revision)
        .expect("remove photo");
    assert_ne!(local.operation.as_ref().expect("B").op_id, id);
    drop(local);
    let mut local = Local::open(&root, None, None).expect("reopen B");
    synchronize(&mut local, &request).expect("B accepted");
    assert_eq!(local.state().profile, b);
    assert_eq!(local.state().remote_revision, 7);
    assert!(!local.state().pending);
    assert_eq!(fixture.backend.lock().expect("state").saves.len(), 2);
    drop(local);
    drop(account);
    drop(store);
    std::fs::remove_dir_all(root).expect("cleanup");
}

struct Fixture {
    base: url::Url,
    backend: Arc<Mutex<Backend>>,
    thread: Option<std::thread::JoinHandle<()>>,
}
impl Fixture {
    fn config(&self) -> Config {
        Config {
            authorize: self
                .base
                .join("functions/v1/native-account-authorize")
                .expect("URL"),
            supabase: self.base.clone(),
            anon_key: "public-fixture".into(),
        }
    }
    fn new() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("listener");
        let base = url::Url::parse(&format!(
            "http://{}/",
            listener.local_addr().expect("address")
        ))
        .expect("URL");
        let backend = Arc::new(Mutex::new(Backend {
            lose_first: true,
            ..Default::default()
        }));
        let state = backend.clone();
        let thread = std::thread::spawn(move || {
            for socket in listener.incoming() {
                let mut socket = socket.expect("accept");
                socket
                    .set_read_timeout(Some(std::time::Duration::from_secs(3)))
                    .expect("bounded fixture I/O");
                let mut bytes = Vec::new();
                loop {
                    let mut byte = [0];
                    socket.read_exact(&mut byte).expect("header");
                    bytes.push(byte[0]);
                    if bytes.ends_with(b"\r\n\r\n") {
                        break;
                    }
                    assert!(bytes.len() < 64 * 1024);
                }
                let headers = String::from_utf8_lossy(&bytes).to_lowercase();
                if headers.starts_with("stop ") {
                    break;
                }
                let length = headers
                    .lines()
                    .find_map(|line| {
                        line.strip_prefix("content-length:")
                            .and_then(|v| v.trim().parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                assert!(length <= 100 * 1024);
                let end = bytes.len();
                bytes.resize(end + length, 0);
                socket.read_exact(&mut bytes[end..]).expect("body");
                let (status, body) = state.lock().expect("state").http_reply(&bytes);
                write!(socket, "HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n", body.len()).expect("response");
                socket.write_all(&body).expect("body");
            }
        });
        Self {
            base,
            backend,
            thread: Some(thread),
        }
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let mut socket = TcpStream::connect(("127.0.0.1", self.base.port().expect("port")))
            .expect("wake fixture");
        socket
            .write_all(b"STOP / HTTP/1.1\r\n\r\n")
            .expect("stop fixture");
        self.thread
            .take()
            .expect("thread")
            .join()
            .expect("fixture shutdown");
    }
}

#[test]
fn uncertain_in_flight_a_then_edit_b_retries_a_before_b_even_after_restart() {
    for with_photo in [false, true] {
        for restart in [false, true] {
            let fixture = Fixture::new();
            let (root, store) = crate::test_store("pilot-in-flight");
            let account = crate::account::fixture(&fixture.base, &store);
            let http = Http::default();
            let config = Config {
                authorize: fixture
                    .base
                    .join("functions/v1/native-account-authorize")
                    .expect("URL"),
                supabase: fixture.base.clone(),
                anon_key: "public-fixture".into(),
            };
            let session = config.authorize(&http, &account, 100).expect("session");
            let request = session.request(&http, &config, &account, 100);
            let mut local = Local::open(&root, None, None).expect("local");
            local
                .save(
                    PilotProfile {
                        description: "A".into(),
                        photo: with_photo.then(|| super::tests::colored_photo([200, 0, 0])),
                        ..Default::default()
                    },
                    0,
                )
                .expect("A");
            assert_eq!(synchronize(&mut local, &request), Err(Error::Protocol));
            let edited = PilotProfile {
                description: "B".into(),
                photo: with_photo.then(|| super::tests::colored_photo([0, 0, 200])),
                ..Default::default()
            };
            local
                .save(edited.clone(), local.state().revision)
                .expect("B durable");
            if restart {
                drop(local);
                local = Local::open(&root, None, None).expect("restart");
            }
            assert_eq!(synchronize(&mut local, &request), Ok(()));
            assert_eq!(local.state().profile, edited);
            assert_eq!(local.state().remote_revision, 2);
            assert!(!local.state().pending);
            let backend = fixture.backend.lock().expect("state");
            assert_eq!(backend.saves.len(), 3);
            assert_eq!(backend.saves[0], backend.saves[1]);
            assert_eq!(backend.saves[2]["p_expected_revision"], 1);
            assert_ne!(backend.saves[0]["p_op_id"], backend.saves[2]["p_op_id"]);
            if with_photo {
                assert_eq!(backend.photo_duplicates, 1);
                // GET del JPEG/SHA de A duplicado y del perfil B final.
                assert_eq!(backend.photo_reads, 2);
                assert_eq!(backend.photos.len(), 2);
            }
            drop(backend);
            drop(local);
            let local = Local::open(&root, None, None).expect("final restart");
            assert_eq!(local.state().profile, edited);
            assert!(!local.state().pending);
            drop(local);
            drop(account);
            drop(store);
            std::fs::remove_dir_all(root).expect("fixture cleanup");
        }
    }
}

#[test]
fn lost_confirmation_reuses_uuid_after_restart_and_new_edit_gets_new_uuid() {
    let fixture = Fixture::new();
    let (root, store) = crate::test_store("pilot-idempotent-retry");
    let account = crate::account::fixture(&fixture.base, &store);
    let http = Http::default();
    let config = Config {
        authorize: fixture
            .base
            .join("functions/v1/native-account-authorize")
            .expect("URL"),
        supabase: fixture.base.clone(),
        anon_key: "public-fixture".into(),
    };
    let session = config.authorize(&http, &account, 100).expect("session");
    let request = session.request(&http, &config, &account, 100);
    let mut local = Local::open(&root, None, None).expect("local");
    let profile = PilotProfile {
        description: "A".into(),
        ..Default::default()
    };
    local.save(profile.clone(), 0).expect("A");
    let id = local.operation.as_ref().expect("operation").op_id.clone();
    assert!(crate::license::uuid(&id));
    assert_eq!(&id[14..15], "4");
    assert_eq!(synchronize(&mut local, &request), Err(Error::Protocol));
    drop(local);
    let mut local = Local::open(&root, None, None).expect("restart");
    assert_eq!(local.operation.as_ref().expect("operation").op_id, id);
    synchronize(&mut local, &request).expect("definitive confirmation");
    assert_eq!(local.state().profile, profile);
    assert_eq!(local.state().remote_revision, 1);
    assert!(!local.state().pending);
    local
        .save(
            PilotProfile {
                description: "B".into(),
                ..profile
            },
            local.state().revision,
        )
        .expect("edit after ack");
    assert_ne!(local.operation.as_ref().expect("new operation").op_id, id);
    synchronize(&mut local, &request).expect("B");
    assert_eq!(local.state().remote_revision, 2);
    let backend = fixture.backend.lock().expect("state");
    assert_eq!(backend.saves[0], backend.saves[1]);
    assert_eq!(backend.receipts.len(), 2);
    drop(backend);
    drop(local);
    drop(account);
    drop(store);
    std::fs::remove_dir_all(root).expect("fixture cleanup");
}

#[test]
fn second_device_between_commit_and_retry_cannot_erase_receipt_or_be_overwritten() {
    for edited in [false, true] {
        let fixture = Fixture::new();
        let (root, store) = crate::test_store("pilot-two-devices");
        let account = crate::account::fixture(&fixture.base, &store);
        let http = Http::default();
        let config = fixture.config();
        let session = config.authorize(&http, &account, 100).expect("session");
        let request = session.request(&http, &config, &account, 100);
        let mut first = Local::open(&root.join("device-1"), None, None).expect("first");
        let mut second = Local::open(&root.join("device-2"), None, None).expect("second");
        first.save(description_profile("A"), 0).expect("A");
        assert_eq!(synchronize(&mut first, &request), Err(Error::Protocol));
        let mut backend = fixture.backend.lock().expect("state");
        let pending = backend.pending.take().expect("in-flight A");
        assert_eq!(backend.apply(&pending).0, 200);
        drop(backend);
        if edited {
            first
                .save(description_profile("B"), first.state().revision)
                .expect("B queued");
        }
        synchronize(&mut second, &request).expect("device 2 loads A");
        second
            .save(description_profile("C"), second.state().revision)
            .expect("device 2 edits C");
        synchronize(&mut second, &request).expect("C commits R2");
        drop(first);
        let mut first = Local::open(&root.join("device-1"), None, None).expect("restart device 1");
        assert_eq!(
            synchronize(&mut first, &request),
            if edited { Err(Error::Conflict) } else { Ok(()) }
        );
        assert_eq!(first.state().remote_revision, 2);
        assert_eq!(
            first.state().profile.description,
            if edited { "B" } else { "C" }
        );
        assert_eq!(first.state().pending, edited);
        assert!(first.operation.is_none(), "conflict must retire stale CAS");
        let backend = fixture.backend.lock().expect("state");
        assert_eq!(
            backend.current.as_ref().expect("current")["profile"]["description"],
            "C"
        );
        assert_eq!(backend.current.as_ref().expect("current")["revision"], 2);
        assert_eq!(backend.saves[0], backend.saves[2]);
        if edited {
            assert_ne!(backend.saves[0]["p_op_id"], backend.saves[3]["p_op_id"]);
            assert_eq!(backend.saves[3]["p_expected_revision"], 1);
        }
        drop(backend);
        if edited {
            drop(first);
            first = Local::open(&root.join("device-1"), None, None).expect("reopen conflict");
            assert!(first.operation.is_none());
            let count = fixture.backend.lock().expect("state").saves.len();
            assert_eq!(synchronize(&mut first, &request), Err(Error::PilotRejected));
            assert_eq!(fixture.backend.lock().expect("state").saves.len(), count);
            assert_eq!(first.state().profile.description, "B");
            assert_eq!(first.state().remote_revision, 2);
        }
        if !edited {
            first
                .save(description_profile("D"), first.state().revision)
                .expect("edit after single recovery");
            synchronize(&mut first, &request).expect("D uses current R2");
            let backend = fixture.backend.lock().expect("state");
            assert_eq!(backend.saves.last().expect("D")["p_expected_revision"], 2);
            assert_eq!(backend.current.as_ref().expect("D")["revision"], 3);
        }
        drop(first);
        drop(second);
        drop(account);
        drop(store);
        std::fs::remove_dir_all(root).expect("fixture cleanup");
    }
}

#[test]
fn lost_confirmation_for_queued_b_preserves_its_new_operation_after_a_is_confirmed() {
    let fixture = Fixture::new();
    fixture.backend.lock().expect("state").lose_third = true;
    let (root, store) = crate::test_store("pilot-queued-b");
    let account = crate::account::fixture(&fixture.base, &store);
    let http = Http::default();
    let config = Config {
        authorize: fixture
            .base
            .join("functions/v1/native-account-authorize")
            .expect("URL"),
        supabase: fixture.base.clone(),
        anon_key: "public-fixture".into(),
    };
    let session = config.authorize(&http, &account, 100).expect("session");
    let request = session.request(&http, &config, &account, 100);
    let mut local = Local::open(&root, None, None).expect("local");
    local
        .save(
            PilotProfile {
                description: "A".into(),
                ..Default::default()
            },
            0,
        )
        .expect("A");
    let first_id = local.operation.as_ref().expect("A op").op_id.clone();
    assert_eq!(synchronize(&mut local, &request), Err(Error::Protocol));
    local
        .save(
            PilotProfile {
                description: "B".into(),
                ..Default::default()
            },
            local.state().revision,
        )
        .expect("B");
    assert_eq!(synchronize(&mut local, &request), Err(Error::Protocol));
    assert_eq!(local.state().remote_revision, 1);
    let second_id = local.operation.as_ref().expect("B op").op_id.clone();
    assert_ne!(first_id, second_id);
    drop(local);
    let mut local = Local::open(&root, None, None).expect("restart with B uncertain");
    assert_eq!(local.operation.as_ref().expect("B op").op_id, second_id);
    synchronize(&mut local, &request).expect("B confirmed");
    assert_eq!(local.state().profile.description, "B");
    assert_eq!(local.state().remote_revision, 2);
    assert!(!local.state().pending);
    let backend = fixture.backend.lock().expect("state");
    assert_eq!(backend.saves[0], backend.saves[1]);
    assert_eq!(backend.saves[2], backend.saves[3]);
    assert_eq!(backend.receipts.len(), 2);
    drop(backend);
    drop(local);
    drop(account);
    drop(store);
    std::fs::remove_dir_all(root).expect("fixture cleanup");
}
