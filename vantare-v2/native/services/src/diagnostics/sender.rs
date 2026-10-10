use super::{
    Crash, FILE_LIMIT, Privacy, QUEUE_LIMIT, Usage, anonymous_id, configured, data_root,
    read_bounded,
};
use crate::{Error, Result, http::Http};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::{
    fs::{self, OpenOptions},
    path::Path,
};
use std::{sync::mpsc, thread::JoinHandle, time::Duration};
use url::Url;

#[cfg(test)]
fn flush(root: &Path, http: &Http, endpoint: &Url, key: Option<&str>) -> Result<()> {
    flush_until(root, http, endpoint, key, &AtomicBool::new(false))
}

fn flush_until(
    root: &Path,
    http: &Http,
    endpoint: &Url,
    key: Option<&str>,
    stopped: &AtomicBool,
) -> Result<()> {
    let Some(key) = key.filter(|key| !key.trim().is_empty()) else {
        return Ok(());
    };
    fs::create_dir_all(root).map_err(|_| Error::Storage)?;
    // Lock SO: exclusión entre auxiliares y liberación automática si el proceso cae.
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(root.join("posthog-send.lock"))
        .map_err(|_| Error::Storage)?;
    lock.try_lock().map_err(|_| Error::Busy)?;
    for folder in ["crashes", "usage"] {
        for slot in 0..QUEUE_LIMIT {
            if stopped.load(Ordering::Relaxed) {
                return Ok(());
            }
            let path = root.join(folder).join(format!("{slot:02}.json"));
            let bytes = match read_bounded(&path, FILE_LIMIT) {
                Ok(bytes) => bytes,
                Err(Error::NotFound) => continue,
                Err(error) => return Err(error),
            };
            // Revocación también descarta pendientes; nunca los reactiva posteriormente.
            let privacy = Privacy::load(root)?;
            if (folder == "crashes" && !privacy.crashes) || (folder == "usage" && !privacy.usage) {
                fs::remove_file(path).map_err(|_| Error::Storage)?;
                continue;
            }
            let (event, properties) = if folder == "crashes" {
                let crash: Crash = if let Ok(crash) = serde_json::from_slice(&bytes) {
                    crash
                } else {
                    // queue publica un documento completo de forma atómica.
                    // Retirar escrituras parciales heredadas libera su slot.
                    fs::remove_file(path).map_err(|_| Error::Storage)?;
                    continue;
                };
                // También los archivos antiguos pasan por esta proyección cerrada.
                let version = if crash.version == crate::product::VERSION {
                    crate::product::VERSION
                } else {
                    "unknown"
                };
                let properties = serde_json::json!({"code": "native_panic", "version": version, "os": std::env::consts::OS, "stack": crash.frames.into_iter().take(64).collect::<Vec<_>>()});
                ("crash".to_owned(), properties)
            } else {
                let usage: Usage = match serde_json::from_slice(&bytes) {
                    Ok(usage) => usage,
                    Err(_) => continue,
                };
                if !usage.valid() {
                    return Err(Error::Protocol);
                }
                let value = serde_json::to_value(usage).map_err(|_| Error::Protocol)?;
                (
                    value["event"].as_str().ok_or(Error::Protocol)?.to_owned(),
                    value["properties"].clone(),
                )
            };
            let mut properties = properties;
            let distinct_id = if folder == "crashes" {
                "native-crash".to_owned()
            } else {
                anonymous_id(root)?
            };
            // Disable person profiles for these installation-level events.
            properties["$process_person_profile"] = false.into();
            properties["$ip"] = serde_json::Value::Null;
            properties["$geoip_disable"] = true.into();
            let response = http.post_json(endpoint, &serde_json::json!({"api_key": key, "event": event, "distinct_id": distinct_id, "properties": properties}), None, None)?.success()?;
            // EU capture returns "Ok"; older capture endpoints return 1.
            let status = response.json::<serde_json::Value>()?["status"].clone();
            if status != 1 && status != "Ok" {
                return Err(Error::Protocol);
            }
            fs::remove_file(path).map_err(|_| Error::Storage)?;
        }
    }
    Ok(())
}

/// Lifetime owned by services; cancellation wakes the minute timer and joins I/O.
pub struct Worker {
    stop: mpsc::Sender<()>,
    stopped: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}
