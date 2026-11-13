//! Resident handles only. A missing or unreconciled observation is never empty.
use super::{RequestId, execution::ResidentInstance};
use crate::account_session::AccountGeneration;
use serde::{Deserialize, Serialize};

pub const PROFILE_LIMIT: usize = 128;
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProfileOwnership {
    #[serde(deserialize_with = "super::checked::profile")]
    pub profile: String,
    pub owned_live: bool,
}
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Ownership {
    #[default]
    Unknown,
    Known {
        #[serde(deserialize_with = "super::checked::revision")]
        revision: String,
        profiles: Vec<ProfileOwnership>,
    },
}
impl Ownership {
    pub(super) fn valid(&self) -> bool {
        match self {
            Self::Unknown => true,
            Self::Known { profiles, .. } => {
                profiles.len() <= PROFILE_LIMIT
                    && profiles.iter().enumerate().all(|(i, profile)| {
                        !profiles[..i]
                            .iter()
                            .any(|previous| previous.profile == profile.profile)
                    })
            }
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RemoveProfileChecked {
    pub request: RequestId,
    pub instance: ResidentInstance,
    pub account: AccountGeneration,
    #[serde(deserialize_with = "super::checked::profile")]
    pub profile: String,
    #[serde(deserialize_with = "super::checked::revision")]
    pub revision: String,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RemovalRejection {
    WrongInstance,
    AccountChanged,
    AuthorityUnavailable,
    Denied,
    Busy,
    RevisionMismatch,
    DocumentUnavailable,
    OwnershipUnknown,
    OwnedLive,
    WriteConflict,
    Io,
    Unavailable,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum RemovalReceipt {
    Accepted,
    Rejected { reason: RemovalRejection },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum RemovalOutcome {
    Removed {
        #[serde(deserialize_with = "super::checked::revision")]
        revision: String,
    },
    Failed {
        reason: RemovalRejection,
    },
}
