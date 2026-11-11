use super::{HostError, HostToUi, Instant, Pipe, RemoteKind, Reply, Request, Session, frame, io};
impl Session {
    fn roadmap_dispatch(&mut self, pipe: &mut Pipe, id: u32, request: &Request) -> io::Result<()> {
        match request {
            Request::RoadmapCached {} | Request::RoadmapRefresh {} => self.roadmap_request(
                pipe,
                id,
                matches!(request, Request::RoadmapRefresh {}),
                Instant::now(),
            ),
            _ => Err(io::ErrorKind::InvalidInput.into()),
        }
    }
    pub(super) fn roadmap_request(
        &mut self,
        pipe: &mut Pipe,
        id: u32,
        refresh: bool,
        now: Instant,
    ) -> io::Result<()> {
        if refresh
            && let Some(value) = crate::roadmap::cached_if_throttled(
                &mut self.last_roadmap_refresh,
                now,
                &self.roadmap,
            )
        {
            return frame::write(
                pipe,
                &HostToUi::Response {
                    id,
                    result: Reply::RoadmapRefresh { value },
                },
            );
        }
        let (kind, command) = if refresh {
            (
                RemoteKind::RoadmapRefresh,
                vantare_ipc::services_protocol::Command::RoadmapRefresh,
            )
        } else {
            (
                RemoteKind::RoadmapCached,
                vantare_ipc::services_protocol::Command::RoadmapCached,
            )
        };
        match self.request_remote(id, kind, command) {
            Ok(()) => Ok(()),
            Err(error) => frame::write(pipe, &HostToUi::Failure { id, error }),
        }
    }
}
pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    session.roadmap_dispatch(pipe, id, request)
}
pub(super) fn complete(
    session: &mut Session,
    remote: Option<(u32, RemoteKind)>,
    id: u32,
    result: Result<vantare_ipc::services_protocol::Reply, HostError>,
) -> Result<Reply, HostError> {
    session.roadmap_complete(remote, id, result)
}
impl Session {
    fn roadmap_complete(
        &mut self,
        remote: Option<(u32, RemoteKind)>,
        id: u32,
        result: Result<vantare_ipc::services_protocol::Reply, HostError>,
    ) -> Result<Reply, HostError> {
        match (remote, result) {
            (
                Some((expected, kind @ (RemoteKind::RoadmapCached | RemoteKind::RoadmapRefresh))),
                Ok(vantare_ipc::services_protocol::Reply::Roadmap {
                    publication, stale, ..
                }),
            ) if expected == id => crate::roadmap::project(publication, stale).and_then(|value| {
                self.roadmap = value.clone();
                match kind {
                    RemoteKind::RoadmapCached => Ok(Reply::RoadmapCached { value }),
                    RemoteKind::RoadmapRefresh => Ok(Reply::RoadmapRefresh { value }),
                    _ => Err(HostError::Denied),
                }
            }),
            (Some((expected, RemoteKind::RoadmapRefresh)), Err(error)) if expected == id => {
                self.roadmap.stale = true;
                Err(error)
            }
            (_, Err(error)) => Err(error),
            _ => Err(HostError::Denied),
        }
    }
}
