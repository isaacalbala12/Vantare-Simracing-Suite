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
