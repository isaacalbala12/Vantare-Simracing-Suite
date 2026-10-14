//! Roadmap polling shares the existing shell heartbeat and cancellable IPC worker.
use super::{Command, Context, Inflight, Ordering, Remote};
use std::time::{Duration, Instant};
const REFRESH: Duration = Duration::from_mins(5);

impl Remote {
    pub(super) fn roadmap_reply(
        &mut self,
        publication: Option<super::super::protocol::roadmap_document::Publication>,
        stale: bool,
        message: String,
    ) {
        if publication.is_some() {
            self.publication = publication;
        }
        self.stale = stale;
        self.roadmap_message = message;
    }
    pub(crate) fn roadmap_publication(
        &self,
    ) -> Option<&super::super::protocol::roadmap_document::Publication> {
        self.manual_roadmap.publication(self.publication.as_ref())
    }
    pub(crate) fn roadmap_status(&self) -> &str {
        if self.working() {
            "Cargando roadmap…"
        } else {
            &self.roadmap_message
        }
    }
    pub(crate) fn ensure_roadmap(&mut self, cx: &mut Context<Self>) {
        self.ensure_roadmap_at(Instant::now(), cx);
    }
    fn ensure_roadmap_at(&mut self, now: Instant, cx: &mut Context<Self>) {
        if !self.roadmap_requested
            && !self.working()
            && self.queued.is_none()
            && !self.stop.load(Ordering::Acquire)
            && self
                .roadmap_polled_at
                .is_none_or(|last| now.saturating_duration_since(last) >= REFRESH)
        {
            self.roadmap_requested = true;
            self.request(Command::RoadmapCached, cx);
            if !self.busy() {
                self.roadmap_requested = false;
            }
        }
    }

    pub(crate) fn poll_roadmap(&mut self, visible: bool, now: Instant, cx: &mut Context<Self>) {
        if !visible || self.manual_roadmap.is_capture() || self.stop.load(Ordering::Acquire) {
            return;
        }
        if !self.roadmap_requested {
            if self.working() || self.queued.is_some() {
                return;
            }
            if self
                .roadmap_polled_at
                .is_some_and(|last| now.saturating_duration_since(last) < REFRESH)
            {
                return;
            }
            self.ensure_roadmap_at(now, cx);
            if !self.roadmap_requested {
                self.roadmap_polled_at = Some(now);
            }
            return;
        }
        if self.busy()
            || self.queued.is_some()
            || self
                .roadmap_polled_at
                .is_some_and(|last| now.saturating_duration_since(last) < REFRESH)
        {
            return;
        }
        self.roadmap_polled_at = Some(now);
        self.request_with_kind(Command::RoadmapRefresh, Some(Inflight::Roadmap), cx);
    }
}

#[cfg(test)]
mod tests {
    use super::super::purchase_tests::fixture;
    use super::super::{Area, Reply, mpsc};
    use super::*;
    use gpui::AppContext;

    fn reply() -> Reply {
        Reply::Roadmap {
            publication: Some(
                serde_json::from_str(include_str!(
                    "../../../reference/fixtures/roadmap-clickup-v2-test.json"
                ))
                .expect("publicación QA"),
            ),
            fetched_at: Some(1),
            stale: false,
            message: "Publicación actualizada".into(),
        }
    }

    #[test]
    fn failed_dispatch_is_throttled_instead_of_retrying_on_every_shell_tick() {
        gpui_platform::headless().run(|cx| {
            let file = crate::document::tests::File::new();
            let (send, requests) = mpsc::sync_channel(8);
            let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
            drop(requests);
            remote.update(cx, |remote, cx| {
                let now = Instant::now();
                remote.poll_roadmap(true, now, cx);
                assert!(!remote.roadmap_requested);
                assert_eq!(remote.roadmap_polled_at, Some(now));
                remote.message = "Sin nuevo intento".into();
                remote.ensure_roadmap(cx); // render calls this independently of the heartbeat
                assert_eq!(remote.message, "Sin nuevo intento");
                remote.poll_roadmap(true, now + Duration::from_millis(100), cx);
                assert_eq!(remote.roadmap_polled_at, Some(now));
                remote.poll_roadmap(true, now + REFRESH, cx);
                assert_eq!(remote.roadmap_polled_at, Some(now + REFRESH));
            });
            crate::quit_headless_test(cx);
        });
    }

