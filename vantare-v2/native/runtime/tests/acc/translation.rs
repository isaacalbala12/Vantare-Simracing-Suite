//! Vectores de regresión; NO son capturas ni evidencia de ACC en marcha.
use super::*;

#[path = "weather.rs"]
mod weather_tests;

fn ms(n: u64) -> Duration {
    Duration::from_millis(n)
}
fn int(b: &mut [u8], at: usize, v: i32) {
    b[at..at + 4].copy_from_slice(&v.to_le_bytes());
}
fn float(b: &mut [u8], at: usize, v: f32) {
    b[at..at + 4].copy_from_slice(&v.to_le_bytes());
}
fn wide(b: &mut [u8], at: usize, s: &str) {
    for (i, c) in s.encode_utf16().enumerate() {
        b[at + i * 2..at + i * 2 + 2].copy_from_slice(&c.to_le_bytes());
    }
}

fn pages() -> [Vec<u8>; 3] {
    let (mut p, mut g, mut s) = (vec![0; 800], vec![0; 1588], vec![0; 820]);
    int(&mut p, 0, 1);
    float(&mut p, 4, 0.75);
    float(&mut p, 8, 0.25);
    float(&mut p, 12, 30.0);
    int(&mut p, 16, 4);
    int(&mut p, 20, 6000);
    float(&mut p, 28, 180.0);
    float(&mut p, 364, 0.5);
    int(&mut g, 0, 1);
    int(&mut g, 4, 2);
    int(&mut g, 8, 2);
    int(&mut g, 1216, 1005);
    int(&mut g, 136, 9);
    int(&mut g, 132, 7);
    int(&mut g, 140, 42000);
    int(&mut g, 144, 90000);
    int(&mut g, 148, 88000);
    float(&mut g, 152, 600_000.0);
    float(&mut g, 248, 0.5);
    int(&mut g, 1360, 1500);
    int(&mut g, 1400, 1);
    int(&mut g, 164, 1);
    int(&mut g, 976 + 7 * 4, 1005);
    float(&mut g, 256 + 7 * 12, 10.0);
    float(&mut g, 264 + 7 * 12, 20.0);
    int(&mut g, 1520, 1);
    wide(&mut s, 0, "1.9");
    wide(&mut s, 30, "1.7");
    wide(&mut s, 134, "monza");
    wide(&mut s, 200, "Driver");
    wide(&mut s, 266, "Player");
    float(&mut s, 416, 120.0);
    [p, g, s]
}

fn setup() -> Translator {
    let mut t = Translator::new(SourceKind::Replay);
    for (kind, b) in pages().into_iter().enumerate() {
        t.shm(u8::try_from(kind).expect("kind"), b, ms(0))
            .expect("SHM válido");
    }
    t.udp(&[1, 42, 0, 0, 0, 1, 0, 0, 0], ms(0))
        .expect("registro");
    t
}

fn lap(out: &mut Vec<u8>, time: i32) {
    out.extend_from_slice(&time.to_le_bytes());
    out.extend_from_slice(&[0, 0, 0, 0, 3]);
    for n in [30000, 30000, 30000] {
        out.extend_from_slice(&i32::to_le_bytes(n));
    }
    out.extend_from_slice(&[0, 1, 0, 0]);
}

fn car(index: u16, spline: f32, laps: u16, last: i32) -> Vec<u8> {
    let mut b = vec![3];
    b.extend_from_slice(&index.to_le_bytes());
    b.extend_from_slice(&[0, 0, 1, 4]);
    for v in [12.0_f32, 20.0, 0.0] {
        b.extend_from_slice(&v.to_le_bytes());
    }
    b.push(1);
    for n in [180_u16, 1, 1, 0] {
        b.extend_from_slice(&n.to_le_bytes());
    }
    b.extend_from_slice(&spline.to_le_bytes());
    b.extend_from_slice(&laps.to_le_bytes());
    b.extend_from_slice(&0_i32.to_le_bytes());
    for time in [last, last, 20000] {
        lap(&mut b, time);
    }
    b
}

fn session(index: u16, kind: u8, phase: u8, clock: f32) -> Vec<u8> {
    let mut b = vec![2, 0, 0];
    b.extend_from_slice(&index.to_le_bytes());
    b.extend_from_slice(&[kind, phase]);
    for time in [clock, 600_000.0] {
        b.extend_from_slice(&time.to_le_bytes());
    }
    b.extend_from_slice(&[0; 4]);
    b.extend_from_slice(&[0; 7]); // tres cadenas vacías e isReplayPlaying=false
    b.extend_from_slice(&[0; 9]);
    lap(&mut b, i32::MAX);
    b
}

fn entry_list(indices: &[u16]) -> Vec<u8> {
    let mut b = vec![4, 42, 0, 0, 0];
    b.extend_from_slice(&u16::try_from(indices.len()).expect("lista").to_le_bytes());
    for index in indices {
        b.extend_from_slice(&index.to_le_bytes());
    }
    b
}

