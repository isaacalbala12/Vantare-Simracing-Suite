use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "onboarding.get")]
    OnboardingGet {},
    #[serde(rename = "onboarding.finish")]
    OnboardingFinish {
        kit: Vec<crate::onboarding::WidgetKind>,
        level: crate::settings::track::PerformanceLevel,
        show: bool,
        #[serde(rename = "baseRevision")]
        base_revision: String,
        #[serde(rename = "layoutRevision")]
        layout_revision: String,
    },
    #[serde(rename = "onboarding.skipPrivate")]
    OnboardingSkipPrivate {},
    #[serde(rename = "onboarding.prices")]
    OnboardingPrices {},
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "onboarding.get")]
    OnboardingGet {
        value: crate::onboarding::OnboardingView,
    },
    #[serde(rename = "onboarding.finish")]
    OnboardingFinish {
        value: crate::onboarding::OnboardingView,
    },
    #[serde(rename = "onboarding.skipPrivate")]
    OnboardingSkipPrivate { accepted: bool },
    #[serde(rename = "onboarding.prices")]
    OnboardingPrices { accepted: bool },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum HostError {
    OnboardingConflict {},
}
#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
