//! Capturas sin alterar para valores; mutaciones explícitas solo para fronteras.
use super::*;

const REAL_44: &[u8] = include_bytes!("../../../../../testdata/lmu-fixture.bin");
const TRACK_1420: &[u8] = include_bytes!("../../../../../testdata/lmu-1.4.2.0-track-fixture.bin");
const PLAYER: usize = 128_468 + 43 * 1_888;

fn observe(bytes: &[u8], build: &str) -> Observation {
    Translator::new(SourceKind::Replay)
        .observe(bytes, build, Duration::ZERO)
        .expect("fixture admitido")
}

fn near(value: Quality<f64>, expected: f64) {
    assert!(
        matches!(value, Quality::Reliable(v) if (v - expected).abs() < 1e-9),
        "{value:?}, esperado {expected}"
    );
}

#[test]
fn unfiltered_steering_uses_sdk_offset_and_signed_normalized_range() {
    for (raw, expected) in [
        (-1.0_f64, Quality::Reliable(-1.0)),
        (-0.5, Quality::Reliable(-0.5)),
        (0.0, Quality::Reliable(0.0)),
        (0.5, Quality::Reliable(0.5)),
        (1.0, Quality::Reliable(1.0)),
        (-1.01, Quality::Unavailable),
        (1.01, Quality::Unavailable),
        (f64::NAN, Quality::Unavailable),
        (f64::INFINITY, Quality::Unavailable),
    ] {
        let mut bytes = REAL_44.to_vec();
        bytes[PLAYER + 404..PLAYER + 412].copy_from_slice(&raw.to_le_bytes());
        bytes[PLAYER + 436..PLAYER + 444].copy_from_slice(&0.75_f64.to_le_bytes());
        let obs = observe(&bytes, "1.3.0.0");
        assert_eq!(
            obs.state.player.expect("jugador").telemetry.steering,
            expected
        );
        assert_eq!(obs.state.capabilities.driver_inputs, Capability::Fresh);
    }
}

#[test]
fn steering_expires_with_telemetry_even_when_scoring_advances() {
    let mut translator = Translator::new(SourceKind::Live);
    let mut bytes = REAL_44.to_vec();
    bytes[PLAYER + 12..PLAYER + 20].copy_from_slice(&5.0_f64.to_le_bytes());
    bytes[PLAYER + 404..PLAYER + 412].copy_from_slice(&(-0.5_f64).to_le_bytes());
    bytes[1700..1708].copy_from_slice(&10.0_f64.to_le_bytes());
    let fresh = translator
        .observe(&bytes, "1.3.0.0", Duration::ZERO)
        .expect("fixture");
    assert_eq!(
        fresh.state.player.expect("jugador").telemetry.steering,
        Quality::Reliable(-0.5)
    );
    bytes[1700..1708].copy_from_slice(&11.0_f64.to_le_bytes());
    let old = translator
        .observe(&bytes, "1.3.0.0", Duration::from_millis(500))
        .expect("fixture");
    assert_eq!(
        old.state.player.expect("jugador").telemetry.steering,
        Quality::Stale(-0.5)
    );
}

#[test]
fn real_celsius_temperatures_and_remaining_rubber_are_not_damage_percentages() {
    let state = observe(REAL_44, "1.3.0.0").state;
    // Sidecar: aire 16 °C y asfalto 23,299214394865544 °C. Kelvin = °C + 273,15.
    near(state.session.weather.air_temperature_k, 289.15);
    near(
        state.session.weather.track_temperature_k,
        296.449_214_394_865_5,
    );
    let damage = state.player.expect("jugador").damage;
    // +1000 conserva 0,9996036887168884 de goma, NO 0,000396 de integridad.
    near(damage.tyre_wear[0], 0.999_603_688_716_888_4);
    // Los otros tres +mWear son ceros de la sanitización legacy, no goma agotada.
    assert_eq!(&damage.tyre_wear[1..], &[Quality::Unavailable; 3]);
    assert_eq!(
        (damage.aero, damage.body, damage.suspension),
        (
            Quality::Unavailable,
            Quality::Unavailable,
            Quality::Unavailable
        )
    );
    assert_eq!(
        (state.capabilities.weather, state.capabilities.damage),
        (Capability::Fresh, Capability::Fresh)
    );
}

