use super::{HostToUi, Pipe, Reply, Request, Session, frame, io};
impl Session {
    fn launcher_dispatch(&mut self, pipe: &mut Pipe, id: u32, request: &Request) -> io::Result<()> {
        match request {
            Request::LauncherGet {} | Request::LauncherLaunch { .. } => {
                self.launcher_request(pipe, id, request)
            }
            Request::LauncherFavorite {} => {
                let message = match crate::favorite::launch(&self.launcher, &self.current) {
                    Ok(accepted) => HostToUi::Response {
                        id,
                        result: Reply::LauncherFavorite { accepted },
                    },
                    Err(error) => HostToUi::Failure { id, error },
                };
                frame::write(pipe, &message)
            }
            _ => Err(io::ErrorKind::InvalidInput.into()),
        }
    }
}
pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    session.launcher_dispatch(pipe, id, request)
}

impl Session {
    fn launcher_request(&mut self, pipe: &mut Pipe, id: u32, request: &Request) -> io::Result<()> {
        match request {
            Request::LauncherGet {} => frame::write(
                pipe,
                &HostToUi::Response {
                    id,
                    result: Reply::LauncherGet {
                        value: self.launcher_reader.view(),
                    },
                },
            ),
            Request::LauncherLaunch {
                profile,
                base_revision,
            } => {
                let message = match crate::launcher::launch(
                    &self.launcher,
                    &self.current,
                    profile,
                    base_revision,
                ) {
                    Ok(accepted) => HostToUi::Response {
                        id,
                        result: Reply::LauncherLaunch { accepted },
                    },
                    Err(error) => HostToUi::Failure { id, error },
                };
                frame::write(pipe, &message)
            }
            _ => Err(io::ErrorKind::InvalidInput.into()),
        }
    }
}

pub(super) fn subscribe(
    session: &mut Session,
    pipe: &mut Pipe,
    _topic: crate::protocol::Topic,
) -> io::Result<()> {
    let value = session.launcher_reader.view();
    frame::write(
        pipe,
        &HostToUi::Event {
            event: Event::Launcher { value },
        },
    )
}
