//! Fotos reales por el pipe real hasta `Widget::ingest` de cada widget (#1537).
//!
//! Fuente: las capturas sin comprimir de `fixtures/telemetry-real` (lmu47, su
//! secuencia de doce, acc, stale y menú) y los goldens gzip de runtime: las
//! 3.839 fotos de lmu47 y los ocho cortes de ACC (el golden no guarda más; las
//! 190.308 fotos de ACC solo existen como hash y en el replay de runtime).
//!
//! Standings, Relative, Delta y Fuel cambian de proyección en #1531: aquí solo
//! se comprueba su entrada pública (`ingest`, `frame`, `size`) sin pánico. Al
//! cerrarse #1531 hay que añadir su comprobación de «—» y de orden.

use std::sync::Arc;
use std::time::{Duration, Instant};

use vantare_domain::format::{PLACEHOLDER, Preferences};
use vantare_domain::{Class, ClassId, Quality, Snapshot, SourceState};

use crate::{Kind, Settings, Widget};

fn real_photos() -> Vec<(String, Snapshot)> {
    let mut photos = Vec::new();
    let sequence = include_str!("../fixtures/telemetry-real/lmu47-input.sequence.json");
    for (index, snapshot) in crate::workshop::snapshots_from_json(sequence)
        .expect("secuencia real")
        .into_iter()
        .enumerate()
    {
        photos.push((format!("lmu47-input #{}", index + 1), snapshot));
    }
    for (name, json) in [
        (
            "lmu47",
            include_str!("../fixtures/telemetry-real/lmu47.snapshot.json"),
        ),
        (
            "acc",
            include_str!("../fixtures/telemetry-real/acc.snapshot.json"),
        ),
        (
            "lmu-stale",
            include_str!("../fixtures/telemetry-real/lmu-stale.snapshot.json"),
        ),
        (
            "lmu-menu",
            include_str!("../fixtures/telemetry-real/lmu-menu.snapshot.json"),
        ),
    ] {
        photos.push((
            name.to_owned(),
            vantare_ipc::snapshot_from_json(json).expect("foto real"),
        ));
    }
    photos
}

/// Fotos de un golden gzip de runtime (`jsonl`, una foto por línea).
fn golden_photos(name: &str) -> Vec<(String, Snapshot)> {
    use std::io::BufRead;
    let path = format!(
        "{}/../runtime/tests/golden/{name}.jsonl.gz",
        env!("CARGO_MANIFEST_DIR")
    );
    let file = std::fs::File::open(path).expect("golden obligatorio");
    std::io::BufReader::new(flate2::read::GzDecoder::new(file))
        .lines()
        .enumerate()
        .map(|(index, line)| {
            let line = line.expect("gzip íntegro");
            let snapshot = vantare_ipc::snapshot_from_json(&line).expect("DTO vigente");
            (format!("{name} #{}", index + 1), snapshot)
        })
        .collect()
}

fn shown<T: Copy>(quality: Quality<T>, valid: impl Fn(T) -> bool) -> bool {
    quality.current().is_some_and(|v| valid(*v))
}

