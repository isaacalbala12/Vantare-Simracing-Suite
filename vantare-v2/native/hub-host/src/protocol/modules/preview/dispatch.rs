use super::{HostError, HostToUi, Pipe, Reply, Request, Session, frame, io};
use crate::preview::{PreviewError, PreviewImage};
pub(super) fn message(id: u32, result: Result<PreviewImage, HostError>) -> HostToUi {
    let message = match result {
        Ok(value) => HostToUi::Response {
            id,
            result: Reply::PreviewRender { value },
        },
        Err(error) => HostToUi::Failure { id, error },
    };
    if serde_json::to_vec(&message).is_ok_and(|bytes| bytes.len() <= frame::LIMIT) {
        message
    } else {
        HostToUi::Failure {
            id,
            error: HostError::PreviewFailed {
                reason: PreviewError::TooLarge,
            },
        }
    }
}
pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    let result = (|| {
        let Request::PreviewRender { target, scale, .. } = request else {
            return Err(HostError::Rejected);
        };
        let access = super::studio::access(session);
        if session.current.live || access.is_none() || session.closing.is_some() {
            return Err(HostError::Denied);
        }
        if !target.valid() {
            return Err(HostError::PreviewFailed {
                reason: PreviewError::InvalidInput,
            });
        }
        #[cfg(windows)]
        {
            use crate::preview::PreviewTarget;
            if session.preview_state.busy() {
                return Err(HostError::Busy);
            }
            let generation = session
                .current
                .account_generation
                .clone()
                .ok_or(HostError::CoreUnavailable)?;
            let settings = match target {
                PreviewTarget::Instance { id, base_revision } => {
                    session.studio.preview_settings(id, base_revision, access)?
                }
                PreviewTarget::Catalog { widget } => {
                    if !widget.info(access).allowed {
                        return Err(HostError::Denied);
                    }
                    let defaults =
                        crate::widget_defaults::get(widget.id()).ok_or(HostError::Rejected)?;
                    (*widget, defaults.settings.get().as_bytes().to_vec())
                }
            };
            session.preview_state.start(
                id,
                &settings,
                *scale,
                generation,
                std::time::Instant::now(),
            )?;
            Ok(())
        }
        #[cfg(not(windows))]
        {
            let _ = scale;
            Err(HostError::PreviewFailed {
                reason: PreviewError::Unavailable,
            })
        }
    })();
    match result {
        Ok(()) => Ok(()), // Only the terminal reply is emitted by the existing tick.
        Err(error) => frame::write(pipe, &message(id, Err(error))),
    }
}
