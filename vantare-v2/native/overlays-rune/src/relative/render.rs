//! Vantare paints the shared Relative scene; retained Rune values stay in this Look.
use super::{
    Update,
    layout::{Footer, Item, Kind},
};
use crate::vantare::alpha;
use crate::vantare::paint::{Face, WHITE, fixed, font, label, pill};
use rune::{Align, Color, El, LiveText, Shape, canvas, el, row, text};
use vantare_domain::{DriverRating, relative::Banner};

use super::{
    layout::{self, Labels, Options, Plan},
    scene::{AlertKind, Scene},
};
use crate::vantare::Style;
use rune::Live;
use std::{collections::BTreeMap, sync::Arc};
use vantare_domain::{
    CarId,
    format::{Language, Preferences},
    geometry::Size,
    relative::{Board, Row},
};

const CLEAR: Color = Color {
    r: 0.0,
    g: 0.0,
    b: 0.0,
    a: 0.0,
};
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
    active: bool,
}
struct DotLive {
    id: CarId,
    class: String,
    player: bool,
    position: Live<[f32; 2]>,
}

#[derive(PartialEq)]
struct RowStructure {
    id: CarId,
    class: String,
    player: bool,
    pits: bool,
    active: bool,
    laps: Option<i32>,
    rating: Option<DriverRating>,
    intrinsic: [String; 3],
}
#[derive(PartialEq)]
struct Structure {
    plan: Plan,
    banner: Option<Banner>,
    paused: bool,
    header: [String; 2],
    rows: Vec<RowStructure>,
    dots: Vec<(CarId, String, bool)>,
}

