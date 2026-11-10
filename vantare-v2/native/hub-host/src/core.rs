use crate::protocol::{AccessView, CoreStatus, LinkState};
use std::{
    io,
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::JoinHandle,
    time::{Duration, Instant},
};
use vantare_ipc::{Demand, Subscriber, control, transport::Event};
#[path = "services_client.rs"]
mod client;
type ServiceRequest = (u32, vantare_ipc::services_protocol::Command);
type ServiceReply = (
    u32,
    Result<vantare_ipc::services_protocol::Reply, crate::protocol::HostError>,
);
pub struct Core {
    photos: Subscriber,
    rights: control::Feed,
    requests: std::sync::mpsc::SyncSender<ServiceRequest>,
    replies: std::sync::mpsc::Receiver<ServiceReply>,
    pending: Option<u32>,
    service_ok: Arc<AtomicBool>,
    stop: Arc<Event>,
    worker: Option<JoinHandle<()>>,
    last_activity: u64,
    last_photo: Option<Instant>,
}
impl Core {
    pub fn start(photo: &str, directory: &Path) -> io::Result<Self> {
        let core_image = directory.join("vantare-core.exe");
        let image = core_image.clone();
        let photos = Subscriber::connect_requested(photo, Demand::default(), move |peer| {
            peer.is_image(&image)
        })
        .map_err(io::Error::other)?;
        let rights = control::Feed::connect(photo, core_image)?;
        let service_ok = Arc::new(AtomicBool::new(false));
        let stop = Arc::new(Event::new()?);
        let target = Arc::clone(&service_ok);
        let cancel = Arc::clone(&stop);
        let supervisor = directory.join("vantare.exe");
        let photo = photo.to_owned();
        let (requests, incoming) = std::sync::mpsc::sync_channel(1);
        let (outgoing, replies) = std::sync::mpsc::channel();
        let worker = std::thread::Builder::new()
            .name("hub-supervisor-link".into())
            .spawn(move || {
                service_worker(&supervisor, &photo, &cancel, &target, &incoming, &outgoing);
            })?;
        Ok(Self {
            requests,
            replies,
            pending: None,
            photos,
            rights,
            service_ok,
            stop,
            worker: Some(worker),
            last_activity: 0,
            last_photo: None,
        })
    }
    pub fn request(
        &mut self,
        id: u32,
        command: vantare_ipc::services_protocol::Command,
    ) -> Result<(), crate::protocol::HostError> {
        if self.pending.is_some() {
            return Err(crate::protocol::HostError::Busy);
        }
        if !self.service_ok.load(Ordering::Acquire) {
            return Err(crate::protocol::HostError::CoreUnavailable);
        }
        self.requests
            .try_send((id, command))
            .map_err(|_| crate::protocol::HostError::Busy)?;
        self.pending = Some(id);
        Ok(())
    }
    pub fn reply(&mut self) -> Option<ServiceReply> {
        match self.replies.try_recv() {
            Ok(value) => {
                self.pending = None;
                Some(value)
            }
            Err(std::sync::mpsc::TryRecvError::Empty) => None,
            Err(std::sync::mpsc::TryRecvError::Disconnected) => {
                self.service_ok.store(false, Ordering::Release);
                self.pending
                    .take()
                    .map(|id| (id, Err(crate::protocol::HostError::CoreUnavailable)))
            }
        }
    }
    pub fn status(&mut self) -> CoreStatus {
        let activity = self.photos.activity();
        if activity != self.last_activity {
            self.last_photo = Some(Instant::now());
            self.last_activity = activity;
        }
        let policy = self.rights.policy();
        let access = control::wall_ms()
            .map(|now| access_view(&policy, now))
            .unwrap_or_default();
        CoreStatus {
            photos: if self.photos.connection().incompatible() {
                LinkState::Incompatible
            } else if self
                .last_photo
                .is_some_and(|time| time.elapsed() < Duration::from_secs(2))
            {
                LinkState::Connected
            } else {
                LinkState::Unavailable
            },
            rights: if matches!(policy.state, control::AccessState::UpdateRequired) {
                LinkState::Incompatible
            } else if policy.epoch > 0 {
                LinkState::Connected
            } else {
                LinkState::Unavailable
            },
            services: if self.service_ok.load(Ordering::Acquire) {
                LinkState::Connected
            } else {
                LinkState::Unavailable
            },
            access,
            // An empty signal demand only receives heartbeats. The authenticated
            // Feed already carries the core's exact domain::is_live observation.
            live: policy.epoch > 0 && policy.live,
        }
    }
}
impl Drop for Core {
    fn drop(&mut self) {
        self.stop.set();
        if let Some(worker) = self.worker.take() {
            let _joined = worker.join();
        }
    }
}

