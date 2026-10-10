//! Valores de capturas reales; transiciones de reloj explícitas, sin sleeps.
use std::path::Path;
use std::time::Duration;
use vantare_domain::{Adapter, DrivingSituation as S, Observation, SourceState};
use vantare_runtime::{adapter::open_replay, core::Core};

fn fixture(name: &str) -> Observation {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../testdata")
        .join(name);
    open_replay(&path, Some("1.4.0.0"))
        .expect("captura obligatoria")
        .poll(Duration::ZERO)
        .expect("admisión")
        .expect("observación")
}

#[test]
fn real_lmu_garage_pit_outlap_and_missing_session() {
    for (name, expected) in [
        ("lmu-1.4-garage-fixture.bin", S::Garage),
        ("lmu-1.4-pit-fixture.bin", S::Garage),
        ("lmu-1.4-outlap-fixture.bin", S::OnTrack),
        ("lmu-1.4-menu-fixture.bin", S::Unknown),
    ] {
        let mut observation = fixture(name);
        let mut core = Core::new(1562);
        core.observe(observation.clone()).expect("primera");
        // No alterar ninguna señal del simulador; reloj de recepción inyectado.
        observation.origin.received_at = Duration::from_millis(250);
        core.observe(observation).expect("confirmación");
        assert_eq!(core.snapshot().state.driving_situation, expected, "{name}");
        core.tick(Duration::from_millis(500));
        assert_eq!(
            core.snapshot().state.driving_situation,
            S::Unknown,
            "silencio no oculta"
        );
    }
}

#[test]
fn lmu_real_scope_does_not_carry_hiding_into_reconnect_or_another_session() {
    let mut core = Core::new(1562);
    let mut garage = fixture("lmu-1.4-garage-fixture.bin");
    core.observe(garage.clone()).expect("garaje");
    garage.origin.received_at = Duration::from_millis(250);
    core.observe(garage.clone()).expect("confirmar");
    assert_eq!(core.snapshot().state.driving_situation, S::Garage);
    core.tick(Duration::from_millis(500));
    garage.origin.received_at = Duration::from_millis(501);
    garage.origin.source_time = Some(Duration::from_secs(10));
    core.observe(garage.clone()).expect("reconectar");
    assert_eq!(core.snapshot().state.driving_situation, S::Unknown);
    garage.origin.received_at = Duration::from_millis(751);
    garage.origin.source_time = Some(Duration::from_secs(11));
    core.observe(garage.clone()).expect("confirmar reconexión");
    assert_eq!(core.snapshot().state.driving_situation, S::Garage);
    garage.state.session.id.0 += 1;
    garage.origin.received_at = Duration::from_millis(752);
    garage.origin.source_time = Some(Duration::from_secs(12));
    core.observe(garage).expect("nueva sesión");
    assert_eq!(core.snapshot().state.driving_situation, S::Unknown);
}

#[test]
fn lmu_pause_retains_values_but_publishes_situation_and_restores_on_resume() {
    let mut core = Core::new(1562);
    let live = fixture("lmu-1.4-outlap-fixture.bin");
    core.observe(live.clone()).expect("live");
    let retained = core.snapshot().state.player;
    for at in [1, 251] {
        let mut paused = live.clone();
        paused.origin.received_at = Duration::from_millis(at);
        paused.state.source_state = SourceState::Paused;
        core.observe(paused).expect("pausa confirmada por adapter");
    }
    assert_eq!(core.snapshot().state.driving_situation, S::Paused);
    assert_eq!(core.snapshot().state.player, retained);
    let mut resumed = live;
    resumed.origin.received_at = Duration::from_millis(252);
    resumed.origin.source_time = Some(Duration::from_secs(10));
    core.observe(resumed).expect("reanudar");
    assert_eq!(core.snapshot().state.driving_situation, S::OnTrack);
}

#[test]
fn a_frozen_pause_settles_on_the_core_clock_without_extra_series_samples() {
    let mut core = Core::new(1562);
    let mut observation = fixture("lmu-1.4-outlap-fixture.bin");
    observation.state.source_state = SourceState::Paused;
    core.observe(observation).expect("pausa");
    let previous = core.snapshot();
    core.tick(Duration::from_millis(249));
    assert_eq!(core.snapshot().sequence, previous.sequence);
    core.tick(Duration::from_millis(250));
    assert_eq!(core.snapshot().state.driving_situation, S::Paused);
    assert_eq!(core.snapshot().origin, previous.origin);
    assert_eq!(core.snapshot().sequence, previous.sequence + 1);
    core.tick(Duration::from_millis(499));
    assert_eq!(core.snapshot().sequence, previous.sequence + 1);
    core.tick(Duration::from_millis(500));
    assert_eq!(core.snapshot().state.driving_situation, S::Unknown);
}
