//! Vectores explícitos: no son capturas de conducción.
use super::*;

fn moving_car(index: u16, time: i32, x: f32, y: f32) -> Vec<u8> {
    let mut b = car(index, 0.5, 2, 90000);
    float(&mut b, 7, x);
    float(&mut b, 11, y);
    int(&mut b, 88, time); // tres laps de 25 bytes; current.LaptimeMS.
    b
}

fn velocity(t: &mut Translator, id: u32, at: u64) -> Quality<[f64; 2]> {
    t.observe(ms(at))
        .expect("observación")
        .state
        .cars
        .iter()
        .find(|c| c.id == CarId(id))
        .expect("coche")
        .velocity_mps
}

fn assert_vector(actual: Quality<[f64; 2]>, expected: [f64; 2]) {
    let Quality::Estimated(v) = actual else {
        panic!("Estimated esperado: {actual:?}")
    };
    assert!(
        (v[0] - expected[0]).abs() < 1e-9 && (v[1] - expected[1]).abs() < 1e-9,
        "{v:?}"
    );
}

#[test]
fn udp_velocity_uses_car_lap_clock_and_not_receive_intervals() {
    let mut t = setup();
    for (at, time, x, y) in [
        (10, 1000, 0.0, 0.0),
        (40, 1100, 4.0, -3.0),
        (70, 1200, 8.0, -6.0),
    ] {
        t.udp(&moving_car(8, time, x, y), ms(at)).expect("UDP");
        if time < 1200 {
            assert_eq!(velocity(&mut t, 8, at), Quality::Unavailable);
        }
    }
    assert_vector(velocity(&mut t, 8, 70), [40.0, -30.0]);
    // Un duplicado no rejuvenece la velocidad; SHM ni otros coches tampoco.
    t.udp(&moving_car(8, 1200, 8.0, -6.0), ms(300))
        .expect("duplicado");
    t.udp(&moving_car(9, 1400, 10.0, 10.0), ms(369))
        .expect("otro coche");
    assert_vector(velocity(&mut t, 8, 369), [40.0, -30.0]);
    assert!(matches!(velocity(&mut t, 8, 370), Quality::Stale(_)));
}

#[test]
fn player_velocity_uses_graphics_pose_and_clock() {
    let mut t = setup();
    for (packet, time, x) in [(2, 1000, 0.0), (3, 1100, 4.0), (4, 1200, 8.0)] {
        let mut g = pages()[1].clone();
        int(&mut g, 0, packet);
        int(&mut g, 140, time);
        float(&mut g, 256 + 7 * 12, x);
        float(&mut g, 264 + 7 * 12, 0.0);
        t.shm(1, g, ms(u64::try_from(time - 1000).expect("at")))
            .expect("graphics");
    }
    assert_vector(velocity(&mut t, 1005, 200), [40.0, 0.0]);
    let mut paused = pages()[1].clone();
    int(&mut paused, 0, 5);
    int(&mut paused, 4, 3);
    t.shm(1, paused, ms(210)).expect("pause");
    assert_eq!(velocity(&mut t, 1005, 210), Quality::Unavailable);
}

fn steady() -> Translator {
    let mut t = setup();
    for (at, time, x) in [(0, 1000, 0.0), (100, 1100, 4.0), (200, 1200, 8.0)] {
        t.udp(&moving_car(8, time, x, 0.0), ms(at)).expect("UDP");
    }
    assert_vector(velocity(&mut t, 8, 200), [40.0, 0.0]);
    t
}

#[test]
fn discontinuities_drop_estimates_and_require_a_new_baseline() {
    for case in 0..12 {
        let mut t = steady();
        let mut b = moving_car(8, 1300, 12.0, 0.0);
        let at = if case == 9 { 500 } else { 300 };
        match case {
            0 => float(&mut b, 7, 500.0),   // velocidad imposible
            1 => float(&mut b, 7, 16.0),    // 80 m/s: aceleración imposible
            2 => b[19] = 2,                 // boxes
            3 => b[19] = 0,                 // ubicación desconocida
            4 => int(&mut b, 88, 1200),     // tiempo repetido con pose distinta
            5 => int(&mut b, 88, 1100),     // tiempo invertido
            6 => int(&mut b, 88, i32::MAX), // sin reloj
            7 => b[32..34].copy_from_slice(&3_u16.to_le_bytes()), // vuelta
            8 => b[3..5].copy_from_slice(&1_u16.to_le_bytes()), // relevo
            9 => {}                         // hueco de recepción >=300 ms
            10 => int(&mut b, 88, 1700),    // hueco de fuente
            11 => float(&mut b, 11, f32::NAN),
            _ => unreachable!(),
        }
        t.udp(&b, ms(at)).expect("datagrama válido");
        assert_eq!(velocity(&mut t, 8, at), Quality::Unavailable, "caso {case}");
        // Ni la siguiente pareja basta después del corte.
        t.udp(&moving_car(8, 1400, 16.0, 0.0), ms(at + 100))
            .expect("nuevo");
        assert_eq!(
            velocity(&mut t, 8, at + 100),
            Quality::Unavailable,
            "caso {case}"
        );
    }
}

