//! Pure Torre scene: domain rows, labels, card geometry and sampled motion.
//! No Rune, colors or window: a Look only translates this scene into pixels.
use crate::motion::Tween;
use std::sync::Arc;
use vantare_domain::{
    broadcast_tower::{Row, Status, ViewModel},
    format::{Language, Preferences},
};

/// Ancho de la tira; el alto lo fija la pintura.
pub const WIDTH: f32 = 1400.0;

const FADE: f64 = 0.120;
const CUE: f64 = 0.450;
const LOOP: f64 = 30.0;
const SLIDE_MS: f64 = 250.0;
const SLIDE_MAX_MS: f64 = 360.0;
/// Rareza heredada (#2365): GPUI mide el recorrido con la tarjeta de 1920 px.
const LEGACY_CARD: f64 = 346.16;
/// Las dos curvas que GPUI usa en la Torre; la común de Relative no vale aquí.
const SLIDE: [f32; 4] = [0.2, 0.75, 0.3, 1.0];
const FADE_CURVE: [f32; 4] = [0.0, 0.0, 0.58, 1.0];

/// La vuelta y los intervalos entre filas consecutivas de la misma clase.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Labels {
    pub lap: String,
    pub intervals: Vec<Option<String>>,
}

impl Labels {
    pub fn new(view: &ViewModel, prefs: Preferences) -> Self {
        let session = view.session.to_lowercase();
        let timed = ["clasi", "qual", "pr"]
            .iter()
            .any(|prefix| session.starts_with(prefix));
        let lap = if timed {
            view.remaining.clone()
        } else {
            let marker = if prefs.language == Language::Es {
                "V"
            } else {
                "L"
            };
            let laps = view
                .total_laps
                .map_or_else(String::new, |laps| format!("/{laps}"));
            format!("{marker} {}{laps} · {}", view.lap, view.remaining)
        };
        let parse = |value: &str| match value {
            "LÍDER" | "LEADER" => Some(0.0),
            other => other.parse::<f32>().ok(),
        };
        let intervals = view
            .rows
            .windows(2)
            .map(|pair| {
                if pair[0].class != pair[1].class {
                    return None;
                }
                let interval = parse(&pair[1].gap)? - parse(&pair[0].gap)?;
                (0.0..1.0)
                    .contains(&interval)
                    .then(|| format!("{interval:.1}"))
            })
            .collect();
        Self { lap, intervals }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CueKind {
    Gained,
    Lost,
}

/// Aviso de adelantamiento con intensidad independiente de la opacidad de la fila.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Cue {
    pub kind: CueKind,
    pub opacity: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct VisualRow {
    pub row: Arc<Row>,
    /// Ranura de la tira, no un índice ni un píxel: `card_left` la convierte en x.
    pub slot: f32,
    pub opacity: f32,
    pub cue: Option<Cue>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Scene {
    pub view: Arc<ViewModel>,
    pub labels: Arc<Labels>,
    pub rows: Vec<VisualRow>,
}

struct Moving {
    row: Arc<Row>,
    slot: Tween,
    fade: Tween,
    cue: Option<(CueKind, Tween)>,
    active: bool,
}

pub struct Motion {
    view: Arc<ViewModel>,
    rows: Vec<Arc<Row>>,
    labels: Arc<Labels>,
    prefs: Preferences,
    /// Filas vivas en orden de la tira y, detrás, los fantasmas que se apagan.
    cards: Vec<Moving>,
    reduced: bool,
    hz: u16,
    carousel: bool,
    /// Instante del último límite (época, sesión o calidad): la fase del carrusel
    /// se mide desde aquí, como `carousel_start` en GPUI.
    anchor: f64,
}

fn valid(view: &ViewModel) -> bool {
    view.status == Status::Ready
        && view.rows.iter().enumerate().all(|(i, row)| {
            row.place.is_some() && !view.rows[..i].iter().any(|other| other.id == row.id)
        })
}

impl Motion {
    pub fn new(
        view: Arc<ViewModel>,
        prefs: Preferences,
        reduced: bool,
        hz: u16,
        clock: f64,
    ) -> Self {
        let mut motion = Self {
            rows: view.rows.iter().cloned().map(Arc::new).collect(),
            labels: Arc::new(Labels::new(&view, prefs)),
            view,
            prefs,
            cards: Vec::new(),
            reduced,
            hz,
            carousel: false,
            anchor: clock,
        };
        motion.reset();
        motion
    }
    fn reset(&mut self) {
        self.cards = self
            .rows
            .iter()
            .enumerate()
            .map(|(slot, row)| Moving {
                row: row.clone(),
                slot: Tween::fixed(slot as f32).with_curve(SLIDE),
                fade: Tween::fixed(1.0).with_curve(FADE_CURVE),
                cue: None,
                active: true,
            })
            .collect();
    }
    pub fn reduced(&self) -> bool {
        self.reduced
    }
    pub fn policy(&mut self, reduced: bool, hz: u16) -> bool {
        let changed = self.reduced != reduced || self.hz != hz;
        self.hz = hz;
        if !changed {
            return false;
        }
        if reduced && !self.reduced {
            self.carousel = false;
            self.cards.retain(|card| card.active);
            for card in &mut self.cards {
                card.slot.settle();
                card.fade = Tween::fixed(1.0).with_curve(FADE_CURVE);
                card.cue = None;
            }
        }
        self.reduced = reduced;
        true
    }
    /// `snap` viene del cambio de época, sesión o calidad; `carousel` es el ajuste guardado.
    pub fn update(
        &mut self,
        view: Arc<ViewModel>,
        prefs: Preferences,
        carousel: bool,
        snap: bool,
        clock: f64,
    ) {
        if snap {
            self.anchor = clock;
        }
        let fresh = !Arc::ptr_eq(&self.view, &view);
        if fresh {
            self.rows = view.rows.iter().cloned().map(Arc::new).collect();
        }
        if fresh || self.prefs != prefs {
            self.labels = Arc::new(Labels::new(&view, prefs));
        }
        self.prefs = prefs;
        let snap = snap || self.reduced;
        let same_rows = self.view.rows.len() == view.rows.len()
            && self
                .view
                .rows
                .iter()
                .zip(&view.rows)
                .all(|(a, b)| a.id == b.id);
        let reseed = snap
            || self.cards.is_empty()
            || !valid(&view)
            || !valid(&self.view)
            || self.view.session != view.session;
        if reseed {
            self.reset();
        } else if same_rows {
            for row in &self.rows {
                if let Some(card) = self.cards.iter_mut().find(|card| card.row.id == row.id) {
                    card.row = row.clone();
                }
            }
        } else {
            self.transitions(&view, clock);
        }
        self.view = view;
        self.carousel = carousel
            && !self.reduced
            && self.view.status == Status::Ready
            && !self.view.rows.is_empty();
    }
    fn transitions(&mut self, next: &ViewModel, clock: f64) {
        let before: Vec<u32> = self.view.rows.iter().map(|row| row.id.0).collect();
        let after: Vec<u32> = next.rows.iter().map(|row| row.id.0).collect();
        let common = |from: &[u32], into: &[u32]| -> Vec<u32> {
            from.iter()
                .copied()
                .filter(|id| into.contains(id))
                .collect()
        };
        let (common_before, common_after) = (common(&before, &after), common(&after, &before));
        let mut cards: Vec<Moving> = self
            .rows
            .iter()
            .enumerate()
            .map(|(slot, row)| {
                let old = self.cards.iter().find(|card| card.row.id == row.id);
                let cue = match (
                    common_before.iter().position(|id| *id == row.id.0),
                    common_after.iter().position(|id| *id == row.id.0),
                ) {
                    (Some(a), Some(b)) if b < a => Some(CueKind::Gained),
                    (Some(a), Some(b)) if b > a => Some(CueKind::Lost),
                    _ => None,
                };
                let mut moving = Moving {
                    row: row.clone(),
                    slot: old.map_or_else(
                        || Tween::fixed(slot as f32).with_curve(SLIDE),
                        |card| card.slot,
                    ),
                    fade: old.map_or_else(
                        || Tween::fixed(0.0).with_curve(FADE_CURVE),
                        |card| card.fade,
                    ),
                    cue: None,
                    active: true,
                };
                if let Some(kind) = cue {
                    let mut fading = Tween::fixed(1.0).with_curve(FADE_CURVE);
                    fading.retarget(0.0, clock, CUE);
                    moving.cue = Some((kind, fading));
                }
                let travelled = f64::from((moving.slot.value(clock) - slot as f32).abs());
                let duration =
                    (SLIDE_MS + travelled * LEGACY_CARD * 0.28).min(SLIDE_MAX_MS) / 1000.0;
                moving.slot.retarget(slot as f32, clock, duration);
                moving.fade.retarget(1.0, clock, FADE);
                moving
            })
            .collect();
        for card in &self.cards {
            if !card.active || after.contains(&card.row.id.0) {
                continue;
            }
            let mut ghost = Moving {
                row: card.row.clone(),
                slot: Tween::fixed(card.slot.value(clock)).with_curve(SLIDE),
                fade: card.fade,
                cue: None,
                active: false,
            };
            ghost.fade.retarget(0.0, clock, FADE);
            cards.push(ghost);
        }
        self.cards = cards;
    }
    /// Call after update/policy and before sampling at the same clock.
    pub fn advance(&mut self, clock: f64) {
        for card in &mut self.cards {
            if card.cue.is_some_and(|(_, control)| !control.active(clock)) {
                card.cue = None;
            }
        }
        self.cards
            .retain(|card| card.active || card.fade.active(clock));
    }
    /// Next instant this widget must be sampled again, or None at rest.
    pub fn next_wake(&self, clock: f64) -> Option<f64> {
        if self.reduced {
            return None;
        }
        if self.cards.iter().any(|card| {
            card.slot.active(clock)
                || card.fade.active(clock)
                || card.cue.is_some_and(|(_, control)| control.active(clock))
        }) {
            return Some(clock);
        }
        if !self.carousel {
            return None;
        }
        let hz = if self.hz == 0 { 30 } else { self.hz };
        Some(clock + 1.0 / f64::from(hz))
    }
}

/// Pure sampling: a Look chooses colors and pixel geometry, never movement.
pub fn visual_rows(motion: &Motion, clock: f64) -> Vec<VisualRow> {
    if motion.carousel {
        let count = motion.rows.len() as f32;
        let offset = ((clock - motion.anchor).rem_euclid(LOOP) / LOOP) as f32 * count;
        let mut rows = Vec::with_capacity(2 * motion.rows.len());
        for copy in 0..2 {
            for (i, row) in motion.rows.iter().enumerate() {
                rows.push(VisualRow {
                    row: row.clone(),
                    slot: i as f32 + copy as f32 * count - offset,
                    opacity: 1.0,
                    cue: None,
                });
            }
        }
        return rows;
    }
    motion
        .cards
        .iter()
        .map(|card| VisualRow {
            row: card.row.clone(),
            slot: card.slot.value(clock),
            opacity: card.fade.value(clock),
            cue: card.cue.map(|(kind, control)| Cue {
                kind,
                opacity: control.value(clock),
            }),
        })
        .filter(|row| row.cue.is_none_or(|cue| cue.opacity > 0.0))
        .collect()
}

pub fn sample(motion: &Motion, clock: f64) -> Scene {
    Scene {
        view: motion.view.clone(),
        labels: motion.labels.clone(),
        rows: visual_rows(motion, clock),
    }
}

/// Puestos donde empieza una clase: cada uno añade 40 px de hueco en la tira.
pub fn class_starts(view: &ViewModel) -> impl Iterator<Item = usize> + '_ {
    view.rows
        .iter()
        .enumerate()
        .filter(|(i, row)| *i == 0 || view.rows[i - 1].class != row.class)
        .map(|(i, _)| i)
}

/// Ancho de tarjeta; incluye los huecos de 40 px de cada cambio de clase.
pub fn card_width(view: &ViewModel, show_weather: bool) -> f32 {
    let groups = class_starts(view).count() as f32;
    let available = WIDTH - 160.0 - if show_weather { 50.0 } else { 8.0 } - groups * 40.0;
    (available / view.rows.len().max(1) as f32).clamp(1.0, 118.0)
}

/// x de la ranura; las ranuras negativas o fraccionarias quedan fuera de la mascarilla.
pub fn card_left(slot: f32, width: f32, view: &ViewModel) -> f32 {
    let groups = class_starts(view).filter(|i| *i as f32 <= slot).count() as f32;
    160.0 + slot * width + groups * 40.0
}

/// Código de tres letras del apellido, como lo pinta GPUI.
pub fn driver_code(name: &str) -> String {
    let surname = name.rsplit_once(". ").map_or(name, |(_, surname)| surname);
    let end = surname
        .char_indices()
        .nth(3)
        .map_or(surname.len(), |(byte, _)| byte);
    surname[..end].to_uppercase()
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::CarId;
    use vantare_domain::broadcast_tower::Accent;

    fn row(id: u32, place: Option<u32>, class: &str, gap: &str) -> Row {
        Row {
            id: CarId(id),
            place,
            name: format!("A. PILOT{id}"),
            class: class.into(),
            accent: Accent::Neutral,
            number: String::new(),
            gap: gap.into(),
            is_player: id == 1,
            in_pits: false,
        }
    }
    fn view(rows: Vec<Row>) -> Arc<ViewModel> {
        Arc::new(ViewModel {
            status: Status::Ready,
            session: "CARRERA".into(),
            lap: "128".into(),
            total_laps: Some(240),
            remaining: "8:42".into(),
            weather: "28°".into(),
            flag: None,
            rows,
        })
    }
    fn order(ids: &[u32]) -> Arc<ViewModel> {
        view(
            ids.iter()
                .enumerate()
                .map(|(i, id)| {
                    let gap = if i == 0 { "LÍDER" } else { "+1.000" };
                    row(*id, Some(i as u32 + 1), "HYP", gap)
                })
                .collect(),
        )
    }
    fn tower(ids: &[u32]) -> Motion {
        Motion::new(order(ids), Preferences::default(), false, 5, 0.0)
    }
    fn prefs() -> Preferences {
        Preferences::default()
    }
    fn slots(motion: &Motion, clock: f64) -> Vec<f32> {
        sample(motion, clock)
            .rows
            .iter()
            .map(|row| row.slot)
            .collect()
    }
    fn cue(rows: &[VisualRow], id: u32) -> Option<Cue> {
        rows.iter()
            .find(|row| row.row.id == CarId(id))
            .and_then(|row| row.cue)
    }

    #[test]
    fn reorder_slides_with_its_cue_and_ends_while_text_changes_do_not_restart_it() {
        let mut motion = tower(&[1, 2, 3]);
        assert_eq!(motion.next_wake(0.0), None, "sembrado sin movimiento");
        motion.update(order(&[2, 1, 3]), prefs(), false, false, 0.0);
        motion.advance(0.0);
        assert_eq!(motion.next_wake(0.0), Some(0.0));
        let start = sample(&motion, 0.0).rows;
        assert_eq!(cue(&start, 2).map(|cue| cue.kind), Some(CueKind::Gained));
        assert_eq!(cue(&start, 1).map(|cue| cue.kind), Some(CueKind::Lost));
        assert_eq!(cue(&start, 2).map(|cue| cue.opacity), Some(1.0));
        let halfway = sample(&motion, 0.17).rows;
        let first = halfway
            .iter()
            .find(|row| row.row.id == CarId(1))
            .expect("fila");
        assert!(first.slot > 0.0 && first.slot < 1.0 && first.opacity == 1.0);
        assert!(cue(&halfway, 2).is_some_and(|cue| cue.opacity < 1.0));
        assert!(
            cue(&sample(&motion, 0.3).rows, 2).is_some(),
            "sigue a los 300 ms"
        );
        let mut text = (*order(&[2, 1, 3])).clone();
        text.rows[1].gap = "+9.999".into();
        motion.update(Arc::new(text), prefs(), false, false, 0.2);
        motion.advance(0.5);
        assert_eq!(motion.next_wake(0.5), None, "el texto no reinicia nada");
        assert_eq!(slots(&motion, 0.5), vec![0.0, 1.0, 2.0]);
        assert!(
            sample(&motion, 0.5)
                .rows
                .iter()
                .all(|row| row.cue.is_none())
        );
    }

    #[test]
    fn insertion_is_not_an_overtake_and_its_ghost_expires_with_the_fade() {
        let mut motion = tower(&[1, 2, 3]);
        motion.update(order(&[4, 1, 2]), prefs(), false, false, 0.0);
        motion.advance(0.0);
        let rows = sample(&motion, 0.0).rows;
        assert_eq!(rows.len(), 4, "incluye el fantasma de la fila 3");
        assert_eq!((rows[0].row.id, rows[0].opacity), (CarId(4), 0.0));
        assert!(rows.iter().all(|row| row.cue.is_none()));
        motion.advance(0.120);
        let rows = sample(&motion, 0.120).rows;
        assert_eq!(rows.len(), 3);
        assert!(!rows.iter().any(|row| row.row.id == CarId(3)));
        assert!(rows.iter().all(|row| row.opacity == 1.0));
    }

    #[test]
    fn reduced_motion_snaps_and_leaves_no_clock_or_cue() {
        let mut motion = Motion::new(order(&[1, 2, 3]), prefs(), true, 5, 0.0);
        motion.update(order(&[3, 1, 2]), prefs(), false, false, 0.0);
        motion.advance(0.0);
        assert_eq!(motion.next_wake(0.0), None);
        assert_eq!(slots(&motion, 0.0), vec![0.0, 1.0, 2.0]);
        let rows = sample(&motion, 0.0).rows;
        assert!(
            rows.iter()
                .all(|row| row.opacity == 1.0 && row.cue.is_none())
        );
        let mut moving = tower(&[1, 2, 3]);
        moving.update(order(&[2, 1, 3]), prefs(), false, false, 0.0);
        moving.advance(0.0);
        assert!(moving.policy(true, 5));
        moving.advance(0.0);
        assert_eq!(moving.next_wake(0.0), None);
        assert_eq!(slots(&moving, 0.0), vec![0.0, 1.0, 2.0]);
        assert!(!moving.policy(true, 5), "sin cambios");
    }

    #[test]
    fn invalid_rows_or_a_new_session_reset_without_animation() {
        let mut motion = tower(&[1, 2, 3]);
        let mut missing = (*order(&[2, 1, 3])).clone();
        missing.rows[2].place = None;
        motion.update(Arc::new(missing), prefs(), false, false, 0.0);
        motion.advance(0.0);
        assert_eq!(motion.next_wake(0.0), None);
        assert_eq!(slots(&motion, 0.0), vec![0.0, 1.0, 2.0]);
        let mut session = (*order(&[2, 1, 3])).clone();
        session.session = "CLASIFICACIÓN".into();
        motion.update(Arc::new(session), prefs(), false, false, 1.0);
        motion.advance(1.0);
        assert_eq!(motion.next_wake(1.0), None);
        assert_eq!(slots(&motion, 1.0), vec![0.0, 1.0, 2.0]);
    }

    #[test]
    fn carousel_has_a_clock_only_while_its_condition_holds() {
        let mut motion = tower(&[1, 2, 3]);
        motion.update(order(&[1, 2, 3]), prefs(), true, false, 0.0);
        motion.advance(0.0);
        assert_eq!(motion.next_wake(0.0), Some(0.2));
        let rows = sample(&motion, 0.0).rows;
        assert_eq!(rows.len(), 6, "dos copias contiguas");
        assert_eq!((rows[0].slot, rows[3].slot), (0.0, 3.0));
        let later = sample(&motion, 15.0).rows;
        assert_eq!((later[0].slot, later[3].slot), (-1.5, 1.5));
        assert_eq!(sample(&motion, 30.0).rows, rows, "bucle de 30 s");
        motion.update(order(&[1, 2, 3]), prefs(), true, false, 10.0);
        assert_eq!(
            sample(&motion, 10.0).rows[0].slot,
            -1.0,
            "fase desde el límite"
        );
        motion.update(order(&[1, 2, 3]), prefs(), true, true, 12.0);
        assert_eq!(
            sample(&motion, 12.0).rows[0].slot,
            0.0,
            "límite nuevo, fase nueva"
        );
        motion.update(order(&[1, 2, 3]), prefs(), false, false, 12.2);
        motion.advance(12.2);
        assert_eq!(motion.next_wake(12.2), None, "sin condición, sin reloj");
        let mut reduced = Motion::new(order(&[1, 2, 3]), prefs(), true, 5, 0.0);
        reduced.update(order(&[1, 2, 3]), prefs(), true, false, 0.0);
        reduced.advance(0.0);
        assert_eq!(reduced.next_wake(0.0), None);
        assert_eq!(sample(&reduced, 0.0).rows.len(), 3);
    }

    #[test]
    fn labels_copy_today_texts_and_intervals() {
        let rows = vec![
            row(1, Some(1), "HYP", "LÍDER"),
            row(2, Some(2), "HYP", "+0.300"),
            row(3, Some(3), "GTE", "+2.000"),
        ];
        let labels = Labels::new(&view(rows), prefs());
        assert_eq!(labels.lap, "V 128/240 · 8:42");
        assert_eq!(labels.intervals, vec![Some("0.3".to_string()), None]);
        let english = Preferences {
            language: Language::En,
            ..Preferences::default()
        };
        assert_eq!(
            Labels::new(&order(&[1, 2]), english).lap,
            "L 128/240 · 8:42"
        );
        let mut qualifying = (*order(&[1, 2])).clone();
        qualifying.session = "CLASIFICACIÓN".into();
        assert_eq!(Labels::new(&Arc::new(qualifying), prefs()).lap, "8:42");
    }

    #[test]
    fn cards_fit_the_strip_with_and_without_weather() {
        for count in [3, 11] {
            for distinct in [false, true] {
                let rows = (0..count)
                    .map(|i| {
                        let class = if distinct {
                            format!("C{i}")
                        } else {
                            "HYP".into()
                        };
                        row(i as u32 + 1, Some(i as u32 + 1), &class, "+0.100")
                    })
                    .collect();
                let view = view(rows);
                for weather in [false, true] {
                    let width = card_width(&view, weather);
                    let right = WIDTH - if weather { 50.0 } else { 8.0 };
                    assert!((1.0..=118.0).contains(&width));
                    for slot in 0..count {
                        let x = card_left(slot as f32, width, &view);
                        assert!(
                            x >= 156.0 && x + width <= right + 0.01,
                            "{count} filas, distinta clase {distinct}, clima {weather}, ranura {slot}"
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn shared_curves_keep_gpui_half_time_values() {
        let halfway = |curve: [f32; 4]| {
            let mut tween = Tween::fixed(0.0).with_curve(curve);
            tween.retarget(1.0, 0.0, 1.0);
            tween.value(0.5)
        };
        assert!(
            (halfway(SLIDE) - 0.920).abs() < 0.01,
            "deslizamiento: 0,920 a mitad de tiempo"
        );
        assert!(
            (halfway(FADE_CURVE) - 0.685).abs() < 0.01,
            "fundido y aviso: 0,685 a mitad de tiempo"
        );
    }

    #[test]
    fn driver_code_keeps_the_three_letter_surname() {
        assert_eq!(driver_code("A. PIER GUIDI"), "PIE");
        assert_eq!(driver_code("A. B. SMITH"), "SMI");
        assert_eq!(driver_code("É. Müller"), "MÜL");
    }
}
