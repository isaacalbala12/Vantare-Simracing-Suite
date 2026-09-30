//! Corpus real obligatorio para unidades; vectores explícitos para límites/frescura.
use super::*;
use vantare_domain::{Adapter, Damage};

fn weather_pages() -> [Vec<u8>; 3] {
    let [mut p, mut g, s] = pages();
    float(&mut p, 288, 20.0);
    float(&mut p, 292, 35.0);
    float(&mut g, 1248, 4.5);
    float(&mut g, 1252, 1.0);
    int(&mut g, 1556, 5); // WET no fija una fracción de humedad.
    int(&mut g, 1560, 3); // MEDIUM_RAIN no fija una fracción de lluvia.
    [p, g, s]
}

fn translator() -> Translator {
    let mut t = Translator::new(SourceKind::Replay);
    for (kind, b) in weather_pages().into_iter().enumerate() {
        t.shm(u8::try_from(kind).expect("kind"), b, ms(0))
            .expect("SHM");
    }
    t
}

fn udp_weather(rain: u8, wetness: u8) -> Vec<u8> {
    let mut b = session(0, 0, 5, 1000.0);
    // SDK: 19 bytes de cabecera, tres cadenas vacías, replay=0, hora=4,
    // temperaturas=2, nubes=1; lluvia y humedad en los bytes siguientes.
    b[33] = rain;
    b[34] = wetness;
    b[30] = 20;
    b[31] = 35;
    b
}

#[test]
fn si_weather_and_unexposed_damage_are_not_fabricated() {
    let mut t = translator();
    let o = t.observe(ms(0)).expect("observación");
    let w = o.state.session.weather;
    assert_eq!(w.air_temperature_k, Quality::Reliable(293.15));
    assert_eq!(w.track_temperature_k, Quality::Reliable(308.15));
    assert_eq!(w.wind_speed_mps, Quality::Reliable(4.5));
    assert_eq!(w.rain, Quality::Unavailable);
    assert_eq!(w.track_wetness, Quality::Unavailable);
    assert_eq!(w.wind_direction_rad, Quality::Unavailable);
    assert_eq!(w.pressure_pa, Quality::Unavailable);
    assert_eq!(o.state.player.expect("jugador").damage, Damage::default());
    assert_eq!(o.state.capabilities.weather, Capability::Fresh);
    assert_eq!(o.state.capabilities.damage, Capability::Unsupported);
    // Campos heredados no utilizados: ni siquiera valores no cero son evidencia.
    let mut p = weather_pages()[0].clone();
    int(&mut p, 0, 2);
    for offset in [
        120, 124, 128, 132, 224, 228, 232, 236, 240, 664, 668, 672, 676,
    ] {
        float(&mut p, offset, 0.5);
    }
    t.shm(0, p, ms(10)).expect("campos de daño");
    assert_eq!(
        t.observe(ms(10))
            .expect("observación")
            .state
            .player
            .expect("jugador")
            .damage,
        Damage::default()
    );
}

#[test]
fn sdk_udp_fractions_are_validated_and_do_not_refresh_shm() {
    let mut t = translator();
    t.udp(&udp_weather(4, 7), ms(600)).expect("lluvia UDP");
    let o = t.observe(ms(600)).expect("observación");
    let w = o.state.session.weather;
    // 4/10 y 7/10, no categorías /5 ni porcentajes /100.
    assert_eq!(w.rain, Quality::Reliable(0.4));
    assert_eq!(w.track_wetness, Quality::Reliable(0.7));
    assert_eq!(w.air_temperature_k, Quality::Reliable(293.15));
    assert_eq!(w.wind_speed_mps, Quality::Stale(4.5));
    let o = t.observe(ms(1600)).expect("caducidad UDP");
    assert_eq!(o.state.session.weather.rain, Quality::Stale(0.4));
    assert_eq!(o.state.capabilities.weather, Capability::WithData);
    t.udp(&udp_weather(11, 255), ms(1700))
        .expect("valores fuera de rango");
    let w = t
        .observe(ms(1700))
        .expect("observación")
        .state
        .session
        .weather;
    assert_eq!(w.rain, Quality::Unavailable);
    assert_eq!(w.track_wetness, Quality::Unavailable);
}

#[test]
fn each_shm_page_freezes_independently_and_repeated_packets_stay_stale() {
    let mut t = translator();
    assert!(
        !t.shm(0, weather_pages()[0].clone(), ms(500))
            .expect("packet repetido")
    );
    let mut g = weather_pages()[1].clone();
    int(&mut g, 0, 2);
    t.shm(1, g, ms(500)).expect("graphics fresco");
    let w = t
        .observe(ms(500))
        .expect("observación")
        .state
        .session
        .weather;
    assert_eq!(w.air_temperature_k, Quality::Stale(293.15));
    assert_eq!(w.wind_speed_mps, Quality::Reliable(4.5));
    let mut p = weather_pages()[0].clone();
    int(&mut p, 0, 2);
    t.shm(0, p, ms(1000)).expect("physics fresco");
    let w = t
        .observe(ms(1000))
        .expect("observación")
        .state
        .session
        .weather;
    assert_eq!(w.air_temperature_k, Quality::Reliable(293.15));
    assert_eq!(w.wind_speed_mps, Quality::Stale(4.5));
    t.udp(&car(8, 0.5, 1, 90000), ms(1500))
        .expect("rival fresco");
    assert_eq!(
        t.observe(ms(1500))
            .expect("observación")
            .state
            .capabilities
            .weather,
        Capability::WithData
    );
}

