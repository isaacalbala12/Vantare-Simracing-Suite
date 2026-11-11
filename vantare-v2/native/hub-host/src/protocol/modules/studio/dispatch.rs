use super::{Event, HostError, HostToUi, Pipe, Reply, Request, Session, Topic, frame, io};
use crate::studio::Edit;
pub(super) fn access(session: &Session) -> Option<vantare_ipc::control::CatalogAccess> {
    if !session.current.access.verified || session.current.access.blocked {
        return None;
    }
    #[cfg(windows)]
    {
        session.core.catalog()
    }
    #[cfg(not(windows))]
    {
        let _ = session;
        None
    }
}
pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    let catalog = access(session);
    let result = (|| {
        if !matches!(
            request,
            Request::StudioGet {} | Request::StudioTrack { show: false }
        ) && (session.current.live || catalog.is_none())
        {
            return Err(HostError::Denied);
        }
        let mut added = None;
        let value = match request {
            Request::StudioGet {} => session.studio.view(catalog),
            Request::StudioVisibility {
                id,
                visible,
                base_revision,
            } => session.studio.edit(
                Edit::Visibility(id.clone(), *visible),
                base_revision,
                catalog,
            )?,
            Request::StudioAdd {
                kind,
                base_revision,
            } => {
                let (value, id) = session.studio.add(*kind, base_revision, catalog)?;
                added = Some(id);
                value
            }
            Request::StudioRemove { id, base_revision } => {
                session
                    .studio
                    .edit(Edit::Remove(id.clone()), base_revision, catalog)?
            }
            Request::StudioInstance {
                id,
                patch,
                base_revision,
            } => session.studio.edit(
                Edit::Instance(id.clone(), patch.clone()),
                base_revision,
                catalog,
            )?,
            Request::StudioUndo { base_revision } => {
                session.studio.edit(Edit::Undo, base_revision, catalog)?
            }
            Request::StudioRedo { base_revision } => {
                session.studio.edit(Edit::Redo, base_revision, catalog)?
            }
            Request::StudioTrack { show } => session.studio.track(*show, catalog)?,
            _ => return Err(HostError::Denied),
        };
        Ok(match request {
            Request::StudioGet {} => Reply::StudioGet { value },
            Request::StudioVisibility { .. } => Reply::StudioVisibility { value },
            Request::StudioAdd { .. } => Reply::StudioAdd {
                value,
                added: added.ok_or(HostError::Io)?,
            },
            Request::StudioRemove { .. } => Reply::StudioRemove { value },
            Request::StudioInstance { .. } => Reply::StudioInstance { value },
            Request::StudioUndo { .. } => Reply::StudioUndo { value },
            Request::StudioRedo { .. } => Reply::StudioRedo { value },
            _ => Reply::StudioTrack { value },
        })
    })();
    frame::write(
        pipe,
        &match result {
            Ok(result) => HostToUi::Response { id, result },
            Err(error) => HostToUi::Failure { id, error },
        },
    )
}
pub(super) fn subscribe(session: &mut Session, pipe: &mut Pipe, _topic: Topic) -> io::Result<()> {
    if session.current.live {
        session.studio.reset_subscription();
        return Ok(());
    }
    let access = access(session);
    let value = session.studio.observed(std::time::Instant::now(), access);
    frame::write(
        pipe,
        &HostToUi::Event {
            event: Event::Studio { value },
        },
    )
}