pub(super) struct Painter {
    prefs: Preferences,
    options: Options,
    style: Arc<Style>,
    board: Arc<Board>,
    pub(super) plan: Plan,
    pub(super) labels: Labels,
    rows: BTreeMap<u32, RowLive>,
    order: Vec<u32>,
    dots: BTreeMap<u32, DotLive>,
    dot_order: Vec<u32>,
    pub(super) header: [LiveText; 6],
    paused: bool,
}
impl Painter {
    pub fn new(
        settings: &vantare_domain::widget_settings::relative::Settings,
        prefs: Preferences,
        scene: &Scene,
    ) -> Self {
        let style = Style::compiled();
        let options = Options::from_settings(settings);
        let mut painter = Self {
            prefs,
            plan: layout::plan(Some(&scene.board), &options, &style),
            labels: Labels::new(Some(&scene.board), &options, prefs.language),
            options,
            style,
            board: scene.board.clone(),
            rows: BTreeMap::new(),
            order: Vec::new(),
            dots: BTreeMap::new(),
            dot_order: Vec::new(),
            header: std::array::from_fn(|_| LiveText::new("")),
            paused: scene.paused,
        };
        painter.sync(scene);
        painter
    }
    pub fn size(&self) -> Size {
        Size {
            width: self.plan.width,
            height: self.plan.height + if self.paused { 22.0 } else { 0.0 },
        }
    }
    pub fn plan_height(&self) -> f32 {
        self.plan.height
    }
    pub fn has_strip(&self) -> bool {
        self.options.cols.strip
    }
    pub fn targets(&self, board: &Board) -> Vec<f32> {
        layout::plan(Some(board), &self.options, &self.style)
            .items
            .into_iter()
            .filter_map(|(y, item)| {
                matches!(item, Item::Slot(_) | Item::Skeleton(_, _)).then_some(y)
            })
            .collect()
    }
    pub fn view(&self) -> El {
        view(self)
    }
    fn structure(&self) -> Structure {
        Structure {
            plan: self.plan.clone(),
            banner: self.board.banner.clone(),
            paused: self.paused,
            header: [
                self.header[0].get().to_string(),
                self.header[1].get().to_string(),
            ],
            rows: self
                .order
                .iter()
                .map(|id| {
                    let live = &self.rows[id];
                    RowStructure {
                        id: live.data.id,
                        class: live.data.class.clone(),
                        player: live.data.is_player,
                        pits: live.data.in_pits,
                        active: live.active,
                        laps: self
                            .options
                            .cols
                            .has(Kind::Laps)
                            .then_some(live.data.lap_delta)
                            .flatten()
                            .filter(|n| *n != 0)
                            .map(i32::signum),
                        rating: self
                            .options
                            .cols
                            .has(Kind::Rating)
                            .then_some(live.data.rating)
                            .flatten(),
                        intrinsic: [
                            live.texts[Kind::Driver as usize].get().to_string(),
                            if self.options.cols.has(Kind::Number) {
                                live.texts[Kind::Number as usize].get().to_string()
                            } else {
                                String::new()
                            },
                            if self.options.cols.vehicle {
                                live.detail.get().to_string()
                            } else {
                                String::new()
                            },
                        ],
                    }
                })
                .collect(),
            dots: self
                .dot_order
                .iter()
                .map(|id| {
                    let d = &self.dots[id];
                    (d.id, d.class.clone(), d.player)
                })
                .collect(),
        }
    }
    /// The only build decision: compare structure, while fixed-size values stay Live.
    pub fn sync(&mut self, scene: &Scene) -> Update {
        let before = self.structure();
        let mut pixels = false;
        self.board = scene.board.clone();
        self.paused = scene.paused;
        self.plan = layout::plan(Some(&scene.board), &self.options, &self.style);
        self.labels = Labels::new(Some(&scene.board), &self.options, self.prefs.language);
        self.order.clear();
        for visual in &scene.rows {
            let row = &visual.row;
            let label = scene
                .board
                .slots
                .iter()
                .position(|slot| slot.as_ref().is_some_and(|r| r.id == row.id))
                .and_then(|index| self.labels.rows[index].clone())
                .unwrap_or_else(|| layout::RowLabels::new(row, &self.options, self.prefs.language));
            let mut values = Self::values(row, &label, self.prefs.language);
            if scene.board.banner == Some(Banner::FullCourseYellow) {
                values[Kind::Trend as usize].clear();
            }
            let colors = Self::inks(row, &scene.board, &self.style);
            let live = self.rows.entry(row.id.0).or_insert_with(|| RowLive {
                data: row.clone(),
                texts: values.clone().map(LiveText::new),
                detail: LiveText::new(label.detail.clone()),
                inks: colors.map(Live::new),
                position: Live::new([0.0, 0.0]),
                opacity: Live::new(1.0),
                pulse: Live::new(CLEAR),
                pulse_end: Live::new(CLEAR),
                flash: Live::new(CLEAR),
                flash_end: Live::new(CLEAR),
                own: Live::new(1.0),
                active: true,
            });
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
                    pixels |= text || ink;
                }
            }
            let detail = live.detail.set(label.detail);
            pixels |= detail && self.options.cols.vehicle;
            pixels |= live.position.set([0.0, visual.slot]);
            pixels |= live.opacity.set(visual.opacity);
            let variant = self.options.variant(&self.style);
            let (from, to) = if variant.player_white > 0.0 {
                (0.3, 0.3)
            } else {
                (variant.player_from, variant.player_to)
            };
            let pulse = visual.traffic_opacity * self.style.relative.pulse_alpha;
            let (flash, strength) = visual.alert.map_or((CLEAR, 0.0), |alert| {
                (
                    match alert.kind {
                        AlertKind::Pits => self.style.colors.box_fill,
                        AlertKind::Gain => self.style.colors.flash_gain,
                        AlertKind::Loss => self.style.colors.flash_loss,
                    },
                    alert.opacity,
                )
            });
            pixels |= live
                .pulse
                .set(alpha(self.style.colors.flash_loss, from * pulse));
            pixels |= live
                .pulse_end
                .set(alpha(self.style.colors.flash_loss, to * pulse));
            pixels |= live.flash.set(alpha(
                flash,
                from * strength * self.style.motion.flash_boost,
            ));
            pixels |= live
                .flash_end
                .set(alpha(flash, to * strength * self.style.motion.flash_boost));
            pixels |= live
                .own
                .set(if row.is_player { 1.0 - strength } else { 1.0 });
            live.data = row.clone();
            live.active = scene.board.slots.iter().flatten().any(|r| r.id == row.id);
            self.order.push(row.id.0);
        }
        self.rows.retain(|id, _| self.order.contains(id));
        self.dot_order.clear();
        if self.options.cols.strip {
            for visual in &scene.strip {
                let dot = &visual.dot;
                let x = strip_x(
                    &self.plan,
                    &self.options,
                    &self.style,
                    f64::from(visual.offset_s),
                );
                let live = self.dots.entry(dot.id.0).or_insert_with(|| DotLive {
                    id: dot.id,
                    class: dot.class.clone(),
                    player: dot.is_player,
                    position: Live::new([x, 0.0]),
                });
                live.class = dot.class.clone();
                live.player = dot.is_player;
                pixels |= live.position.set([x, 0.0]);
                self.dot_order.push(dot.id.0);
            }
        }
        self.dots.retain(|id, _| self.dot_order.contains(id));
        for (live, text) in self.header.iter().zip(header_values(self)) {
            pixels |= live.set(text);
        }
        Update {
            build: before != self.structure(),
            pixels,
        }
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
}
fn strip_x(plan: &Plan, options: &Options, style: &Style, offset_s: f64) -> f32 {
    let pad = options.variant(style).padding_x;
    let span = plan.width - 2.0 * pad;
    let t = ((offset_s + vantare_domain::relative::STRIP_S)
        / (2.0 * vantare_domain::relative::STRIP_S))
        .clamp(0.0, 1.0) as f32;
    pad + t * span
}

