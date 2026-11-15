//! Relative family: canonical domain projection, retained Rune values and finite motion.
mod layout;
mod motion;
mod render;
use crate::vantare::{Style, alpha, waiting};
use layout::{Kind, Labels, Options, Plan};
use motion::Tween;
use rune::{Color, El, Live, LiveText};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
    time::Duration,
};
use vantare_domain::{
    CarId, Snapshot,
    format::{Language, Preferences},
    geometry::Size,
    relative::{self, Banner, Board, Row, Side},
    widget_settings::relative::Settings,
};

#[derive(Default)]
pub(crate) struct Update {
    pub build: bool,
    pub pixels: bool,
}
struct RowLive {
    data: Arc<Row>,
    texts: [LiveText; 8],
    detail: LiveText,
    inks: [Live<Color>; 8],
    position: Live<[f32; 2]>,
    opacity: Live<f32>,
    pulse: Live<Color>,
    pulse_end: Live<Color>,
    flash: Live<Color>,
    flash_end: Live<Color>,
    own: Live<f32>,
    y: Tween,
    fade: Tween,
    flashing: Option<(Color, f64)>,
    active: bool,
}
struct DotLive {
    id: CarId,
    class: String,
    player: bool,
    position: Live<[f32; 2]>,
    x: Tween,
}
const CLEAR: Color = Color {
    r: 0.0,
    g: 0.0,
    b: 0.0,
    a: 0.0,
};
fn rank(side: Side) -> u8 {
    match side {
        Side::Ahead => 2,
        Side::Player => 1,
        Side::Behind => 0,
    }
}

