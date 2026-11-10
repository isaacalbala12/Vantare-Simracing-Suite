//! Editable presentation fields only. Opaque profile extensions stay in Rust.
use crate::protocol::HostError;
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_ipc::services_protocol::pilot_document::{PilotPhoto, PilotProfile, PilotState};

pub const NAME_LIMIT: usize = 64;
pub const DESCRIPTION_LIMIT: usize = 280;
pub const FAVORITE_LIMIT: usize = 120;
pub const SIMULATOR_LIMIT: usize = 64;
pub const SIMULATOR_COUNT: usize = 16;
pub use vantare_services::pilot::{MAX_SOURCE_BYTES, MAX_SOURCE_SIDE, PHOTO_SIDE};
pub const MAX_PHOTO_BYTES: usize = vantare_ipc::services_protocol::pilot_document::MAX_PHOTO_BYTES;

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PilotFields {
    pub public_name: String,
    pub description: String,
    pub country: Option<String>,
    pub simulators: Vec<String>,
    pub favorite_car: String,
    pub favorite_team: String,
    pub photo: Option<String>,
}
impl PilotFields {
    fn apply(&self, profile: &mut PilotProfile) {
        profile.public_name.clone_from(&self.public_name);
        profile.description.clone_from(&self.description);
        profile.country.clone_from(&self.country);
        profile.simulators.clone_from(&self.simulators);
        profile.favorite_car.clone_from(&self.favorite_car);
        profile.favorite_team.clone_from(&self.favorite_team);
        profile.photo = self
            .photo
            .as_ref()
            .map(|jpeg| PilotPhoto { jpeg: jpeg.clone() });
    }
    pub fn valid(&self) -> bool {
        let mut profile = PilotProfile::default();
        self.apply(&mut profile);
        profile.validate()
    }
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PilotView {
    pub fields: PilotFields,
    pub revision: String,
    pub pending: bool,
}
pub fn view(state: &PilotState) -> PilotView {
    let profile = &state.profile;
    PilotView {
        fields: PilotFields {
            public_name: profile.public_name.clone(),
            description: profile.description.clone(),
            country: profile.country.clone(),
            simulators: profile.simulators.clone(),
            favorite_car: profile.favorite_car.clone(),
            favorite_team: profile.favorite_team.clone(),
            photo: profile.photo.as_ref().map(|photo| photo.jpeg.clone()),
        },
        revision: state.revision.to_string(),
        pending: state.pending,
    }
}
pub fn save(
    state: Option<&PilotState>,
    fields: &PilotFields,
    revision: &str,
) -> Result<vantare_ipc::services_protocol::Command, HostError> {
    let state = state.ok_or(HostError::Denied)?;
    if revision != state.revision.to_string() || !fields.valid() {
        return Err(HostError::Denied);
    }
    let mut profile = state.profile.clone();
    fields.apply(&mut profile);
    if !profile.validate() {
        return Err(HostError::Denied);
    }
    Ok(vantare_ipc::services_protocol::Command::PilotSave {
        profile,
        expected_revision: state.revision,
    })
}
#[cfg(any(test, feature = "bindings"))]
pub fn countries() -> Vec<String> {
    (b'A'..=b'Z')
        .flat_map(|a| (b'A'..=b'Z').map(move |b| String::from_utf8(vec![a, b]).expect("ASCII")))
        .filter(|code| vantare_ipc::services_protocol::pilot_document::country_valid(code))
        .collect()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn saves_only_known_fields_at_the_loaded_revision_and_preserves_extensions() {
        let mut state = PilotState {
            revision: u64::MAX,
            ..Default::default()
        };
        state
            .profile
            .extensions
            .insert("future".into(), serde_json::json!({"team":42}));
        let mut fields = view(&state).fields;
        fields.public_name = "QA".into();
        assert!(save(None, &fields, "0").is_err());
        assert!(save(Some(&state), &fields, "0").is_err());
        let vantare_ipc::services_protocol::Command::PilotSave {
            profile,
            expected_revision,
        } = save(Some(&state), &fields, &state.revision.to_string()).expect("CAS intent")
        else {
            panic!("save")
        };
        assert_eq!(profile.extensions, state.profile.extensions);
        assert_eq!(expected_revision, u64::MAX);
        assert_eq!(profile.public_name, "QA");
        assert_eq!(view(&state).revision, u64::MAX.to_string());
    }
    #[test]
    fn exported_ui_limits_match_the_authoritative_profile_validation() {
        for (limit, field) in [
            (NAME_LIMIT, "name"),
            (DESCRIPTION_LIMIT, "description"),
            (FAVORITE_LIMIT, "car"),
            (FAVORITE_LIMIT, "team"),
        ] {
            for size in [limit, limit + 1] {
                let mut fields = PilotFields::default();
                match field {
                    "name" => fields.public_name = "ñ".repeat(size),
                    "description" => fields.description = "ñ".repeat(size),
                    "car" => fields.favorite_car = "ñ".repeat(size),
                    _ => fields.favorite_team = "ñ".repeat(size),
                }
                assert_eq!(fields.valid(), size == limit);
            }
        }
        let mut fields = PilotFields {
            simulators: vec!["x".repeat(SIMULATOR_LIMIT)],
            ..Default::default()
        };
        assert!(fields.valid());
        fields.simulators[0].push('x');
        assert!(!fields.valid());
        fields.simulators = (0..SIMULATOR_COUNT).map(|i| format!("qa{i}")).collect();
        assert!(fields.valid());
        fields.simulators.push("extra".into());
        assert!(!fields.valid());
        assert!(countries().contains(&"ES".into()));
        assert!(!countries().contains(&"ZZ".into()));
    }
}