#[test]
fn newer_capture_preserves_four_new_tyres_but_no_temperatures_or_wind() {
    let state = observe(TRACK_1420, "1.4.2.0").state;
    assert_eq!(
        state.player.expect("jugador").damage.tyre_wear,
        [Quality::Reliable(1.0); 4]
    );
    let w = state.session.weather;
    assert_eq!(
        (
            w.air_temperature_k,
            w.track_temperature_k,
            w.wind_speed_mps,
            w.wind_direction_rad,
            w.track_wetness,
            w.pressure_pa
        ),
        (
            Quality::Unavailable,
            Quality::Unavailable,
            Quality::Unavailable,
            Quality::Unavailable,
            Quality::Unavailable,
            Quality::Unavailable
        )
    );
}

#[test]
fn weather_and_damage_expire_with_their_blocks() {
    let mut t = Translator::new(SourceKind::Replay);
    t.observe(TRACK_1420, "1.4.2.0", Duration::ZERO)
        .expect("primero");
    let state = t
        .observe(TRACK_1420, "1.4.2.0", Duration::from_millis(500))
        .expect("congelado")
        .state;
    assert_eq!(
        state.player.expect("jugador").damage.tyre_wear,
        [Quality::Stale(1.0); 4]
    );
    assert_eq!(
        (state.capabilities.weather, state.capabilities.damage),
        (Capability::WithData, Capability::WithData)
    );

    // Prueba de frontera: scoring avanza, pero la fila de telemetría no cambia.
    let mut t = Translator::new(SourceKind::Replay);
    t.observe(REAL_44, "1.3.0.0", Duration::ZERO)
        .expect("primero");
    let mut next = REAL_44.to_vec();
    write(&mut next, 1_700, 113.2);
    let state = t
        .observe(&next, "1.3.0.0", Duration::from_millis(600))
        .expect("solo scoring avanza")
        .state;
    near(state.session.weather.air_temperature_k, 289.15);
    assert!(matches!(
        state.player.expect("jugador").damage.tyre_wear[0],
        Quality::Stale(_)
    ));
    assert_eq!(
        (state.capabilities.weather, state.capabilities.damage),
        (Capability::Fresh, Capability::WithData)
    );
}

fn write(bytes: &mut [u8], at: usize, value: f64) {
    bytes[at..at + 8].copy_from_slice(&value.to_le_bytes());
}

#[test]
fn scoring_freeze_does_not_expire_a_running_telemetry_clock() {
    let mut bytes = REAL_44.to_vec();
    write(&mut bytes, PLAYER + 12, 112.6);
    let mut t = Translator::new(SourceKind::Replay);
    t.observe(&bytes, "1.3.0.0", Duration::ZERO)
        .expect("primero");
    write(&mut bytes, PLAYER + 12, 113.2);
    let state = t
        .observe(&bytes, "1.3.0.0", Duration::from_millis(600))
        .expect("solo telemetría avanza")
        .state;
    assert!(matches!(
        state.session.weather.air_temperature_k,
        Quality::Stale(_)
    ));
    near(
        state.player.expect("jugador").damage.tyre_wear[0],
        0.999_603_688_716_888_4,
    );
    assert_eq!(
        (state.capabilities.weather, state.capabilities.damage),
        (Capability::WithData, Capability::Fresh)
    );
}

#[test]
fn a_frozen_telemetry_clock_and_recovery_keep_the_existing_hysteresis() {
    let mut bytes = REAL_44.to_vec();
    write(&mut bytes, PLAYER + 12, 112.6);
    let mut t = Translator::new(SourceKind::Replay);
    t.observe(&bytes, "1.3.0.0", Duration::ZERO)
        .expect("primero");
    assert!(t.needs_refresh(Duration::from_millis(500)));
    for (now, tel, expected) in [
        (600_u32, 112.6, Capability::WithData),
        (800, 112.8, Capability::WithData),
        (1200, 113.2, Capability::WithData),
        (1600, 113.6, Capability::WithData),
        (2000, 114.0, Capability::WithData),
        (2400, 114.4, Capability::WithData),
        (2800, 114.8, Capability::Fresh),
    ] {
        write(&mut bytes, 1_700, 112.6 + f64::from(now) / 1000.0);
        write(&mut bytes, PLAYER + 12, tel);
        // Un contenido distinto no rehabilita un reloj que sigue congelado.
        write(&mut bytes, PLAYER + 1_000, 0.9);
        let state = t
            .observe(&bytes, "1.3.0.0", Duration::from_millis(u64::from(now)))
            .expect("paso")
            .state;
        assert_eq!(state.capabilities.damage, expected, "{now} ms");
    }
}