#[test]
fn invalid_signals_pause_zero_physics_and_off_degrade_honestly() {
    let mut t = translator();
    let mut p = weather_pages()[0].clone();
    int(&mut p, 0, 2);
    float(&mut p, 288, f32::NAN);
    float(&mut p, 292, -300.0);
    t.shm(0, p, ms(10)).expect("physics inválido");
    let mut g = weather_pages()[1].clone();
    int(&mut g, 0, 2);
    float(&mut g, 1248, -1.0);
    int(&mut g, 1560, 99);
    t.shm(1, g.clone(), ms(10)).expect("graphics inválido");
    let w = t
        .observe(ms(10))
        .expect("observación")
        .state
        .session
        .weather;
    assert_eq!(w, Weather::default());
    assert_eq!(
        t.observe(ms(10))
            .expect("observación")
            .state
            .capabilities
            .weather,
        Capability::Supported
    );

    let mut t = translator();
    let mut zero = vec![0; 800];
    int(&mut zero, 0, 2);
    t.shm(0, zero, ms(10)).expect("physics a cero");
    assert_eq!(
        t.observe(ms(10))
            .expect("observación")
            .state
            .session
            .weather
            .air_temperature_k,
        Quality::Stale(293.15)
    );
    int(&mut g, 0, 3);
    int(&mut g, 4, 3);
    float(&mut g, 1248, 4.5);
    t.shm(1, g.clone(), ms(20)).expect("pausa");
    t.udp(&udp_weather(4, 7), ms(20))
        .expect("UDP durante pausa");
    let w = t
        .observe(ms(20))
        .expect("observación")
        .state
        .session
        .weather;
    assert_eq!(w.wind_speed_mps, Quality::Stale(4.5));
    assert_eq!(w.rain, Quality::Stale(0.4));
    int(&mut g, 0, 4);
    int(&mut g, 4, 0);
    t.shm(1, g, ms(30)).expect("menú OFF");
    let observation = t.observe(ms(30)).expect("menú");
    assert_eq!(observation.state.session.weather, Weather::default());
    assert_eq!(
        observation.state.capabilities.weather,
        Capability::Supported
    );
}

#[test]
fn no_rain_is_an_exact_shm_value_but_other_categories_are_not_fractions() {
    let mut t = setup();
    assert_eq!(
        t.observe(ms(0))
            .expect("NO_RAIN")
            .state
            .session
            .weather
            .rain,
        Quality::Reliable(0.0)
    );
    assert_eq!(
        t.observe(ms(500))
            .expect("caducidad")
            .state
            .session
            .weather
            .rain,
        Quality::Stale(0.0)
    );
    for category in 1..=5 {
        let mut g = pages()[1].clone();
        int(&mut g, 0, category + 1);
        int(&mut g, 1560, category);
        t.shm(1, g, ms(600)).expect("categoría");
        assert_eq!(
            t.observe(ms(600))
                .expect("observación")
                .state
                .session
                .weather
                .rain,
            Quality::Unavailable
        );
    }
}

#[test]
fn real_acc_fixture_weather_has_independent_si_expectations() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../testdata/acc/acc-sesion-udp-20260929.tar.gz");
    let mut replay = super::super::super::replay::open_acc_replay(&path)
        .expect("corpus ACC obligatorio verificado");
    let mut checked = false;
    let mut checked_udp = false;
    // El primer REALTIME_UPDATE real llega en 11.8011902 s, tras el registro.
    // Recorrer SHM hasta ese instante: 1 s nunca alcanza el clima UDP.
    for _ in 0..10_000 {
        let Some(o) = replay
            .poll(Duration::from_secs(12))
            .expect("captura válida")
        else {
            continue;
        };
        if o.state.player.is_none() {
            continue;
        }
        let w = o.state.session.weather;
        if w.track_wetness.current().is_some() {
            // Primera REALTIME_UPDATE capturada: RainLevel=0, Wetness=0.
            assert_eq!(w.rain, Quality::Reliable(0.0));
            assert_eq!(w.track_wetness, Quality::Reliable(0.0));
            checked_udp = true;
        }
        if checked {
            if checked_udp {
                break;
            }
            continue;
        }
        // Primera physics real: airTemp = 30.9055118560791 °C, roadTemp =
        // 39.66082000732422 °C (f32 crudos). Kelvin se calcula sumando 273.15.
        assert_eq!(
            w.air_temperature_k,
            Quality::Reliable(304.055_511_856_079_1)
        );
        assert_eq!(
            w.track_temperature_k,
            Quality::Reliable(312.810_820_007_324_2)
        );
        assert_eq!(w.wind_speed_mps, Quality::Reliable(0.0)); // windSpeed SHM real = 0 m/s.
        assert_eq!(w.rain, Quality::Reliable(0.0)); // enum NO_RAIN real = 0.
        assert_eq!(
            o.state.player.expect("jugador parado en boxes").damage,
            Damage::default()
        );
        checked = true;
    }
    assert!(checked, "el corpus debe producir clima del jugador");
    assert!(checked_udp, "el corpus debe aportar humedad desde UDP");
}
