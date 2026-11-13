use vantare_ipc::launcher::results::{STEP_LIMIT, StepResult, StepState};

/// Private worker snapshot: completeness is required before offering any retry.
#[derive(Clone, Debug)]
pub struct StepSnapshot {
    pub steps: Vec<StepResult>,
    pub complete: bool,
    last_terminal: Vec<Option<StepState>>,
}
impl StepSnapshot {
    pub(super) fn new(count: usize, selected: &[usize]) -> Option<Self> {
        if count == 0 || count > STEP_LIMIT {
            return None;
        }
        let steps = (0u16..)
            .take(count)
            .map(|index| StepResult {
                index,
                state: if selected.contains(&usize::from(index)) {
                    StepState::Pending
                } else {
                    StepState::NotSelected
                },
            })
            .collect();
        Some(Self {
            steps,
            complete: false,
            last_terminal: vec![None; count],
        })
    }
    pub(super) fn reset(&mut self, selected: &[usize]) {
        for step in &mut self.steps {
            step.state = if selected.contains(&usize::from(step.index)) {
                StepState::Pending
            } else {
                StepState::NotSelected
            };
        }
        self.complete = false;
    }
    pub(super) fn mark(&mut self, index: usize, state: StepState) {
        if let Some(step) = self.steps.get_mut(index) {
            if step.state == StepState::NotSelected {
                return;
            }
            if state == StepState::Waiting
                && matches!(step.state, StepState::Ready | StepState::Failed)
            {
                return;
            }
            step.state = state;
            if matches!(
                state,
                StepState::Ready | StepState::Failed | StepState::Cancelled
            ) {
                self.last_terminal[index] = Some(state);
            }
        }
    }
    pub(super) fn finish(&mut self, cancelled: bool) {
        for step in &mut self.steps {
            step.state = match step.state {
                StepState::Pending | StepState::Waiting | StepState::Launching => self
                    .last_terminal[usize::from(step.index)]
                .unwrap_or(if cancelled && step.state != StepState::Pending {
                    StepState::Cancelled
                } else {
                    StepState::NotRun
                }),
                state => state,
            };
        }
        self.complete = true;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn snapshots_keep_repeated_indices_and_reset_results_between_full_passes() {
        let mut result = StepSnapshot::new(5, &[1, 3, 4]).unwrap();
        result.mark(1, StepState::Ready);
        result.mark(3, StepState::Failed);
        result.mark(3, StepState::Waiting);
        result.finish(false);
        assert_eq!(
            result.steps.iter().map(|s| s.state).collect::<Vec<_>>(),
            vec![
                StepState::NotSelected,
                StepState::Ready,
                StepState::NotSelected,
                StepState::Failed,
                StepState::NotRun
            ]
        );
        assert!(result.complete);
        result.reset(&[1, 3, 4]);
        result.mark(1, StepState::Launching);
        result.mark(4, StepState::Waiting);
        result.finish(true);
        assert_eq!(result.steps[1].state, StepState::Ready);
        assert_eq!(result.steps[3].state, StepState::Failed);
        assert_eq!(result.steps[4].state, StepState::Cancelled);
        assert!(StepSnapshot::new(129, &[0]).is_none());
    }
}