#[test]
fn invalid_weather_never_creates_kelvin_or_a_wind_direction() {
    for bad in [f64::NAN, f64::INFINITY, -100.0, 100.0] {
        let mut bytes = REAL_44.to_vec();
        write(&mut bytes, 1_860, bad);
        write(&mut bytes, 1_876, bad);
        let w = observe(&bytes, "1.3.0.0").state.session.weather;
        assert_eq!(w.air_temperature_k, Quality::Unavailable);
        near(w.track_temperature_k, 296.449_214_394_865_5);
        assert_eq!(w.wind_direction_rad, Quality::Unavailable);
        if !bad.is_finite() {
            assert_eq!(w.wind_speed_mps, Quality::Unavailable);
        }
    }
    let mut bytes = REAL_44.to_vec();
    write(&mut bytes, 1_860, 0.0);
    near(
        observe(&bytes, "1.3.0.0")
            .state
            .session
            .weather
            .air_temperature_k,
        273.15,
    );
}

#[test]
fn optional_signals_validate_independently_and_never_clamp_bad_values() {
    // Casos controlados del SDK, NO nuevas capturas físicas.
    let mut bytes = REAL_44.to_vec();
    write(&mut bytes, 1_852, 0.25); // lluvia: fracción, no porcentaje
    write(&mut bytes, 1_876, 3.0);
    write(&mut bytes, 1_884, 0.0);
    write(&mut bytes, 1_892, 4.0); // módulo del vector = 5 m/s
    write(&mut bytes, 1_964, 0.4); // humedad media, no media de mínimo/máximo
    write(&mut bytes, PLAYER + 12, 112.6); // reloj telem real, sin sanitizar
    write(&mut bytes, PLAYER + 1_260, 0.0); // goma agotada explícita con reloj
    let state = observe(&bytes, "1.3.0.0").state;
    near(state.session.weather.rain, 0.25);
    near(state.session.weather.wind_speed_mps, 5.0);
    near(state.session.weather.track_wetness, 0.4);
    near(state.player.expect("jugador").damage.tyre_wear[1], 0.0);
    // No tenemos norte geográfico ni presión atmosférica en este protocolo.
    assert_eq!(
        state.session.weather.wind_direction_rad,
        Quality::Unavailable
    );
    assert_eq!(state.session.weather.pressure_pa, Quality::Unavailable);
    for invalid in [f64::NAN, f64::INFINITY, -1.0, 1.01] {
        write(&mut bytes, 1_852, invalid);
        write(&mut bytes, 1_964, invalid);
        write(&mut bytes, PLAYER + 1_260, invalid);
        let state = observe(&bytes, "1.3.0.0").state;
        assert_eq!(state.session.weather.rain, Quality::Unavailable);
        assert_eq!(state.session.weather.track_wetness, Quality::Unavailable);
        let d = state.player.expect("jugador").damage;
        assert_eq!(d.tyre_wear[1], Quality::Unavailable);
        near(d.tyre_wear[0], 0.999_603_688_716_888_4);
        near(state.session.weather.air_temperature_k, 289.15);
    }
}

#[test]
fn all_existing_menu_and_zeroed_damage_fixtures_remain_dataless() {
    for (file, build) in [
        ("lmu-menu-fixture.bin", "1.3.0.0"),
        ("lmu-1.4-menu-fixture.bin", "1.4.0.0"),
        ("lmu-1.4.1.3-menu-fixture.bin", "1.4.1.3"),
        ("lmu-1.4.2.0-menu-fixture.bin", "1.4.2.0"),
        ("lmu-1.4-track-fixture.bin", "1.4.0.0"),
        ("lmu-1.4-pre-pit-track-fixture.bin", "1.4.0.0"),
        ("lmu-1.4-pit-fixture.bin", "1.4.0.0"),
        ("lmu-1.4-outlap-fixture.bin", "1.4.0.0"),
        ("lmu-1.4-garage-fixture.bin", "1.4.0.0"),
        ("lmu-1.4.1.3-track-fixture.bin", "1.4.1.3"),
    ] {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../testdata")
            .join(file);
        let bytes = std::fs::read(&path).expect("corpus obligatorio");
        let state = observe(&bytes, build).state;
        assert_eq!(state.capabilities.damage, Capability::Supported, "{file}");
        assert_eq!(
            state.session.weather.air_temperature_k,
            Quality::Unavailable,
            "{file}"
        );
        if let Some(p) = state.player {
            assert_eq!(p.damage.tyre_wear, [Quality::Unavailable; 4], "{file}");
        }
    }
}
