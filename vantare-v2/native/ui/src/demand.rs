//! Señales de la presentación: ni geometría ni datos del simulador.
use vantare_ipc::{Demand, Signal};

pub(crate) fn signals(interval_ms: u16, signals: &[Signal]) -> Demand {
    let mut demand = Demand::default();
    for &signal in signals {
        demand.request(signal, interval_ms);
    }
    demand
}

pub(crate) fn information(demand: &mut Demand, id: &str, slots: bool) {
    use Signal::{
        LapCount, LapTimes, LapsRemaining, Positions, SessionClock, SessionInfo, TrackName, Weather,
    };
    let signal = match id {
        "trackTemperature" | "airTemperature" | "ambient" | "wind" | "rain" | "wetness" => Weather,
        "track" if slots => Weather,
        "track" => TrackName,
        "estimatedLaps" => LapsRemaining,
        "totalLaps" => SessionInfo,
        "remaining" | "time" => SessionClock,
        "lap" => LapCount,
        "position" => Positions,
        "lastLap" | "bestLap" => LapTimes,
        _ => return,
    };
    demand.request(signal, 250);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Kind, Settings};

    #[test]
    fn a_flags_only_layout_receives_the_players_personal_flag_over_the_real_pipe() {
        use std::{
            sync::Arc,
            time::{Duration, Instant},
        };
        let mut snapshot = vantare_ipc::snapshot_from_fixture_json(include_str!(
            "../fixtures/telemetry-real/lmu47.snapshot.json"
        ))
        .expect("captura real");
        let player = snapshot.state.player.expect("jugador de la captura").car;
        // Controlled positive flag: the real corpus does not certify a DQ.
        snapshot.state.flags = vantare_domain::Quality::Reliable(vec![vantare_domain::Flag {
            kind: vantare_domain::FlagKind::Black,
            scope: vantare_domain::FlagScope::Car(player),
        }]);
        let name = format!("vantare-1638-flags-demand-{}", std::process::id());
        let mut publisher = vantare_ipc::Publisher::new(&name, |_| true).expect("pipe aislado");
        let demand = Settings::default_for(Kind::RacingFlags).demand();
        let source = publisher.demand_source();
        let mut subscriber =
            vantare_ipc::Subscriber::connect_requested(&name, demand.clone(), |_| true)
                .expect("lector");
        let deadline = Instant::now() + Duration::from_secs(2);
        while source.mask() != demand.mask() {
            assert!(Instant::now() < deadline, "demanda pendiente");
            std::thread::yield_now();
        }
        publisher.publish(Arc::new(snapshot)).expect("foto");
        let photo = subscriber
            .next_photo(Duration::from_secs(1))
            .expect("entrega selectiva");
        let vm = vantare_domain::racing_flags::project(
            &photo.snapshot,
            vantare_domain::format::Preferences::default(),
        );
        assert_eq!(vm.message, "DESCALIFICADO");
    }

    #[test]
    fn common_boards_and_hidden_inputs_declare_required_signals() {
        let settings: Settings = serde_json::from_str(r#"{"kind":"standings","designSystem":"eficiencia","classScope":"all-classes","showSessionHeader":false,"showSessionFooter":true,"footerSlots":["ambient"],"columns":[{"metricId":"driverName"},{"metricId":"gap","enabled":false}]}"#).expect("ajustes");
        let demand = settings.demand();
        assert!(demand.contains(Signal::Weather));
        assert!(demand.contains(Signal::Gaps));
        assert!(demand.contains(Signal::ClassGaps));
        assert!(!demand.contains(Signal::LapsRemaining));
        assert!(demand.contains(Signal::SessionClock));
        for &look in crate::look::Look::ALL {
            let mut next = settings.normalized();
            next.set_look(look);
            assert_eq!(
                next.demand(),
                demand,
                "Look no cambia la señal del Board común"
            );
        }
        let settings: Settings =
            serde_json::from_str(r#"{"kind":"input-telemetry","showClutch":false}"#)
                .expect("ajustes");
        assert!(settings.demand().contains(Signal::Pedals));
        assert!(
            settings.demand().contains(Signal::Clutch),
            "el estado del renderer depende de clutch"
        );
        for &kind in Kind::ALL {
            assert!(Settings::default_for(kind).demand() != Demand::default());
        }
    }

    #[test]
    fn layout_unions_visible_widgets_and_replaces_demand_when_it_changes() {
        let mut layout =
            crate::layout::Layout::from_json(include_bytes!("../fixtures/layout.json"))
                .expect("layout");
        layout.instances[0].settings = Settings::default_for(Kind::Pedals);
        layout.instances.truncate(1);
        let pedals = layout.demand();
        assert!(pedals.contains(Signal::Pedals));
        assert!(!pedals.contains(Signal::Delta));
        let mut delta = layout.instances[0].clone();
        delta.id = "delta-demand".into();
        delta.settings = Settings::default_for(Kind::Delta);
        layout.instances.push(delta);
        assert!(layout.demand().covers(&pedals));
        assert!(layout.demand().contains(Signal::Delta));
        layout.instances[0].visible = false;
        assert!(!layout.demand().contains(Signal::Pedals));
        layout.instances[1].visible = false;
        assert_eq!(layout.demand(), Demand::default());
    }
    #[test]
    fn requested_photos_preserve_every_default_widget_projection() {
        check_requested_projections(None);
    }

    #[test]
    fn real_lmu_and_acc_photos_preserve_every_default_widget_projection() {
        for scene in [
            include_str!("../fixtures/telemetry-real/lmu47.snapshot.json"),
            include_str!("../fixtures/telemetry-real/acc.snapshot.json"),
            include_str!("../fixtures/telemetry-real/lmu-stale.snapshot.json"),
            include_str!("../fixtures/telemetry-real/lmu-menu.snapshot.json"),
        ] {
            check_requested_projections(Some(scene));
        }
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "opt-in: núcleo LMU físico con pipe y datos aislados; no es gate CI"]
    fn live_lmu_photos_preserve_every_widget_projection() {
        use std::time::{Duration, Instant};
        use vantare_domain::{SourceKind, SourceState};
        let pipe = std::env::var("VANTARE_1638_LIVE_PIPE").expect("pipe QA explícito");
        assert!(pipe.starts_with("vantare-1638-"), "pipe QA aislado");
        let image = std::fs::canonicalize(
            std::env::var_os("VANTARE_1638_CORE_IMAGE").expect("imagen Core QA explícita"),
        )
        .expect("imagen Core existente");
        let mut subscriber = vantare_ipc::Subscriber::connect(&pipe, move |peer| {
            std::fs::canonicalize(&peer.image).is_ok_and(|path| path == image)
        })
        .expect("lector Core real");
        let deadline = Instant::now() + Duration::from_secs(10);
        let snapshot = loop {
            assert!(
                Instant::now() < deadline,
                "LMU sin sesión usable en el pipe QA"
            );
            if let Some(photo) = subscriber.next_photo(Duration::from_millis(250)) {
                let snapshot = photo.snapshot;
                if !snapshot.state.cars.is_empty() && snapshot.state.player.is_some() {
                    assert_eq!(snapshot.origin.source.simulator, "lmu", "solo LMU");
                    assert_eq!(
                        snapshot.origin.source.kind,
                        SourceKind::Live,
                        "no admite replay"
                    );
                    if matches!(
                        snapshot.state.source_state,
                        SourceState::Live | SourceState::Paused
                    ) {
                        break snapshot;
                    }
                }
            }
        };
        println!(
            "LMU físico: sequence={}, state={:?}, cars={}, flags_current={}; sin guardar nombres/cuerpos",
            snapshot.sequence,
            snapshot.state.source_state,
            snapshot.state.cars.len(),
            snapshot.state.flags.current().is_some(),
        );
        // Misma foto física para todos los widgets: compara cada proyección
        // completa con su demanda por el pipe productivo, sin abrir ventanas.
        let json = vantare_ipc::snapshot_to_json(&snapshot).expect("DTO live");
        check_requested_projections(Some(&json));
    }

    fn check_requested_projections(real_scene: Option<&str>) {
        use std::{sync::Arc, time::Duration};
        let prefs = vantare_domain::format::Preferences::default();
        let mut configurations: Vec<_> = Kind::ALL
            .iter()
            .copied()
            .map(Settings::default_for)
            .collect();
        if real_scene.is_some() {
            // Opciones reales del inspector; los datos de las fotos no se modifican.
            for json in [
                r#"{"kind":"standings","classScope":"all-classes","classificationMode":"multiclass","columns":[{"metricId":"position"},{"metricId":"carNumber"},{"metricId":"driverName"},{"metricId":"class"},{"metricId":"gap"},{"metricId":"interval"},{"metricId":"currentLap"},{"metricId":"lastLap"},{"metricId":"bestLap"},{"metricId":"pit"}]}"#,
                r#"{"kind":"standings","footerFirst":"totalLaps","footerSecond":"track"}"#,
                r#"{"kind":"relative","classScope":"sameClass","columns":[{"metricId":"position"},{"metricId":"class"},{"metricId":"carNumber"},{"metricId":"driverName"},{"metricId":"gap"},{"metricId":"bestLap"},{"metricId":"lastLap"}],"footerSlots":["ambient","track","wind","rain","wetness","time","lap","position","lastLap"]}"#,
                r#"{"kind":"head-to-head","target":"behind"}"#,
            ] {
                configurations.push(serde_json::from_str(json).expect("opciones del inspector"));
            }
        }
        for (index, settings) in configurations.into_iter().enumerate() {
            let kind = settings.kind();
            let scene = real_scene.map_or_else(
                || {
                    std::fs::read_to_string(format!(
                        "{}/fixtures/{}.snapshot.json",
                        env!("CARGO_MANIFEST_DIR"),
                        kind.name()
                    ))
                    .expect("escena de paridad")
                },
                str::to_owned,
            );
            let mut snapshot = vantare_ipc::snapshot_from_json(&scene).expect("foto completa");
            let name = format!(
                "vantare-demand-projection-{}-{}-{}-{index}",
                std::process::id(),
                // Los dos tests corren a la vez: cada uno con su socket.
                if real_scene.is_some() {
                    "real"
                } else {
                    "default"
                },
                kind.name()
            );
            let mut publisher = vantare_ipc::Publisher::new(&name, |_| true).expect("pipe");
            let demand = settings.demand();
            let source = publisher.demand_source();
            let mut subscriber =
                vantare_ipc::Subscriber::connect_requested(&name, demand.clone(), |_| true)
                    .expect("suscriptor");
            let deadline = std::time::Instant::now() + Duration::from_secs(2);
            while source.mask() != demand.mask() {
                assert!(
                    std::time::Instant::now() < deadline,
                    "{}: demanda no aceptada",
                    kind.name()
                );
                std::thread::yield_now();
            }
            snapshot.sequence += 1;
            publisher.publish(Arc::new(snapshot.clone())).expect("tick");
            let photo = subscriber
                .next_photo(Duration::from_secs(2))
                .expect("foto pedida");
            let mut widget = crate::Widget::new(&settings, prefs);
            widget.ingest(&snapshot, prefs);
            assert!(
                !widget.ingest(&photo.snapshot, prefs),
                "{}: la demanda cambia su proyección con {settings:?}",
                kind.name(),
            );
            println!("{}: demanda y proyección por pipe preservadas", kind.name());
        }
    }
    #[test]
    fn history_widgets_receive_every_observation_without_cadence_gaps() {
        use std::{
            sync::Arc,
            time::{Duration, Instant},
        };
        for kind in [Kind::DeltaTrace, Kind::InputTelemetry] {
            let text = std::fs::read_to_string(format!(
                "{}/fixtures/{}.sequence.json",
                env!("CARGO_MANIFEST_DIR"),
                kind.name()
            ))
            .expect("secuencia congelada");
            let snapshots = crate::workshop::snapshots_from_json(&text).expect("secuencia");
            let name = format!(
                "vantare-history-demand-{}-{}",
                std::process::id(),
                kind.name()
            );
            let mut publisher = vantare_ipc::Publisher::new(&name, |_| true).expect("pipe");
            let demand = Settings::default_for(kind).demand();
            let source = publisher.demand_source();
            let mut subscriber =
                vantare_ipc::Subscriber::connect_requested(&name, demand.clone(), |_| true)
                    .expect("suscriptor");
            let deadline = Instant::now() + Duration::from_secs(2);
            while source.mask() != demand.mask() {
                assert!(Instant::now() < deadline, "demanda de historia pendiente");
                std::thread::yield_now();
            }
            for snapshot in snapshots.into_iter().take(5) {
                publisher
                    .publish(Arc::new(snapshot.clone()))
                    .expect("observación");
                let photo = subscriber
                    .next_photo(Duration::from_millis(100))
                    .expect("una entrega por observación; no un hueco artificial en la historia");
                assert_eq!(photo.snapshot.sequence, snapshot.sequence);
                assert_eq!(photo.snapshot.origin, snapshot.origin);
                let received = photo.snapshot.state.player.expect("jugador recibido");
                let full = snapshot.state.player.expect("jugador de referencia");
                if kind == Kind::DeltaTrace {
                    assert_eq!(received.delta_best_s, full.delta_best_s);
                } else {
                    assert_eq!(received.telemetry.throttle, full.telemetry.throttle);
                    assert_eq!(received.telemetry.brake, full.telemetry.brake);
                    assert_eq!(received.telemetry.clutch, full.telemetry.clutch);
                    assert_eq!(received.telemetry.gear, full.telemetry.gear);
                    assert_eq!(received.telemetry.speed_mps, full.telemetry.speed_mps);
                    assert_eq!(
                        received.telemetry.engine_speed_rad_s,
                        full.telemetry.engine_speed_rad_s
                    );
                }
            }
        }
    }
}
