//! Studio is a host-owned document: serialize writes and never replay an uncertain edit.
use vantare_hub_host::{
    protocol::{CoreStatus, HostError, REQUEST_TIMEOUT_MS, Reply, Request, Topic, UiToHost},
    studio::{INSTANCE_LIMIT, OverlayInstance, StudioPlan, StudioState, StudioView},
};

struct Pending {
    id: u32,
    deadline: f64,
    request: Request,
}
pub struct Studio {
    pub value: Option<StudioView>,
    pub selected: String,
    pub problem: Option<&'static str>,
    pub catalog_open: bool,
    pub query: rune::TextEdit,
    pub track_tab: bool,
    pub removing: Option<String>,
    active: bool,
    refresh: bool,
    uncertain: bool,
    next_id: u32,
    pending: Option<Pending>,
    queued: Option<Request>,
}
#[cfg(any(test, debug_assertions))]
pub fn scene(name: &str) -> StudioView {
    let corpus: serde_json::Value = serde_json::from_str(include_str!(
        "../../hub-web/src/contract/generated/corpus/studio.json"
    ))
    .expect("shared Studio corpus");
    let value = corpus["host"]
        .as_array()
        .unwrap()
        .iter()
        .find(|m| {
            m["result"]["method"] == "studio.get"
                && m["result"]["value"]["instances"]
                    .as_array()
                    .is_some_and(|i| !i.is_empty())
        })
        .unwrap();
    let mut view: StudioView = serde_json::from_value(value["result"]["value"].clone()).unwrap();
    match name {
        "studio-vacio" => view.instances.clear(),
        "studio-protegido" => view.state = StudioState::Protected,
        "studio-missing" => {
            view.state = StudioState::Missing;
            view.instances.clear();
        }
        _ => {}
    }
    view
}

