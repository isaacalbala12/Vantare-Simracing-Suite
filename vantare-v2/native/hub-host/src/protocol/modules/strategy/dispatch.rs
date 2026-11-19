use super::{HostError, HostToUi, Pipe, Reply, Request, Session, frame, io};

pub(super) fn allowed(session: &Session) -> bool {
    session.current.access.verified && !session.current.access.blocked && session.closing.is_none()
}

/// The trusted answer of the main process to a ticket. Without access, or for
/// another account, it is denied; without a ticket it is ignored the same way.
pub(super) fn picked(
    session: &mut Session,
    pipe: &mut Pipe,
    selection: &crate::strategy::StrategyFileSelection,
) -> io::Result<()> {
    let allowed = allowed(session);
    let strategy = &mut session.strategy;
    let allowed = strategy.observe(session.current.account_generation.as_deref(), allowed);
    strategy.poll_calculation();
    let result = if allowed {
        strategy.picked_file(selection, std::time::Instant::now())
    } else {
        // Whoever cannot be served cannot hold a ticket either.
        strategy.drop_ticket();
        Err(HostError::Denied)
    };
    let message = match result {
        Ok(value) => HostToUi::Response {
            id: selection.id,
            result: Reply::StrategyPickFile { value },
        },
        Err(error) => HostToUi::Failure {
            id: selection.id,
            error,
        },
    };
    frame::write(pipe, &message)
}

#[allow(clippy::too_many_lines)] // One flat match with an arm per request.
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
                inputs,
            } => strategy
                .create(
                    revision,
                    fields,
                    base_pace_seconds.as_deref(),
                    fuel_per_lap_liters.as_deref(),
                    inputs.as_deref(),
                    &chrono::Utc::now().to_rfc3339(),
                )
                .map(|value| Reply::StrategyCreate { value }),
            Request::StrategyConfirm {
                event_id,
                strategy_id,
                revision,
                fields,
                inputs,
            } => strategy
                .confirm(event_id, strategy_id, revision, fields, inputs.as_deref())
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
            Request::StrategyPickFile { mode, revision } => strategy
                .pick_file(id, *mode, revision, std::time::Instant::now())
                .map(|value| Reply::StrategyPickFile { value }),
            Request::StrategyAccept {
                revision,
                compute_id,
            } => strategy
                .accept(
                    revision,
                    *compute_id,
                    &chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
                )
                .map(|value| Reply::StrategyAccept { value }),
            Request::StrategyUnaccept { revision } => strategy
                .unaccept(revision)
                .map(|value| Reply::StrategyUnaccept { value }),
            Request::StrategyShowAccepted { revision } => strategy
                .show_accepted(revision)
                .map(|value| Reply::StrategyShowAccepted { value }),
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
