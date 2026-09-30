//! Vectores explícitos; no son evidencia física ni capturas del juego.
use super::*;

#[test]
fn fresh_udp_player_survives_stale_graphics_and_invalid_shm_fields() {
    let mut t = setup();
    t.udp(&car(1005, 0.5, 9, 95000), ms(600)).expect("UDP");
    let o = t.observe(ms(600)).expect("observación");
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
    t.udp(&car(8, 0.5, 9, 95000), ms(1100))
        .expect("rival fresco");
    let fuel = t
        .observe(ms(1100))
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