/// Celdas que pintan «—» (o nada) aunque la foto trae el dato Reliable o
/// Estimated. Solo proyecciones ajenas a #1531.
fn hidden_values(snapshot: &Snapshot, prefs: Preferences) -> Vec<String> {
    let mut hidden = Vec::new();
    let mut check = |widget: &str, field: &str, has: bool, missing: bool| {
        if has && missing {
            hidden.push(format!("{widget}.{field}"));
        }
    };
    let available = !matches!(
        snapshot.state.source_state,
        SourceState::Waiting | SourceState::Lost
    );
    let finite = |v: f64| v.is_finite();
    let positive = |v: f64| v.is_finite() && v >= 0.0;
    if let Some(player) = snapshot.state.player.filter(|_| available) {
        let t = player.telemetry;
        let gear = shown(t.gear, |g| g >= -1);
        let pedals = [t.clutch, t.brake, t.throttle].map(|q| shown(q, finite));
        let pedals_vm = vantare_domain::pedals_telemetry::project(snapshot, prefs);
        check("pedals", "gear", gear, pedals_vm.gear == PLACEHOLDER);
        let speed = shown(t.speed_mps, positive);
        check("pedals", "speed", speed, pedals_vm.speed == PLACEHOLDER);
        let rpm = shown(t.engine_speed_rad_s, positive);
        check("pedals", "rpm", rpm, pedals_vm.rpm == PLACEHOLDER);
        let input = vantare_domain::input_telemetry::project(snapshot, prefs);
        check("input", "gear", gear, input.gear == PLACEHOLDER);
        check("input", "speed", speed, input.speed == PLACEHOLDER);
        check("input", "rpm", rpm, input.rpm == PLACEHOLDER);
        for (index, has) in pedals.into_iter().enumerate() {
            check("pedals", "pedal", has, pedals_vm.pedals[index].is_none());
            check("input", "pedal", has, input.pedals[index].is_none());
        }
    }
    let weather = vantare_domain::track_weather::project(snapshot, prefs);
    if weather.status == vantare_domain::track_weather::Status::Ready {
        let w = snapshot.state.session.weather;
        let unit = |v: f64| (0.0..=1.0).contains(&v);
        let wet = shown(w.track_wetness, unit);
        // Mismo orden que la proyección; «SECO» solo existe con humedad.
        let mut signals = vec![
            shown(w.track_temperature_k, positive),
            shown(w.air_temperature_k, positive),
            shown(w.wind_speed_mps, positive),
            shown(w.rain, unit),
            wet,
        ];
        if wet {
            signals.push(true);
        }
        signals.push(shown(w.pressure_pa, positive));
        assert_eq!(weather.metrics.len(), signals.len(), "métricas de clima");
        for (metric, has) in weather.metrics.iter().zip(signals) {
            check("weather", metric.label, has, metric.value == PLACEHOLDER);
        }
    }
    let tower = vantare_domain::broadcast_tower::project(snapshot, prefs);
    let session = available && snapshot.state.session.kind.current().is_some();
    check("tower", "session", session, tower.session == PLACEHOLDER);
    for row in &tower.rows {
        let car = snapshot
            .state
            .cars
            .iter()
            .find(|car| car.id == row.id)
            .expect("fila con coche");
        let place = shown(car.position, |p| p > 0);
        check("tower", "place", place, row.place.is_none());
    }
    hidden
}

/// Publica cada foto y entrega lo recibido a un widget por tipo, con la
/// demanda unida de todos, como el proceso de overlays.
fn replay(name: &str, photos: Vec<(String, Snapshot)>, mut each: impl FnMut(&str, &Snapshot)) {
    let prefs = Preferences::default();
    let settings: Vec<Settings> = Kind::ALL
        .iter()
        .copied()
        .map(Settings::default_for)
        .collect();
    let mut widgets: Vec<Widget> = settings.iter().map(|s| Widget::new(s, prefs)).collect();
    let mut demand = vantare_ipc::Demand::default();
    for s in &settings {
        demand.union(&s.demand());
    }
    let pipe = format!("vantare-replay-{name}-{}", std::process::id());
    let mut publisher = vantare_ipc::Publisher::new(&pipe, |_| true).expect("pipe");
    let source = publisher.demand_source();
    let mut subscriber =
        vantare_ipc::Subscriber::connect_requested(&pipe, demand.clone(), |_| true)
            .expect("suscriptor");
    let deadline = Instant::now() + Duration::from_secs(2);
    while source.mask() != demand.mask() {
        assert!(Instant::now() < deadline, "demanda no aceptada");
        std::thread::yield_now();
    }
    for (sequence, (label, mut snapshot)) in (1..).zip(photos) {
        // Una línea de tiempo creciente para el publicador; datos intactos.
        (snapshot.epoch, snapshot.sequence) = (1, sequence);
        publisher.publish(Arc::new(snapshot)).expect("publicar");
        let photo = subscriber
            .next_photo(Duration::from_secs(2))
            .unwrap_or_else(|| panic!("{label}: foto no recibida"));
        assert_eq!(photo.snapshot.sequence, sequence, "{label}");
        for (widget, settings) in widgets.iter_mut().zip(&settings) {
            widget.ingest(&photo.snapshot, prefs);
            let _ = widget.frame_with_motion(prefs, true);
            let (w, h) = widget.size();
            assert!(
                w > 0.0 && h > 0.0 && w.is_finite() && h.is_finite(),
                "{label}: tamaño de {}",
                settings.kind().name()
            );
        }
        each(&label, &photo.snapshot);
    }
}

