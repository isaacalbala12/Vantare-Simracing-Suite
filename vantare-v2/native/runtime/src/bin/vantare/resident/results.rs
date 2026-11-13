//! One scoped run, never an execution history or a source of executable data.
use super::{Chain, ChainFailure, ChainOutcome, Owner, RunId};
use vantare_ipc::launcher::results::{RetryScope, RunMode, RunResults, StepState};

pub(super) struct RunRecord {
    pub summary: RunResults,
    pub original: Vec<usize>,
}
impl RunRecord {
    pub(super) fn selection(&self, scope: RetryScope) -> Vec<usize> {
        match scope {
            RetryScope::All => self.original.clone(),
            RetryScope::Failed => self
                .summary
                .steps
                .iter()
                .filter(|step| step.state == StepState::Failed)
                .map(|step| usize::from(step.index))
                .collect(),
        }
    }
}
impl Owner {
    pub(super) fn begin_results(
        &mut self,
        profile: String,
        mode: RunMode,
        original: Option<Vec<usize>>,
    ) {
        self.run_record = None;
        let Some((run, scope)) = self.active_run.zip(self.active_scope.as_ref()) else {
            return;
        };
        let Some(snapshot) = self.chain.as_ref().and_then(Chain::step_results) else {
            return;
        };
        let original = original.unwrap_or_else(|| {
            snapshot
                .steps
                .iter()
                .filter(|step| step.state != StepState::NotSelected)
                .map(|step| usize::from(step.index))
                .collect()
        });
        self.run_record = Some(RunRecord {
            original,
            summary: RunResults {
                run,
                profile,
                revision: scope.revision.clone(),
                account: scope.account.clone(),
                mode,
                outcome: None,
                steps: snapshot.steps,
            },
        });
    }
    pub(super) fn refresh_results(&mut self) {
        let Some(chain) = self.chain.as_ref() else {
            return;
        };
        if let Some(snapshot) = chain.step_results() {
            if let Some(record) = &mut self.run_record {
                record.summary.steps = snapshot.steps;
            }
        } else {
            self.run_record = None;
        }
    }
    pub(super) fn finish_results(&mut self, run: RunId, outcome: ChainOutcome, chain: &Chain) {
        let snapshot = chain.step_results().filter(|result| result.complete);
        if let Some(snapshot) = snapshot
            && !matches!(
                outcome,
                ChainOutcome::Failed {
                    reason: ChainFailure::Internal | ChainFailure::WorkerPanicked
                }
            )
            && let Some(record) = &mut self.run_record
            && record.summary.run == run
        {
            record.summary.steps = snapshot.steps;
            record.summary.outcome = Some(outcome);
        } else {
            self.run_record = None;
        }
    }
}
