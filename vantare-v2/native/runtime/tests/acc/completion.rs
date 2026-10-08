//! Vectores explícitos; no son evidencia física ni capturas del juego.
use super::*;
use crate::core::Core;
use vantare_domain::{SourceState, format::Preferences};

#[test]
fn fresh_udp_player_survives_stale_graphics_and_invalid_shm_fields() {
    let mut t = setup();
    t.udp(&car(1005, 0.5, 9, 95000), ms(600)).expect("UDP");
    let o = t.observe(ms(600)).expect("observación");
    assert_eq!(o.state.source_state, SourceState::Live);
    let c = o.state.player_car().expect("jugador");
    assert_eq!(c.position, Quality::Reliable(1));
    assert_eq!(c.laps, Quality::Reliable(9));
    assert_eq!(c.last_lap_s, Quality::Reliable(95.0));
    assert_eq!(c.lap_elapsed_s, Quality::Reliable(20.0));
    assert_eq!(c.in_pits, Quality::Reliable(false));
    assert!(matches!(c.pose, Quality::Reliable(_)));
    assert_eq!(c.last_sectors_s, vec![Quality::Reliable(30.0); 3]);
    assert_eq!(
        o.state.player.expect("inputs").telemetry.throttle,
        Quality::Stale(0.75)
    );

    let mut g = pages()[1].clone();
    int(&mut g, 0, 2);
    int(&mut g, 136, -1);
    int(&mut g, 164, -1);
    int(&mut g, 144, i32::MAX);
    int(&mut g, 148, i32::MAX);
    t.shm(1, g, ms(610)).expect("SHM inválida por señal");
    let o = t.observe(ms(610)).expect("observación");
    let c = o.state.player_car().expect("jugador");
    assert_eq!(c.position, Quality::Reliable(1));
    assert_eq!(c.last_lap_s, Quality::Reliable(95.0));
    assert_eq!(c.best_lap_s, Quality::Reliable(95.0));
}

#[test]
fn native_fuel_liters_and_estimated_range_use_graphics_clock_only() {
    let mut t = setup();
    let mut g = pages()[1].clone();
    int(&mut g, 0, 2);
    float(&mut g, 1284, 2.5);
    float(&mut g, 1412, 12.0);
    int(&mut g, 172, 99); // numberOfLaps no es duración total.
    int(&mut g, 1580, 0); // gap válido en ms, no sentinel de vuelta.
    t.shm(1, g.clone(), ms(600)).expect("graphics fresco");
    let o = t.observe(ms(600)).expect("observación");
    let fuel = o.state.player.expect("jugador").fuel;
    assert_eq!(fuel.level_l, Quality::Unavailable, "physics documenta kg");
    assert_eq!(
        fuel.capacity_l,
        Quality::Unavailable,
        "maxFuel no fija unidad"
    );
    assert_eq!(fuel.per_lap_l, Quality::Reliable(2.5));
    assert_eq!(fuel.laps_left, Quality::Estimated(12.0));
    assert_eq!(o.state.session.laps_total, Quality::Unavailable);
    assert_eq!(
        o.state.player_car().expect("jugador").gap_ahead,
        Quality::Reliable(Gap::Time { seconds: 0.0 })
    );
    int(&mut g, 0, 3);
    int(&mut g, 1236, 1);
    t.shm(1, g.clone(), ms(610)).expect("pit lane");
    assert_eq!(
        t.observe(ms(610))
            .expect("boxes")
            .state
            .player_car()
            .expect("jugador")
            .gap_ahead,
        Quality::Unavailable,
        "no declarar gap cero de clasificación en boxes"
    );
    int(&mut g, 1236, 0);
    t.udp(&car(8, 0.5, 9, 95000), ms(1110))
        .expect("rival fresco");
    let fuel = t
        .observe(ms(1110))
        .expect("obsoleta")
        .state
        .player
        .expect("jugador")
        .fuel;
    assert_eq!(fuel.per_lap_l, Quality::Stale(2.5));
    assert_eq!(fuel.laps_left, Quality::Stale(12.0));
    for raw in [0.0, -1.0, f32::NAN, f32::INFINITY] {
        let packet = i32_at(&g, 0) + 1;
        int(&mut g, 0, packet);
        float(&mut g, 1284, raw);
        float(&mut g, 1412, raw);
        t.shm(1, g.clone(), ms(1200)).expect("sentinel");
        let fuel = t
            .observe(ms(1200))
            .expect("observación")
            .state
            .player
            .expect("jugador")
            .fuel;
        assert_eq!(fuel.per_lap_l, Quality::Unavailable);
        assert_eq!(fuel.laps_left, Quality::Unavailable);
    }
}

