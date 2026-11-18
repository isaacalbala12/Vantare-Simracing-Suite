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
    #[serde(rename = "strategy.create")]
    StrategyCreate {
        revision: String,
        fields: Box<crate::strategy::StrategyFields>,
        #[serde(rename = "basePaceSeconds")]
        base_pace_seconds: Option<String>,
        #[serde(rename = "fuelPerLapLiters")]
        fuel_per_lap_liters: Option<String>,
    },
    #[serde(rename = "strategy.confirm")]
    StrategyConfirm {
        #[serde(rename = "eventId")]
        event_id: String,
        #[serde(rename = "strategyId")]
        strategy_id: String,
        revision: String,
        fields: Box<crate::strategy::StrategyFields>,
    },
    #[serde(rename = "strategy.save")]
    StrategySave { revision: String },
    #[serde(rename = "strategy.discard")]
    StrategyDiscard { revision: String },
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
    #[serde(rename = "strategy.create")]
    StrategyCreate {
        value: crate::strategy::StrategyView,
    },
    #[serde(rename = "strategy.confirm")]
    StrategyConfirm {
        value: crate::strategy::StrategyView,
    },
    #[serde(rename = "strategy.save")]
    StrategySave {
        value: crate::strategy::StrategyView,
    },
    #[serde(rename = "strategy.discard")]
    StrategyDiscard {
        value: crate::strategy::StrategyView,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum HostError {
    StrategyDirty,
    StrategyImportFailed,
    StrategyInvalidText,
    StrategyConflict {
        current: crate::strategy::StrategyView,
    },
}

#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
