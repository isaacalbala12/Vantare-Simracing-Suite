use super::*;

#[test]
fn a_full_session_channel_does_not_block_core_photos_and_counts_every_discard() {
    use crate::core::Core;
    let script =
        std::env::temp_dir().join(format!("vantare-session-slow-{}.ps1", std::process::id()));
    std::fs::write(&script, "[Console]::In.ReadToEnd() | Out-Null")
        .expect("helper bloqueado antes de ready");
    let (_sender, receiver) = mpsc::sync_channel(1);
    let worker = SeriesWorker::start(Path::new("pwsh"), &script, receiver).expect("helper lento");
    let process = Arc::clone(&worker.process);
    let (complete, completed) = mpsc::channel();
    let (release, released) = mpsc::channel();
    let producer = thread::spawn(move || {
        let mut core = Core::new(1);
        for lap in 0..2000 {
            core.observe(vantare_domain::Observation::default())
                .expect("foto sigue");
            worker.try_session_event(super::SessionEvent::Lap {
                epoch: 1,
                session: 1,
                car: 7,
                lap,
                official_ms: None,
                sector_ms: None,
            });
        }
        complete
            .send((core.snapshot().sequence, worker.session_events_dropped()))
            .expect("fin sin ACK");
        released.recv().expect("limpieza autorizada por padre");
        drop(worker);
    });
    let outcome = completed.recv_timeout(Duration::from_secs(5));
    if outcome.is_err() {
        process
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .abort()
            .expect("limpieza si se bloqueó el productor");
    }
    release.send(()).expect("soltar cleanup");
    producer.join().expect("productor");
    std::fs::remove_file(script).expect("limpiar fixture propia");
    assert_eq!(outcome.expect("try_send no espera al helper"), (2000, 1936));
}
