use super::{CloseReason, HostToUi, Pipe, Reply, Request, Session, Topic, frame, io};
impl Session {
    fn transport_dispatch(
        &mut self,
        pipe: &mut Pipe,
        id: u32,
        request: &Request,
    ) -> io::Result<()> {
        match request {
            Request::CoreGet {} => frame::write(
                pipe,
                &HostToUi::Response {
                    id,
                    result: Reply::Core {
                        value: self.current.clone(),
                    },
                },
            ),
            Request::WindowClose {} => self.request_close(pipe, CloseReason::Window),
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
    session.transport_dispatch(pipe, id, request)
}

#[cfg(test)]
mod tests {
    use crate::protocol::{self, UiToHost};
    #[test]
    fn every_rust_request_has_one_screen_handler() {
        let samples = protocol::bindings::corpus();
        for value in samples["ui"].as_array().expect("UI corpus") {
            let message: UiToHost = serde_json::from_value(value.clone()).expect("typed sample");
            if let UiToHost::Request { request, .. } = message {
                assert_eq!(
                    super::super::SCREEN_HANDLERS
                        .iter()
                        .filter(|(accept, _)| accept(&request))
                        .count(),
                    1,
                    "one closed route for {request:?}"
                );
            }
        }
    }
}

pub(super) fn subscribe(
    session: &mut Session,
    pipe: &mut Pipe,
    topic: crate::protocol::Topic,
) -> io::Result<()> {
    match topic {
        Topic::Core => session.send_core(pipe),
        Topic::SimStatus => frame::write(
            pipe,
            &HostToUi::Event {
                event: Event::SimStatus {
                    live: session.current.live,
                },
            },
        ),
        _ => Err(io::ErrorKind::InvalidInput.into()),
    }
}