#[test]
fn udp_temperatures_fill_missing_or_stale_physics_without_refreshing_wind() {
    let mut t = setup();
    let mut b = session(0, 10, 5, 1000.0);
    b[30] = 21;
    b[31] = 36;
    t.udp(&b, ms(600)).expect("clima UDP");
    let w = t
        .observe(ms(600))
        .expect("observación")
        .state
        .session
        .weather;
    assert_eq!(w.air_temperature_k, Quality::Reliable(294.15));
    assert_eq!(w.track_temperature_k, Quality::Reliable(309.15));
    assert_eq!(w.wind_speed_mps, Quality::Stale(0.0));
    let w = t
        .observe(ms(1600))
        .expect("silencio UDP")
        .state
        .session
        .weather;
    assert!(matches!(w.air_temperature_k, Quality::Stale(_)));
    let mut p = pages()[0].clone();
    int(&mut p, 0, 2);
    float(&mut p, 288, 24.0);
    float(&mut p, 292, 40.0);
    t.shm(0, p, ms(1700)).expect("physics nuevo");
    let w = t
        .observe(ms(1700))
        .expect("observación")
        .state
        .session
        .weather;
    assert_eq!(w.air_temperature_k, Quality::Reliable(297.15));
    assert_eq!(w.track_temperature_k, Quality::Reliable(313.15));
}

fn core_with_grid() -> Core {
    let mut t = setup();
    t.udp(&session(0, 10, 5, 1000.0), ms(0))
        .expect("sesión UDP");
    t.track = Some((1, "monza".into(), 5793.0));
    for index in [8, 1005] {
        t.entries.insert(
            index,
            Entry {
                index,
                number: i32::from(index),
                cup: 0,
                drivers: vec![format!("Driver {index}")],
            },
        );
        let mut b = car(index, 0.5, 9, 95000);
        let position: u16 = if index == 8 { 1 } else { 2 };
        b[22..24].copy_from_slice(&position.to_le_bytes());
        b[24..26].copy_from_slice(&position.to_le_bytes());
        t.udp(&b, ms(0)).expect("parrilla");
    }
    let mut g = pages()[1].clone();
    int(&mut g, 0, 2);
    int(&mut g, 136, 2);
    int(&mut g, 132, 9);
    int(&mut g, 144, 95000);
    int(&mut g, 148, 95000);
    int(&mut g, 1580, 2500);
    int(&mut g, 1500, 1);
    int(&mut g, 1508, 1);
    int(&mut g, 1224, 1);
    float(&mut g, 1284, 2.5);
    float(&mut g, 1412, 12.0);
    t.shm(1, g, ms(0)).expect("jugador");
    let mut core = Core::new(42);
    assert_eq!(core.snapshot().state.source_state, SourceState::Waiting);
    core.observe(t.observe(ms(0)).expect("observación"))
        .expect("núcleo neutral");
    core
}

