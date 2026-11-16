use super::painting_tests::{config, paint};
use super::*;
use rune::Runtime;
use vantare_domain::{
    CarId,
    Quality::Reliable,
    standings::Mark,
    widget_settings::look::{Accent, Tone},
};

fn photo() -> Snapshot {
    super::tests::named_photos()
        .into_iter()
        .find(|(name, _)| name == "Carrera · vuelta 14/38")
        .unwrap()
        .1
}
fn swap(photo: &mut Snapshot) {
    photo.state.cars[0].position = Reliable(2);
    photo.state.cars[0].class_position = Reliable(2);
    photo.state.cars[1].position = Reliable(1);
    photo.state.cars[1].class_position = Reliable(1);
}
fn runtime(preset: &str, tone: Tone) -> Runtime<Standings> {
    let mut settings = config(preset);
    settings.style = tone;
    let mut w = Standings::new(&settings, Preferences::default());
    w.update(&photo(), 0.0);
    let mut rt = paint(w);
    rt.poll = Some(|s, clock, tx| {
        let changed = s.animate(clock).build;
        s.schedule(clock, tx);
        changed
    });
    rt.frame(0.0);
    rt
}
fn target(rt: &Runtime<Standings>, id: CarId) -> f32 {
    let board = rt.state.scene.board.as_ref().unwrap();
    rt.state
        .scene
        .plan
        .items
        .iter()
        .find_map(|&(y, item)| match item {
            layout::Item::Row(g, r) if board.groups[g].rows[r].id == id => Some(y),
            _ => None,
        })
        .unwrap()
}
fn row(rt: &Runtime<Standings>, id: CarId) -> rune::ElementInfo {
    let key = format!("standings-row-{}", id.0);
    rt.elements()
        .into_iter()
        .find(|e| e.key.as_deref() == Some(&key))
        .expect("fila literal con pin")
}
fn near(a: f32, b: f32) {
    assert!((a - b).abs() < 0.025, "{a} != {b}");
}
fn bounds(rt: &mut Runtime<Standings>) {
    let size = rt.state.size();
    crate::testdata::assert_inside_window(rt, (size.width, size.height));
}
#[test]
fn gpui_flip_is_three_hundred_twenty_ms_cubic_out_and_leaves_zero_wakes() {
    let style = Style::compiled();
    assert_eq!(style.motion.reorder_ms, 320.0);
    assert_eq!(style.motion.fade_ms, 220.0);
    let mut rt = runtime("expanded", Tone::Neo);
    assert!(rt.wake_deadline().is_none());
    let mut input = photo();
    let id = input.state.cars[0].id;
    let previous = target(&rt, id);
    swap(&mut input);
    assert!(rt.update_if(|s, _| s.update(&input, 0.0).build));
    rt.frame(0.080); // 80 / 320 = 1/4; CubicOut: restante (3/4)^3.
    assert!(
        rt.wake_deadline().is_some(),
        "el FLIP necesita reloj durante 320 ms"
    );
    let top = target(&rt, id);
    near(row(&rt, id).rect[1], top + (previous - top) * 0.421875);
    rt.frame(0.080); // Mitad exacta: queda 1/8 del desplazamiento.
    near(row(&rt, id).rect[1], top + (previous - top) * 0.125);
    rt.frame(0.159);
    assert!(rt.wake_deadline().is_some());
    rt.frame(0.002);
    near(row(&rt, id).rect[1], top);
    assert!(
        rt.wake_deadline().is_some(),
        "el destello mantiene el reloj tras el FLIP"
    );
    rt.frame(1.100); // 1400 ms de destello desde el cambio.
    assert!(
        rt.wake_deadline().is_none(),
        "cero despertares al acabar el destello (1400 ms)"
    );
    assert!(!rt.frame(10.0), "el reposo no presenta otra imagen");
    assert!(rt.wake_deadline().is_none());
    bounds(&mut rt);
}
#[test]
fn gpui_entry_is_two_hundred_twenty_ms_linear_and_departure_has_no_ghost() {
    let mut rt = runtime("expanded", Tone::Neo);
    let mut input = photo();
    let mut added = input.state.cars[0].clone();
    added.id = CarId(999);
    added.position = Reliable(8);
    added.class_position = Reliable(8);
    added.driver.name = "Piloto nuevo".into();
    input.state.cars.push(added);
    assert!(rt.update_if(|s, _| s.update(&input, 0.0).build));
    rt.frame(0.055);
    near(row(&rt, CarId(999)).opacity, 0.25);
    assert!(rt.wake_deadline().is_some());
    rt.frame(0.055);
    near(row(&rt, CarId(999)).opacity, 0.5);
    rt.frame(0.111);
    near(row(&rt, CarId(999)).opacity, 1.0);
    assert!(rt.wake_deadline().is_none(), "el fade termina a 220 ms");
    input.state.cars.retain(|c| c.id != CarId(999));
    assert!(rt.update_if(|s, _| s.update(&input, 0.221).build));
    rt.frame(0.0);
    assert!(
        !rt.elements()
            .iter()
            .any(|e| e.key.as_deref() == Some("standings-row-999")),
        "update_rows Vantare no retiene filas salientes"
    );
    assert!(rt.wake_deadline().is_none());
    bounds(&mut rt);
}
#[test]
fn interrupted_flip_restarts_from_the_live_position_with_the_same_gpui_duration() {
    let mut rt = runtime("expanded", Tone::Neo);
    let original = photo();
    let id = original.state.cars[0].id;
    let mut input = original.clone();
    swap(&mut input);
    rt.update_if(|s, _| s.update(&input, 0.0).build);
    rt.frame(0.160);
    let before = row(&rt, id).rect[1];
    rt.update_if(|s, _| s.update(&original, 0.160).build);
    rt.frame(0.0);
    near(row(&rt, id).rect[1], before);
    rt.frame(0.160);
    let top = target(&rt, id);
    near(row(&rt, id).rect[1], top + (before - top) * 0.125);
    rt.frame(0.161);
    near(row(&rt, id).rect[1], top);
    assert!(
        rt.wake_deadline().is_some(),
        "el destello del segundo cambio sigue vivo"
    );
    rt.frame(1.100);
    assert!(rt.wake_deadline().is_none());
    bounds(&mut rt);
}
#[test]
fn reduced_motion_jumps_and_stopping_an_active_transition_removes_its_clock() {
    for already_reduced in [false, true] {
        let mut rt = runtime("expanded", Tone::Neo);
        let mut input = photo();
        let id = input.state.cars[0].id;
        if already_reduced {
            rt.update_if(|s, _| s.policy(true, 60, 0.0).build);
        }
        swap(&mut input);
        rt.update_if(|s, _| s.update(&input, 0.0).build);
        if !already_reduced {
            rt.frame(0.080);
            assert!(rt.wake_deadline().is_some());
            rt.update_if(|s, _| s.policy(true, 60, 0.080).build);
        }
        rt.frame(0.0);
        near(row(&rt, id).rect[1], target(&rt, id));
        near(row(&rt, id).opacity, 1.0);
        if !already_reduced {
            // Consume el wake anterior que ya estaba en la cola; no se programa otro.
            assert!(!rt.frame(0.020)); // Supera el tick de 60 Hz y su redondeo a nanosegundos.
        }
        assert!(rt.wake_deadline().is_none());
        assert!(!rt.frame(5.0));
        bounds(&mut rt);
    }
}
#[test]
fn moving_rows_are_pinned_inside_all_literal_widths_with_and_without_the_banner() {
    for preset in ["compact", "standard", "expanded"] {
        for tone in [Tone::Neo, Tone::Neutro] {
            let mut rt = runtime(preset, tone);
            let mut input = photo();
            swap(&mut input);
            rt.update_if(|s, _| s.update(&input, 0.0).build);
            rt.frame(0.0);
            assert!(
                rt.elements()
                    .iter()
                    .any(|e| e.key.as_deref() == Some("row-flash")),
                "{preset}/{tone:?}: destello activo"
            );
            bounds(&mut rt);
            for delta in [0.0, 0.080, 0.080, 0.080, 0.081] {
                rt.frame(delta);
                bounds(&mut rt);
            }
            let fcy = super::tests::named_photos()
                .into_iter()
                .find(|(name, _)| name == "FCY · amarilla en todo el circuito")
                .unwrap()
                .1;
            rt.update_if(|s, _| s.update(&fcy, 0.321).build);
            for delta in [0.0, 0.080, 0.080, 0.080, 0.081] {
                rt.frame(delta);
                bounds(&mut rt);
            }
            assert!(
                rt.wake_deadline().is_some(),
                "{preset}/{tone:?}: el destello mantiene el reloj"
            );
            rt.frame(1.100);
            assert!(rt.wake_deadline().is_none());
        }
    }
}
#[test]
fn scene_changes_without_a_sequence_change_animate_but_metadata_does_not_restart_a_flip() {
    let mut rt = runtime("expanded", Tone::Neo);
    let mut input = photo();
    swap(&mut input);
    assert!(rt.update_if(|s, _| s.update(&input, 0.0).build));
    rt.frame(0.160);
    input.sequence = input.sequence.saturating_sub(1);
    assert!(!rt.update_if(|s, _| s.update(&input, 0.160).build));
    rt.frame(0.161);
    assert!(
        rt.wake_deadline().is_some(),
        "el destello sigue vivo; sequence no lo reinicia"
    );
    input.state.source_state = SourceState::Lost;
    assert!(rt.update_if(|s, _| s.update(&input, 0.321).build));
    rt.frame(0.020);
    assert!(rt.wake_deadline().is_none());
    assert!(
        rt.elements()
            .iter()
            .any(|e| e.text.as_deref() == Some("ESPERANDO AL SIMULADOR"))
    );
    bounds(&mut rt);
}
#[test]
fn changing_only_options_snaps_without_animating_a_flip() {
    let mut rt = runtime("expanded", Tone::Neo);
    let mut input = photo();
    swap(&mut input);
    let id = input.state.cars[0].id;
    assert!(rt.update_if(|s, _| s.update(&input, 0.0).build));
    rt.frame(0.080);
    assert!(
        rt.wake_deadline().is_some(),
        "el FLIP necesita reloj a 80 ms"
    );
    assert!(rt.update_if(|s, _| {
        s.settings.accent = Accent::Amber;
        s.update(&input, 0.080).build
    }));
    rt.frame(0.020);
    near(row(&rt, id).rect[1], target(&rt, id));
    assert!(
        rt.wake_deadline().is_some(),
        "solo queda el destello, no un FLIP"
    );
    rt.frame(1.320);
    assert!(
        rt.wake_deadline().is_none(),
        "cero despertares al acabar el destello"
    );
    bounds(&mut rt);
}
#[test]
fn a_row_leaving_mid_flip_releases_the_clock() {
    let mut rt = runtime("expanded", Tone::Neo);
    let mut input = photo();
    swap(&mut input);
    assert!(rt.update_if(|s, _| s.update(&input, 0.0).build));
    rt.frame(0.080);
    assert!(rt.wake_deadline().is_some());
    input.state.source_state = SourceState::Lost;
    assert!(rt.update_if(|s, _| s.update(&input, 0.080).build));
    rt.frame(0.020);
    assert!(
        rt.wake_deadline().is_none(),
        "la fila saliente no deja reloj"
    );
    bounds(&mut rt);
}
#[test]
fn a_row_that_leaves_and_returns_fades_in_again() {
    let mut rt = runtime("expanded", Tone::Neo);
    let input = photo();
    let id = input.state.cars[0].id;
    let mut gone = input.clone();
    gone.state.source_state = SourceState::Lost;
    assert!(rt.update_if(|s, _| s.update(&gone, 0.010).build));
    assert!(rt.update_if(|s, _| s.update(&input, 0.020).build));
    rt.frame(0.020);
    near(row(&rt, id).opacity, 0.0);
    rt.frame(0.110);
    near(row(&rt, id).opacity, 0.5);
    rt.frame(0.111);
    near(row(&rt, id).opacity, 1.0);
    assert!(rt.wake_deadline().is_none());
    bounds(&mut rt);
}
#[test]
fn an_entry_and_a_reorder_animate_together() {
    let mut rt = runtime("expanded", Tone::Neo);
    let mut input = photo();
    let id = input.state.cars[0].id;
    swap(&mut input);
    let mut added = input.state.cars[0].clone();
    added.id = CarId(999);
    added.position = Reliable(8);
    added.class_position = Reliable(8);
    added.driver.name = "Piloto nuevo".into();
    input.state.cars.push(added);
    assert!(rt.update_if(|s, _| s.update(&input, 0.0).build));
    rt.frame(0.055);
    near(row(&rt, CarId(999)).opacity, 0.25);
    let top = target(&rt, id);
    assert!(
        (row(&rt, id).rect[1] - top).abs() > 1.0,
        "la reordenación sigue viva a 55 ms"
    );
    rt.frame(0.165);
    near(row(&rt, CarId(999)).opacity, 1.0);
    assert!(
        rt.wake_deadline().is_some(),
        "el FLIP continúa tras el fundido"
    );
    rt.frame(0.101);
    near(row(&rt, id).rect[1], top);
    assert!(
        rt.wake_deadline().is_some(),
        "el destello mantiene el reloj"
    );
    rt.frame(1.100);
    assert!(rt.wake_deadline().is_none());
    bounds(&mut rt);
}
fn flash(rt: &Runtime<Standings>, id: CarId) -> Option<(motion::Flash, f32)> {
    rt.state.scene.frame.get(&id).and_then(|pose| pose.flash)
}
#[test]
fn lead_loss_and_gain_flashes_follow_the_gpui_priority() {
    let mut rt = runtime("expanded", Tone::Neo);
    let ids: Vec<_> = rt
        .state
        .scene
        .board
        .as_ref()
        .unwrap()
        .rows()
        .iter()
        .map(|row| row.id)
        .collect();
    assert!(ids.len() >= 4, "la foto tiene filas suficientes");
    let mut input = photo();
    swap(&mut input);
    rt.update_if(|s, _| s.update(&input, 0.0).build);
    assert_eq!(
        flash(&rt, ids[1]).map(|(kind, _)| kind),
        Some(motion::Flash::Lead),
        "el nuevo líder destella en vez de ganar puestos"
    );
    assert_eq!(
        flash(&rt, ids[0]).map(|(kind, _)| kind),
        Some(motion::Flash::Loss)
    );
    let mut rotate = photo();
    for car in &mut rotate.state.cars {
        if car.id == ids[2] {
            car.position = Reliable(4);
            car.class_position = Reliable(4);
        }
        if car.id == ids[3] {
            car.position = Reliable(3);
            car.class_position = Reliable(3);
        }
    }
    rt.update_if(|s, _| s.update(&rotate, 0.100).build);
    assert_eq!(
        flash(&rt, ids[3]).map(|(kind, _)| kind),
        Some(motion::Flash::Gain)
    );
    assert_eq!(
        flash(&rt, ids[2]).map(|(kind, _)| kind),
        Some(motion::Flash::Loss)
    );
}
#[test]
fn a_flash_decays_linearly_for_1400_ms_and_releases_the_clock() {
    let style = Style::compiled();
    assert_eq!(style.motion.flash_ms, 1400.0);
    assert_eq!(style.motion.flash_boost, 1.0);
    for (kind, hex) in [
        (motion::Flash::Gain, "#22c55eff"),
        (motion::Flash::Loss, "#e14a54ff"),
        (motion::Flash::Lead, "#f5c518ff"),
        (motion::Flash::Best, "#b26bffff"),
        (motion::Flash::Pit, "#f59e0bff"),
    ] {
        assert_eq!(
            render::flash_color(kind, &style).hex(),
            hex,
            "color GPUI de {kind:?}"
        );
    }
    let mut rt = runtime("expanded", Tone::Neo);
    let mut input = photo();
    swap(&mut input);
    let id = input.state.cars[0].id;
    rt.update_if(|s, _| s.update(&input, 0.0).build);
    let start = flash(&rt, id).expect("destello");
    assert_eq!(start.0, motion::Flash::Loss);
    assert_eq!(start.1, 1.0);
    rt.frame(0.700);
    assert!((flash(&rt, id).unwrap().1 - 0.5).abs() < 1e-3, "lineal");
    rt.frame(0.699);
    assert!(flash(&rt, id).unwrap().1 < 0.001);
    rt.frame(0.001);
    assert!(flash(&rt, id).is_none(), "1400 ms");
    assert!(rt.wake_deadline().is_none());
}
#[test]
fn the_pit_flash_uses_the_box_fill_kind() {
    let mut rt = runtime("expanded", Tone::Neo);
    let id = rt
        .state
        .scene
        .board
        .as_ref()
        .unwrap()
        .rows()
        .get(2)
        .unwrap()
        .id;
    let mut input = photo();
    let car = input
        .state
        .cars
        .iter_mut()
        .find(|car| car.id == id)
        .unwrap();
    car.in_pits = Reliable(true);
    rt.update_if(|s, _| s.update(&input, 0.0).build);
    assert_eq!(
        flash(&rt, id).map(|(kind, _)| kind),
        Some(motion::Flash::Pit)
    );
}
#[test]
fn the_fastest_mark_flashes_best_and_a_personal_best_does_not() {
    let mut rt = runtime("expanded", Tone::Neo);
    let rows = rt.state.scene.board.as_ref().unwrap().rows();
    let best = rows
        .iter()
        .filter_map(|row| row.best_lap_s)
        .min_by(f64::total_cmp)
        .expect("vuelta rápida");
    let challenger = rows
        .iter()
        .find(|row| {
            row.best_mark != Mark::Fastest && row.best_lap_s.is_some_and(|lap| lap > best + 0.050)
        })
        .expect("otra vuelta")
        .id;
    let mut record = photo();
    for car in &mut record.state.cars {
        if car.id == challenger {
            car.best_lap_s = Reliable(best - 0.100);
        }
    }
    rt.update_if(|s, _| s.update(&record, 0.0).build);
    assert_eq!(
        flash(&rt, challenger).map(|(kind, _)| kind),
        Some(motion::Flash::Best),
        "pasa a Mark::Fastest"
    );
    let mut rt = runtime("expanded", Tone::Neo);
    let rows = rt.state.scene.board.as_ref().unwrap().rows();
    let slow = rows
        .iter()
        .find(|row| {
            row.best_mark != Mark::Fastest && row.best_lap_s.is_some_and(|lap| lap > best + 0.200)
        })
        .expect("una vuelta mejorable")
        .id;
    let previous = photo()
        .state
        .cars
        .iter()
        .find(|car| car.id == slow)
        .and_then(|car| car.best_lap_s.current().copied())
        .expect("vuelta propia");
    let mut personal = photo();
    for car in &mut personal.state.cars {
        if car.id == slow {
            car.best_lap_s = Reliable(previous - 0.100);
        }
    }
    rt.update_if(|s, _| s.update(&personal, 0.0).build);
    assert!(
        flash(&rt, slow).is_none(),
        "GPUI Vantare no emite mejor personal"
    );
}
#[test]
fn reduced_motion_paints_no_flash_and_requests_no_wakes() {
    let mut rt = runtime("expanded", Tone::Neo);
    rt.update_if(|s, _| s.policy(true, 60, 0.0).build);
    let mut input = photo();
    swap(&mut input);
    rt.update_if(|s, _| s.update(&input, 0.0).build);
    assert!(
        rt.state
            .scene
            .frame
            .values()
            .all(|pose| pose.flash.is_none()),
        "reducido no destella"
    );
    rt.frame(0.0);
    assert!(rt.wake_deadline().is_none());
    bounds(&mut rt);
}
#[test]
fn entering_pits_beats_lead_and_gain_on_the_same_row() {
    let mut rt = runtime("expanded", Tone::Neo);
    let ids: Vec<_> = rt
        .state
        .scene
        .board
        .as_ref()
        .unwrap()
        .rows()
        .iter()
        .map(|row| row.id)
        .collect();
    let (leader, second) = (ids[0], ids[1]);
    let mut input = photo();
    for car in &mut input.state.cars {
        if car.id == second {
            car.in_pits = Reliable(true);
            car.position = Reliable(1);
            car.class_position = Reliable(1);
        }
        if car.id == leader {
            car.position = Reliable(2);
            car.class_position = Reliable(2);
        }
    }
    rt.update_if(|s, _| s.update(&input, 0.0).build);
    assert_eq!(
        flash(&rt, second).map(|(kind, _)| kind),
        Some(motion::Flash::Pit),
        "boxes manda sobre liderato y subida"
    );
}
#[test]
fn a_repeated_photo_and_a_lower_sequence_do_not_flash_again() {
    let mut rt = runtime("expanded", Tone::Neo);
    let mut input = photo();
    swap(&mut input);
    let id = input.state.cars[0].id;
    rt.update_if(|s, _| s.update(&input, 0.0).build);
    assert_eq!(flash(&rt, id).unwrap().1, 1.0);
    rt.frame(0.700);
    let mid = flash(&rt, id).unwrap().1;
    assert!((mid - 0.5).abs() < 1e-3);
    assert!(!rt.update_if(|s, _| s.update(&input, 0.700).build));
    input.sequence = input.sequence.saturating_sub(1);
    assert!(!rt.update_if(|s, _| s.update(&input, 0.700).build));
    let after = flash(&rt, id).unwrap().1;
    assert!((after - mid).abs() < 1e-6, "no se reinicia el destello");
    rt.frame(0.700);
    assert!(flash(&rt, id).is_none());
    assert!(rt.wake_deadline().is_none());
}
#[test]
fn options_only_change_does_not_flash() {
    let mut rt = runtime("expanded", Tone::Neo);
    let input = photo();
    assert!(rt.update_if(|s, _| {
        s.settings.accent = Accent::Amber;
        s.update(&input, 0.0).build
    }));
    assert!(
        rt.state
            .scene
            .frame
            .values()
            .all(|pose| pose.flash.is_none()),
        "solo opciones: sin destello"
    );
    rt.frame(0.020);
    assert!(rt.wake_deadline().is_none());
}
#[test]
fn a_hidden_row_that_becomes_visible_does_not_flash() {
    let mut rt = runtime("expanded", Tone::Neo);
    let mut input = photo();
    let class = input.state.cars[0].class.clone();
    let hidden = input
        .state
        .cars
        .iter()
        .find(|car| car.position.current().is_some_and(|position| *position > 8))
        .expect("una fila fuera del top 8")
        .id;
    assert!(!rt.state.scene.frame.contains_key(&hidden));
    for car in &mut input.state.cars {
        if car.id == hidden {
            car.position = Reliable(1);
            car.class_position = Reliable(1);
            car.class = class.clone();
        }
    }
    rt.update_if(|s, _| s.update(&input, 0.0).build);
    assert!(
        rt.state.scene.frame.contains_key(&hidden),
        "ahora es visible"
    );
    assert!(flash(&rt, hidden).is_none(), "aparecer no destella");
}
#[test]
fn leaving_reduced_motion_does_not_flash() {
    let mut rt = runtime("expanded", Tone::Neo);
    rt.update_if(|s, _| s.policy(true, 60, 0.0).build);
    let mut input = photo();
    swap(&mut input);
    rt.update_if(|s, _| s.update(&input, 0.0).build);
    rt.update_if(|s, _| s.policy(false, 60, 0.0).build);
    rt.update_if(|s, _| s.update(&input, 0.0).build);
    assert!(
        rt.state
            .scene
            .frame
            .values()
            .all(|pose| pose.flash.is_none()),
        "salir de reducido no destella"
    );
    rt.frame(0.020);
    assert!(rt.wake_deadline().is_none());
    bounds(&mut rt);
}