#[test]
fn epoch_entry_replacement_and_removal_never_reuse_history() {
    let mut t = steady();
    t.udp(&session(0, 0, 5, 1000.0), ms(200)).expect("sesión");
    let epoch = t.epoch;
    t.udp(&session(0, 0, 5, 0.0), ms(210)).expect("reinicio");
    assert!(t.epoch > epoch);
    t.udp(&moving_car(8, 1300, 12.0, 0.0), ms(220))
        .expect("car");
    assert_eq!(velocity(&mut t, 8, 220), Quality::Unavailable);

    let mut t = steady();
    t.udp(&entry_list(&[8]), ms(210)).expect("lista");
    t.entries.insert(
        8,
        Entry {
            index: 8,
            number: 1,
            cup: 0,
            drivers: vec!["A".into()],
        },
    );
    let mut b = vec![6, 8, 0, 0, 0, 0]; // índice, modelo, equipo vacío
    b.extend_from_slice(&2_i32.to_le_bytes());
    b.extend_from_slice(&[0, 0, 0, 0, 0]); // cup, driver, nationality, 0 drivers
    t.udp(&b, ms(220)).expect("entrada reemplazada");
    assert_eq!(velocity(&mut t, 8, 220), Quality::Unavailable);
    t.udp(&entry_list(&[]), ms(230)).expect("retirada");
    t.udp(&entry_list(&[8]), ms(240)).expect("reentrada");
    t.udp(&moving_car(8, 1300, 12.0, 0.0), ms(250))
        .expect("car");
    assert_eq!(velocity(&mut t, 8, 250), Quality::Unavailable);
}

#[test]
fn rapid_graphics_noise_and_filter_have_explicit_vectors() {
    use crate::adapter::acc::velocity::{Sample, Velocity};
    let mut v = Velocity::default();
    for n in 0..=10 {
        v.update(Some(Sample {
            position: [f64::from(n) * 0.8, 0.0],
            clock: f64::from(n) * 0.02,
            identity: (0, 1),
            at: ms(u64::try_from(n * 20).expect("at")),
        }));
    }
    assert_vector(v.quality(ms(200)), [40.0, 0.0]);
    let mut v = Velocity::default();
    for (at, x) in [(0, 0.0), (100, 0.02), (200, -0.01)] {
        v.update(Some(Sample {
            position: [x, 0.0],
            clock: ms(at).as_secs_f64(),
            identity: (0, 1),
            at: ms(at),
        }));
    }
    assert_vector(v.quality(ms(200)), [0.0, 0.0]);
    let mut t = steady();
    t.udp(&moving_car(8, 1300, 12.2, 0.0), ms(300))
        .expect("aceleración");
    let Quality::Estimated([x, y]) = velocity(&mut t, 8, 300) else {
        panic!("estimado")
    };
    assert!((x - 41.0).abs() < 1e-4 && y == 0.0); // EMA alpha=0.5.
}

#[test]
fn player_pose_and_velocity_use_the_same_source_and_reconnect_is_cold() {
    let mut t = setup();
    for (at, time, x) in [(0, 1000, 0.0), (100, 1100, 4.0), (200, 1200, 8.0)] {
        t.udp(&moving_car(1005, time, x, 0.0), ms(at))
            .expect("UDP jugador");
    }
    // Graphics actual en otra posición: nunca adjuntar su vector UDP.
    assert_eq!(velocity(&mut t, 1005, 200), Quality::Unavailable);
    for (at, time, x) in [(400, 1400, 16.0), (500, 1500, 20.0), (600, 1600, 24.0)] {
        t.udp(&moving_car(1005, time, x, 0.0), ms(at)).expect("UDP");
    }
    // SHM envejecida: pose y vector provienen de UDP.
    assert_vector(velocity(&mut t, 1005, 600), [40.0, 0.0]);
    t.udp(&[1, 43, 0, 0, 0, 1, 0, 0, 0], ms(610))
        .expect("reconexión");
    assert_eq!(velocity(&mut t, 1005, 610), Quality::Unavailable);
}
