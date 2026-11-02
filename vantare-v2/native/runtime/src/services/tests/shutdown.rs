use super::*;

#[test]
fn polling_shutdown_completes_the_real_helper_cleanup_before_reporting_done() {
    let Fixture {
        root,
        photo,
        services: mut owner,
        core,
        link: _,
    } = Fixture::new();
    let mut hub = Session::open(&photo);
    assert!(matches!(hub.request(Command::Status), Reply::Status { .. }));
    assert!(owner.state.lock().expect("estado").client.is_some());
    // Mantiene el Hub conectado y el helper vivo: la API de cierre del Host
    // debe cancelar la escucha y ejecutar finish(), sin ayuda del consumidor.
    owner.request_shutdown();
    let deadline = Instant::now() + Duration::from_secs(5);
    while !owner
        .poll_shutdown()
        .expect("join sólo de hilos terminados")
    {
        assert!(Instant::now() < deadline, "finish del Host no termina");
        thread::yield_now();
    }
    assert!(owner.state.lock().expect("estado final").client.is_none());
    assert!(owner.timer.is_none() && owner.server.is_none());
    drop(owner);
    drop(hub);
    drop(core);
    std::fs::remove_dir_all(root).expect("limpiar únicamente fixture");
}

struct StalledPeer {
    cancel: Arc<Event>,
    stop: Arc<Event>,
    worker: Option<thread::JoinHandle<()>>,
    _original: Pipe,
}
impl Drop for StalledPeer {
    fn drop(&mut self) {
        self.cancel.set();
        self.stop.set();
        if let Some(worker) = self.worker.take() {
            let _joined = worker.join();
        }
    }
}

fn stall_helper(owner: &Host) -> (StalledPeer, std::sync::mpsc::Receiver<()>) {
    let cancel = owner
        .state
        .lock()
        .expect("state")
        .client
        .as_ref()
        .expect("helper")
        .cancellation();
    let name = format!(
        "shutdown-inflight-{}",
        vantare_services::random_id().expect("id")
    );
    let stop = Arc::new(Event::new().expect("peer stop"));
    let mut listener =
        Listener::new(&name, Arc::clone(&stop), Duration::from_secs(5)).expect("listener");
    let mut pipe = listener.instance().expect("instance");
    let (send, seen) = std::sync::mpsc::channel();
    let release = Arc::clone(&stop);
    let worker = thread::spawn(move || {
        pipe.accept().expect("connected");
        let _: Request = protocol::read(&mut pipe).expect("actual helper request");
        send.send(()).expect("in-flight barrier");
        // Sólo watchdog de fallo; el test libera por evento, sin sleeps.
        release.wait(Duration::from_secs(5));
    });
    let stalled =
        vantare_ipc::transport::connect(&name, Arc::clone(&cancel), Duration::from_secs(5))
            .expect("stalled transport");
    let original = owner
        .state
        .lock()
        .expect("state")
        .client
        .as_mut()
        .expect("helper")
        .replace_transport_for_test(stalled);
    (
        StalledPeer {
            cancel,
            stop,
            worker: Some(worker),
            _original: original,
        },
        seen,
    )
}

#[test]
fn closing_retries_cancellation_of_a_real_inflight_request_after_a_missed_slot() {
    for late_publication in [false, true] {
        close_inflight(late_publication);
    }
}

fn close_inflight(late_publication: bool) {
    let Fixture {
        root,
        photo,
        services: mut owner,
        core,
        link,
    } = Fixture::new();
    let mut hub = Session::open(&photo);
    assert!(matches!(hub.request(Command::Status), Reply::Status { .. }));
    let (peer, seen) = stall_helper(&owner);
    let request = thread::spawn(move || {
        hub.sequence += 1;
        protocol::write(
            &mut hub.pipe,
            &Request {
                version: protocol::VERSION,
                nonce: hub.nonce.clone(),
                sequence: hub.sequence,
                command: Command::Status,
            },
        )
        .expect("Hub request");
        // Al parar se puede cerrar el canal antes de contestar; eso es normal.
        let _reply: io::Result<Response> = protocol::read(&mut hub.pipe);
    });
    seen.recv_timeout(Duration::from_secs(5))
        .expect("petición en curso antes del cierre");
    let mut slot = owner.cancellation.lock().expect("slot");
    if late_publication {
        let pending = slot.take();
        drop(slot);
        owner.request_shutdown();
        *owner.cancellation.lock().expect("publicación tardía") = pending;
    } else {
        // El primer try_lock pierde: no puede quedarse sin reintento.
        owner.request_shutdown();
        drop(slot);
    }
    let first_poll = owner.poll_shutdown().expect("cierre normal sin fallo");
    assert!(
        peer.cancel.is_set(),
        "el poll reintenta la cancelación perdida"
    );
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut done = first_poll;
    while !done {
        assert!(Instant::now() < deadline, "no se queda bloqueado en I/O");
        done = owner.poll_shutdown().expect("cierre normal");
        thread::yield_now();
    }
    assert!(owner.state.lock().expect("cleanup final").client.is_none());
    assert!(
        control::request(&link, control::Command::Read).is_ok(),
        "el núcleo sigue disponible"
    );
    request.join().expect("petición cancelada recogida");
    drop(peer);
    drop(owner);
    drop(core);
    std::fs::remove_dir_all(root).expect("sólo fixture propia");
}