impl Worker {
    pub fn start() -> Result<Option<Self>> {
        if !configured() {
            return Ok(None);
        }
        let root = data_root()?;
        let endpoint =
            Url::parse("https://eu.i.posthog.com/i/v0/e/").map_err(|_| Error::Unconfigured)?;
        let (stop, receiver) = mpsc::channel();
        let stopped = Arc::new(AtomicBool::new(false));
        let cancel = Arc::clone(&stopped);
        let thread = std::thread::Builder::new()
            .name("posthog-pending".into())
            .spawn(move || {
                let http = Http::default();
                loop {
                    if let Err(error) = flush_until(
                        &root,
                        &http,
                        &endpoint,
                        option_env!("VANTARE_POSTHOG_KEY"),
                        &cancel,
                    ) {
                        eprintln!("diagnóstico: {error}");
                    }
                    match receiver.recv_timeout(Duration::from_mins(1)) {
                        Err(mpsc::RecvTimeoutError::Timeout) => {}
                        Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    }
                }
            })
            .map_err(|_| Error::Storage)?;
        Ok(Some(Self {
            stop,
            stopped,
            thread: Some(thread),
        }))
    }
}
impl Drop for Worker {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::Relaxed);
        let _already_stopped = self.stop.send(());
        if let Some(thread) = self.thread.take()
            && thread.join().is_err()
        {
            eprintln!("diagnóstico: worker terminado con panic");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::diagnostics::{PRIVACY_FILE, enqueue_usage, write_crash};
    use crate::test_http::Server;

    #[test]
    fn isa1548_partial_crashes_release_all_slots_without_sending() {
        let root = super::super::tests::root();
        super::super::tests::consent(&root);
        fs::create_dir(root.join("crashes")).expect("queue");
        for slot in 0..QUEUE_LIMIT {
            fs::write(
                root.join("crashes").join(format!("{slot:02}.json")),
                b"{\"binary\":",
            )
            .expect("interrupted write fixture");
        }
        let server = Server::start(vec![]);
        flush(&root, &Http::default(), &server.base, Some("public-test")).expect("flush");
        assert!(server.requests.try_recv().is_err());
        server.finish();
        assert_eq!(
            fs::read_dir(root.join("crashes")).expect("queue").count(),
            0
        );
        write_crash(&root, "core", "panic", "trace").expect("slot reusable");
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn default_legacy_and_rejected_privacy_discard_pending_without_http() {
        let root = super::super::tests::root();
        let server = Server::start(vec![]);
        for settings in [
            None,
            Some(br#"{"crashes":true,"usage":false}"#.as_slice()),
            Some(br#"{"crashes":false,"usage":false,"crashes_decided":true}"#.as_slice()),
        ] {
            if let Some(bytes) = settings {
                fs::write(root.join(PRIVACY_FILE), bytes).expect("privacy");
            }
            fs::create_dir_all(root.join("crashes")).expect("queue");
            fs::write(root.join("crashes/00.json"), b"{}").expect("old pending");
            flush(&root, &Http::default(), &server.base, Some("public-test")).expect("no send");
            assert!(!root.join("crashes/00.json").exists());
            write_crash(&root, "core", "panic", "trace").expect("no capture");
            assert!(!root.join("crashes/00.json").exists());
        }
        assert!(server.requests.try_recv().is_err());
        server.finish();
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn accepted_eu_capture_removes_pending_event() {
        let root = super::super::tests::root();
        super::super::tests::consent(&root);
        write_crash(&root, "core", "diagnostic", "trace").expect("enqueue");
        let server = Server::start(vec![(200, r#"{"status":"Ok"}"#.into())]);
        flush(&root, &Http::default(), &server.base, Some("public-test"))
            .expect("EU accepted capture");
        assert!(!root.join("crashes/00.json").exists());
        server.finish();
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn sends_and_removes_only_confirmed_crashes() {
        let root = super::super::tests::root();
        super::super::tests::consent(&root);
        write_crash(
            &root,
            "core",
            &super::super::tests::sensitive_text(),
            &super::super::tests::sensitive_text(),
        )
        .expect("crash");
        let saved: Crash =
            serde_json::from_slice(&fs::read(root.join("crashes/00.json")).expect("file"))
                .expect("json");
        assert_eq!(saved.message, "native_panic");
        assert!(saved.backtrace.is_empty());
        let server = Server::start(vec![
            (503, "{}".into()),
            (200, "{\"status\":0}".into()),
            (200, "{\"status\":1}".into()),
        ]);
        let http = Http::default();
        assert_eq!(
            flush(&root, &http, &server.base, Some("public-test")),
            Err(Error::Offline)
        );
        assert!(root.join("crashes/00.json").exists());
        assert_eq!(
            flush(&root, &http, &server.base, Some("public-test")),
            Err(Error::Protocol)
        );
        assert!(root.join("crashes/00.json").exists());
        flush(&root, &http, &server.base, Some("public-test")).expect("confirmed");
        assert!(!root.join("crashes/00.json").exists());
        for _ in 0..3 {
            let request = server
                .requests
                .recv_timeout(Duration::from_secs(3))
                .expect("request");
            let body: serde_json::Value =
                serde_json::from_str(request.split_once("\r\n\r\n").expect("body").1)
                    .expect("json");
            assert!(body["properties"].get("message").is_none());
            assert!(body["properties"].get("backtrace").is_none());
            assert_eq!(body["properties"]["code"], "native_panic");
            assert_eq!(body["properties"]["$geoip_disable"], true);
            assert!(
                body["properties"]
                    .get("$ip")
                    .is_some_and(serde_json::Value::is_null)
            );
            assert_eq!(body["properties"]["version"], crate::product::VERSION);
            assert_eq!(body["properties"]["os"], std::env::consts::OS);
            assert!(request.contains("\"event\":\"crash\""));
            assert!(request.contains("$process_person_profile"));
        }
        server.finish();
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn legacy_crash_is_redacted_before_sending() {
        let root = super::super::tests::root();
        super::super::tests::consent(&root);
        fs::create_dir(root.join("crashes")).expect("dir");
        let old = Crash {
            binary: "Nombre privado del usuario".into(),
            version: "Nombre privado del usuario".into(),
            message: format!(
                "Nombre privado del usuario {}",
                super::super::tests::sensitive_text()
            ),
            backtrace: format!(
                "Nombre privado del usuario {}",
                super::super::tests::sensitive_text()
            ),
            timestamp: 1,
            frames: vec![1234],
        };
        fs::write(
            root.join("crashes/00.json"),
            serde_json::to_vec(&old).expect("json"),
        )
        .expect("legacy file");
        let server = Server::start(vec![(200, "{\"status\":1}".into())]);
        flush(&root, &Http::default(), &server.base, Some("public-test")).expect("flush");
        let request = server
            .requests
            .recv_timeout(Duration::from_secs(3))
            .expect("request");
        let body: serde_json::Value =
            serde_json::from_str(request.split_once("\r\n\r\n").expect("body").1).expect("json");
        let properties = body["properties"].as_object().expect("properties");
        let mut fields: Vec<_> = properties.keys().map(String::as_str).collect();
        fields.sort_unstable();
        assert_eq!(
            fields,
            [
                "$geoip_disable",
                "$ip",
                "$process_person_profile",
                "code",
                "os",
                "stack",
                "version"
            ]
        );
        assert_eq!(properties["stack"], serde_json::json!([1234]));
        assert_eq!(properties["version"], "unknown");
        assert_eq!(body["distinct_id"], "native-crash");
        assert!(!request.contains("Nombre privado del usuario"));
        for fragment in [
            "WindowsUser",
            "ForwardUser",
            "LinuxUser",
            "MacUser",
            "fixture-token-123",
        ] {
            assert!(!request.contains(fragment));
        }
        server.finish();
        assert!(!root.join("crashes/00.json").exists());
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn no_key_or_consent_does_not_send_and_revocation_discards_pending() {
        let root = super::super::tests::root();
        super::super::tests::consent(&root);
        let server = Server::start(vec![]);
        let http = Http::default();
        write_crash(&root, "core", "panic", "trace").expect("crash");
        flush(&root, &http, &server.base, None).expect("no key");
        assert!(root.join("crashes/00.json").exists());
        let usage = Usage::LiveSessionStarted {
            simulator: "lmu".into(),
        };
        enqueue_usage(&root, &usage).expect("no consent");
        assert!(!root.join("usage").exists());
        fs::write(
            root.join(PRIVACY_FILE),
            br#"{"crashes":true,"usage":true,"crashes_decided":true}"#,
        )
        .expect("consent");
        enqueue_usage(&root, &usage).expect("pending usage");
        fs::write(
            root.join(PRIVACY_FILE),
            br#"{"crashes":false,"usage":false}"#,
        )
        .expect("revoke");
        flush(&root, &http, &server.base, Some("public-test")).expect("discard");
        assert!(!root.join("usage/00.json").exists());
        assert!(!root.join("crashes/00.json").exists());
        assert!(server.requests.try_recv().is_err());
        server.finish();
        fs::remove_dir_all(root).expect("cleanup");
    }
    #[test]
    fn sends_only_the_three_typed_usage_events() {
        let root = super::super::tests::root();
        fs::write(
            root.join(PRIVACY_FILE),
            br#"{"crashes":true,"usage":true,"crashes_decided":true}"#,
        )
        .expect("consent");
        for usage in [
            Usage::AppStarted {
                version: "1.0.0".into(),
                channel: "beta".into(),
            },
            Usage::LiveSessionStarted {
                simulator: "lmu".into(),
            },
            Usage::LayoutWidgets {
                widget_types: vec!["radar".into()],
            },
        ] {
            enqueue_usage(&root, &usage).expect("enqueue");
        }
        let server = Server::start(vec![(200, "{\"status\":1}".into()); 3]);
        flush(&root, &Http::default(), &server.base, Some("public-test")).expect("flush");
        for name in ["app_started", "live_session_started", "layout_widgets"] {
            let request = server
                .requests
                .recv_timeout(Duration::from_secs(3))
                .expect("request");
            assert!(request.contains(name));
            let body: serde_json::Value =
                serde_json::from_str(request.split_once("\r\n\r\n").expect("body").1)
                    .expect("json");
            assert_eq!(body["properties"]["$geoip_disable"], true);
            assert!(
                body["properties"]
                    .get("$ip")
                    .is_some_and(serde_json::Value::is_null)
            );
            assert!(!request.contains("position"));
        }
        server.finish();
        fs::remove_dir_all(root).expect("cleanup");
    }
}
