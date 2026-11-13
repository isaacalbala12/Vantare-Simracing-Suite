use crate::bootstrap::Bootstrap;
#[cfg(windows)]
use crate::client::Client;
#[cfg(debug_assertions)]
use std::collections::VecDeque;
#[cfg(windows)]
use std::time::{Duration, Instant};
use std::{
    io,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver, SyncSender},
    },
    thread::JoinHandle,
};
use vantare_hub_host::protocol::{HostToUi, UiToHost};
type Message = Result<HostToUi, io::ErrorKind>;
type Wake = Arc<Mutex<Option<rune::Waker>>>;
pub struct Host {
    pub outgoing: SyncSender<UiToHost>,
    incoming: Receiver<Message>,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
    wake: Wake,
}
#[cfg(debug_assertions)]
pub struct Scene {
    messages: VecDeque<HostToUi>,
    closing: bool,
    close_answered: bool,
}
impl Drop for Host {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}
pub enum Link {
    #[cfg_attr(
        not(windows),
        allow(
            dead_code,
            reason = "real host is Windows-only; scene host is the portable development backend"
        )
    )]
    Host(Host),
    #[cfg(debug_assertions)]
    Scene(Scene),
}
impl Link {
    pub fn open(bootstrap: Bootstrap) -> io::Result<(Self, HostToUi)> {
        match bootstrap {
            #[cfg(debug_assertions)]
            Bootstrap::Scene => {
                let hello: HostToUi =
                    serde_json::from_str(include_str!("../../hub-web/fixtures/ajustes-base.json"))
                        .map_err(|_| io::ErrorKind::InvalidData)?;
                Ok((
                    Self::Scene(Scene {
                        messages: VecDeque::new(),
                        closing: false,
                        close_answered: false,
                    }),
                    hello,
                ))
            }
            Bootstrap::Host { name, token } => Self::real(name, token),
        }
    }
    #[cfg(windows)]
    fn real(name: String, token: String) -> io::Result<(Self, HostToUi)> {
        let (outgoing, send) = mpsc::sync_channel(64);
        let (receive, incoming) = mpsc::sync_channel(64);
        let stop = Arc::new(AtomicBool::new(false));
        let cancelled = stop.clone();
        let wake: Wake = Arc::new(Mutex::new(None));
        let signal = wake.clone();
        let thread = std::thread::spawn(move || {
            let publish = |value: Message| {
                let accepted = receive.try_send(value).is_ok();
                if let Some(wake) = signal.lock().unwrap().as_ref() {
                    wake();
                }
                accepted
            };
            let result = (|| -> io::Result<()> {
                let mut pipe = crate::pipe::Pipe::open(&name)?;
                Client::authenticate(&mut pipe, &token)?;
                drop(token);
                let mut client = Client::default();
                let deadline = Instant::now() + Duration::from_secs(15);
                let mut greeted = false;
                while !cancelled.load(Ordering::Acquire) {
                    // Four idle wakeups/s instead of fifty. Outgoing requests still wake immediately.
                    match send.recv_timeout(Duration::from_millis(250)) {
                        Ok(message) => client.send(&mut pipe, &message)?,
                        Err(mpsc::RecvTimeoutError::Disconnected) => return Ok(()),
                        Err(mpsc::RecvTimeoutError::Timeout) => {}
                    }
                    for _ in 0..16 {
                        if cancelled.load(Ordering::Acquire) {
                            return Ok(());
                        }
                        let Some(message) = client.receive(&mut pipe)? else {
                            break;
                        };
                        greeted |= matches!(message, HostToUi::Hello { .. });
                        if !publish(Ok(message)) {
                            return Err(io::ErrorKind::OutOfMemory.into());
                        }
                    }
                    if !greeted && Instant::now() >= deadline {
                        return Err(io::ErrorKind::TimedOut.into());
                    }
                }
                Ok(())
            })();
            if let Err(error) = result {
                let _ = publish(Err(error.kind()));
            }
        });
        let host = Host {
            outgoing,
            incoming,
            stop,
            thread: Some(thread),
            wake,
        };
        match host.incoming.recv_timeout(Duration::from_secs(16)) {
            Ok(Ok(hello @ HostToUi::Hello { .. })) => Ok((Self::Host(host), hello)),
            Ok(Err(error)) => Err(error.into()),
            _ => Err(io::ErrorKind::TimedOut.into()),
        }
    }
    #[cfg(not(windows))]
    fn real(_name: String, _token: String) -> io::Result<(Self, HostToUi)> {
        Err(io::ErrorKind::Unsupported.into())
    }
    pub fn wake_with(&mut self, waker: rune::Waker) {
        match self {
            Self::Host(host) => {
                *host.wake.lock().unwrap() = Some(waker.clone());
                // Incoming messages may predate setup. Signal after releasing the mutex.
                waker();
            }
            #[cfg(debug_assertions)]
            Self::Scene(_) => {}
        }
    }
    pub fn sender(&self) -> Option<SyncSender<UiToHost>> {
        match self {
            Self::Host(h) => Some(h.outgoing.clone()),
            #[cfg(debug_assertions)]
            Self::Scene(_) => None,
        }
    }
    pub fn receive(&mut self) -> Option<Message> {
        match self {
            Self::Host(h) => match h.incoming.try_recv() {
                Ok(v) => Some(v),
                Err(mpsc::TryRecvError::Disconnected) => Some(Err(io::ErrorKind::BrokenPipe)),
                Err(mpsc::TryRecvError::Empty) => None,
            },
            #[cfg(debug_assertions)]
            Self::Scene(state) => {
                let message = state.messages.pop_front()?;
                if matches!(message, HostToUi::CloseRequested { .. }) {
                    // Match the real client's write-before-publish close acknowledgement.
                    if let Err(error) = scene(state, UiToHost::CloseAnswer { allow: true }) {
                        return Some(Err(error.kind()));
                    }
                }
                Some(Ok(message))
            }
        }
    }
    pub fn send(&mut self, message: UiToHost) -> io::Result<()> {
        match self {
            Self::Host(h) => h
                .outgoing
                .try_send(message)
                .map_err(|_| io::ErrorKind::WouldBlock.into()),
            #[cfg(debug_assertions)]
            Self::Scene(messages) => scene(messages, message),
        }
    }
}
#[cfg(debug_assertions)]
fn scene(state: &mut Scene, message: UiToHost) -> io::Result<()> {
    use vantare_hub_host::protocol::{self, Event, Reply, Request, Topic};
    let core = || {
        serde_json::from_str(include_str!("../../hub-web/fixtures/core-offline.json"))
            .expect("shared core fixture")
    };
    let messages = &mut state.messages;
    match message {
        UiToHost::Request {
            id,
            request: Request::CoreGet {},
        } => messages.push_back(HostToUi::Response {
            id,
            result: Reply::Core { value: core() },
        }),
        UiToHost::Subscribe { topic: Topic::Core } => messages.push_back(HostToUi::Event {
            event: Event::Core { value: core() },
        }),
        UiToHost::Request {
            request: Request::WindowClose {},
            ..
        } => {
            state.closing = true;
            messages.push_back(HostToUi::CloseRequested {
                reason: protocol::CloseReason::Window,
            });
        }
        UiToHost::CloseAnswer { allow } => {
            if !state.closing {
                return Err(io::ErrorKind::InvalidData.into());
            }
            state.close_answered = allow;
            state.closing = allow;
        }
        UiToHost::Request { id, .. } => messages.push_back(HostToUi::Failure {
            id,
            error: protocol::HostError::Unsupported,
        }),
        _ => {}
    }
    Ok(())
}
#[cfg(all(test, debug_assertions))]
mod tests {
    use super::*;
    use vantare_hub_host::protocol::{Reply, Request};
    #[test]
    fn setup_wakes_for_messages_queued_before_registration() {
        let (outgoing, _send) = mpsc::sync_channel(1);
        let (receive, incoming) = mpsc::sync_channel(1);
        receive.send(Err(io::ErrorKind::BrokenPipe)).unwrap();
        let mut link = Link::Host(Host {
            outgoing,
            incoming,
            stop: Arc::new(AtomicBool::new(false)),
            thread: None,
            wake: Arc::new(Mutex::new(None)),
        });
        let (signal, notified) = mpsc::channel();
        link.wake_with(Arc::new(move || {
            signal.send(()).unwrap();
        }));
        notified
            .try_recv()
            .expect("setup must schedule an initial drain");
        assert!(matches!(
            link.receive(),
            Some(Err(io::ErrorKind::BrokenPipe))
        ));
    }
    #[test]
    fn scene_uses_shared_hello_and_core_and_closes_without_graphics() {
        let (mut link, hello) = Link::open(Bootstrap::Scene).unwrap();
        assert!(matches!(hello, HostToUi::Hello { version: 31, .. }));
        link.send(UiToHost::Ready {}).unwrap();
        link.send(UiToHost::Request {
            id: 7,
            request: Request::CoreGet {},
        })
        .unwrap();
        assert!(matches!(
            link.receive(),
            Some(Ok(HostToUi::Response {
                id: 7,
                result: Reply::Core { .. }
            }))
        ));
        link.send(UiToHost::Request {
            id: 8,
            request: Request::WindowClose {},
        })
        .unwrap();
        assert!(matches!(
            link.receive(),
            Some(Ok(HostToUi::CloseRequested { .. }))
        ));
        let Link::Scene(scene) = link else {
            unreachable!()
        };
        assert!(
            scene.close_answered,
            "CloseAnswer must precede the GUI's quit"
        );
    }
}
