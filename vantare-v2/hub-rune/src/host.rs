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
#[derive(Clone)]
pub struct Sender {
    channel: SyncSender<UiToHost>,
    #[cfg(windows)]
    signal: Option<Arc<crate::pipe::Signal>>,
}
impl Sender {
    pub fn try_send(&self, message: UiToHost) -> io::Result<()> {
        self.channel
            .try_send(message)
            .map_err(|error| match error {
                mpsc::TrySendError::Full(_) => io::Error::from(io::ErrorKind::WouldBlock),
                mpsc::TrySendError::Disconnected(_) => io::Error::from(io::ErrorKind::BrokenPipe),
            })?;
        #[cfg(windows)]
        if let Some(signal) = &self.signal {
            signal.signal()?;
        }
        Ok(())
    }
}
pub struct Host {
    pub outgoing: Sender,
    incoming: Receiver<Message>,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
    wake: Wake,
    #[cfg(windows)]
    connection: Option<Arc<crate::pipe::Connection>>,
}
#[cfg(all(test, debug_assertions))]
pub enum CloseReply {
    Allow,
    Silent,
    Reject,
    Veto,
}
#[cfg(debug_assertions)]
pub struct Scene {
    messages: VecDeque<HostToUi>,
    closing: bool,
    close_answered: bool,
    #[cfg(test)]
    pub close_reply: CloseReply,
}
impl Drop for Host {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        #[cfg(windows)]
        {
            if let Some(connection) = &self.connection {
                let _ = connection.cancel();
            }
            if let Some(signal) = &self.outgoing.signal {
                let _ = signal.signal();
            }
        }
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
                        #[cfg(test)]
                        close_reply: CloseReply::Allow,
                    }),
                    hello,
                ))
            }
            Bootstrap::Host { name, token } => Self::real(name, token),
        }
    }
    #[cfg(windows)]
    fn real(name: String, token: String) -> io::Result<(Self, HostToUi)> {
        let connection = crate::pipe::Connection::open(&name)?;
        let worker_connection = connection.clone();
        let control = crate::pipe::Signal::new()?;
        let worker_control = control.clone();
        let (outgoing, send) = mpsc::sync_channel(64);
        let outgoing = Sender {
            channel: outgoing,
            signal: Some(control),
        };
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
                let mut pipe = crate::pipe::Pipe::new(worker_connection)?;
                Client::authenticate(&mut pipe, &token)?;
                drop(token);
                let mut client = Client::default();
                let deadline = Instant::now() + Duration::from_secs(15);
                let mut greeted = false;
                while !cancelled.load(Ordering::Acquire) {
                    // Reset before draining: an enqueue racing with the drain leaves the event set.
                    worker_control.reset()?;
                    if cancelled.load(Ordering::Acquire) {
                        return Ok(());
                    }
                    for _ in 0..64 {
                        if cancelled.load(Ordering::Acquire) {
                            return Ok(());
                        }
                        match send.try_recv() {
                            Ok(message) => client.send(&mut pipe, &message)?,
                            Err(mpsc::TryRecvError::Disconnected) => return Ok(()),
                            Err(mpsc::TryRecvError::Empty) => break,
                        }
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
                    let timeout = if greeted {
                        None
                    } else {
                        Some(
                            deadline
                                .checked_duration_since(Instant::now())
                                .ok_or(io::ErrorKind::TimedOut)?,
                        )
                    };
                    if pipe.wait(&worker_control, timeout)? == crate::pipe::Ready::Timeout {
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
            connection: Some(connection),
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
    pub fn sender(&self) -> Option<Sender> {
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
            Self::Host(h) => h.outgoing.try_send(message),
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
            #[cfg(test)]
            match state.close_reply {
                CloseReply::Silent => return Ok(()),
                CloseReply::Reject => {
                    messages.push_back(HostToUi::Failure {
                        id: 0,
                        error: protocol::HostError::CoreUnavailable,
                    });
                    return Ok(());
                }
                CloseReply::Veto => {
                    messages.push_back(HostToUi::Failure {
                        id: 0,
                        error: protocol::HostError::Busy,
                    });
                    return Ok(());
                }
                CloseReply::Allow => {}
            }
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
    #[cfg(windows)]
    fn drop_cancels_the_pending_read_before_joining_the_worker() {
        use std::io::{Read, Write};
        let (_server, connection) = crate::pipe::tests::connected_pair();
        let control = crate::pipe::Signal::new().unwrap();
        let worker_connection = connection.clone();
        let worker_control = control.clone();
        let (armed, ready) = mpsc::channel();
        let (cancelled, observed_cancel) = mpsc::channel();
        let thread = std::thread::spawn(move || {
            let mut pipe = crate::pipe::Pipe::new(worker_connection).unwrap();
            let mut byte = [0];
            assert_eq!(
                pipe.read(&mut byte).unwrap_err().kind(),
                io::ErrorKind::WouldBlock
            );
            armed.send(()).unwrap();
            pipe.wait(&worker_control, None).unwrap();
            // An event alone is insufficient: Drop must have made I/O terminal before join.
            cancelled
                .send(matches!(pipe.write(b"must not be sent"),
                Err(error) if error.kind() == io::ErrorKind::ConnectionAborted))
                .unwrap();
        });
        ready.recv().unwrap();
        let (channel, _receiver) = mpsc::sync_channel(1);
        let (_publish, incoming) = mpsc::sync_channel(1);
        let host = Host {
            outgoing: Sender {
                channel,
                signal: Some(control.clone()),
            },
            incoming,
            stop: Arc::new(AtomicBool::new(false)),
            thread: Some(thread),
            wake: Arc::new(Mutex::new(None)),
            connection: Some(connection.clone()),
        };
        // Rescue a broken implementation instead of hanging the test runner on join forever.
        // The channel establishes ordering; the timeout is only a failure bound.
        let (dropped, done) = mpsc::channel();
        let watchdog = std::thread::spawn(move || {
            if done.recv_timeout(Duration::from_secs(1)).is_ok() {
                return false;
            }
            let _ = connection.cancel();
            control.signal().unwrap();
            true
        });
        drop(host);
        dropped.send(()).unwrap();
        assert!(
            !watchdog.join().unwrap(),
            "Drop must cancel before waiting for the worker"
        );
        assert!(
            observed_cancel.recv().unwrap(),
            "I/O must be cancelled before join"
        );
    }
    #[test]
    fn setup_wakes_for_messages_queued_before_registration() {
        let (outgoing, _send) = mpsc::sync_channel(1);
        let (receive, incoming) = mpsc::sync_channel(1);
        receive.send(Err(io::ErrorKind::BrokenPipe)).unwrap();
        let mut link = Link::Host(Host {
            outgoing: Sender {
                channel: outgoing,
                #[cfg(windows)]
                signal: None,
            },
            incoming,
            #[cfg(windows)]
            connection: None,
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
        assert!(
            matches!(hello, HostToUi::Hello { version, .. } if version == vantare_hub_host::protocol::VERSION)
        );
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
