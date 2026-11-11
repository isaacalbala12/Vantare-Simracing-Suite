use super::{Event, HostError, HostToUi, Pipe, Reply, Request, Session, Topic, frame, io};
fn access(session: &Session) -> Option<vantare_ipc::control::CatalogAccess> {
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
        if !matches!(request, Request::StudioGet {}) && (session.current.live || catalog.is_none())
        {
            return Err(HostError::Denied);
        }
        use crate::studio::Edit;
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
            } => session
                .studio
                .edit(Edit::Add(*kind), base_revision, catalog)?,
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
            Request::StudioAdd { .. } => Reply::StudioAdd { value },
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
    let access = access(session);
    let value = session.studio.view(access);
    frame::write(
        pipe,
        &HostToUi::Event {
            event: Event::Studio { value },
        },
    )
}
pub(super) fn tick(session: &mut Session, pipe: &mut Pipe) -> io::Result<()> {
    let access = access(session);
    if let Some(value) = session.studio.changed(
        session.subscriptions.contains(&Topic::Studio),
        std::time::Instant::now(),
        access,
    ) {
        frame::write(
            pipe,
            &HostToUi::Event {
                event: Event::Studio { value },
            },
        )?;
    }
    Ok(())
}
