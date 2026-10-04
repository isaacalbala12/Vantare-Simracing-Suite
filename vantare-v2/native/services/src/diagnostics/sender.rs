use super::{
    Crash, FILE_LIMIT, Privacy, QUEUE_LIMIT, Usage, anonymous_id, bounded, configured, data_root,
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
                let crash: Crash = match serde_json::from_slice(&bytes) {
                    Ok(crash) => crash,
                    // Puede estar escribiendo otro proceso: conservar para el siguiente ciclo.
                    Err(_) => continue,
                };
                let properties = serde_json::json!({"binary": bounded(&crash.binary,64), "version": bounded(&crash.version,64), "channel": crate::product::CHANNEL, "message": bounded(&crash.message,1024), "backtrace": bounded(&crash.backtrace,8192), "timestamp": crash.timestamp});
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
            let distinct_id = anonymous_id(root)?;
            // Disable person profiles for these installation-level events.
            properties["$process_person_profile"] = false.into();
            let response = http.post_json(endpoint, &serde_json::json!({"api_key": key, "event": event, "distinct_id": distinct_id, "properties": properties}), None, None)?.success()?;
            // Capture API confirms accepted ingestion with {"status": 1}.
            if response.json::<serde_json::Value>()?["status"] != 1 {
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
    fn sends_and_removes_only_confirmed_crashes() {
        let root = super::super::tests::root();
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
        super::super::tests::assert_redacted(&saved.message);
        super::super::tests::assert_redacted(&saved.backtrace);
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
            for field in ["message", "backtrace"] {
                super::super::tests::assert_redacted(
                    body["properties"][field].as_str().expect("text"),
                );
            }
            assert_eq!(body["properties"]["version"], crate::product::VERSION);
            assert_eq!(body["properties"]["channel"], crate::product::CHANNEL);
            assert!(request.contains("\"event\":\"crash\""));
            assert!(request.contains("$process_person_profile"));
        }
        server.finish();
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn legacy_crash_is_redacted_before_sending() {
        let root = super::super::tests::root();
        fs::create_dir(root.join("crashes")).expect("dir");
        let old = Crash {
            binary: "core".into(),
            version: "1.0.0".into(),
            message: super::super::tests::sensitive_text(),
            backtrace: super::super::tests::sensitive_text(),
            timestamp: 1,
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
        for field in ["message", "backtrace"] {
            super::super::tests::assert_redacted(body["properties"][field].as_str().expect("text"));
        }
        server.finish();
        assert!(!root.join("crashes/00.json").exists());
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn no_key_or_consent_does_not_send_and_revocation_discards_pending() {
        let root = super::super::tests::root();
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
        fs::write(root.join(PRIVACY_FILE), br#"{"crashes":true,"usage":true}"#).expect("consent");
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
        fs::write(root.join(PRIVACY_FILE), br#"{"crashes":true,"usage":true}"#).expect("consent");
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
            assert!(!request.contains("position"));
        }
        server.finish();
        fs::remove_dir_all(root).expect("cleanup");
    }
}