// Same navigation rule as frozen Hub shell/navigation.rs::Access::from_policy.
fn access_view(policy: &control::Policy, now: u64) -> AccessView {
    if policy.state == control::AccessState::NoCredential {
        return AccessView::default();
    }
    if !policy.state.permits_access() {
        return AccessView {
            blocked: true,
            ..AccessView::default()
        };
    }
    if !policy.current_at(now) {
        return AccessView::default();
    }
    AccessView {
        verified: true,
        blocked: false,
        tester: policy.tester,
        calendar: policy.calendar,
        engineer: policy.engineer,
        strategy: policy.strategy,
    }
}

fn service_worker(
    supervisor: &Path,
    photo: &str,
    cancel: &Arc<Event>,
    target: &AtomicBool,
    incoming: &std::sync::mpsc::Receiver<ServiceRequest>,
    outgoing: &std::sync::mpsc::Sender<ServiceReply>,
) {
    let mut connection = None;
    let mut connection_error = crate::protocol::HostError::CoreUnavailable;
    let mut last_probe: Option<Instant> = None;
    while !cancel.is_set() {
        if last_probe.is_none_or(|last| last.elapsed() >= Duration::from_secs(2)) {
            last_probe = Some(Instant::now());
            if connection.is_none() {
                match client::Client::start(supervisor, photo, Arc::clone(cancel)) {
                    Ok(client) => connection = Some(client),
                    Err(error) => connection_error = error,
                }
            }
            let ok = connection.as_mut().is_some_and(|client| {
                match client.request(vantare_ipc::services_protocol::Command::Probe) {
                    Ok(_) => true,
                    Err(error) => {
                        connection_error = error;
                        false
                    }
                }
            });
            target.store(ok, Ordering::Release);
            if !ok {
                connection = None;
            }
        }
        match incoming.recv_timeout(Duration::from_millis(250)) {
            Ok((id, command)) => {
                let result = connection
                    .as_mut()
                    .ok_or_else(|| connection_error.clone())
                    .and_then(|client| client.request(command));
                if outgoing.send((id, result)).is_err() {
                    break;
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
        }
    }
    target.store(false, Ordering::Release);
}

#[cfg(test)]
mod tests {
    use super::*;
    fn policy(state: control::AccessState) -> control::Policy {
        control::Policy {
            version: control::VERSION,
            epoch: 1,
            revision: 1,
            checked_at_ms: 1000,
            state,
            tester: true,
            calendar: true,
            engineer: true,
            strategy: true,
            ..control::Policy::default()
        }
    }
    #[test]
    fn missing_and_denied_credentials_never_expose_capabilities() {
        assert_eq!(
            access_view(&policy(control::AccessState::NoCredential), 1000),
            AccessView::default()
        );
        for state in [
            control::AccessState::Revoked,
            control::AccessState::Expired,
            control::AccessState::Unconfigured,
            control::AccessState::Unavailable,
        ] {
            assert_eq!(
                access_view(&policy(state), 1000),
                AccessView {
                    blocked: true,
                    ..AccessView::default()
                }
            );
        }
    }
    #[test]
    fn only_current_permitted_policy_exposes_capabilities() {
        let active = policy(control::AccessState::Active);
        assert!(access_view(&active, 1000).verified);
        assert!(access_view(&active, 1000).tester);
        assert_eq!(access_view(&active, 3000), AccessView::default());
        let expired = control::Policy {
            signed_until_ms: Some(999),
            ..active
        };
        assert_eq!(access_view(&expired, 1000), AccessView::default());
    }
}