pub(crate) struct Relative {
    settings: Settings,
    prefs: Preferences,
    options: Options,
    style: Arc<Style>,
    board: Arc<Board>,
    plan: Plan,
    labels: Labels,
    rows: BTreeMap<u32, RowLive>,
    order: Vec<u32>,
    dots: BTreeMap<u32, DotLive>,
    dot_order: Vec<u32>,
    header: [LiveText; 6],
    boundary: Option<(u64, u64, Preferences)>,
    paused: bool,
    live_projection: bool,
    reduced: bool,
    hz: u16,
    started: f64,
    next_pulse: Option<f64>,
}
impl Relative {
    pub fn new(
        settings: &Settings,
        prefs: Preferences,
        reduced: bool,
        hz: u16,
        clock: f64,
    ) -> Self {
        let settings = settings.normalized();
        let options = Options::from_settings(&settings);
        let style = Style::compiled();
        let plan = layout::plan(None, &options, &style);
        let labels = Labels::new(None, &options, prefs.language);
        let board = relative::project_cached(
            &Snapshot::default(),
            prefs,
            Self::content(&settings),
            &settings.footer_slots,
            None,
        );
        let header = [
            labels.title.clone(),
            labels.header.clone(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
        ]
        .map(LiveText::new);
        let state = Self {
            settings,
            prefs,
            options,
            style,
            board,
            plan,
            labels,
            rows: BTreeMap::new(),
            order: Vec::new(),
            dots: BTreeMap::new(),
            dot_order: Vec::new(),
            header,
            boundary: None,
            paused: false,
            live_projection: false,
            reduced,
            hz,
            started: clock,
            next_pulse: None,
        };
        for (live, text) in state.header.iter().zip(render::header_values(&state)) {
            live.set(text);
        }
        state
    }
    fn content(settings: &Settings) -> relative::Content {
        relative::Content {
            range_ahead: settings.range_ahead,
            range_behind: settings.range_behind,
            same_class: settings.class_scope == "sameClass",
            include_player: settings.include_player,
        }
    }
    pub fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        self.settings == settings.normalized() && self.prefs == prefs
    }
    pub fn size(&self) -> Size {
        self.size_for(None)
    }
    pub fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        let paused = snapshot.map_or(self.paused, |s| {
            s.state.source_state == vantare_domain::SourceState::Paused
        });
        Size {
            width: self.plan.width,
            height: self.plan.height + if paused { 22.0 } else { 0.0 },
        }
    }
    pub fn view(&self) -> El {
        render::view(self)
    }
    pub fn policy(&mut self, reduced: bool, hz: u16, clock: f64) -> Update {
        let changed = self.reduced != reduced;
        if self.hz != hz {
            self.next_pulse = None;
        }
        self.reduced = reduced;
        self.hz = hz;
        let mut update = Update::default();
        if changed && reduced {
            self.next_pulse = None;
            let before = self.rows.len();
            self.rows.retain(|_, r| r.active);
            update.build = before != self.rows.len();
            self.order.retain(|id| self.rows.contains_key(id));
            for row in self.rows.values_mut() {
                row.y.settle();
                row.fade = Tween::linear(1.0);
                row.flashing = None;
            }
            for dot in self.dots.values_mut() {
                dot.x.settle();
            }
        }
        if changed && reduced {
            let animated = self.animate(clock);
            update.build |= animated.build;
            update.pixels |= animated.pixels;
        }
        update
    }
    /// Same host pause contract as GPUI: retain the last live projection and append a band.
    pub fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        let paused = snapshot.state.source_state == vantare_domain::SourceState::Paused;
        if paused && self.paused {
            return Update::default();
        }
        let changed = self.paused != paused;
        self.paused = paused;
        if paused && self.live_projection {
            return Update {
                build: changed,
                pixels: false,
            };
        }
        let mut update = if paused {
            let mut retained = snapshot.clone();
            retained.state.source_state = vantare_domain::SourceState::Live;
            self.project(&retained, clock)
        } else {
            self.project(snapshot, clock)
        };
        self.live_projection = vantare_domain::freshness::shows_last_live(snapshot);
        update.build |= changed;
        update
    }
    fn project(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        let board = relative::project_cached(
            snapshot,
            self.prefs,
            Self::content(&self.settings),
            &self.settings.footer_slots,
            Some(&self.board),
        );
        let boundary = Some((snapshot.epoch, snapshot.state.session.id.0, self.prefs));
        if Arc::ptr_eq(&board, &self.board) && self.boundary == boundary {
            return Update::default();
        }
        let snap = self.reduced
            || self.boundary != boundary
            || waiting(Some((self.board.source_state, self.board.player_present)))
            || waiting(Some((board.source_state, board.player_present)));
        self.boundary = boundary;
        let plan = layout::plan(Some(&board), &self.options, &self.style);
        let labels = Labels::new(Some(&board), &self.options, self.prefs.language);
        let mut out = Update {
            build: self.plan != plan || self.board.banner != board.banner,
            pixels: false,
        };
        let old_order = self.order.clone();
        let active: BTreeSet<u32> = if waiting(Some((board.source_state, board.player_present))) {
            BTreeSet::new()
        } else {
            board.slots.iter().flatten().map(|r| r.id.0).collect()
        };
        let fade = f64::from(self.style.motion.fade_ms) / 1000.0;
        for (&id, row) in &mut self.rows {
            if !active.contains(&id) && row.active {
                row.active = false;
                row.fade.retarget(0.0, clock, fade);
            }
        }
        self.order.clear();
        for &(y, item) in &plan.items {
            let layout::Item::Slot(index) = item else {
                continue;
            };
            let Some(row) = board.slots.get(index).and_then(Option::as_ref) else {
                continue;
            };
            let Some(label) = labels.rows.get(index).and_then(Option::as_ref) else {
                continue;
            };
            let mut values = Self::values(row, label, self.prefs.language);
            if board.banner == Some(Banner::FullCourseYellow) {
                values[Kind::Trend as usize].clear();
            }
            let colors = Self::inks(row, &board, &self.style);
            if let Some(live) = self.rows.get_mut(&row.id.0) {
                if live.data.class != row.class
                    || live.data.in_pits != row.in_pits
                    || live.data.is_player != row.is_player
                    || (self.options.cols.has(Kind::Laps)
                        && live.data.lap_delta.filter(|n| *n != 0).map(i32::signum)
                            != row.lap_delta.filter(|n| *n != 0).map(i32::signum))
                    || (self.options.cols.has(Kind::Rating) && live.data.rating != row.rating)
                {
                    out.build = true;
                }
                if !snap {
                    if row.in_pits && !live.data.in_pits {
                        live.flashing = Some((self.style.colors.box_fill, clock));
                    } else if rank(row.side) < rank(live.data.side) {
                        live.flashing = Some((self.style.colors.flash_gain, clock));
                    } else if rank(row.side) > rank(live.data.side) {
                        live.flashing = Some((self.style.colors.flash_loss, clock));
                    }
                    live.y
                        .retarget(y, clock, f64::from(self.style.motion.reorder_ms) / 1000.0);
                    live.fade.retarget(1.0, clock, fade);
                } else {
                    live.y = Tween::fixed(y);
                    live.fade = Tween::linear(1.0);
                    live.flashing = None;
                }
                for (index, kind) in [
                    Kind::Position,
                    Kind::Number,
                    Kind::Driver,
                    Kind::Laps,
                    Kind::Rating,
                    Kind::Safety,
                    Kind::Trend,
                    Kind::Gap,
                ]
                .iter()
                .enumerate()
                {
                    let text = live.texts[index].set(values[index].clone());
                    let ink = live.inks[index].set(colors[index]);
                    if self.options.cols.has(*kind) {
                        out.pixels |= text || ink;
                        // These text changes alter intrinsic chip/name layout; numeric cells stay Live-only.
                        out.build |= text && matches!(kind, Kind::Driver | Kind::Number);
                    }
                }
                let detail = live.detail.set(label.detail.clone());
                out.pixels |= detail && self.options.cols.vehicle;
                out.build |= detail && self.options.cols.vehicle;
                live.data = row.clone();
                live.active = true;
            } else {
                let mut opacity = Tween::linear(if snap { 1.0 } else { 0.0 });
                if !snap {
                    opacity.retarget(1.0, clock, fade);
                }
                self.rows.insert(
                    row.id.0,
                    RowLive {
                        data: row.clone(),
                        texts: values.map(LiveText::new),
                        detail: LiveText::new(label.detail.clone()),
                        inks: colors.map(Live::new),
                        position: Live::new([0.0, y]),
                        opacity: Live::new(if snap { 1.0 } else { 0.0 }),
                        pulse: Live::new(CLEAR),
                        pulse_end: Live::new(CLEAR),
                        flash: Live::new(CLEAR),
                        flash_end: Live::new(CLEAR),
                        own: Live::new(1.0),
                        y: Tween::fixed(y),
                        fade: opacity,
                        flashing: None,
                        active: true,
                    },
                );
                out.build = true;
            }
            self.order.push(row.id.0);
        }
        if snap {
            self.rows.retain(|_, r| r.active);
        }
        for (&id, row) in &self.rows {
            if !row.active {
                self.order.push(id);
            }
        }
        out.build |= old_order != self.order;
        let before_dots = self.dot_order.clone();
        self.dot_order.clear();
        if self.options.cols.strip && !waiting(Some((board.source_state, board.player_present))) {
            for dot in &board.strip {
                let x = strip_x(&plan, &self.options, &self.style, dot.offset_s);
                if let Some(live) = self.dots.get_mut(&dot.id.0) {
                    out.build |= live.class != dot.class || live.player != dot.is_player;
                    live.class = dot.class.clone();
                    live.player = dot.is_player;
                    if snap {
                        live.x = Tween::fixed(x);
                    } else {
                        live.x
                            .retarget(x, clock, f64::from(self.style.motion.reorder_ms) / 1000.0);
                    }
                } else {
                    self.dots.insert(
                        dot.id.0,
                        DotLive {
                            id: dot.id,
                            class: dot.class.clone(),
                            player: dot.is_player,
                            position: Live::new([x, 0.0]),
                            x: Tween::fixed(x),
                        },
                    );
                    out.build = true;
                }
                self.dot_order.push(dot.id.0);
            }
        }
        self.dots.retain(|id, _| self.dot_order.contains(id));
        out.build |= before_dots != self.dot_order;
        self.board = board;
        self.plan = plan;
        self.labels = labels;
        let values = render::header_values(self);
        for (index, (live, text)) in self.header.iter().zip(values).enumerate() {
            let changed = live.set(text);
            out.pixels |= changed;
            out.build |= index == 1 && changed;
        }
        let animated = self.animate(clock);
        out.build |= animated.build;
        out.pixels |= animated.pixels;
        out
    }
    fn values(row: &Row, label: &layout::RowLabels, language: Language) -> [String; 8] {
        let es = language == Language::Es;
        let rating = match (row.rating, es) {
            (None, _) => "—",
            (Some(vantare_domain::DriverRating::Platinum), true) => "PLATINO",
            (Some(vantare_domain::DriverRating::Platinum), false) => "PLATINUM",
            (Some(vantare_domain::DriverRating::Gold), true) => "ORO",
            (Some(vantare_domain::DriverRating::Gold), false) => "GOLD",
            (Some(vantare_domain::DriverRating::Silver), true) => "PLATA",
            (Some(vantare_domain::DriverRating::Silver), false) => "SILVER",
            (Some(vantare_domain::DriverRating::Bronze), true) => "BRONCE",
            (Some(vantare_domain::DriverRating::Bronze), false) => "BRONZE",
        };
        [
            row.class_position.to_string(),
            label.number.clone(),
            label.driver.clone(),
            label.laps.clone(),
            rating.into(),
            row.safety.to_string(),
            label.trend.clone(),
            row.rich_gap.to_string(),
        ]
    }
    fn inks(row: &Row, board: &Board, style: &Style) -> [Color; 8] {
        let c = &style.colors;
        let gap = if board.banner == Some(Banner::FullCourseYellow) {
            c.frozen
        } else if row.is_player {
            c.text
        } else {
            c.value
        };
        let trend = row
            .trend
            .as_ref()
            .map_or(c.muted, |t| if t.good { c.gain } else { c.loss });
        let laps = if row.lap_delta.unwrap_or(0) < 0 {
            style.relative.laps_down_text
        } else {
            style.relative.laps_up_text
        };
        [
            c.muted,
            style.class(&row.class).ink,
            c.text,
            laps,
            c.muted,
            c.muted,
            trend,
            gap,
        ]
    }
    pub fn animate(&mut self, clock: f64) -> Update {
        let mut out = Update::default();
        let pulsing = !self.reduced
            && self.board.banner != Some(Banner::FullCourseYellow)
            && self.rows.values().any(|r| r.active && r.data.fast_traffic);
        let pulse_due = pulsing && self.next_pulse.is_none_or(|due| clock >= due);
        if pulse_due {
            self.next_pulse =
                Some(clock + 1.0 / f64::from(if self.hz == 0 { 30 } else { self.hz }));
        }
        if !pulsing {
            self.next_pulse = None;
        }
        let period = f64::from(self.style.relative.pulse_ms.max(1.0)) / 1000.0;
        let pulse =
            (0.5 - 0.5 * ((clock - self.started) / period * std::f64::consts::TAU).cos()) as f32;
        for row in self.rows.values_mut() {
            out.pixels |= row.position.set([0.0, row.y.value(clock)]);
            out.pixels |= row.opacity.set(row.fade.value(clock));
            let variant = self.options.variant(&self.style);
            let (from, to) = if variant.player_white > 0.0 {
                (0.3, 0.3)
            } else {
                (variant.player_from, variant.player_to)
            };
            let flash = row.flashing.and_then(|(color, at)| {
                let t = (clock - at) / (f64::from(self.style.motion.flash_ms) / 1000.0).max(0.001);
                (t < 1.0 && !self.reduced).then_some((color, 1.0 - t as f32))
            });
            let (first, last, own) = flash.map_or((CLEAR, CLEAR, 1.0), |(color, strength)| {
                (
                    alpha(color, from * strength * self.style.motion.flash_boost),
                    alpha(color, to * strength * self.style.motion.flash_boost),
                    1.0 - strength,
                )
            });
            out.pixels |= row.flash.set(first);
            out.pixels |= row.flash_end.set(last);
            if row.data.is_player {
                out.pixels |= row.own.set(own);
            }
            if flash.is_none() {
                row.flashing = None;
            }
            if pulse_due || !pulsing || !row.active || !row.data.fast_traffic {
                let strength = if pulsing && row.active && row.data.fast_traffic {
                    self.style.relative.pulse_alpha * pulse
                } else {
                    0.0
                };
                out.pixels |= row
                    .pulse
                    .set(alpha(self.style.colors.flash_loss, from * strength));
                out.pixels |= row
                    .pulse_end
                    .set(alpha(self.style.colors.flash_loss, to * strength));
            }
        }
        let before = self.rows.len();
        self.rows.retain(|_, r| r.active || r.fade.active(clock));
        if before != self.rows.len() {
            self.order.retain(|id| self.rows.contains_key(id));
            out.build = true;
        }
        for dot in self.dots.values_mut() {
            out.pixels |= dot.position.set([dot.x.value(clock), 0.0]);
        }
        out
    }
    pub fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        if self.reduced {
            return;
        }
        if self
            .rows
            .values()
            .any(|r| r.y.active(clock) || r.fade.active(clock) || r.flashing.is_some())
            || self.dots.values().any(|d| d.x.active(clock))
        {
            tx.wake_after(Duration::ZERO);
        }
        if let Some(due) = self.next_pulse {
            tx.wake_at(due);
        }
    }
}
fn strip_x(plan: &Plan, options: &Options, style: &Style, offset_s: f64) -> f32 {
    let pad = options.variant(style).padding_x;
    let span = plan.width - 2.0 * pad;
    let t = ((offset_s + vantare_domain::relative::STRIP_S)
        / (2.0 * vantare_domain::relative::STRIP_S))
        .clamp(0.0, 1.0) as f32;
    pad + t * span
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::{
        Quality::Reliable,
        widget_settings::{look::Tone, relative::vantare_template},
    };
    fn painter(reduced: bool) -> Relative {
        Relative::new(
            &Settings::default(),
            Preferences::default(),
            reduced,
            5,
            0.0,
        )
    }
    #[test]
    fn reordering_and_ghosts_finish_even_when_text_keeps_changing() {
        let mut painter = painter(false);
        let mut snapshot = crate::testdata::snapshot();
        painter.update(&snapshot, 0.0);
        let before = painter.rows[&3].position.get();
        snapshot.state.cars[2].relative_s = Reliable(-0.5);
        painter.update(&snapshot, 1.0);
        for n in 1..=100 {
            snapshot.sequence += 1;
            snapshot.state.cars[2].number = n.to_string();
            painter.update(&snapshot, 1.0 + f64::from(n) / 100.0);
        }
        let row = &painter.rows[&3];
        assert_ne!(row.position.get(), before);
        assert!(!row.y.active(2.0));
        assert!(row.flashing.is_none());
        snapshot.state.cars.retain(|c| c.id.0 != 3);
        painter.update(&snapshot, 3.0);
        assert!(painter.rows.contains_key(&3), "finite fading ghost");
        assert!(painter.animate(4.0).build);
        assert!(!painter.rows.contains_key(&3));
        let idle = painter.animate(30.0);
        assert!(!idle.build && !idle.pixels);
    }
    #[test]
    fn reduced_motion_snaps_rows_and_has_no_pulse_or_finite_tail() {
        let mut painter = painter(true);
        let mut snapshot = crate::testdata::snapshot();
        painter.update(&snapshot, 0.0);
        snapshot.state.cars[2].relative_s = Reliable(-0.5);
        painter.update(&snapshot, 1.0);
        assert!(
            painter
                .rows
                .values()
                .all(|r| !r.y.active(1.0) && !r.fade.active(1.0) && r.flashing.is_none())
        );
        assert!(painter.next_pulse.is_none());
        let idle = painter.animate(30.0);
        assert!(!idle.build && !idle.pixels);
        assert!(!painter.policy(true, 5, 31.0).pixels);
    }
    #[test]
    fn traffic_pulses_at_widget_cadence_and_stops_when_reduced() {
        let settings = Settings {
            class_scope: "all".into(),
            ..Default::default()
        };
        let mut painter = Relative::new(&settings, Preferences::default(), false, 5, 0.0);
        let mut snapshot = crate::testdata::snapshot();
        let faster = &mut snapshot.state.cars[4];
        faster.class = Some(vantare_domain::Class {
            id: vantare_domain::ClassId(2),
            name: "Hypercar".into(),
        });
        faster.best_lap_s = Reliable(90.0);
        painter.update(&snapshot, 0.0);
        assert!(painter.board.traffic.is_some());
        assert!(painter.next_pulse.is_some());
        assert!(!painter.animate(0.1).pixels);
        assert!(painter.animate(0.2).pixels);
        assert!(!painter.animate(0.25).pixels);
        assert!(painter.policy(true, 5, 0.3).pixels);
        assert!(painter.next_pulse.is_none());
        assert!(!painter.animate(1.0).pixels);
    }
    #[test]
    fn templates_tones_languages_and_reversed_custom_columns_keep_canonical_order() {
        for template in ["compact", "standard", "expanded"] {
            for tone in [Tone::Neo, Tone::Neutro] {
                let mut settings = Settings {
                    style: tone,
                    columns: Some(vantare_template(template)),
                    ..Default::default()
                };
                settings.columns.as_mut().expect("columns").reverse();
                let options = Options::from_settings(&settings);
                let expected = options.cols.order.clone();
                let mut painter = Relative::new(
                    &settings,
                    Preferences {
                        language: Language::En,
                        ..Default::default()
                    },
                    true,
                    15,
                    0.0,
                );
                painter.update(&crate::testdata::snapshot(), 0.0);
                assert_eq!(
                    painter
                        .plan
                        .columns
                        .iter()
                        .map(|c| c.kind)
                        .collect::<Vec<_>>(),
                    expected
                );
                assert!(
                    painter
                        .labels
                        .rows
                        .iter()
                        .flatten()
                        .any(|r| r.driver == "You")
                );
                assert!(painter.plan.width > 0.0 && painter.plan.height >= painter.plan.content);
                let _view = painter.view();
            }
        }
    }
    #[test]
    fn canonical_templates_keep_the_catalogue_widths() {
        for (template, width) in [("compact", 280.0), ("standard", 420.0), ("expanded", 600.0)] {
            let settings = Settings {
                columns: Some(vantare_template(template)),
                ..Default::default()
            };
            let painter = Relative::new(&settings, Preferences::default(), true, 15, 0.0);
            assert_eq!(painter.size().width, width, "{template}");
            assert_eq!(painter.header[4].get().as_ref(), "Esperando al simulador");
        }
    }
    #[test]
    fn pause_retains_last_live_rows_and_new_windows_can_project_the_retained_photo() {
        let mut painter = painter(true);
        let live = crate::testdata::snapshot();
        painter.update(&live, 0.0);
        let height = painter.size().height;
        let board = painter.board.clone();
        let mut paused = live.clone();
        paused.state.source_state = vantare_domain::SourceState::Paused;
        paused.state.cars[2].number = "unexpected".into();
        assert!(painter.update(&paused, 1.0).build);
        assert!(Arc::ptr_eq(&board, &painter.board));
        assert_eq!(painter.size().height, height + 22.0);
        assert!(!painter.update(&paused, 2.0).build);
        let mut opened = Relative::new(&Settings::default(), Preferences::default(), true, 5, 0.0);
        opened.update(&paused, 0.0);
        assert!(!opened.rows.is_empty());
        assert!(painter.update(&live, 3.0).build);
        assert_eq!(painter.size().height, height);
    }
}