#[test]
fn real_photos_reach_every_widget_through_the_pipe_without_hiding_current_values() {
    let prefs = Preferences::default();
    let mut checked = 0;
    replay("real", real_photos(), |label, snapshot| {
        let hidden = hidden_values(snapshot, prefs);
        assert!(
            hidden.is_empty(),
            "{label}: «—» con dato actual: {hidden:?}"
        );
        checked += 1;
    });
    assert_eq!(checked, 16, "todas las fotos reales");
}

#[test]
fn golden_corpora_reach_every_widget_through_the_pipe_without_hiding_current_values() {
    let prefs = Preferences::default();
    for (name, photos) in [("lmu47", 3839), ("acc", 8)] {
        let mut checked = 0;
        replay(name, golden_photos(name), |label, snapshot| {
            let hidden = hidden_values(snapshot, prefs);
            assert!(
                hidden.is_empty(),
                "{label}: «—» con dato actual: {hidden:?}"
            );
            checked += 1;
        });
        assert_eq!(checked, photos, "{name}: corpus completo");
    }
}

/// Foto de 104 coches en tres clases intercaladas, ampliada desde la captura
/// real de lmu47; el jugador va último.
pub(crate) fn photo_104() -> Snapshot {
    let mut snapshot = vantare_ipc::snapshot_from_json(include_str!(
        "../fixtures/telemetry-real/lmu47.snapshot.json"
    ))
    .expect("foto real");
    let template = snapshot.state.cars.clone();
    let classes = ["Hypercar", "LMP2", "LMGT3"];
    let mut class_positions = [0; 3];
    snapshot.state.cars = (0..104_u32)
        .map(|index| {
            let mut car = template[index as usize % template.len()].clone();
            let class = index as usize % 3;
            class_positions[class] += 1;
            car.id = vantare_domain::CarId(index + 1);
            car.number = format!("{}", index + 1);
            car.driver.name = format!("Piloto Con Nombre Largo {:03}", index + 1);
            car.class = Some(Class {
                id: ClassId(class as u32),
                name: classes[class].into(),
            });
            car.position = Quality::Reliable(index + 1);
            car.class_position = Quality::Reliable(class_positions[class]);
            car
        })
        .collect();
    snapshot.state.player.as_mut().expect("jugador").car = vantare_domain::CarId(104);
    snapshot
}

#[test]
fn a_104_car_multiclass_grid_reaches_every_widget_and_keeps_the_player() {
    let prefs = Preferences::default();
    let mut received = None;
    replay("104", vec![("104".into(), photo_104())], |_, snapshot| {
        received = Some(snapshot.clone());
    });
    let snapshot = received.expect("foto de 104");
    assert_eq!(snapshot.state.cars.len(), 104, "el cable no recorta coches");
    let hidden = hidden_values(&snapshot, prefs);
    assert!(hidden.is_empty(), "«—» con dato actual: {hidden:?}");
    // Ambos Looks conservan al jugador con el Board común y su Plan (#1531).
    let board = std::sync::Arc::new(vantare_domain::standings::project(&snapshot, prefs));
    let plan = vantare_domain::standings::Plan::new(board.clone(), "104".into(), snapshot.sequence);
    assert_eq!(plan.rows.len(), 104, "el Plan no recorta coches");
    let rows = &plan.rows;
    let me: Vec<_> = rows.iter().filter(|row| row.is_player).collect();
    assert_eq!(me.len(), 1, "un solo jugador en Standings");
    assert_eq!(me[0].position, 104);
    assert_eq!(me[0].row.position, "104");
    assert!(board.player_present);
    let players = board
        .groups
        .iter()
        .flat_map(|group| &group.rows)
        .filter(|row| row.is_player)
        .count();
    assert_eq!(players, 1, "un solo jugador en Standings Vantare");
}
