//! Tests de los efectos de Standings contra las constantes de GPUI. El badge de
//! boxes se prueba aislado para poder sustituirlo por el rail literal.
use super::motion::{self, Motion};
use super::scene::Row;
use std::sync::Arc;
use vantare_domain::{
    CarId,
    standings::{Plan, SelectedRow, Status},
};

fn row(id: u32, position: i64) -> SelectedRow {
    let mut selected = SelectedRow::unavailable(CarId(id), position);
    selected.position = position;
    selected
}

fn plan(rows: Vec<SelectedRow>, sequence: u64, identity: &str) -> Plan {
    let session_best = rows
        .iter()
        .filter_map(|row| Some((row.id, row.best_lap_s?)))
        .min_by(|a, b| a.1.total_cmp(&b.1));
    let board = Arc::new(vantare_domain::standings::project(
        &vantare_domain::Snapshot::default(),
        vantare_domain::format::Preferences::default(),
    ));
    Plan {
        board,
        rows,
        status: Status::Ready,
        race: true,
        session_best,
        identity: identity.into(),
        sequence,
    }
}

fn with_best(mut row: SelectedRow, best: f64) -> SelectedRow {
    Arc::make_mut(&mut row.row).best_lap_s = Some(best);
    row
}

#[test]
fn repeated_or_late_photos_keep_motion_but_a_new_session_starts_it() {
    let base = plan(vec![row(1, 1), row(2, 2)], 10, "s:1");
    assert!(motion::motion_continues(&base, &base), "foto repetida");
    let mut late = base.clone();
    late.sequence = 9;
    assert!(!motion::motion_continues(&base, &late), "foto atrasada");
    let mut other = base.clone();
    other.identity = "s:2".into();
    assert!(!motion::motion_continues(&base, &other), "otra sesión");
    let mut ahead = base.clone();
    ahead.sequence = 11;
    assert!(motion::motion_continues(&base, &ahead), "secuencia futura");
}

#[test]
fn a_position_change_lights_the_chip_with_the_gpui_150_180_times() {
    let mut motion = Motion::new();
    let before = plan(vec![row(1, 3)], 1, "s:1");
    let after = plan(vec![row(1, 1)], 2, "s:1");
    motion.update(&[(&display_row(1), 0.0)], 0.0);
    motion.events(&before, &after, 1.0);
    let start = motion.sample(1.0);
    assert_eq!(start.rows[&1].chip.map(|(places, _)| places), Some(2));
    assert_eq!(start.rows[&1].flash.map(|(_, a)| a), Some(0.0));
    let half = motion.sample(1.0 + 0.090);
    let chip = half.rows[&1].chip.expect("chip").1;
    assert!((chip - 0.5).abs() < 1e-3, "180 ms EASE a mitad: {chip}");
    assert!(half.rows[&1].flash.expect("flash").1 > 0.0);
}

#[test]
fn battle_best_marker_and_pit_use_their_literal_tweens() {
    let mut motion = Motion::new();
    let mut ahead = row(1, 1);
    Arc::make_mut(&mut ahead.row).battle_gap_seconds = Some(0.8);
    let mut behind = row(2, 2);
    Arc::make_mut(&mut behind.row).battle_gap_seconds = Some(0.8);
    let best = with_best(row(3, 3), 90.0);
    let next = plan(vec![ahead, behind, best], 2, "s:1");
    motion.update(
        &[
            (&display_row(1), 0.0),
            (&display_row(2), 30.0),
            (&display_row(3), 60.0),
        ],
        0.0,
    );
    motion.events(&plan(Vec::new(), 1, "s:1"), &next, 1.0);
    let start = motion.sample(1.0);
    assert!(start.rows[&1].battle <= 0.01, "entra desde cero");
    assert_eq!(start.rows[&3].best_marker, 0.0, "el rombo entra desde cero");
    let half = motion.sample(1.0 + 0.100);
    assert!(half.rows[&1].battle > 0.0 && half.rows[&1].battle < 1.0);
    let done = motion.sample(1.0 + 0.221);
    assert!((done.rows[&1].battle - 1.0).abs() < 1e-6, "200 ms");
    assert!((done.rows[&3].best_marker - 1.0).abs() < 1e-6, "220 ms");
}

#[test]
fn entering_the_pits_flashes_the_row_and_shows_no_rail() {
    let mut motion = Motion::new();
    let before = plan(vec![row(1, 1)], 1, "s:1");
    let mut inside = row(1, 1);
    Arc::make_mut(&mut inside.row).in_pits = true;
    let after = plan(vec![inside], 2, "s:1");
    motion.update(&[(&display_row(1), 0.0)], 0.0);
    motion.events(&before, &after, 1.0);
    let vis = motion.sample(1.0);
    assert_eq!(
        vis.rows[&1].flash.map(|(kind, _)| kind),
        Some(motion::Flash::Pit),
        "Vantare solo destella la fila y deja la píldora PIT"
    );
    assert!(vis.rows[&1].chip.is_none(), "sin chip de posición");
}

#[test]
fn the_sweep_uses_800_ms_and_the_notice_expires_at_1200() {
    let mut motion = Motion::new();
    let before = with_best(row(1, 1), 91.0);
    let after = with_best(row(1, 1), 90.0);
    motion.update(&[(&display_row(1), 0.0)], 0.0);
    motion.events(&plan(vec![before], 1, "s:1"), &plan(vec![after], 2, "s:1"), 1.0);
    let start = motion.sample(1.0);
    assert_eq!(
        start.rows[&1].sweep.map(|(session, _, _)| session),
        Some(false),
        "mejor personal"
    );
    let middle = motion.sample(1.0 + 0.400);
    assert!(middle.rows[&1].sweep.is_some());
    let ended = motion.sample(1.0 + 0.801);
    assert!(ended.rows[&1].sweep.is_none(), "800 ms de barrido");
    assert_eq!(motion.next_wake(1.0), Some(1.0), "mientras barre, frame");
    assert_eq!(motion.next_wake(1.1), Some(1.2), "solo caduca el aviso");
    assert_eq!(motion.next_wake(1.3), None, "cero despertares");
}

#[test]
fn reduced_motion_snaps_effects_and_keeps_only_the_expiry_wake() {
    let mut motion = Motion::new();
    motion.policy(true);
    let before = plan(vec![row(1, 3)], 1, "s:1");
    let after = plan(vec![row(1, 1)], 2, "s:1");
    motion.update(&[(&display_row(1), 0.0)], 0.0);
    motion.events(&before, &after, 1.0);
    let sample = motion.sample(1.0);
    assert!(sample.rows[&1].chip.is_none(), "sin chip con reducido");
    assert_eq!(motion.next_wake(1.0), Some(1.2), "un solo despertar");
    assert_eq!(motion.next_wake(1.2), None);
}

/// Fila de pintura mínima para el aprendizaje de posiciones del Motion.
fn display_row(id: u32) -> Row {
    Row {
        id,
        player: false,
        class: "hypercar".into(),
        cells: Vec::new(),
    }
}
