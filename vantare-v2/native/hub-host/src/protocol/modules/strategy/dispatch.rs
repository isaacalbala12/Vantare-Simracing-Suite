use super::{HostError, HostToUi, Pipe, Reply, Request, Session, frame, io};

pub(super) fn allowed(session: &Session) -> bool {
    session.current.access.verified && !session.current.access.blocked && session.closing.is_none()
}

pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    let allowed = allowed(session);
    let strategy = &mut session.strategy;
    let allowed = strategy.observe(session.current.account_generation.as_deref(), allowed);
    strategy.poll_calculation();
    let result = if allowed {
        match request {
            Request::StrategyOpen {} => strategy.open().map(|value| Reply::StrategyOpen { value }),
            Request::StrategyView {} => strategy
                .view_opened()
                .map(|value| Reply::StrategyView { value }),
            Request::StrategySelect {
                event_id,
                strategy_id,
                revision,
            } => strategy
                .select(event_id, strategy_id, revision)
                .map(|value| Reply::StrategySelect { value }),
            Request::StrategyCreate {
                revision,
                fields,
                base_pace_seconds,
                fuel_per_lap_liters,
            } => strategy
                .create(
                    revision,
                    fields,
                    base_pace_seconds.as_deref(),
                    fuel_per_lap_liters.as_deref(),
                    &chrono::Utc::now().to_rfc3339(),
                )
                .map(|value| Reply::StrategyCreate { value }),
            Request::StrategyConfirm {
                event_id,
                strategy_id,
                revision,
                fields,
            } => strategy
                .confirm(event_id, strategy_id, revision, fields)
                .map(|value| Reply::StrategyConfirm { value }),
            Request::StrategySave { revision } => strategy
                .save(revision)
                .map(|value| Reply::StrategySave { value }),
            Request::StrategyDiscard { revision } => strategy
                .discard(revision)
                .map(|value| Reply::StrategyDiscard { value }),
            Request::StrategyCompute {
                event_id,
                strategy_id,
                revision,
                form,
            } => strategy
                .compute(event_id, strategy_id, revision, form)
                .map(|value| Reply::StrategyCompute { value }),
            Request::StrategyCancel { compute_id } => strategy
                .cancel_calculation(*compute_id)
                .map(|value| Reply::StrategyCancel { value }),
            Request::StrategyMoveBoundary {
                revision,
                compute_id,
                index,
                lap,
            } => strategy
                .move_boundary(revision, *compute_id, *index, *lap)
                .map(|value| Reply::StrategyMoveBoundary { value }),
            Request::StrategyMoveStop {
                revision,
                compute_id,
                index,
                delta,
            } => strategy
                .move_stop(revision, *compute_id, *index, *delta)
                .map(|value| Reply::StrategyMoveStop { value }),
            Request::StrategyRecalculate {
                revision,
                compute_id,
            } => strategy
                .recalculate(revision, *compute_id)
                .map(|value| Reply::StrategyRecalculate { value }),
            Request::StrategyResetEdit {
                revision,
                compute_id,
            } => strategy
                .reset_edit(revision, *compute_id)
                .map(|value| Reply::StrategyResetEdit { value }),
            _ => Err(HostError::Rejected),
        }
    } else {
        Err(HostError::Denied)
    };
    let message = match result {
        Ok(result) => HostToUi::Response { id, result },
        Err(error) => HostToUi::Failure { id, error },
    };
    frame::write(pipe, &message)
}