#[test]
fn common_core_derives_gaps_keeps_native_fuel_and_roundtrips_dto_v4() {
    let mut core = core_with_grid();
    let snapshot = core.snapshot();
    assert_eq!(snapshot.state.source_state, SourceState::Live);
    let player = snapshot.state.player_car().expect("jugador");
    assert_eq!(
        player.gap_ahead,
        Quality::Reliable(Gap::Time { seconds: 2.5 })
    );
    assert_eq!(
        player.gap_leader,
        Quality::Estimated(Gap::Time { seconds: 2.5 })
    );
    let fuel = snapshot.state.player.expect("jugador").fuel;
    assert_eq!(fuel.per_lap_l, Quality::Reliable(2.5));
    assert_eq!(fuel.laps_left, Quality::Estimated(12.0));
    assert_eq!(
        fuel.history, [None; 10],
        "sin nivel en litros no inventar historial"
    );
    let json = vantare_ipc::snapshot_to_json(&snapshot).expect("DTO");
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&json).expect("JSON")["version"],
        u64::from(vantare_ipc::DTO_VERSION)
    );
    let decoded = vantare_ipc::snapshot_from_json(&json).expect("DTO vigente");
    assert_eq!(decoded, *snapshot);
    let flags = decoded.state.flags.current().expect("ámbitos conservados");
    for scope in [
        FlagScope::Session,
        FlagScope::Sector(1),
        FlagScope::Car(CarId(1005)),
    ] {
        assert!(flags.iter().any(|f| f.scope == scope));
    }
    let mut relabelled = decoded.clone();
    relabelled.origin.source.simulator = "lmu";
    let prefs = Preferences::default();
    macro_rules! neutral {
        ($($module:ident),+) => { $(assert_eq!(
            vantare_domain::$module::project(&decoded, prefs),
            vantare_domain::$module::project(&relabelled, prefs)
        );)+ };
    }
    neutral!(
        standings,
        pedals,
        racing_flags,
        fuel_strategy,
        track_weather,
        input_telemetry,
        broadcast_tower
    );
    assert_eq!(
        vantare_domain::radar::project(&decoded),
        vantare_domain::radar::project(&relabelled)
    );
    core.tick(ms(500));
    let stale = core.snapshot();
    assert_eq!(stale.state.source_state, SourceState::Stale);
    assert_eq!(
        stale.state.player.expect("jugador").fuel.per_lap_l,
        Quality::Stale(2.5)
    );
    let json = vantare_ipc::snapshot_to_json(&stale).expect("DTO stale");
    assert_eq!(
        vantare_ipc::snapshot_from_json(&json)
            .expect("stale")
            .state
            .source_state,
        SourceState::Stale
    );
}

#[test]
fn source_off_and_expiry_only_observations_require_shared_core_decision() {
    let mut states = Vec::new();
    for off in [true, false] {
        let mut t = setup();
        let mut core = Core::new(42);
        core.observe(t.observe(ms(0)).expect("live"))
            .expect("núcleo");
        if off {
            let mut g = pages()[1].clone();
            int(&mut g, 0, 2);
            int(&mut g, 4, 0);
            t.shm(1, g, ms(600)).expect("OFF");
        }
        core.observe(t.observe(ms(600)).expect("estado"))
            .expect("núcleo");
        states.push(core.snapshot().state.source_state);
    }
    assert_eq!(states, [SourceState::Waiting, SourceState::Stale]);

    let mut t = setup();
    // Sin graphics aún, static por sí sola no declara una sesión activa.
    t.pages[1] = None;
    assert_eq!(
        t.observe(ms(0)).expect("sin sesión").state.source_state,
        SourceState::Waiting
    );
    t.udp(&session(0, 10, 5, 1000.0), ms(0))
        .expect("sesión UDP");
    assert_eq!(
        t.observe(ms(0)).expect("UDP actual").state.source_state,
        SourceState::Live
    );
    assert_eq!(
        t.observe(ms(1000))
            .expect("UDP caducado")
            .state
            .source_state,
        SourceState::Stale
    );
    t.udp(&session(0, 10, 5, 2000.0), ms(1010))
        .expect("UDP recuperado");
    assert_eq!(
        t.observe(ms(1010)).expect("UDP actual").state.source_state,
        SourceState::Live
    );
}

#[test]
fn class_gap_from_native_player_ahead_requires_common_leader_anchor() {
    let core = core_with_grid();
    let snapshot = core.snapshot();
    assert_eq!(
        snapshot
            .state
            .player_car()
            .expect("jugador")
            .gap_class_leader,
        Quality::Estimated(Gap::Time { seconds: 2.5 })
    );
}

#[test]
fn zero_current_lap_time_is_present_but_zero_last_lap_is_absent() {
    let mut t = setup();
    let mut b = car(8, 0.5, 9, 0);
    b[88..92].copy_from_slice(&0_i32.to_le_bytes());
    t.udp(&b, ms(0)).expect("inicio de vuelta");
    let o = t.observe(ms(0)).expect("observación");
    let c = o
        .state
        .cars
        .iter()
        .find(|c| c.id == CarId(8))
        .expect("rival");
    assert_eq!(c.lap_elapsed_s, Quality::Reliable(0.0));
    assert_eq!(c.last_lap_s, Quality::Unavailable);
    b[88..92].copy_from_slice(&i32::MAX.to_le_bytes());
    t.udp(&b, ms(10)).expect("sentinel");
    let o = t.observe(ms(10)).expect("observación");
    assert_eq!(o.state.cars[0].lap_elapsed_s, Quality::Unavailable);
}
