use super::painting_tests::{config, paint};
use super::*;
use rune::Runtime;
use vantare_domain::{CarId, Quality::Reliable, widget_settings::look::Tone};

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
        rt.wake_deadline().is_none(),
        "cero despertares al acabar 320 ms"
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
    assert!(rt.wake_deadline().is_none(), "no se reinicia por sequence");
    input.state.source_state = SourceState::Lost;
    assert!(rt.update_if(|s, _| s.update(&input, 0.321).build));
    rt.frame(0.0);
    assert!(rt.wake_deadline().is_none());
    assert!(
        rt.elements()
            .iter()
            .any(|e| e.text.as_deref() == Some("ESPERANDO AL SIMULADOR"))
    );
    bounds(&mut rt);
}