    #[test]
    fn polling_loads_cache_refreshes_immediately_and_every_five_minutes_without_overlap() {
        gpui_platform::headless().run(|cx| {
            let file = crate::document::tests::File::new();
            let (send, requests) = mpsc::sync_channel(8);
            let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
            remote.update(cx, |remote, cx| {
                let now = Instant::now();
                remote.poll_roadmap(false, now, cx);
                assert!(requests.try_recv().is_err());
                remote.poll_roadmap(true, now, cx);
                assert!(matches!(requests.try_recv(), Ok(Command::RoadmapCached)));
                remote.complete(reply(), cx);
                remote.poll_roadmap(true, now, cx);
                assert!(matches!(requests.try_recv(), Ok(Command::RoadmapRefresh)));
                assert!(!remote.working());
                assert!(!remote.holds_hub_in_game());
                remote.poll_roadmap(true, now + REFRESH, cx);
                assert!(requests.try_recv().is_err(), "no overlap while IPC waits");
                remote.complete(reply(), cx);
                remote.poll_roadmap(true, now + Duration::from_secs(299), cx);
                assert!(requests.try_recv().is_err());
                remote.poll_roadmap(false, now + REFRESH, cx);
                assert!(requests.try_recv().is_err());
                remote.poll_roadmap(true, now + REFRESH, cx);
                assert!(matches!(requests.try_recv(), Ok(Command::RoadmapRefresh)));
                remote.complete(reply(), cx);
                remote.cancel();
                remote.poll_roadmap(true, now + REFRESH * 2, cx);
                assert!(requests.try_recv().is_err());
            });
            crate::quit_headless_test(cx);
        });
    }

    #[test]
    fn failed_refresh_preserves_publication_user_context_and_retries_after_five_minutes() {
        gpui_platform::headless().run(|cx| {
            let file = crate::document::tests::File::new();
            let (send, requests) = mpsc::sync_channel(8);
            let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
            remote.update(cx, |remote, cx| {
                let now = Instant::now();
                remote.ensure_roadmap(cx);
                assert!(matches!(requests.try_recv(), Ok(Command::RoadmapCached)));
                remote.complete(reply(), cx);
                let previous = remote.publication.clone().expect("cache");
                remote.message = "Resultado de usuario".into();
                remote.editor.dirty = true;
                remote.editor.message = "Borrador conservado".into();
                remote.active = Area::Report;
                remote.poll_roadmap(true, now, cx);
                assert!(matches!(requests.try_recv(), Ok(Command::RoadmapRefresh)));
                remote.request(Command::DraftLoad, cx);
                assert!(matches!(remote.queued, Some(Command::DraftLoad)));
                remote.complete(
                    Reply::Error {
                        message: "Offline QA".into(),
                    },
                    cx,
                );
                assert_eq!(
                    remote.publication.as_ref().expect("preserved").id,
                    previous.id
                );
                assert_eq!(remote.roadmap_message, "Offline QA");
                assert_eq!(remote.message, "Resultado de usuario");
                assert_eq!(remote.editor.message, "Borrador conservado");
                assert!(remote.editor.dirty);
                assert!(
                    matches!(requests.try_recv(), Ok(Command::DraftLoad)),
                    "explicit action wins"
                );
                remote.complete(
                    Reply::Error {
                        message: "Draft QA".into(),
                    },
                    cx,
                );
                remote.poll_roadmap(true, now + Duration::from_secs(299), cx);
                assert!(requests.try_recv().is_err());
                remote.poll_roadmap(true, now + REFRESH, cx);
                assert!(matches!(requests.try_recv(), Ok(Command::RoadmapRefresh)));
                remote.complete(
                    Reply::Roadmap {
                        publication: None,
                        fetched_at: None,
                        stale: true,
                        message: "Sin nueva publicación".into(),
                    },
                    cx,
                );
                assert_eq!(
                    remote.publication.as_ref().expect("preserved").id,
                    previous.id
                );
            });
            crate::quit_headless_test(cx);
        });
    }
}