#[test]
fn si_player_identity_by_slot_delta_flags_and_fuel() {
    let mut t = setup();
    let mut g = pages()[1].clone();
    int(&mut g, 0, 2);
    int(&mut g, 1500, 1);
    int(&mut g, 1508, 1);
    int(&mut g, 1224, 1);
    t.shm(1, g.clone(), ms(10)).expect("banderas");
    let o = t.observe(ms(10)).expect("observación");
    let p = o.state.player.expect("jugador");
    assert_eq!(p.car, CarId(1005));
    assert_eq!(p.telemetry.gear, Quality::Reliable(3));
    assert_eq!(p.telemetry.speed_mps, Quality::Reliable(50.0));
    assert_eq!(p.telemetry.throttle, Quality::Reliable(0.75));
    assert_eq!(p.delta_best_s, Quality::Reliable(1.5));
    let pose = o
        .state
        .player_car()
        .expect("jugador neutral")
        .pose
        .current()
        .expect("hueco 7");
    assert!((pose.x_m - 10.0).abs() < 1e-12 && (pose.y_m - 20.0).abs() < 1e-12);
    assert_eq!(o.state.session.remaining_s, Quality::Reliable(600.0));
    let flags = o.state.flags.current().expect("banderas");
    for flag in [
        Flag {
            kind: FlagKind::Yellow,
            scope: FlagScope::Session,
        },
        Flag {
            kind: FlagKind::Yellow,
            scope: FlagScope::Sector(1),
        },
        Flag {
            kind: FlagKind::Blue,
            scope: FlagScope::Car(CarId(1005)),
        },
    ] {
        assert!(flags.contains(&flag));
    }
    int(&mut g, 0, 3);
    int(&mut g, 1400, 0);
    int(&mut g, 1528, 1);
    int(&mut g, 1224, 123);
    t.shm(1, g, ms(20)).expect("roja");
    let o = t.observe(ms(20)).expect("observación");
    assert_eq!(
        o.state.player.expect("jugador").delta_best_s,
        Quality::Reliable(-1.5)
    );
    assert_eq!(
        o.state.session.state,
        Quality::Estimated(SessionState::Interrupted)
    );
    assert!(o.state.flags.current().expect("banderas").contains(&Flag {
        kind: FlagKind::Other("flag:123".into()),
        scope: FlagScope::Car(CarId(1005))
    }));
}

#[test]
fn udp_does_not_rejuvenate_shm_and_packet_repeats_stay_stale() {
    let mut t = setup();
    t.udp(&car(8, 0.5, 2, 90000), ms(600)).expect("UDP fresco");
    assert!(
        !t.shm(0, pages()[0].clone(), ms(600))
            .expect("packetId repetido")
    );
    let o = t.observe(ms(600)).expect("observación");
    assert_eq!(o.state.capabilities.driver_inputs, Capability::WithData);
    assert_eq!(o.state.capabilities.flags, Capability::WithData);
    assert_eq!(o.state.capabilities.positions, Capability::Fresh);
    assert!(matches!(
        o.state.player.expect("jugador").telemetry.throttle,
        Quality::Stale(0.75)
    ));
    assert_eq!(
        t.observe(ms(1600))
            .expect("caducidad UDP")
            .state
            .capabilities
            .positions,
        Capability::WithData
    );
}

#[test]
fn lap_line_window_freezes_lap_count_best_and_last_for_udp_and_player() {
    let mut t = setup();
    for (at, spline, count, last) in [
        (0, 0.9, 1, 91000),
        (10, 0.95, 2, 0),
        (20, 0.02, 1, i32::MAX),
        (30, 0.06, 2, 89000),
        (40, 0.08, 2, 89000),
    ] {
        t.udp(&car(8, spline, count, last), ms(at))
            .expect("lap update");
        let mut g = pages()[1].clone();
        int(&mut g, 0, i32::try_from(at + 2).expect("packet"));
        float(&mut g, 248, spline);
        int(&mut g, 132, i32::from(count));
        int(&mut g, 144, last);
        int(&mut g, 148, last);
        t.shm(1, g, ms(at)).expect("jugador");
        let o = t.observe(ms(at)).expect("observación");
        for c in &o.state.cars {
            let expected_laps = if at == 40 { 2 } else { 1 };
            let expected_time = if at == 40 { 89.0 } else { 91.0 };
            assert_eq!(c.laps, Quality::Reliable(expected_laps));
            assert_eq!(c.last_lap_s, Quality::Reliable(expected_time));
            assert_eq!(c.best_lap_s, Quality::Reliable(expected_time));
        }
    }
}

