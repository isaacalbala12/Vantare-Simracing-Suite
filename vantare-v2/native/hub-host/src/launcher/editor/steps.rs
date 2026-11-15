//! Opaque read capabilities bind a saved step to its original profile and revision.
use super::{HostError, Path, PreparedDuplicate, ProfileDraft, ProfileEditorView};
use std::collections::{BTreeMap, BTreeSet};
use vantare_launcher::{Profile, Step};

#[derive(Default)]
pub struct StepKeys {
    revision: String,
    profile: Option<String>,
    indices: BTreeMap<String, usize>,
    prepared: Option<Profile>,
}
impl StepKeys {
    pub fn open(&mut self, path: &Path, id: Option<&str>) -> Result<ProfileEditorView, HostError> {
        // Any new read replaces the preceding capabilities, including a failed read.
        *self = Self::default();
        let mut view = super::get(path, id)?;
        let next = Self::issue(&mut view)?;
        let view = super::checked(view)?;
        *self = next;
        Ok(view)
    }
    /// Preparation only reserves capabilities in this Session; it never writes the store.
    pub fn prepare_duplicate(
        &mut self,
        path: &Path,
        id: &str,
        revision: &str,
    ) -> Result<PreparedDuplicate, HostError> {
        *self = Self::default();
        let bytes = super::duplicate_bytes(path, revision)?;
        let document =
            vantare_launcher::Document::from_bytes(&bytes).map_err(|_| HostError::Protected)?;
        let source = document
            .profiles
            .iter()
            .find(|profile| profile.id == id)
            .ok_or(HostError::Denied)?;
        if document.profiles.len() >= crate::launcher::PROFILE_LIMIT
            || source.name.len() + crate::launcher::actions::COPY_SUFFIX.len() > super::NAME_MAX
        {
            return Err(HostError::Denied);
        }
        let target = format!(
            "profile-{}",
            vantare_services::random_id().map_err(|_| HostError::Io)?
        );
        if document.profiles.iter().any(|profile| profile.id == target) {
            return Err(HostError::Rejected);
        }
        let copy = source.duplicate(target);
        let mut view = ProfileEditorView {
            revision: revision.into(),
            draft: super::draft(&copy),
        };
        let mut next = Self::issue(&mut view)?;
        let view = super::checked_duplicate(PreparedDuplicate {
            base_revision: view.revision,
            draft: view.draft,
        })?;
        next.prepared = Some(copy);
        *self = next;
        Ok(view)
    }
    pub fn is_prepared_duplicate(&self) -> bool {
        self.prepared.is_some()
    }
    pub(super) fn prepared_profile(&self, id: &str) -> Option<&Profile> {
        self.prepared.as_ref().filter(|profile| profile.id == id)
    }
    pub(super) fn issue(view: &mut ProfileEditorView) -> Result<Self, HostError> {
        let mut indices = BTreeMap::new();
        for (index, step) in view.draft.steps.iter_mut().enumerate() {
            let key = vantare_services::random_id().map_err(|_| HostError::Io)?;
            indices.insert(key.clone(), index);
            step.key = Some(key);
        }
        Ok(Self {
            revision: view.revision.clone(),
            profile: view.draft.id.clone(),
            indices,
            prepared: None,
        })
    }
    pub(super) fn matches(&self, profile: Option<&str>, revision: &str) -> bool {
        self.profile.as_deref() == profile && self.revision == revision
    }
}
// Caller invariant: editor::save verified matches(draft.id, observed_revision)
// before apply/preserve. This private helper only resolves that read's indices;
// it never authenticates a renderer-provided key without the host registry.
pub(super) fn preserve(
    profile: &Profile,
    draft: &ProfileDraft,
    keys: Option<&StepKeys>,
) -> Result<Vec<Step>, HostError> {
    let mut seen = BTreeSet::new();
    draft
        .steps
        .iter()
        .map(|step| {
            let previous = match &step.key {
                None => None,
                Some(key) => {
                    if !seen.insert(key) {
                        return Err(HostError::Denied);
                    }
                    let keys = keys
                        .filter(|keys| keys.profile == draft.id)
                        .ok_or(HostError::Denied)?;
                    let index = keys.indices.get(key).ok_or(HostError::Denied)?;
                    profile
                        .steps
                        .get(*index)
                        .filter(|previous| previous.app_id == step.app_id)
                }
            };
            Ok(Step {
                app_id: step.app_id.clone(),
                delay_seconds: step.delay_seconds,
                args_override: previous.and_then(|previous| previous.args_override.clone()),
            })
        })
        .collect()
}
