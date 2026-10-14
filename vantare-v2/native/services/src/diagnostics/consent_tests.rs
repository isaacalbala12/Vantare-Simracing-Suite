use super::*;
use std::sync::mpsc;

pub(super) fn choice(root: &Path, allowed: bool) -> Privacy {
    let mut next = Privacy::load(root).expect("load consent");
    next.usage = allowed;
    next.usage_decided = true;
    Privacy::save_with(root, next, |value| {
        fs::write(
            root.join(PRIVACY_FILE),
            serde_json::to_vec(&value).expect("json"),
        )
        .map_err(|error| error.to_string())
    })
    .expect("save consent")
}

#[test]
fn isa1609_b_paused_producer_cannot_publish_after_revoke_or_reaccept() {
    for reaccept in [false, true] {
        let root = tests::root();
        choice(&root, true);
        let (ready, reached) = mpsc::channel();
        let (resume, paused) = mpsc::channel();
        std::thread::scope(|scope| {
            let fixture = &root;
            let producer = scope.spawn(move || {
                enqueue_usage_after_check(
                    fixture,
                    &Usage::PageViewed {
                        page: "studio".into(),
                    },
                    || {
                        ready.send(()).expect("ready");
                        paused.recv().expect("resume");
                    },
                )
                .expect("producer");
            });
            reached
                .recv_timeout(std::time::Duration::from_secs(5))
                .expect("producer paused");
            choice(&root, false);
            if reaccept {
                choice(&root, true);
            }
            resume.send(()).expect("resume producer");
            producer.join().expect("producer finished");
        });
        assert!(
            !root.join("usage/00.json").exists(),
            "revoked event published (reaccept={reaccept})"
        );
        fs::remove_dir_all(root).expect("cleanup");
    }
}

#[cfg(feature = "network")]
#[test]
fn isa1609_a_paused_payload_cannot_post_after_revoke_or_reaccept() {
    use crate::{http::Http, test_http::Server};
    use std::sync::atomic::AtomicBool;
    for reaccept in [false, true] {
        let root = tests::root();
        choice(&root, true);
        enqueue_usage(
            &root,
            &Usage::PageViewed {
                page: "home".into(),
            },
        )
        .expect("queue");
        let server = Server::start(vec![(200, r#"{"status":1}"#.into())]);
        let (ready, reached) = mpsc::channel();
        let (resume, paused) = mpsc::channel();
        std::thread::scope(|scope| {
            let fixture = &root;
            let endpoint = &server.base;
            let sender = scope.spawn(move || {
                sender::flush_with_hook(
                    fixture,
                    &Http::default(),
                    endpoint,
                    Some("test"),
                    &AtomicBool::new(false),
                    || {
                        ready.send(()).expect("ready");
                        paused.recv().expect("resume");
                    },
                )
            });
            reached
                .recv_timeout(std::time::Duration::from_secs(5))
                .expect("payload paused");
            choice(&root, false);
            if reaccept {
                choice(&root, true);
            }
            resume.send(()).expect("resume sender");
            let result = sender.join().expect("sender finished");
            assert!(
                server.requests.try_recv().is_err(),
                "POST began after revocation (reaccept={reaccept}, result={result:?})"
            );
            result.expect("discard stale payload");
        });
        // El mismo servidor recibe después un evento nuevo para cerrar su hilo.
        choice(&root, true);
        enqueue_usage(
            &root,
            &Usage::PageViewed {
                page: "studio".into(),
            },
        )
        .expect("fresh event");
        sender::flush_with_hook(
            &root,
            &Http::default(),
            &server.base,
            Some("test"),
            &AtomicBool::new(false),
            || {},
        )
        .expect("fresh generation sends");
        assert!(
            server
                .requests
                .recv_timeout(std::time::Duration::from_secs(5))
                .expect("fresh request")
                .contains("studio")
        );
        server.finish();
        fs::remove_dir_all(root).expect("cleanup");
    }
}

#[test]
fn isa1609_identity_and_observations_reset_on_revocation() {
    let root = tests::root();
    choice(&root, true);
    let before = consented_usage_id(&root)
        .expect("identity")
        .expect("allowed");
    enqueue_once(&root, &Usage::AccountSignedIn {}).expect("observations");
    choice(&root, false);
    assert!(
        !root.join("anonymous-id").exists(),
        "revocation must erase local usage ID"
    );
    for marker in [
        "installation-observed-v1",
        "account-observed-v1",
        "commercial-license-observed-v1",
    ] {
        assert!(
            !root.join(marker).exists(),
            "observation must not cross identities"
        );
    }
    choice(&root, true);
    assert_ne!(
        before,
        consented_usage_id(&root)
            .expect("identity")
            .expect("accepted again")
    );
    enqueue_once(&root, &Usage::AccountSignedIn {}).expect("fresh observations");
    assert!(root.join("usage/00.json").exists() && root.join("usage/01.json").exists());
    fs::remove_dir_all(root).expect("cleanup");
}
