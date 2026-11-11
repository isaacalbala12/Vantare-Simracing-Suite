use super::{HostError, Pipe, Reply, Request, Session, io};
impl Session {
    fn onboarding_view(&mut self) -> Result<crate::onboarding::OnboardingView, HostError> {
        let settings = self.settings.refresh();
        let launcher = self.launcher_reader.view();
        let found = self.launcher_reader.discovered(&launcher.revision);
        let simulators = found.map_or([false; 2], |found| {
            [
                found
                    .app("lmu")
                    .is_some_and(|app| app.availability.installed),
                found.onboarding_acc_installed,
            ]
        });
        self.onboarding
            .view(&settings, simulators, launcher.scanning)
    }
}
pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    let privacy = session.privacy.refresh();
    session.onboarding.private.refresh(&privacy, session.privacy.private_active());
    if matches!(request, Request::OnboardingFinish { .. })
        && !session
            .onboarding
            .private
            .can_finish(&privacy)
    {
        return session.respond(
            pipe,
            id,
            Err(HostError::Denied),
            crate::diagnostics::DiagnosticSection::Privacy,
        );
    }
    let result = match request {
        Request::OnboardingGet {} => session
            .onboarding_view()
            .map(|value| Reply::OnboardingGet { value }),
        Request::OnboardingFinish {
            kit,
            level,
            show,
            base_revision,
            layout_revision,
        } => {
            #[cfg(windows)]
            {
                let choice = crate::onboarding::Finish {
                    kit: kit.clone(),
                    level: *level,
                    show: *show,
                    base_revision: base_revision.clone(),
                    layout_revision: layout_revision.clone(),
                };
                session
                    .settings
                    .finish_onboarding(&session.onboarding.layout, &choice)
                    .and_then(|()| session.onboarding_view())
                    .map(|value| Reply::OnboardingFinish { value })
            }
            #[cfg(not(windows))]
            {
                let _ = (kit, level, show, base_revision, layout_revision);
                Err(HostError::Unsupported)
            }
        }
        Request::OnboardingSkipPrivate {} => {
            let pending = !session.settings.refresh().general.onboarding_completed;
            if session.onboarding.private.can_skip(pending) {
                session.privacy.enter_private().map(|()| {
                    session.onboarding.private.skip(pending);
                    Reply::OnboardingSkipPrivate { accepted: true }
                })
            } else {
                Err(HostError::Denied)
            }
        }
        Request::OnboardingPrices {} => Err(HostError::Unsupported), // Fixed URL is handled by the main process.
        _ => return Err(io::ErrorKind::InvalidInput.into()),
    };
    session.respond(
        pipe,
        id,
        result,
        crate::diagnostics::DiagnosticSection::Settings,
    )
}