#[test]
fn rewind_index_and_track_change_start_new_sessions_without_old_entries() {
    let mut t = setup();
    t.udp(&session(0, 10, 5, 100_000.0), ms(0))
        .expect("carrera");
    t.udp(&car(8, 0.5, 7, 90000), ms(10)).expect("rival");
    t.udp(&session(0, 10, 5, 1000.0), ms(20))
        .expect("rewind SP mismo index");
    let o = t.observe(ms(20)).expect("sesión nueva");
    assert_eq!(o.state.session.id, SessionId(2));
    assert!(!o.state.cars.iter().any(|c| c.id == CarId(8)));
    assert!(t.request_entries && t.request_track);
    t.udp(&session(1, 10, 1, 2000.0), ms(30))
        .expect("index nuevo");
    assert_eq!(
        t.observe(ms(30)).expect("sesión nueva").state.session.id,
        SessionId(3)
    );
    assert_eq!(
        t.observe(ms(30)).expect("estado").state.session.state,
        Quality::Reliable(SessionState::Preparing)
    );
    let mut s = pages()[2].clone();
    s[134..200].fill(0);
    wide(&mut s, 134, "spa");
    t.shm(2, s, ms(40)).expect("pista");
    let mut g = pages()[1].clone();
    int(&mut g, 0, 2);
    t.shm(1, g, ms(41)).expect("firma inicial");
    let mut s = pages()[2].clone();
    s[134..200].fill(0);
    wide(&mut s, 134, "brands_hatch");
    t.shm(2, s, ms(50)).expect("cambio de pista");
    assert_eq!(
        t.observe(ms(50)).expect("sesión nueva").state.session.id,
        SessionId(4)
    );
}

#[test]
fn off_and_zero_physics_degrade_honestly() {
    let mut t = setup();
    let mut p = vec![0; 800];
    int(&mut p, 0, 2);
    t.shm(0, p, ms(10)).expect("pausa");
    let o = t.observe(ms(10)).expect("últimos datos");
    assert_eq!(
        o.state.player.expect("jugador").fuel.level_l,
        Quality::Stale(30.0)
    );
    let mut g = pages()[1].clone();
    int(&mut g, 0, 2);
    int(&mut g, 4, 0);
    t.shm(1, g, ms(20)).expect("OFF");
    let o = t.observe(ms(20)).expect("menú");
    assert!(o.state.cars.is_empty() && o.state.player.is_none());
    assert_eq!(o.state.capabilities.positions, Capability::Supported);
    assert_eq!(o.state.capabilities.driver_inputs, Capability::Supported);
    assert_eq!(o.state.capabilities.session_clock, Capability::Supported);
    assert_eq!(o.state.session.state, Quality::Unavailable);
}

#[test]
fn malformed_protocol_is_transactional_sentinels_are_absent_and_grid_is_bounded() {
    let mut t = setup();
    t.udp(&car(8, 0.5, 1, i32::MAX), ms(0)).expect("ausente");
    assert!(t.request_entries, "carIndex desconocido pide lista");
    let before = t.observe(ms(0)).expect("before");
    assert_eq!(before.state.cars[0].last_lap_s, Quality::Unavailable);
    let b = car(9, 0.5, 1, 90000);
    for n in 0..b.len() {
        assert!(t.udp(&b[..n], ms(0)).is_err());
    }
    assert_eq!(before, t.observe(ms(0)).expect("después de truncados"));
    assert!(t.udp(&entry_list(&[8, 8]), ms(0)).is_err());
    let too_many: Vec<u16> = (0..105).collect();
    assert!(t.udp(&entry_list(&too_many), ms(0)).is_err());
    assert!(t.shm(1, vec![0; 1587], ms(0)).is_err());
    let mut p = pages()[0].clone();
    int(&mut p, 0, 2);
    float(&mut p, 4, f32::NAN);
    float(&mut p, 12, 121.0);
    t.shm(0, p, ms(1)).expect("saneamiento por señal");
    let player = t
        .observe(ms(1))
        .expect("observación")
        .state
        .player
        .expect("jugador");
    assert_eq!(player.telemetry.throttle, Quality::Unavailable);
    assert_eq!(player.fuel.level_l, Quality::Unavailable);
}

#[test]
fn driver_swap_keeps_car_and_driver_ids_follow_names() {
    let mut t = setup();
    t.udp(&entry_list(&[8, 9]), ms(0)).expect("lista");
    for i in [8, 9] {
        t.entries.insert(
            i,
            Entry {
                index: i,
                number: 42,
                cup: 0,
                drivers: vec!["Alice".into(), "Bob".into()],
            },
        );
        t.udp(&car(i, 0.5, 2, 90000), ms(0)).expect("coche");
    }
    let a = t.observe(ms(0)).expect("Alice");
    let alice = a.state.cars[0].driver.id;
    assert_eq!(a.state.cars[1].driver.id, alice);
    let mut b = car(8, 0.5, 2, 90000);
    b[3..5].copy_from_slice(&1_u16.to_le_bytes());
    b[5] = 2;
    t.udp(&b, ms(10)).expect("relevo");
    let swap = t.observe(ms(10)).expect("Bob");
    assert_eq!(swap.state.cars[0].id, CarId(8));
    assert_eq!(swap.state.cars[0].driver.name, "Bob");
    assert_ne!(swap.state.cars[0].driver.id, alice);
    assert_eq!(swap.state.cars[1].driver.id, alice);
}