impl Default for Studio {
    fn default() -> Self {
        Self {
            value: None,
            selected: String::new(),
            problem: None,
            catalog_open: false,
            query: Default::default(),
            track_tab: false,
            removing: None,
            active: false,
            refresh: false,
            uncertain: false,
            next_id: 0x4000_0000,
            pending: None,
            queued: None,
        }
    }
}
impl Studio {
    pub fn item(&self) -> Option<&OverlayInstance> {
        self.value
            .as_ref()?
            .instances
            .iter()
            .find(|i| i.id == self.selected)
    }
    pub fn busy(&self) -> bool {
        self.pending.is_some() || self.queued.is_some() || self.uncertain
    }
    pub fn reload(&mut self) {
        self.refresh = true;
    }
    #[cfg(test)]
    pub fn revision(&self) -> String {
        self.value
            .as_ref()
            .map_or_else(String::new, |v| v.revision.clone())
    }
    pub fn allowed(&self, request: &Request, core: &CoreStatus) -> bool {
        if matches!(request, Request::StudioGet {}) {
            return true;
        }
        let Some(v) = &self.value else {
            return false;
        };
        // The user must always be able to stop showing overlays, even after access is lost.
        if matches!(request, Request::StudioTrack { show: false }) {
            return v.showing;
        }
        if !core.access.verified
            || core.access.blocked
            || v.state != StudioState::Ready
            || v.plan == StudioPlan::Unverified
        {
            return false;
        }
        match request {
            Request::StudioInstance {
                patch: vantare_hub_host::studio::InstancePatch::Opacity(value),
                ..
            } if !(vantare_hub_host::studio::OPACITY_MIN
                ..=vantare_hub_host::studio::OPACITY_MAX)
                .contains(value) =>
            {
                false
            }
            Request::StudioTrack { show: true } => !v.instances.is_empty(),
            Request::StudioAdd {
                kind,
                base_revision,
            } => {
                *base_revision == v.revision
                    && v.instances.len() < INSTANCE_LIMIT
                    && v.catalog.iter().any(|c| c.kind == *kind && c.allowed)
            }
            Request::StudioUndo { base_revision } => *base_revision == v.revision && v.can_undo,
            Request::StudioRedo { base_revision } => *base_revision == v.revision && v.can_redo,
            Request::StudioVisibility {
                id, base_revision, ..
            }
            | Request::StudioRemove { id, base_revision }
            | Request::StudioInstance {
                id, base_revision, ..
            } => {
                *base_revision == v.revision && v.instances.iter().any(|i| i.id == *id && !i.locked)
            }
            _ => false,
        }
    }
    pub fn queue(&mut self, request: Request, core: &CoreStatus) {
        if self.busy() {
            return;
        }
        if self.allowed(&request, core) {
            self.problem = None;
            self.queued = Some(request);
        } else {
            self.problem = Some("studio.reconfirm");
        }
    }
    pub fn next(&mut self, now: f64, visible: bool, core: &CoreStatus) -> Vec<UiToHost> {
        let mut output = Vec::new();
        if self.pending.as_ref().is_some_and(|p| now >= p.deadline) {
            let pending = self.pending.take().unwrap();
            self.uncertain = !matches!(pending.request, Request::StudioGet {});
            self.problem = Some(if self.uncertain {
                "studio.reconfirm"
            } else {
                "studio.readFailed"
            });
            if self.uncertain {
                self.refresh = true;
            }
        }
        if visible != self.active {
            self.active = visible;
            output.push(if visible {
                UiToHost::Subscribe {
                    topic: Topic::Studio,
                }
            } else {
                UiToHost::Unsubscribe {
                    topic: Topic::Studio,
                }
            });
            if visible {
                self.refresh = true;
            } else {
                self.catalog_open = false;
                self.removing = None;
                self.queued = None;
                if self
                    .pending
                    .as_ref()
                    .is_some_and(|p| matches!(p.request, Request::StudioGet {}))
                {
                    self.pending = None;
                }
            }
        }
        if self.pending.is_some() {
            return output;
        }
        let request = if let Some(request) = self.queued.take() {
            if !self.allowed(&request, core) {
                self.problem = Some("studio.reconfirm");
                return output;
            }
            request
        } else if visible && self.refresh {
            self.refresh = false;
            Request::StudioGet {}
        } else {
            return output;
        };
        let id = self.next_id;
        let Some(next) = id.checked_add(1).filter(|n| *n < 0x8000_0000) else {
            self.problem = Some("studio.offline");
            return output;
        };
        self.next_id = next;
        self.pending = Some(Pending {
            id,
            deadline: now + f64::from(REQUEST_TIMEOUT_MS) / 1000.0,
            request: request.clone(),
        });
        output.push(UiToHost::Request { id, request });
        output
    }
    fn update(&mut self, value: StudioView) {
        if self
            .value
            .as_ref()
            .is_some_and(|old| old.revision != value.revision)
        {
            self.removing = None;
        }
        if !value.instances.iter().any(|i| i.id == self.selected) {
            self.selected = value
                .instances
                .first()
                .map_or_else(String::new, |i| i.id.clone());
        }
        self.value = Some(value);
    }
    pub fn event(&mut self, value: StudioView) -> bool {
        if !self.active {
            return false;
        }
        // Events do not acknowledge an outstanding write or resolve an uncertain timeout.
        self.update(value);
        true
    }
    pub fn accept(&mut self, id: u32, reply: Reply) -> bool {
        let Some(p) = &self.pending else {
            return false;
        };
        if p.id != id {
            return false;
        }
        let matched = matches!(
            (&p.request, &reply),
            (Request::StudioGet {}, Reply::StudioGet { .. })
                | (
                    Request::StudioVisibility { .. },
                    Reply::StudioVisibility { .. }
                )
                | (Request::StudioAdd { .. }, Reply::StudioAdd { .. })
                | (Request::StudioRemove { .. }, Reply::StudioRemove { .. })
                | (Request::StudioInstance { .. }, Reply::StudioInstance { .. })
                | (Request::StudioUndo { .. }, Reply::StudioUndo { .. })
                | (Request::StudioRedo { .. }, Reply::StudioRedo { .. })
                | (Request::StudioTrack { .. }, Reply::StudioTrack { .. })
        );
        if !matched {
            return false;
        }
        let value = match reply {
            Reply::StudioAdd { value, added } => {
                self.selected = added;
                self.catalog_open = false;
                value
            }
            Reply::StudioGet { value }
            | Reply::StudioVisibility { value }
            | Reply::StudioRemove { value }
            | Reply::StudioInstance { value }
            | Reply::StudioUndo { value }
            | Reply::StudioRedo { value }
            | Reply::StudioTrack { value } => value,
            _ => unreachable!(),
        };
        self.pending = None;
        self.uncertain = false;
        self.problem = None;
        self.removing = None;
        self.update(value);
        true
    }
    pub fn fail(&mut self, id: u32, error: &HostError) -> bool {
        if self.pending.as_ref().is_none_or(|p| p.id != id) {
            return false;
        }
        let reading = self
            .pending
            .take()
            .is_some_and(|p| matches!(p.request, Request::StudioGet {}));
        self.problem = Some(match error {
            HostError::StudioConflict { current } => {
                self.update(current.clone());
                "studio.conflict"
            }
            HostError::Protected => "studio.protected",
            HostError::Busy => "studio.busy",
            HostError::CoreUnavailable if reading => "studio.offline",
            _ if reading => "studio.readFailed",
            HostError::Denied
            | HostError::Rejected
            | HostError::Unsupported
            | HostError::Incompatible { .. } => "studio.failed",
            // Io can follow persistence; CoreUnavailable can hide a completed operation.
            // Unknown errors are not proof that a write had no effect.
            _ => {
                self.uncertain = true;
                self.refresh = true;
                "studio.reconfirm"
            }
        });
        true
    }
    pub fn due(&self) -> Option<f64> {
        self.pending.as_ref().map(|p| p.deadline)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn ready() -> (Studio, CoreStatus) {
        let mut s = Studio::default();
        let core = CoreStatus {
            access: vantare_hub_host::protocol::AccessView {
                verified: true,
                ..Default::default()
            },
            ..Default::default()
        };
        let id = request(&s.next(0.0, true, &core));
        assert!(s.accept(
            id,
            Reply::StudioGet {
                value: scene("studio-base")
            }
        ));
        (s, core)
    }
    fn request(messages: &[UiToHost]) -> u32 {
        messages
            .iter()
            .find_map(|m| {
                if let UiToHost::Request { id, .. } = m {
                    Some(*id)
                } else {
                    None
                }
            })
            .unwrap()
    }
    #[test]
    fn changing_revision_closes_remove_confirmation() {
        let (mut s, _) = ready();
        s.removing = Some(s.selected.clone());
        assert!(s.event(scene("studio-base")));
        assert!(s.removing.is_some());
        let mut changed = scene("studio-base");
        changed.revision = "b".repeat(64);
        assert!(s.event(changed));
        assert!(
            s.removing.is_none(),
            "a new document requires a fresh confirmation"
        );
    }
    #[test]
    fn ambiguous_write_errors_block_edits_until_a_successful_read() {
        for error in [HostError::Io, HostError::CoreUnavailable] {
            let (mut s, core) = ready();
            s.queue(
                Request::StudioRemove {
                    id: s.selected.clone(),
                    base_revision: s.revision(),
                },
                &core,
            );
            let id = request(&s.next(1.0, true, &core));
            assert!(s.fail(id, &error));
            assert!(s.busy());
            s.queue(
                Request::StudioRemove {
                    id: s.selected.clone(),
                    base_revision: s.revision(),
                },
                &core,
            );
            let messages = s.next(2.0, true, &core);
            assert!(matches!(
                messages.as_slice(),
                [UiToHost::Request {
                    request: Request::StudioGet {},
                    ..
                }]
            ));
            let refresh_id = request(&messages);
            assert!(s.event(scene("studio-base")));
            assert!(s.busy(), "an event cannot settle an uncertain write");
            assert!(s.fail(refresh_id, &HostError::Io));
            assert!(s.busy());
            assert!(
                s.next(3.0, true, &core).is_empty(),
                "no automatic write retry or read loop"
            );
            s.reload();
            let refresh_id = request(&s.next(4.0, true, &core));
            assert!(s.accept(
                refresh_id,
                Reply::StudioGet {
                    value: scene("studio-base")
                }
            ));
            assert!(!s.busy());
        }
    }
    #[test]
    fn studio_is_subscribed_only_while_visible_and_reentry_refreshes() {
        let (mut s, core) = ready();
        let id = s.selected.clone();
        assert!(s.next(1.0, true, &core).is_empty());
        assert!(matches!(
            s.next(2.0, false, &core).as_slice(),
            [UiToHost::Unsubscribe {
                topic: Topic::Studio
            }]
        ));
        assert!(!s.event(scene("studio-vacio")));
        assert!(!s.next(3.0, true, &core).is_empty());
        assert_eq!(s.selected, id);
    }
    #[test]
    fn writes_are_serial_rechecked_and_never_replayed_on_timeout() {
        let (mut s, mut core) = ready();
        let edit = Request::StudioVisibility {
            id: s.selected.clone(),
            visible: false,
            base_revision: s.revision(),
        };
        s.queue(edit.clone(), &core);
        s.queue(edit.clone(), &core);
        core.access.verified = false;
        assert!(s.next(1.0, true, &core).is_empty());
        assert_eq!(s.problem, Some("studio.reconfirm"));
        core.access.verified = true;
        s.queue(edit.clone(), &core);
        let id = request(&s.next(2.0, true, &core));
        assert!(s.next(3.0, true, &core).is_empty());
        let refresh = s.next(48.0, true, &core);
        let fresh = request(&refresh);
        assert!(matches!(
            refresh.last(),
            Some(UiToHost::Request {
                request: Request::StudioGet {},
                ..
            })
        ));
        s.queue(edit, &core);
        assert!(s.next(49.0, true, &core).is_empty());
        assert!(!s.accept(
            id,
            Reply::StudioVisibility {
                value: scene("studio-base")
            }
        ));
        assert!(s.accept(
            fresh,
            Reply::StudioGet {
                value: scene("studio-base")
            }
        ));
        assert!(!s.busy());
    }
    #[test]
    fn stale_revision_and_conflict_require_a_new_user_action() {
        let (mut s, core) = ready();
        let edit = Request::StudioRemove {
            id: s.selected.clone(),
            base_revision: s.revision(),
        };
        s.queue(edit, &core);
        let id = request(&s.next(1.0, true, &core));
        let mut changed = scene("studio-vacio");
        changed.revision = "a".repeat(64);
        assert!(s.fail(id, &HostError::StudioConflict { current: changed }));
        assert!(s.selected.is_empty());
        assert_eq!(s.problem, Some("studio.conflict"));
        assert!(s.next(2.0, true, &core).is_empty());
        assert!(!s.allowed(
            &Request::StudioUndo {
                base_revision: "b".repeat(64)
            },
            &core
        ));
    }
    #[test]
    fn locked_and_protected_edits_are_denied_but_stop_stays_available() {
        let (mut s, mut core) = ready();
        let edit = Request::StudioVisibility {
            id: s.selected.clone(),
            visible: false,
            base_revision: s.revision(),
        };
        s.value.as_mut().unwrap().instances[0].locked = true;
        assert!(!s.allowed(&edit, &core));
        s.value.as_mut().unwrap().state = StudioState::Protected;
        s.value.as_mut().unwrap().showing = true;
        core.access.blocked = true;
        assert!(!s.allowed(&edit, &core));
        assert!(s.allowed(&Request::StudioTrack { show: false }, &core));
    }
    #[test]
    fn unrelated_reply_cannot_finish_a_pending_write() {
        let (mut s, core) = ready();
        s.queue(
            Request::StudioVisibility {
                id: s.selected.clone(),
                visible: false,
                base_revision: s.revision(),
            },
            &core,
        );
        let id = request(&s.next(1.0, true, &core));
        assert!(!s.accept(
            id,
            Reply::StudioGet {
                value: scene("studio-base")
            }
        ));
        assert!(s.busy());
        assert!(s.accept(
            id,
            Reply::StudioVisibility {
                value: scene("studio-base")
            }
        ));
    }
    #[test]
    fn opacity_bounds_and_catalog_permissions_are_rechecked_before_dispatch() {
        let (mut s, core) = ready();
        for opacity in [0, 19, 101, 255] {
            assert!(!s.allowed(
                &Request::StudioInstance {
                    id: s.selected.clone(),
                    base_revision: s.revision(),
                    patch: vantare_hub_host::studio::InstancePatch::Opacity(opacity),
                },
                &core
            ));
        }
        let info = s
            .value
            .as_ref()
            .unwrap()
            .catalog
            .iter()
            .find(|c| c.allowed)
            .unwrap();
        let kind = info.kind;
        s.queue(
            Request::StudioAdd {
                kind,
                base_revision: s.revision(),
            },
            &core,
        );
        s.value
            .as_mut()
            .unwrap()
            .catalog
            .iter_mut()
            .find(|c| c.kind == kind)
            .unwrap()
            .allowed = false;
        assert!(s.next(1.0, true, &core).is_empty());
        assert_eq!(s.problem, Some("studio.reconfirm"));
    }
    #[test]
    fn read_failure_is_recoverable_and_leave_drops_unsent_edits_and_dialogs() {
        let (mut s, core) = ready();
        s.reload();
        let id = request(&s.next(1.0, true, &core));
        assert!(s.fail(id, &HostError::Unsupported));
        assert_eq!(s.problem, Some("studio.readFailed"));
        s.queue(
            Request::StudioRemove {
                id: s.selected.clone(),
                base_revision: s.revision(),
            },
            &core,
        );
        s.catalog_open = true;
        s.removing = Some(s.selected.clone());
        let messages = s.next(2.0, false, &core);
        assert!(matches!(
            messages.as_slice(),
            [UiToHost::Unsubscribe {
                topic: Topic::Studio
            }]
        ));
        assert!(!s.busy());
        assert!(!s.catalog_open);
        assert!(s.removing.is_none());
    }
}
