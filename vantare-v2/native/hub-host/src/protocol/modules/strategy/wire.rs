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
        /// The 15 calculation inputs, with the same shape and checks as
        /// `strategy.compute`; `null` creates the event without them. They replace
        /// `basePaceSeconds` and `fuelPerLapLiters`: sending either with `inputs`
        /// is `rejected`.
        inputs: Option<Box<crate::strategy::StrategySolverFields>>,
    },
    #[serde(rename = "strategy.confirm")]
    StrategyConfirm {
        #[serde(rename = "eventId")]
        event_id: String,
        #[serde(rename = "strategyId")]
        strategy_id: String,
        revision: String,
        fields: Box<crate::strategy::StrategyFields>,
        /// The 15 calculation inputs, with the same shape and checks as in
        /// `strategy.create` and `strategy.compute`. `null` (or a missing key, which
        /// Rust accepts as `create` does; the TS validator requires the key) confirms
        /// the fields only and keeps the stored inputs. With inputs they replace
        /// the stored ones as a whole, and nothing is calculated.
        inputs: Option<Box<crate::strategy::StrategySolverFields>>,
    },
    #[serde(rename = "strategy.save")]
    StrategySave { revision: String },
    #[serde(rename = "strategy.discard")]
    StrategyDiscard { revision: String },
    #[serde(rename = "strategy.compute")]
    StrategyCompute {
        #[serde(rename = "eventId")]
        event_id: String,
        #[serde(rename = "strategyId")]
        strategy_id: String,
        revision: String,
        form: Box<crate::strategy::StrategyComputeForm>,
    },
    #[serde(rename = "strategy.cancel")]
    StrategyCancel {
        #[serde(rename = "computeId")]
        compute_id: u32,
    },
    /// Moves the boundary after stint `index` (0-based) to `lap`.
    #[serde(rename = "strategy.moveBoundary")]
    StrategyMoveBoundary {
        revision: String,
        #[serde(rename = "computeId")]
        compute_id: u32,
        index: u32,
        lap: u32,
    },
    /// Moves stop `index` (0-based) one lap earlier (-1) or later (1).
    #[serde(rename = "strategy.moveStop")]
    StrategyMoveStop {
        revision: String,
        #[serde(rename = "computeId")]
        compute_id: u32,
        index: u32,
        delta: i8,
    },
    /// Recalculates with the edited schedule as a constraint (new `computeId`).
    #[serde(rename = "strategy.recalculate")]
    StrategyRecalculate {
        revision: String,
        #[serde(rename = "computeId")]
        compute_id: u32,
    },
    /// Discards the edit and returns to the last feasible plan.
    #[serde(rename = "strategy.resetEdit")]
    StrategyResetEdit {
        revision: String,
        #[serde(rename = "computeId")]
        compute_id: u32,
    },
    /// Asks for «Abrir otro archivo…» (`open`) or «Guardar como…» (`saveAs`). The
    /// host only records a ticket and acknowledges with the current view; the main
    /// process opens the dialog and answers with `PickedStrategyFile`.
    #[serde(rename = "strategy.pickFile")]
    StrategyPickFile {
        mode: crate::strategy::StrategyFileMode,
        revision: String,
    },
    /// Accepts the plan `computeId` names for the active variant: it is kept in the
    /// document (in memory, «Sin guardar») with the entries it came from.
    #[serde(rename = "strategy.accept")]
    StrategyAccept {
        revision: String,
        #[serde(rename = "computeId")]
        compute_id: u32,
    },
    /// Removes the accepted plan of the active variant.
    #[serde(rename = "strategy.unaccept")]
    StrategyUnaccept { revision: String },
    /// Drops the proposal on screen so that the accepted plan is shown.
    #[serde(rename = "strategy.showAccepted")]
    StrategyShowAccepted { revision: String },
    /// The plan `target` names, as text ready to copy. Nothing changes in the host.
    #[serde(rename = "strategy.export")]
    StrategyExport {
        revision: String,
        target: crate::strategy::StrategyExportTarget,
    },
    /// Asks for «Guardar como hoja de cálculo…». As `strategy.pickFile`, the host
    /// only records a ticket and acknowledges (with the name to suggest); the main
    /// process opens the dialog and answers with `PickedStrategyFile`, and the host
    /// writes the CSV there.
    #[serde(rename = "strategy.exportFile")]
    StrategyExportFile {
        revision: String,
        target: crate::strategy::StrategyExportTarget,
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
    #[serde(rename = "strategy.compute")]
    StrategyCompute {
        value: crate::strategy::StrategyView,
    },
    #[serde(rename = "strategy.cancel")]
    StrategyCancel {
        value: crate::strategy::StrategyView,
    },
    #[serde(rename = "strategy.moveBoundary")]
    StrategyMoveBoundary {
        value: crate::strategy::StrategyView,
    },
    #[serde(rename = "strategy.moveStop")]
    StrategyMoveStop {
        value: crate::strategy::StrategyView,
    },
    #[serde(rename = "strategy.recalculate")]
    StrategyRecalculate {
        value: crate::strategy::StrategyView,
    },
    #[serde(rename = "strategy.resetEdit")]
    StrategyResetEdit {
        value: crate::strategy::StrategyView,
    },
    /// The acknowledgement (the current view) and, later, the final answer.
    #[serde(rename = "strategy.pickFile")]
    StrategyPickFile {
        value: crate::strategy::StrategyView,
    },
    #[serde(rename = "strategy.accept")]
    StrategyAccept {
        value: crate::strategy::StrategyView,
    },
    #[serde(rename = "strategy.unaccept")]
    StrategyUnaccept {
        value: crate::strategy::StrategyView,
    },
    #[serde(rename = "strategy.showAccepted")]
    StrategyShowAccepted {
        value: crate::strategy::StrategyView,
    },
    #[serde(rename = "strategy.export")]
    StrategyExport {
        value: crate::strategy::StrategyExportText,
    },
    /// The acknowledgement (the name to suggest) and, later, the final answer.
    #[serde(rename = "strategy.exportFile")]
    StrategyExportFile {
        value: crate::strategy::StrategyExportFileValue,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum HostError {
    StrategyDirty,
    /// A new calculation was refused while an edited schedule is pending.
    StrategyEditPending,
    StrategyImportFailed,
    StrategyInvalidText,
    /// The checks of the calculation refused the data of `strategy.confirm`: the
    /// form field to blame, or `null` when it is not one field. Nothing was kept.
    StrategyInvalidInput {
        field: Option<crate::strategy::StrategyField>,
    },
    /// The chosen file cannot be read or written.
    StrategyFileUnavailable,
    /// The chosen file is over the 12 MiB limit of a document.
    StrategyFileTooLarge,
    /// `saveAs` to a file the host has not observed, or to the primary file from
    /// another document: it is never overwritten.
    StrategyTargetExists,
    /// The ticket of the dialog expired (120 s) before the main process answered.
    StrategyPickExpired,
    /// `strategy.accept` found no plan it can keep: none, without a timeline, not
    /// the active variant's, or an entry the document cannot copy.
    StrategyNotAcceptable,
    /// `strategy.unaccept` or `strategy.showAccepted` on a variant with no accepted plan.
    StrategyNoAcceptedPlan,
    /// `strategy.export` or `strategy.exportFile` found no plan to write: none, not
    /// a calculated or partial one with a timeline, or no accepted plan.
    StrategyNothingToExport,
    /// The CSV was to be written to a file that does not end in `.csv`.
    StrategyExportNotCsv,
    /// Another program (a spreadsheet, usually) has the CSV open and it cannot be
    /// replaced: close it and try again. Never `busy`, which means «wait a moment».
    StrategyFileInUse,
    StrategyConflict {
        current: Box<crate::strategy::StrategyView>,
    },
}

#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
