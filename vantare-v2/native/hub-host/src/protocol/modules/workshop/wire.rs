use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "workshop.catalog")]
    WorkshopCatalog {},
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "workshop.catalog")]
    WorkshopCatalog {
        widgets: Vec<crate::workshop::WidgetScenes>,
    },
}
#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