pub(super) fn header_values(state: &Painter) -> [String; 6] {
    let es = state.prefs.language == Language::Es;
    let banner = state
        .board
        .banner
        .as_ref()
        .map(|b| match b {
            Banner::FullCourseYellow => "FCY".into(),
            Banner::LocalYellow(_) => state.labels.yellow.clone(),
            Banner::InPits => if es { "En boxes" } else { "In the pits" }.into(),
        })
        .unwrap_or_default();
    let banner: String = banner.to_uppercase();
    let right = if state.board.banner == Some(Banner::InPits) && state.board.pit_limiter {
        if es { "limitador" } else { "limiter" }
    } else {
        ""
    };
    let footer = state.plan.items.iter().find_map(|(_, i)| {
        if let Item::Footer(f) = i {
            Some(*f)
        } else {
            None
        }
    });
    let (left, end) = match footer {
        Some(Footer::Waiting) => (
            if es {
                "Esperando al simulador"
            } else {
                "Waiting for the simulator"
            }
            .into(),
            String::new(),
        ),
        Some(Footer::Traffic) => (
            state.labels.traffic.clone(),
            if es {
                "deja hueco en la curva"
            } else {
                "leave room in the corner"
            }
            .into(),
        ),
        Some(Footer::Pits) => (state.labels.exit.clone(), state.labels.loss.clone()),
        Some(Footer::Legend) => (
            if es {
                "▲▼ s/vuelta recortados"
            } else {
                "▲▼ s/lap gained"
            }
            .into(),
            String::new(),
        ),
        Some(Footer::Session) => {
            let value = if state.board.session.to_lowercase().starts_with("pr") {
                if es { "Tanda —" } else { "Run —" }
            } else if es {
                "Delta de vuelta lanzada —"
            } else {
                "Flying lap delta —"
            };
            (value.into(), String::new())
        }
        None => (String::new(), String::new()),
    };
    [
        state.labels.title.clone(),
        state.labels.header.clone(),
        banner,
        right.into(),
        left,
        end,
    ]
}
pub(super) fn view(state: &Painter) -> El {
    let s = &state.style;
    let v = state.options.variant(s);
    let width = state.plan.width;
    let border = if v.border_accent > 0.0 {
        alpha(state.options.accent(s), v.border_accent)
    } else {
        v.border
    };
    let mut root = el()
        .key("relative-view")
        .size(width, state.size().height)
        .motion(rune::Spring::NONE)
        .child(
            el().size(width, state.plan.content)
                .radius(v.radius)
                .border(1.0, border)
                .linear_gradient(std::f32::consts::PI, [(0.0, v.top), (1.0, v.bottom)])
                .shadow(
                    v.shadow_y,
                    v.shadow_blur,
                    alpha(
                        Color {
                            a: 1.0,
                            ..s.colors.shadow
                        },
                        v.shadow_alpha,
                    ),
                ),
        );
    for id in &state.order {
        if let Some(live) = state.rows.get(id)
            && !live.active
        {
            root = root.child(car_row(state, live));
        }
    }
    for &(y, item) in &state.plan.items {
        root = match item {
            Item::Header => root.child(header(state, y)),
            Item::Banner => root.child(banner(state)),
            Item::Strip => root.child(strip(state, y)),
            Item::Slot(index) => {
                if let Some(row) = state
                    .board
                    .slots
                    .get(index)
                    .and_then(Option::as_ref)
                    .and_then(|r| state.rows.get(&r.id.0))
                {
                    root.child(car_row(state, row))
                } else {
                    root
                }
            }
            Item::Skeleton(index, me) => root.child(skeleton(state, y, index, me)),
            Item::Footer(kind) => root.child(footer(state, y, kind)),
        };
    }
    if state.paused {
        let title = if state.prefs.language == Language::Es {
            "EN PAUSA"
        } else {
            "PAUSED"
        };
        root = root.child(
            el().key("pause-band")
                .size(width, 22.0)
                .fill(rune::color::hex("#101113f2").expect("pause color"))
                .pin(Some(0.0), Some(state.plan.height), None, None)
                .child(
                    text(title)
                        .font(font(s, Face::Body, 11.0, 22.0, 0.22, 600.0))
                        .color(WHITE)
                        .h(22.0)
                        .pin(Some(8.0), Some(0.0), None, None),
                ),
        );
    }
    root
}
fn highlight(state: &Painter, color: Color) -> El {
    let s = &state.style;
    let v = state.options.variant(s);
    let x = v.padding_x - s.geometry.player_bleed;
    let node = el()
        .size(state.plan.width - 2.0 * x, s.geometry.row_height)
        .radius(v.player_radius)
        .pin(Some(x), Some(0.0), None, None);
    if v.player_white > 0.0 {
        node.fill(alpha(
            color,
            if color == WHITE { v.player_white } else { 0.3 },
        ))
    } else {
        node.linear_gradient(
            if v.player_vertical {
                std::f32::consts::PI
            } else {
                std::f32::consts::FRAC_PI_2
            },
            [
                (0.0, alpha(color, v.player_from)),
                (1.0, alpha(color, v.player_to)),
            ],
        )
    }
}
fn car_row(state: &Painter, live: &RowLive) -> El {
    let s = &state.style;
    let g = &s.geometry;
    let f = &s.fonts;
    let r = &s.relative;
    let c = &s.colors;
    let v = state.options.variant(s);
    let h = g.row_height;
    let class = s.class(&live.data.class);
    let mut root = el()
        .key(format!("car-{}", live.data.id.0))
        .size(state.plan.width, h)
        .pin(Some(0.0), Some(0.0), None, None)
        .live_offset(&live.position)
        .live_opacity(&live.opacity);
    if live.data.is_player {
        root = root.child(
            highlight(
                state,
                if v.player_white > 0.0 {
                    WHITE
                } else {
                    state.options.accent(s)
                },
            )
            .live_opacity(&live.own),
        );
    }
    let x = v.padding_x - g.player_bleed;
    let layer = || {
        el().size(state.plan.width - 2.0 * x, h)
            .radius(v.player_radius)
            .pin(Some(x), Some(0.0), None, None)
            .linear_gradient(
                if v.player_vertical {
                    0.0
                } else {
                    std::f32::consts::FRAC_PI_2
                },
                [(0.0, CLEAR), (1.0, CLEAR)],
            )
    };
    root = root
        .child(layer().live_gradient(&live.pulse, &live.pulse_end))
        .child(layer().live_gradient(&live.flash, &live.flash_end));
    root = root.child(
        el().size(g.class_dot, g.class_dot)
            .radius(if v.square_dots {
                0.0
            } else {
                g.class_dot / 2.0
            })
            .fill(class.dot)
            .pin(Some(v.padding_x), Some((h - g.class_dot) / 2.0), None, None),
    );
    for column in &state.plan.columns {
        let index = column.kind as usize;
        let value = &live.texts[index];
        let key = format!("cell-{}-{}", live.data.id.0, column.kind.metric());
        let node = match column.kind {
            Kind::Position => label(
                s,
                value,
                key,
                column.width,
                h,
                Face::Display,
                r.position_size,
                600.0,
                c.muted,
                Align::End,
            )
            .live_text_color(&live.inks[index]),
            Kind::Number => text(value.get().to_string())
                .key(key)
                .live_text(value)
                .font(font(
                    s,
                    Face::Mono,
                    f.mono_small,
                    g.number_height,
                    0.0,
                    400.0,
                ))
                .color(class.ink)
                .h(g.number_height)
                .min_w(g.number_min_width)
                .pl(g.number_padding)
                .pr(g.number_padding)
                .fill(class.tint)
                .radius(g.chip_radius),
            Kind::Driver => {
                let body = font(s, Face::Body, f.body, h, 0.0, 400.0);
                let box_width = if live.data.in_pits {
                    rune::text::measure(
                        "BOX",
                        &[],
                        font(
                            s,
                            Face::Body,
                            f.pill,
                            g.pill_height,
                            f.pill_tracking,
                            f.pill_weight,
                        ),
                        None,
                    )
                    .0 + 2.0 * g.pill_padding
                        + g.cell_gap
                } else {
                    0.0
                };
                let available = (column.width - box_width).max(0.0);
                let used = rune::text::measure(&value.get(), &[], body, None)
                    .0
                    .min(available);
                let name = text(value.get().to_string())
                    .key(key)
                    .font(body)
                    .color(c.text)
                    .size(used, h)
                    .truncate();
                let mut names =
                    el().size(available, h)
                        .child(name.pin(Some(0.0), Some(0.0), None, None));
                let rest = available - used;
                if state.options.cols.vehicle && rest > 12.0 {
                    names = names.child(
                        text(live.detail.get().to_string())
                            .key(format!("detail-{}", live.data.id.0))
                            .font(font(s, Face::Body, f.small, h, 0.0, 400.0))
                            .color(c.muted)
                            .size(rest, h)
                            .truncate()
                            .pin(Some(used), Some(0.0), None, None),
                    );
                }
                let mut cell = row()
                    .size(column.width, h)
                    .items_center()
                    .gap(g.cell_gap)
                    .child(names);
                if live.data.in_pits {
                    cell = cell.child(
                        text("BOX")
                            .font(font(
                                s,
                                Face::Body,
                                f.pill,
                                g.pill_height,
                                f.pill_tracking,
                                f.pill_weight,
                            ))
                            .color(c.box_text)
                            .fill(c.box_fill)
                            .h(g.pill_height)
                            .pl(g.pill_padding)
                            .pr(g.pill_padding)
                            .radius(g.chip_radius),
                    );
                }
                cell
            }
            Kind::Laps => {
                if let Some(laps) = live.data.lap_delta.filter(|n| *n != 0) {
                    let (fill, ink) = if laps < 0 {
                        (r.laps_down_fill, r.laps_down_text)
                    } else {
                        (r.laps_up_fill, r.laps_up_text)
                    };
                    pill(s, value, key, fill, ink)
                } else {
                    el().size(column.width, h)
                }
            }
            Kind::Rating => {
                let (fill, ink) = match live.data.rating {
                    Some(DriverRating::Platinum) => (r.platinum_fill, r.platinum_text),
                    Some(DriverRating::Gold) => (r.gold_fill, r.gold_text),
                    Some(DriverRating::Silver) => (r.silver_fill, r.silver_text),
                    Some(DriverRating::Bronze) => (r.bronze_fill, r.bronze_text),
                    None => (CLEAR, c.even),
                };
                if live.data.rating.is_some() {
                    pill(s, value, key, fill, ink)
                        .w(column.width)
                        .align(Align::Center)
                } else {
                    label(
                        s,
                        value,
                        key,
                        column.width,
                        h,
                        Face::Body,
                        f.small,
                        400.0,
                        ink,
                        Align::Start,
                    )
                }
            }
            Kind::Safety | Kind::Trend | Kind::Gap => label(
                s,
                value,
                key,
                column.width,
                h,
                Face::Mono,
                f.mono,
                400.0,
                c.value,
                Align::End,
            )
            .live_text_color(&live.inks[index]),
        };
        let cell_height = match column.kind {
            Kind::Number => g.number_height,
            Kind::Laps if live.data.lap_delta.is_some_and(|n| n != 0) => g.pill_height,
            Kind::Rating if live.data.rating.is_some() => g.pill_height,
            _ => h,
        };
        root = root.child(node.pin(
            Some(column.x),
            Some(
                (h - cell_height) / 2.0
                    + if column.kind == Kind::Position {
                        f.display_baseline
                    } else {
                        0.0
                    },
            ),
            None,
            None,
        ));
    }
    root
}
fn header(state: &Painter, y: f32) -> El {
    let s = &state.style;
    let v = state.options.variant(s);
    let h = v.header_height - if v.header_rule > 0.0 { 6.0 } else { 0.0 };
    let pad = v.padding_x;
    let width = state.plan.width;
    let face = if v.header_display {
        Face::Display
    } else {
        Face::Body
    };
    let title = text(state.header[0].get().to_string())
        .key("header-title")
        .font(font(
            s,
            face,
            v.header_size,
            h,
            v.header_tracking,
            if v.header_display { 600.0 } else { 400.0 },
        ))
        .color(v.header_color)
        .h(h)
        .grow(1.0)
        .min_w(0.0)
        .truncate();
    let range = text(state.header[1].get().to_string())
        .key("header-range")
        .font(font(
            s,
            face,
            v.header_size,
            h,
            v.header_tracking,
            if v.header_display { 600.0 } else { 400.0 },
        ))
        .color(v.header_color)
        .h(h);
    let mut line = row()
        .size(width - 2.0 * pad, h)
        .items_center()
        .gap(s.brand.margin)
        .child(title)
        .child(range);
    if state.options.brand {
        let scale = s.brand.symbol_height / 41.0;
        let points = [
            [9.0, 51.0],
            [32.0, 10.0],
            [55.0, 51.0],
            [42.0, 51.0],
            [32.0, 32.0],
            [22.0, 51.0],
        ]
        .map(|[x, y]| [(x - 9.0) * scale, (y - 10.0) * scale]);
        line = line.child(
            row()
                .h(h)
                .items_center()
                .gap(s.brand.gap)
                .child(
                    canvas(Shape::new().fill(points.to_vec(), s.brand.symbol))
                        .key("brand-symbol")
                        .size(46.0 * scale, s.brand.symbol_height),
                )
                .child(
                    text("VANTARE")
                        .font(font(
                            s,
                            Face::Display,
                            s.brand.size,
                            h,
                            s.brand.tracking,
                            600.0,
                        ))
                        .color(s.colors.muted)
                        .h(h),
                ),
        );
    }
    let mut root = el()
        .size(width, v.header_height)
        .pin(Some(0.0), Some(y), None, None)
        .child(line.pin(Some(pad), Some(0.0), None, None));
    if v.header_rule > 0.0 {
        root = root.child(
            el().size(width - 2.0 * pad, 1.0)
                .fill(alpha(state.options.accent(s), v.header_rule))
                .pin(Some(pad), Some(v.header_height - 1.0), None, None),
        );
    }
    root
}
fn banner(state: &Painter) -> El {
    let s = &state.style;
    let g = &s.geometry;
    let c = &s.colors;
    let pad = state.options.variant(s).padding_x;
    let (fill, ink, line) = match state.board.banner {
        Some(Banner::FullCourseYellow) => (c.fcy_fill, c.fcy_text, None),
        Some(Banner::LocalYellow(_)) => (c.yellow_fill, c.yellow_text, Some(c.yellow_line)),
        _ => (c.stops_fill, c.text, Some(c.line)),
    };
    let mut node = el()
        .size(state.plan.width, g.banner_height)
        .fill(fill)
        .child(
            label(
                s,
                &state.header[2],
                "banner-left",
                state.plan.width - 2.0 * pad,
                g.banner_height,
                Face::Display,
                s.fonts.banner,
                600.0,
                ink,
                Align::Start,
            )
            .font(font(
                s,
                Face::Display,
                s.fonts.banner,
                g.banner_height,
                s.fonts.banner_tracking,
                600.0,
            ))
            .pin(Some(pad), Some(0.0), None, None),
        )
        .child(
            label(
                s,
                &state.header[3],
                "pit-limiter",
                state.plan.width - 2.0 * pad,
                g.banner_height,
                Face::Mono,
                s.fonts.mono_small,
                400.0,
                ink,
                Align::End,
            )
            .pin(Some(pad), Some(0.0), None, None),
        );
    if let Some(line) = line {
        node = node.child(el().size(state.plan.width, 1.0).fill(line).pin(
            Some(0.0),
            Some(g.banner_height - 1.0),
            None,
            None,
        ));
    }
    node
}
fn strip(state: &Painter, y: f32) -> El {
    let s = &state.style;
    let r = &s.relative;
    let pad = state.options.variant(s).padding_x;
    let width = state.plan.width;
    let mut root = el()
        .key("track-strip")
        .size(width, r.strip_height)
        .pin(Some(0.0), Some(y), None, None)
        .child(el().size(width - 2.0 * pad, 2.0).fill(r.strip_line).pin(
            Some(pad),
            Some(10.0),
            None,
            None,
        ))
        .child(el().size(1.0, 14.0).fill(r.strip_tick).pin(
            Some(width / 2.0),
            Some(4.0),
            None,
            None,
        ))
        .child(
            text("−10 s")
                .font(font(s, Face::Mono, r.strip_label, 11.0, 0.0, 400.0))
                .color(r.strip_text)
                .size(50.0, 11.0)
                .pin(Some(pad), Some(17.0), None, None),
        )
        .child(
            text("+10 s")
                .font(font(s, Face::Mono, r.strip_label, 11.0, 0.0, 400.0))
                .color(r.strip_text)
                .size(50.0, 11.0)
                .align(Align::End)
                .pin(None, Some(17.0), Some(pad), None),
        );
    for id in state
        .dot_order
        .iter()
        .filter(|id| state.dots.get(id).is_some_and(|d| !d.player))
        .chain(
            state
                .dot_order
                .iter()
                .filter(|id| state.dots.get(id).is_some_and(|d| d.player)),
        )
    {
        let d = &state.dots[id];
        let size = if d.player { r.strip_me } else { r.strip_dot };
        let mut dot = el()
            .key(format!("strip-car-{}", d.id.0))
            .size(size, size)
            .radius(size / 2.0)
            .fill(if d.player {
                state.options.accent(s)
            } else {
                s.class(&d.class).dot
            })
            .live_offset(&d.position)
            .pin(Some(-size / 2.0), Some(11.0 - size / 2.0), None, None);
        if d.player {
            dot = dot.border(2.0, WHITE);
        }
        root = root.child(dot);
    }
    root
}
fn skeleton(state: &Painter, y: f32, index: usize, me: bool) -> El {
    let s = &state.style;
    let g = &s.geometry;
    let v = state.options.variant(s);
    let ink = s.colors.skeleton;
    let mut root = el()
        .key(format!("skeleton-{index}"))
        .size(state.plan.width, g.row_height)
        .pin(Some(0.0), Some(y), None, None);
    if me {
        root = root.child(
            highlight(
                state,
                if v.player_white > 0.0 {
                    WHITE
                } else {
                    state.options.accent(s)
                },
            )
            .opacity(0.6),
        );
    }
    let top = (g.row_height - g.skeleton_bar) / 2.0;
    root.child(el().size(16.0, g.skeleton_bar).radius(2.0).fill(ink).pin(
        Some(v.padding_x),
        Some(top),
        None,
        None,
    ))
    .child(
        el().size(g.class_dot, g.class_dot)
            .radius(g.class_dot / 2.0)
            .fill(ink)
            .pin(
                Some(v.padding_x + 16.0 + g.cell_gap),
                Some((g.row_height - g.class_dot) / 2.0),
                None,
                None,
            ),
    )
    .child(
        el().size(110.0 + ((index * 37) % 70) as f32, g.skeleton_bar)
            .radius(2.0)
            .fill(ink)
            .pin(
                Some(v.padding_x + 16.0 + 2.0 * g.cell_gap + g.class_dot),
                Some(top),
                None,
                None,
            ),
    )
    .child(el().size(48.0, g.skeleton_bar).radius(2.0).fill(ink).pin(
        None,
        Some(top),
        Some(v.padding_x),
        None,
    ))
}
fn footer(state: &Painter, y: f32, kind: Footer) -> El {
    let s = &state.style;
    let g = &s.geometry;
    let c = &s.colors;
    let pad = state.options.variant(s).padding_x;
    let width = state.plan.width;
    let top = 1.0 + g.footer_gap;
    let es = state.prefs.language == Language::Es;
    let mut root = el()
        .key("relative-footer")
        .size(width, top + g.footer_height)
        .pin(Some(0.0), Some(y), None, None)
        .child(el().size(width - 2.0 * pad, 1.0).fill(c.line).pin(
            Some(pad),
            Some(0.0),
            None,
            None,
        ));
    let left = pad
        + if kind == Footer::Waiting {
            g.pulse + g.cell_gap
        } else if kind == Footer::Traffic {
            8.0 + g.cell_gap
        } else {
            0.0
        };
    if kind == Footer::Waiting {
        root = root.child(
            el().size(g.pulse, g.pulse)
                .radius(g.pulse / 2.0)
                .fill(c.pulse)
                .pin(
                    Some(pad),
                    Some(top + (g.footer_height - g.pulse) / 2.0),
                    None,
                    None,
                ),
        );
    }
    if kind == Footer::Traffic {
        root = root.child(fixed(s, "▲ ", g.footer_height, s.fonts.header, c.loss).pin(
            Some(pad),
            Some(top),
            None,
            None,
        ));
    }
    if kind == Footer::Legend {
        let minus = LiveText::new(if es { "−V" } else { "−L" });
        let plus = LiveText::new(if es { "+V" } else { "+L" });
        let legend = row()
            .h(g.footer_height)
            .items_center()
            .gap(g.cell_gap)
            .child(pill(
                s,
                &minus,
                "legend-down",
                s.relative.laps_down_fill,
                s.relative.laps_down_text,
            ))
            .child(fixed(
                s,
                if es { "doblado" } else { "lapped" },
                g.footer_height,
                s.fonts.header,
                c.muted,
            ))
            .child(pill(
                s,
                &plus,
                "legend-up",
                s.relative.laps_up_fill,
                s.relative.laps_up_text,
            ))
            .child(fixed(
                s,
                if es { "te dobla" } else { "laps you" },
                g.footer_height,
                s.fonts.header,
                c.muted,
            ));
        root = root.child(legend.pin(None, Some(top), Some(pad), None));
    }
    root.child(
        label(
            s,
            &state.header[4],
            "footer-left",
            width - 2.0 * pad,
            g.footer_height,
            Face::Body,
            s.fonts.header,
            400.0,
            c.muted,
            Align::Start,
        )
        .pin(Some(left), Some(top), None, None),
    )
    .child(
        label(
            s,
            &state.header[5],
            "footer-right",
            width - 2.0 * pad,
            g.footer_height,
            Face::Body,
            s.fonts.header,
            400.0,
            c.muted,
            Align::End,
        )
        .pin(Some(pad), Some(top), None, None),
    )
}
