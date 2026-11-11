use super::{Event, HostError, HostToUi, Pipe, Reply, Request, Session, frame, io};
impl Session {
    fn launcher_dispatch(&mut self, pipe: &mut Pipe, id: u32, request: &Request) -> io::Result<()> {
        match request {
            Request::LauncherProfileGet { .. } | Request::LauncherProfileSave { .. } => {
                self.profile_request(pipe, id, request)
            }
            Request::LauncherGet {} => self.launcher_snapshot(pipe, id),
            Request::LauncherLaunch { .. } => self.launcher_request(pipe, id, request),
            Request::LauncherFavorite {} => {
                let message = match crate::favorite::launch(&self.launcher, &self.current) {
                    Ok(accepted) => HostToUi::Response {
                        id,
                        result: Reply::LauncherFavorite { accepted },
                    },
                    Err(HostError::LauncherConflict { .. }) => HostToUi::Failure {
                        id,
                        error: HostError::LauncherConflict {
                            current: self.launcher_reader.view(),
                        },
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
                    Err(HostError::LauncherConflict { .. }) => HostToUi::Failure {
                        id,
                        error: HostError::LauncherConflict {
                            current: self.launcher_reader.view(),
                        },
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

impl Session {
    pub(super) fn save_profile_draft(
        &mut self,
        draft: &crate::launcher::editor::ProfileDraft,
        base_revision: &str,
    ) -> Result<(), HostError> {
        let current = crate::launcher::read(&self.launcher);
        if !current.exists || current.protected {
            return Err(HostError::Protected);
        }
        if current.revision != base_revision {
            return Err(HostError::LauncherConflict {
                current: self.launcher_reader.view(),
            });
        }
        let found = self
            .launcher_reader
            .discovered(base_revision)
            .ok_or(HostError::Busy)?;
        crate::launcher::editor::save(
            &self.launcher,
            draft,
            base_revision,
            found,
            self.reserved_profile.as_deref(),
            Some(&self.profile_step_keys),
        )
    }
    fn profile_request(&mut self, pipe: &mut Pipe, id: u32, request: &Request) -> io::Result<()> {
        match request {
            Request::LauncherProfileGet { id: profile_id } => {
                let message = match self
                    .profile_step_keys
                    .open(&self.launcher, profile_id.as_deref())
                {
                    Ok(value) => {
                        if profile_id.is_none() {
                            self.reserved_profile.clone_from(&value.draft.id);
                        }
                        HostToUi::Response {
                            id,
                            result: Reply::LauncherProfileGet { value },
                        }
                    }
                    Err(HostError::LauncherConflict { .. }) => HostToUi::Failure {
                        id,
                        error: HostError::LauncherConflict {
                            current: self.launcher_reader.view(),
                        },
                    },
                    Err(error) => HostToUi::Failure { id, error },
                };
                frame::write(pipe, &message)
            }
            Request::LauncherProfileSave {
                draft,
                base_revision,
            } => {
                let saved = self.save_profile_draft(draft, base_revision);
                // Each save attempt consumes the read, including conflict/Busy.
                self.profile_step_keys = crate::launcher::editor::StepKeys::default();
                let message = match saved {
                    Ok(()) => HostToUi::Response {
                        id,
                        result: Reply::LauncherProfileSave {
                            value: self.launcher_reader.view(),
                        },
                    },
                    Err(HostError::LauncherConflict { .. }) => HostToUi::Failure {
                        id,
                        error: HostError::LauncherConflict {
                            current: self.launcher_reader.view(),
                        },
                    },
                    Err(error) => HostToUi::Failure { id, error },
                };
                frame::write(pipe, &message)
            }
            _ => Err(io::ErrorKind::InvalidInput.into()),
        }
    }
    fn launcher_snapshot(&mut self, pipe: &mut Pipe, id: u32) -> io::Result<()> {
        self.launcher_reader.rescan();
        frame::write(
            pipe,
            &HostToUi::Response {
                id,
                result: Reply::LauncherGet {
                    value: self.launcher_reader.view(),
                },
            },
        )
    }
}
