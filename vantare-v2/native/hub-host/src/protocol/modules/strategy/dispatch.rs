use super::{HostError, HostToUi, Pipe, Reply, Request, Session, frame, io};

pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    let allowed = session.current.access.verified
        && !session.current.access.blocked
        && session.closing.is_none();
    let strategy = &mut session.strategy;
    strategy.observe(session.current.account_generation.as_deref(), allowed);
    let result = if allowed {
        match request {
            Request::StrategyOpen {} => strategy.open().map(|value| Reply::StrategyOpen { value }),
            Request::StrategyView {} => Ok(Reply::StrategyView {
                value: strategy.view(),
            }),
            Request::StrategySelect {
                event_id,
                strategy_id,
                revision,
            } => strategy
                .select(event_id, strategy_id, revision)
                .map(|value| Reply::StrategySelect { value }),
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
