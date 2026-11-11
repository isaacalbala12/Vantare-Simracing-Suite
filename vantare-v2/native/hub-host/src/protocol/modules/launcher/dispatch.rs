use super::{Event, HostError, HostToUi, Pipe, Reply, Request, Session, frame, io};
impl Session {
    fn launcher_dispatch(&mut self, pipe: &mut Pipe, id: u32, request: &Request) -> io::Result<()> {
        match request {
            Request::LauncherCatalog {}
            | Request::LauncherScan {}
            | Request::LauncherAppGet { .. }
            | Request::LauncherAppPick {}
            | Request::LauncherAppSave { .. }
            | Request::LauncherAppRemove { .. }
            | Request::LauncherAppFavorite { .. } => self.application_request(pipe, id, request),
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

impl Session {
    fn application_request(
        &mut self,
        pipe: &mut Pipe,
        id: u32,
        request: &Request,
    ) -> io::Result<()> {
        match request {
            Request::LauncherCatalog {} => {
                let view = self.launcher_reader.view();
                let result = crate::launcher::apps::catalog(
                    &self.launcher,
                    self.launcher_reader.discovered(&view.revision),
                );
                frame::write(
                    pipe,
                    &match result {
                        Ok(value) => HostToUi::Response {
                            id,
                            result: Reply::LauncherCatalog { value },
                        },
                        Err(error) => HostToUi::Failure { id, error },
                    },
                )
            }
            Request::LauncherScan {} => frame::write(
                pipe,
                &match self.launcher_reader.scan() {
                    Ok(value) => HostToUi::Response {
                        id,
                        result: Reply::LauncherScan { value },
                    },
                    Err(error) => HostToUi::Failure { id, error },
                },
            ),
            Request::LauncherAppGet { id: app_id } => frame::write(
                pipe,
                &match crate::launcher::apps::get(&self.launcher, app_id.as_deref()) {
                    Ok(value) => HostToUi::Response {
                        id,
                        result: Reply::LauncherAppGet { value },
                    },
                    Err(error) => HostToUi::Failure { id, error },
                },
            ),
            // Main consumes this null acknowledgement and opens its own dialog.
            // The final result uses the same request id and is accepted only once.
            Request::LauncherAppPick {} => frame::write(
                pipe,
                &match self
                    .app_picker
                    .request_dialog(id, std::time::Instant::now())
                {
                    Ok(()) => HostToUi::Response {
                        id,
                        result: Reply::LauncherAppPick { value: None },
                    },
                    Err(error) => HostToUi::Failure { id, error },
                },
            ),
            Request::LauncherAppSave { .. }
            | Request::LauncherAppRemove { .. }
            | Request::LauncherAppFavorite { .. } => {
                self.application_write_request(pipe, id, request)
            }
            _ => Err(io::ErrorKind::InvalidInput.into()),
        }
    }
    fn application_write_request(
        &mut self,
        pipe: &mut Pipe,
        id: u32,
        request: &Request,
    ) -> io::Result<()> {
        match request {
            Request::LauncherAppSave {
                draft,
                pick_token,
                base_revision,
            } => {
                let saved = self.app_picker.save(
                    &self.launcher,
                    draft,
                    pick_token.as_deref(),
                    base_revision,
                    std::time::Instant::now(),
                );
                frame::write(
                    pipe,
                    &match saved {
                        Ok(()) => HostToUi::Response {
                            id,
                            result: Reply::LauncherAppSave {
                                value: self.launcher_reader.view(),
                            },
                        },
                        Err(error) => HostToUi::Failure { id, error },
                    },
                )
            }
            Request::LauncherAppRemove {
                id: app_id,
                base_revision,
            } => {
                let saved = crate::launcher::apps::remove(&self.launcher, app_id, base_revision);
                frame::write(
                    pipe,
                    &match saved {
                        Ok(()) => HostToUi::Response {
                            id,
                            result: Reply::LauncherAppRemove {
                                value: self.launcher_reader.view(),
                            },
                        },
                        Err(error) => HostToUi::Failure { id, error },
                    },
                )
            }
            Request::LauncherAppFavorite {
                id: app_id,
                favorite,
                base_revision,
            } => {
                let saved = crate::launcher::apps::favorite(
                    &self.launcher,
                    app_id,
                    *favorite,
                    base_revision,
                );
                frame::write(
                    pipe,
                    &match saved {
                        Ok(()) => HostToUi::Response {
                            id,
                            result: Reply::LauncherAppFavorite {
                                value: self.launcher_reader.view(),
                            },
                        },
                        Err(error) => HostToUi::Failure { id, error },
                    },
                )
            }
            _ => Err(io::ErrorKind::InvalidInput.into()),
        }
    }
}
