use super::{HostError, HostToUi, Pipe, Reply, Request, Session, frame, io};
use crate::workshop::Scenes;

pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    let message = if matches!(request, Request::WorkshopCatalog {}) {
        HostToUi::Response {
            id,
            result: Reply::WorkshopCatalog {
                widgets: session
                    .workshop_scenes
                    .get_or_init(Scenes::runtime)
                    .widgets(),
            },
        }
    } else {
        HostToUi::Failure {
            id,
            error: HostError::Rejected,
        }
    };
    frame::write(pipe, &message)
}
