use super::{HostError, Pipe, Reply, Request, Session, io};
pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    let result = match request {
        Request::ReportLocalPrepare { fields } => {
            if !crate::testing::allowed(&session.current.access) {
                Err(HostError::Denied)
            } else if !fields.valid() {
                Err(HostError::Rejected)
            } else {
                crate::report_local::prepare(
                    fields,
                    &session
                        .diagnostic
                        .view(&session.current, session.settings.view().protected),
                    crate::report_local::collect_binaries(),
                )
                .map(|value| Reply::ReportLocalPrepare { value })
            }
        }
        // Only Electron main may open a native save dialog; never forward this to services.
        Request::ReportLocalExport {} => Err(HostError::Unsupported),
        _ => return Err(io::ErrorKind::InvalidInput.into()),
    };
    session.respond(
        pipe,
        id,
        result,
        crate::diagnostics::DiagnosticSection::Services,
    )
}
