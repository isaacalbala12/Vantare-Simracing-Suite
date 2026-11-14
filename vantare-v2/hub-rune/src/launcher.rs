//! Launcher UI state. The host owns persistence, discovery and execution.
use crate::launcher_orders::Orders;
use vantare_hub_host::{
    launcher::{
        LauncherView,
        apps::{AppEditor, CatalogView, PickedApp},
        editor::{ProfileDraft, ProfileEditorView},
    },
    protocol::{CoreStatus, HostError, REQUEST_TIMEOUT_MS, Reply, Request, Topic, UiToHost},
};

pub struct ProfileEdit {
    pub source: ProfileEditorView,
    pub original: ProfileDraft,
    pub discard: bool,
    pub confirm_arguments: bool,
}
impl ProfileEdit {
    pub fn loses_arguments(&self) -> bool {
        self.original
            .steps
            .iter()
            .filter(|s| s.has_custom_arguments)
            .any(|old| {
                !self
                    .source
                    .draft
                    .steps
                    .iter()
                    .any(|s| s.key == old.key && s.app_id == old.app_id)
            })
    }
}
#[derive(Default)]
pub struct ProfileFields {
    pub name: rune::TextEdit,
    pub description: rune::TextEdit,
    pub notes: rune::TextEdit,
    pub hotkey: rune::TextEdit,
}
impl ProfileFields {
    fn new(source: &ProfileDraft) -> Self {
        Self {
            name: rune::TextEdit::new(&source.name),
            description: rune::TextEdit::new(&source.description),
            notes: rune::TextEdit::new(&source.notes),
            hotkey: rune::TextEdit::new(&source.hotkey),
        }
    }
    pub fn draft(&self, source: &ProfileDraft) -> ProfileDraft {
        let mut draft = source.clone();
        draft.name = self.name.text.clone();
        draft.description = self.description.text.clone();
        draft.notes = self.notes.text.clone();
        draft.hotkey = self.hotkey.text.clone();
        draft
    }
}
pub struct AppEdit {
    pub source: AppEditor,
    pub picked: Option<PickedApp>,
    pub discard: bool,
    pub confirm_arguments: bool,
}
impl AppEdit {
    pub fn loses_arguments(&self) -> bool {
        (self.picked.is_some() || (self.source.draft.use_discovery && self.source.has_executable))
            && (self.source.has_custom_arguments || self.source.custom_profiles > 0)
    }
}
struct Pending {
    id: u32,
    deadline: f64,
    request: Request,
    account: Option<String>,
}
#[derive(Default)]
pub struct Launcher {
    pub value: Option<LauncherView>,
    pub catalog: Option<CatalogView>,
    pub orders: Orders,
    pub selected: String,
    pub applications: bool,
    pub search: rune::TextEdit,
    pub profile: Option<ProfileEdit>,
    pub fields: ProfileFields,
    pub app: Option<AppEdit>,
    pub app_name: rune::TextEdit,
    pub removing_app: Option<String>,
    pub problem: Option<&'static str>,
    pending: Option<Pending>,
    queued: Option<Request>,
    refresh: bool,
    refresh_resident: bool,
    refresh_catalog: bool,
    active: bool,
    subscribed_resident: bool,
    uncertain: bool,
    next_id: u32,
    // 0=await initial acknowledgement, 1=show native picker, 2=await path, 3=await result.
    picker_phase: u8,
}
pub fn execution_request(request: &Request) -> bool {
    matches!(
        request,
        Request::LauncherLaunchChecked { .. }
            | Request::LauncherResidentAnswer { .. }
            | Request::LauncherResidentCancel { .. }
            | Request::LauncherResidentRehearse { .. }
            | Request::LauncherResidentRetry { .. }
    )
}
fn reading(request: &Request) -> bool {
    matches!(
        request,
        Request::LauncherGet {}
            | Request::LauncherResidentGet {}
            | Request::LauncherCatalog {}
            | Request::LauncherProfileGet { .. }
            | Request::LauncherAppGet { .. }
            | Request::LauncherAppPick { .. }
    )
}
impl Launcher {
    pub fn busy(&self) -> bool {
        self.pending.is_some() || self.queued.is_some() || self.uncertain
    }
    pub fn execution_busy(&self) -> bool {
        self.orders.busy() || self.queued.as_ref().is_some_and(execution_request)
    }
    pub fn reload(&mut self) {
        self.refresh = true;
        self.refresh_resident = true;
        self.refresh_catalog = true;
    }
    pub fn selected(&self) -> Option<&vantare_hub_host::launcher::LauncherProfile> {
        self.value
            .as_ref()?
            .profiles
            .iter()
            .find(|p| p.id == self.selected)
            .or_else(|| self.value.as_ref()?.profiles.iter().find(|p| p.favorite))
            .or_else(|| self.value.as_ref()?.profiles.first())
    }
    pub fn allowed(&self, request: &Request, core: &CoreStatus, home_busy: bool) -> bool {
        if matches!(
            request,
            Request::LauncherGet {} | Request::LauncherResidentGet {} | Request::LauncherCatalog {}
        ) {
            return true;
        }
        let Some(v) = &self.value else {
            return false;
        };
        if execution_request(request) {
            return (!home_busy
                || matches!(
                    request,
                    Request::LauncherResidentCancel { .. } | Request::LauncherResidentAnswer { .. }
                ))
                && self.orders.allowed(request, v, core);
        }
        if !core.access.verified
            || core.access.blocked
            || core.live
            || v.protected
            || v.running
            || v.scanning
            || self.orders.in_flight()
        {
            return false;
        }
        let revision = match request {
            Request::LauncherProfileFavorite {
                id, base_revision, ..
            }
            | Request::LauncherProfileDuplicate { id, base_revision }
            | Request::LauncherProfileOption {
                id, base_revision, ..
            } => {
                if !v.profiles.iter().any(|p| &p.id == id) {
                    return false;
                }
                base_revision
            }
            Request::LauncherTrigger { id, base_revision } => {
                if id
                    .as_ref()
                    .is_some_and(|id| !v.profiles.iter().any(|p| &p.id == id))
                {
                    return false;
                }
                base_revision
            }
            Request::LauncherProfileSave {
                draft,
                base_revision,
            } => {
                use vantare_hub_host::launcher::editor::{
                    DESCRIPTION_MAX, HOTKEY_MAX, NAME_MAX, NOTES_MAX, STEPS_MAX,
                };
                if draft.name.trim().is_empty()
                    || draft.name.len() > NAME_MAX
                    || draft.name.contains('\0')
                    || draft.description.len() > DESCRIPTION_MAX
                    || draft.notes.len() > NOTES_MAX
                    || draft.hotkey.len() > HOTKEY_MAX
                    || draft.steps.len() > STEPS_MAX
                    || draft.steps.is_empty()
                {
                    return false;
                }
                if self.profile.as_ref().is_none_or(|e| {
                    e.source.revision != *base_revision
                        || e.source.draft.id != draft.id
                        || (e.loses_arguments() && !e.confirm_arguments)
                }) {
                    return false;
                }
                base_revision
            }
            Request::LauncherAppSave {
                draft,
                pick_token,
                base_revision,
            } => {
                let Some(e) = &self.app else {
                    return false;
                };
                if draft.id != e.source.draft.id
                    || e.source.revision != *base_revision
                    || draft.name.trim().is_empty()
                    || draft.name.len() > vantare_hub_host::launcher::editor::NAME_MAX
                    || draft.name.contains('\0')
                    || (draft.id.is_none() && pick_token.is_none())
                    || (pick_token.is_some()
                        && e.picked.as_ref().map(|p| &p.token) != pick_token.as_ref())
                    || (e.loses_arguments() && !e.confirm_arguments)
                    || (draft.use_discovery && pick_token.is_some())
                {
                    return false;
                }
                base_revision
            }
            Request::LauncherAppFavorite { base_revision, .. } => base_revision,
            Request::LauncherAppRemove { id, base_revision } => {
                if !self.catalog.as_ref().is_some_and(|c| {
                    c.revision == v.revision && c.apps.iter().any(|a| &a.id == id && a.removable)
                }) || v.profiles.iter().any(|p| p.apps.contains(id))
                {
                    return false;
                }
                base_revision
            }
            Request::LauncherScan {}
            | Request::LauncherProfileGet { .. }
            | Request::LauncherAppGet { .. }
            | Request::LauncherAppPick { .. } => return true,
            // L56 is consumed once its native types merge. Never use legacy profile.delete.
            _ => return false,
        };
        *revision == v.revision
    }
    pub fn queue(&mut self, request: Request, core: &CoreStatus, home_busy: bool) {
        if self.busy() {
            return;
        }
        if self.allowed(&request, core, home_busy) {
            self.queued = Some(request);
            self.problem = None;
        } else {
            self.problem = Some("launcher.changed");
        }
    }
    fn document(&mut self, value: LauncherView) {
        if self
            .value
            .as_ref()
            .is_some_and(|old| old.scanning != value.scanning || old.apps != value.apps)
        {
            self.refresh_catalog = true;
        }
        if self
            .value
            .as_ref()
            .is_some_and(|v| v.revision != value.revision)
        {
            self.removing_app = None;
            self.refresh_catalog = true;
        }
        if !value.profiles.iter().any(|p| p.id == self.selected) {
            self.selected = value
                .profiles
                .iter()
                .find(|p| p.favorite)
                .or(value.profiles.first())
                .map_or_else(String::new, |p| p.id.clone());
        }
        self.value = Some(value);
    }
    pub fn event(&mut self, value: LauncherView) -> bool {
        self.document(value);
        true
    }
    pub fn next(
        &mut self,
        now: f64,
        visible: bool,
        core: &CoreStatus,
        home_busy: bool,
    ) -> Vec<UiToHost> {
        let mut out = Vec::new();
        if let Some(p) = &self.pending
            && now >= p.deadline
        {
            let id = p.id;
            self.fail(id, &HostError::Io);
        }
        if visible != self.active {
            self.active = visible;
            out.push(if visible {
                UiToHost::Subscribe {
                    topic: Topic::Launcher,
                }
            } else {
                UiToHost::Unsubscribe {
                    topic: Topic::Launcher,
                }
            });
            if visible {
                self.reload();
            } else {
                self.queued = None;
                self.removing_app = None;
            }
        }
        let resident = visible || self.orders.busy();
        if resident != self.subscribed_resident {
            self.subscribed_resident = resident;
            out.push(if resident {
                UiToHost::Subscribe {
                    topic: Topic::LauncherResident,
                }
            } else {
                UiToHost::Unsubscribe {
                    topic: Topic::LauncherResident,
                }
            });
            if resident {
                self.refresh_resident = true;
            }
        }
        if self.pending.is_some() {
            return out;
        }
        let request = if let Some(request) = self.queued.take() {
            if !self.allowed(&request, core, home_busy) {
                self.problem = Some("launcher.changed");
                return out;
            }
            request
        } else if visible && self.refresh {
            self.refresh = false;
            Request::LauncherGet {}
        } else if resident && self.refresh_resident {
            self.refresh_resident = false;
            Request::LauncherResidentGet {}
        } else if visible && self.refresh_catalog {
            self.refresh_catalog = false;
            Request::LauncherCatalog {}
        } else {
            return out;
        };
        if execution_request(&request) && !self.orders.begin(request.clone(), core) {
            self.problem = Some("control.unavailable");
            return out;
        }
        self.next_id = self.next_id.max(0x2000_0000);
        let id = self.next_id;
        let Some(next) = id.checked_add(1).filter(|id| *id < 0x4000_0000) else {
            self.problem = Some("launcher.failed");
            return out;
        };
        self.next_id = next;
        self.picker_phase = 0;
        self.pending = Some(Pending {
            id,
            deadline: now + f64::from(REQUEST_TIMEOUT_MS) / 1000.0,
            request: request.clone(),
            account: core.account_generation.clone(),
        });
        out.push(UiToHost::Request { id, request });
        out
    }
    pub fn accept(&mut self, id: u32, result: Reply, now: f64) -> bool {
        let Some(p) = &mut self.pending else {
            return false;
        };
        if p.id != id {
            return false;
        }
        let Some(method) = serde_json::to_value(&p.request)
            .ok()
            .and_then(|v| v.get("method").cloned())
        else {
            return false;
        };
        if serde_json::to_value(&result)
            .ok()
            .and_then(|v| v.get("method").cloned())
            .as_ref()
            != Some(&method)
        {
            return false;
        }
        if matches!(result, Reply::LauncherAppPick { value: None }) && self.picker_phase == 0 {
            self.picker_phase = 1;
            p.deadline = now
                + std::time::Duration::from_secs(
                    vantare_hub_host::launcher::apps::PICK_LIFETIME_SECONDS,
                )
                .as_secs_f64();
            return true;
        }
        if matches!(result, Reply::LauncherAppPick { .. }) && self.picker_phase != 3 {
            return false;
        }
        let request = self.pending.take().unwrap().request;
        match result {
            Reply::LauncherGet { value }
            | Reply::LauncherScan { value }
            | Reply::LauncherProfileFavorite { value }
            | Reply::LauncherProfileDuplicate { value }
            | Reply::LauncherProfileOption { value }
            | Reply::LauncherTrigger { value }
            | Reply::LauncherProfileSave { value }
            | Reply::LauncherAppSave { value }
            | Reply::LauncherAppRemove { value }
            | Reply::LauncherAppFavorite { value } => {
                if matches!(request, Request::LauncherProfileSave { .. }) {
                    self.profile = None;
                }
                if matches!(request, Request::LauncherAppSave { .. }) {
                    self.app = None;
                }
                self.document(value);
                self.uncertain = false;
            }
            Reply::LauncherCatalog { value } => self.catalog = Some(value),
            Reply::LauncherResidentGet { value } => self.orders.view = Some(value),
            Reply::LauncherProfileGet { value } => {
                self.fields = ProfileFields::new(&value.draft);
                self.profile = Some(ProfileEdit {
                    original: value.draft.clone(),
                    source: value,
                    discard: false,
                    confirm_arguments: false,
                });
            }
            Reply::LauncherAppGet { value } => {
                self.app_name = rune::TextEdit::new(&value.draft.name);
                self.app = Some(AppEdit {
                    source: value,
                    picked: None,
                    discard: false,
                    confirm_arguments: false,
                });
            }
            Reply::LauncherAppPick { value } => {
                if let Some(app) = &mut self.app {
                    if let Some(picked) = &value {
                        app.source.draft.use_discovery = false;
                        if self.app_name.text.trim().is_empty() {
                            self.app_name = rune::TextEdit::new(&picked.name);
                        }
                    }
                    app.confirm_arguments = false;
                    app.picked = value;
                }
                self.picker_phase = 0;
            }
            Reply::LauncherLaunchChecked {
                value: vantare_hub_host::launcher::checked::LaunchQueued::Queued { request },
            }
            | Reply::LauncherResidentAnswer {
                value: vantare_hub_host::launcher_resident::ResidentQueued::Queued { request },
            }
            | Reply::LauncherResidentCancel {
                value: vantare_hub_host::launcher_resident::ResidentQueued::Queued { request },
            }
            | Reply::LauncherResidentRehearse {
                value: vantare_hub_host::launcher_resident::ResidentQueued::Queued { request },
            }
            | Reply::LauncherResidentRetry {
                value: vantare_hub_host::launcher_resident::ResidentQueued::Queued { request },
            } => self.orders.queued(request, now),
            _ => return false,
        }
        self.problem = None;
        true
    }
    pub fn open_picker(&mut self) -> Option<u32> {
        if self.picker_phase != 1 {
            return None;
        }
        self.picker_phase = 2;
        Some(self.pending.as_ref()?.id)
    }
    pub fn picked(&mut self, id: u32, path: Option<String>, core: &CoreStatus) -> Option<UiToHost> {
        let p = self.pending.as_ref()?;
        if self.picker_phase != 2 || p.id != id {
            return None;
        }
        self.picker_phase = 3;
        let path =
            if p.account == core.account_generation && core.access.verified && !core.access.blocked
            {
                path
            } else {
                None
            };
        Some(UiToHost::PickedExecutable(
            vantare_hub_host::launcher::apps::ExecutableSelection { id, path },
        ))
    }
    pub fn fail(&mut self, id: u32, error: &HostError) -> bool {
        if self.pending.as_ref().is_none_or(|p| p.id != id) {
            return false;
        }
        let p = self.pending.take().unwrap();
        self.picker_phase = 0;
        if execution_request(&p.request) {
            self.orders.failed(error);
        }
        self.problem = Some(match error {
            HostError::LauncherConflict { current } => {
                self.document(current.clone());
                "action.conflict"
            }
            HostError::Busy => "launcher.busy",
            HostError::ResidentAnswerRejected { .. }
            | HostError::ResidentControlRejected { .. } => "control.rejected",
            HostError::Protected => "launcher.protected",
            HostError::Denied
            | HostError::Rejected
            | HostError::Unsupported
            | HostError::Incompatible { .. } => "launcher.denied",
            _ if reading(&p.request) => "launcher.coreUnavailable",
            _ if execution_request(&p.request) => "control.unknown",
            _ => {
                self.uncertain = true;
                self.refresh = true;
                "action.reconfirm"
            }
        });
        true
    }
    pub fn due(&self) -> Option<f64> {
        self.pending
            .as_ref()
            .map(|p| p.deadline)
            .into_iter()
            .chain(self.orders.due())
            .min_by(f64::total_cmp)
    }
}

#[cfg(any(test, debug_assertions))]
pub fn scene(name: &str) -> LauncherView {
    let corpus: serde_json::Value = serde_json::from_str(include_str!(
        "../../hub-web/src/contract/generated/corpus/launcher.json"
    ))
    .expect("shared Launcher corpus");
    let mut view: LauncherView = serde_json::from_value(
        corpus["host"]
            .as_array()
            .unwrap()
            .iter()
            .find(|m| m["result"]["method"] == "launcher.get")
            .unwrap()["result"]["value"]
            .clone(),
    )
    .unwrap();
    match name {
        "launcher-vacio" => view.profiles.clear(),
        "launcher-protegido" => view.protected = true,
        _ => {}
    }
    view
}
