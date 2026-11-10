//! Owned wire variants. The build assembles the closed transport enums.
use super::super::*;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "roadmap.cached")]
    RoadmapCached {},
    #[serde(rename = "roadmap.refresh")]
    RoadmapRefresh {},
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "roadmap.cached")]
    RoadmapCached { value: crate::roadmap::RoadmapView },
    #[serde(rename = "roadmap.refresh")]
    RoadmapRefresh { value: crate::roadmap::RoadmapView },
}

#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
