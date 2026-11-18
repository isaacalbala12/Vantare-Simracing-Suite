use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "strategy.open")]
    StrategyOpen {},
    #[serde(rename = "strategy.view")]
    StrategyView {},
    #[serde(rename = "strategy.select")]
    StrategySelect {
        #[serde(rename = "eventId")]
        event_id: String,
        #[serde(rename = "strategyId")]
        strategy_id: String,
        revision: String,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "strategy.open")]
    StrategyOpen {
        value: crate::strategy::StrategyView,
    },
    #[serde(rename = "strategy.view")]
    StrategyView {
        value: crate::strategy::StrategyView,
    },
    #[serde(rename = "strategy.select")]
    StrategySelect {
        value: crate::strategy::StrategyView,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum HostError {
    StrategyConflict {
        current: crate::strategy::StrategyView,
    },
}

#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
