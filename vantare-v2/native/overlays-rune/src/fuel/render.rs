//! Vantare paints the shared Fuel scene; Rune values stay in this Look.
use super::{
    layout::{self, Band, Fill, Ink, Line, Options, Plan},
    scene::{Bar, Scene},
};
use crate::{
    vantare::{
        Style, alpha,
        paint::{Face, font},
    },
    widget::Update,
};
use rune::{Align, Color, El, Live, Shape, canvas, el, row, text};
use std::sync::Arc;
use vantare_domain::{
    format::Preferences, fuel_strategy::Board, geometry::Size as WidgetSize,
    widget_session::Session, widget_settings::fuel_strategy::Settings,
};

const CLEAR: Color = Color {
    r: 0.0,
    g: 0.0,
    b: 0.0,
    a: 0.0,
};
const CHANNELS: usize = 5;
const PILLS: usize = 2;

/// Rectángulo animado de una barra: posición, tamaño y relleno.
struct BarLive {
    rect: Live<[f32; 4]>,
    fill: Live<Color>,
}

pub(super) struct Painter {
    prefs: Preferences,
    options: Options,
    style: Arc<Style>,
    board: Arc<Board>,
    session: Option<Session>,
    lines: Arc<Vec<Line>>,
    plan: Plan,
    bars: Vec<BarLive>,
    window: Live<[f32; 4]>,
    pills: Vec<Live<[f32; 4]>>,
    pill_targets: Vec<[f32; 4]>,
    border: Live<Color>,
    /// Última estructura pintada: solo se compara el puntero de las líneas.
    last: Option<(Arc<Vec<Line>>, Plan)>,
}

impl Painter {
    pub(super) fn new(settings: &Settings, prefs: Preferences, scene: &Scene) -> Self {
        let style = Style::compiled();
        let options = Options::from_settings(settings);
        let lines = Arc::new(layout::lines(
            Some(scene.board.as_ref()),
            &options,
            None,
            prefs.language,
        ));
        let plan = layout::plan(&lines, &options, &style);
        let pill_targets = pill_targets(&style, &options, &lines, &plan);
        let mut painter = Self {
            prefs,
            options,
            style,
            board: scene.board.clone(),
            session: None,
            lines,
            plan,
            bars: (0..CHANNELS)
                .map(|_| BarLive {
                    rect: Live::new([0.0; 4]),
                    fill: Live::new(CLEAR),
                })
                .collect(),
            window: Live::new([0.0; 4]),
            pills: (0..PILLS).map(|_| Live::new([0.0; 4])).collect(),
            pill_targets,
            border: Live::new(CLEAR),
            last: None,
        };
        painter.sync(scene);
        painter
    }
    pub(super) fn size(&self) -> WidgetSize {
        WidgetSize {
            width: self.plan.width,
            height: self.plan.height,
        }
    }
    /// Recalcula líneas, plan y píldoras solo cuando cambian datos o sesión.
    pub(super) fn prepare(&mut self, board: &Arc<Board>, session: Option<Session>) -> bool {
        if Arc::ptr_eq(&self.board, board) && self.session == session {
            return false;
        }
        self.board = board.clone();
        self.session = session;
        self.lines = Arc::new(layout::lines(
            Some(board.as_ref()),
            &self.options,
            session,
            self.prefs.language,
        ));
        self.plan = layout::plan(&self.lines, &self.options, &self.style);
        self.pill_targets = pill_targets(&self.style, &self.options, &self.lines, &self.plan);
        true
    }
    /// Fracciones que este Look pinta, en el orden del plan.
    pub(super) fn targets(&self) -> Vec<(Bar, f32)> {
        layout::targets(&self.lines)
    }
    pub(super) fn view(&self) -> El {
        view(self)
    }
    fn pad(&self) -> f32 {
        self.options.variant(&self.style).padding_x
    }
    /// Los valores animados se pintan sin recomponer; el resto, al comparar.
    pub(super) fn sync(&mut self, scene: &Scene) -> Update {
        let mut pixels = self.values(scene);
        let build = self
            .last
            .as_ref()
            .is_none_or(|(lines, plan)| !Arc::ptr_eq(lines, &self.lines) || *plan != self.plan);
        self.last = Some((self.lines.clone(), self.plan.clone()));
        pixels |= build;
        Update { build, pixels }
    }
    /// Barras, ventana, píldoras y borde: lo único que cambia sin recomponer.
    fn values(&mut self, scene: &Scene) -> bool {
        let mut pixels = false;
        let lines = self.lines.clone();
        let pad = self.pad();
        let inner = self.plan.width - 2.0 * pad;
        let (big_height, bar_height, gauge_height, gauge_bar, low_border) = {
            let f = &self.style.fuel;
            (
                f.big_height,
                f.bar,
                f.gauge_height,
                f.gauge_bar,
                f.low_border,
            )
        };
        for (index, line) in lines.iter().enumerate() {
            let top = self.plan.tops.get(index).copied().unwrap_or(0.0);
            match line {
                Line::Big { fraction, fill, .. } => {
                    if fraction.is_some() {
                        let y = top + big_height - bar_height - 4.0;
                        pixels |=
                            self.set_bar(Bar::Compact, [pad, y, inner, bar_height], *fill, scene);
                    }
                }
                Line::Gauge {
                    bar,
                    fraction,
                    fill,
                    ..
                } => {
                    if fraction.is_some() {
                        let y = top + gauge_height - gauge_bar - 8.0;
                        pixels |= self.set_bar(*bar, [pad, y, inner, gauge_bar], *fill, scene);
                    }
                }
                Line::Window { open, close, .. } => {
                    pixels |= self.window.set([
                        pad + open * inner,
                        top + 5.0,
                        ((close - open) * inner).max(4.0),
                        8.0,
                    ]);
                    let marker = &mut self.bars[Bar::Now as usize].rect;
                    pixels |= marker.set([
                        pad + scene.fraction(Bar::Now).unwrap_or_default() * inner - 1.0,
                        top + 1.0,
                        2.0,
                        16.0,
                    ]);
                }
                _ => {}
            }
        }
        for (live, target) in self.pills.iter_mut().zip(&self.pill_targets) {
            pixels |= live.set(*target);
        }
        pixels |= self.border.set(alpha(low_border, scene.border));
        pixels
    }
    fn set_bar(&mut self, bar: Bar, area: [f32; 4], fill: Fill, scene: &Scene) -> bool {
        let value = scene.fraction(bar).unwrap_or_default();
        let painted = self.fill(fill);
        let live = &mut self.bars[bar as usize];
        let moved = live.rect.set([area[0], area[1], area[2] * value, area[3]]);
        let color = live.fill.set(painted);
        moved || color
    }
    fn ink(&self, ink: Ink) -> Color {
        let c = &self.style.colors;
        match ink {
            Ink::Plain => c.value,
            Ink::Hi => c.text,
            Ink::Red => c.loss,
            Ink::Amber => c.yellow_text,
            Ink::Green => c.gain,
            Ink::Accent => self.options.accent(&self.style),
        }
    }
    fn fill(&self, fill: Fill) -> Color {
        let f = &self.style.fuel;
        match fill {
            Fill::Accent => self.options.accent(&self.style),
            Fill::Fuel => f.fuel_bar,
            Fill::Refuel => f.refuel,
            Fill::Red => f.low_border,
        }
    }
}

/// Sitio de cada píldora de medidor: se mide al recomponer, no en cada frame.
fn pill_targets(style: &Style, options: &Options, lines: &[Line], plan: &Plan) -> Vec<[f32; 4]> {
    let pad = options.variant(style).padding_x;
    let fuel = &style.fuel;
    lines
        .iter()
        .enumerate()
        .filter_map(|(index, line)| {
            let Line::Gauge {
                pill: Some(text),
                suffix,
                small,
                value,
                ..
            } = line
            else {
                return None;
            };
            let top = plan.tops.get(index).copied().unwrap_or(0.0);
            let size = if *small {
                fuel.gauge_value_small
            } else {
                fuel.gauge_value
            };
            let value_width = measure(
                style,
                value,
                Face::Display,
                size,
                fuel.gauge_value,
                600.0,
                0.5,
            );
            let suffix_width = if suffix.is_empty() {
                0.0
            } else {
                measure(
                    style,
                    suffix,
                    Face::Body,
                    fuel.gauge_suffix,
                    fuel.gauge_value,
                    400.0,
                    0.0,
                )
            };
            let right = plan.width - pad - suffix_width - value_width;
            let width = pill_width(style, text);
            Some([right - 8.0 - width, top + 3.0, width, 16.0])
        })
        .collect()
}

/// Ancho de un texto con la fuente y el hueco exactos con que se pinta.
fn measure(
    style: &Style,
    value: &str,
    face: Face,
    size: f32,
    height: f32,
    weight: f32,
    tracking: f32,
) -> f32 {
    rune::text::measure(
        value,
        &[],
        font(style, face, size, height, tracking, weight),
        None,
    )
    .0
}

fn pill_width(style: &Style, value: &str) -> f32 {
    measure(
        style,
        value,
        Face::Body,
        style.fonts.pill,
        style.geometry.pill_height,
        style.fonts.pill_weight,
        style.fonts.pill_tracking,
    ) + 2.0 * style.geometry.pill_padding
}

/// GPUI coloca el texto por línea base; Rune centra en su caja, así que cada
/// cara suma su desplazamiento canónico (Display 1 px, Mono 0).
fn shift(style: &Style, face: Face, y: f32) -> f32 {
    match face {
        Face::Body => y,
        Face::Display => y + style.fonts.display_baseline,
        Face::Mono => y + style.fonts.mono_baseline,
    }
}

/// Punto del gráfico de consumo local a su lienzo (0..alto).
fn spark_point(index: usize, count: usize, value: f32, inner: f32, height: f32) -> [f32; 2] {
    let x = 2.0 + index as f32 * (inner - 4.0) / (count.max(2) - 1) as f32;
    [x, height - 2.0 - value * (height - 4.0)]
}

#[allow(clippy::too_many_arguments)] // Caja de texto: sitio, fuente e ink.
fn cell(
    style: &Style,
    value: &str,
    key: String,
    area: [f32; 4],
    face: Face,
    size: f32,
    weight: f32,
    tracking: f32,
    align: Align,
    ink: Color,
    fit: bool,
) -> El {
    let [x, y, width, height] = area;
    let node = text(value)
        .key(key)
        .font(font(style, face, size, height, tracking, weight))
        .color(ink)
        .size(width, height)
        .align(align);
    let node = if fit { node.truncate() } else { node };
    node.pin(Some(x), Some(shift(style, face, y)), None, None)
}

fn view(state: &Painter) -> El {
    let s = &state.style;
    let v = state.options.variant(s);
    let width = state.plan.width;
    let content = state.plan.content.min(state.plan.height);
    let border = if v.border_accent > 0.0 {
        alpha(state.options.accent(s), v.border_accent)
    } else {
        v.border
    };
    let mut root = el()
        .key("fuel-view")
        .size(width, state.plan.height)
        .motion(rune::Spring::NONE)
        .child(
            el().key("fuel-panel")
                .size(width, content)
                .radius(v.radius)
                .border(1.0, border)
                .pin(Some(0.0), Some(0.0), None, None)
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
        )
        .child(
            el().key("fuel-low")
                .size(width, content)
                .radius(v.radius)
                .border(1.0, CLEAR)
                .pin(Some(0.0), Some(0.0), None, None)
                .live_border(&state.border),
        );
    let mut pill = 0;
    for (index, (line, &y)) in state.lines.iter().zip(&state.plan.tops).enumerate() {
        root = match line {
            Line::Banner(band) => banner(state, *band, root),
            Line::Header { left, right } => header(state, index, y, left, right, root),
            Line::Big { .. } => big(state, index, y, line, root),
            Line::Gauge { pill: text, .. } => {
                let slot = text.as_ref().map(|_| {
                    let slot = pill.min(state.pills.len() - 1);
                    pill += 1;
                    slot
                });
                gauge(state, index, y, line, slot, root)
            }
            Line::Row { .. } => row_line(state, index, y, line, root),
            Line::Tiles(tiles) => tiles_line(state, index, y, tiles, root),
            Line::Sub { left, right } => sub(state, index, y, left, right, root),
            Line::Spark { values, average } => spark(state, y, values, *average, root),
            Line::Window { open, close, .. } => window(state, y, *open, *close, root),
            Line::WindowLabels(first, now, last) => {
                window_labels(state, index, y, [first, now, last], root)
            }
            Line::Footer {
                left,
                right,
                pill,
                pulse,
            } => footer(
                state,
                index,
                y,
                left,
                right.as_deref(),
                pill.as_deref(),
                *pulse,
                root,
            ),
        };
    }
    root
}

fn header(state: &Painter, index: usize, y: f32, left: &str, right: &str, root: El) -> El {
    let s = &state.style;
    let v = state.options.variant(s);
    let h = v.header_height;
    let pad = v.padding_x;
    let width = state.plan.width;
    let face = if v.header_display {
        Face::Display
    } else {
        Face::Body
    };
    let weight = if v.header_display { 600.0 } else { 400.0 };
    let track = v.header_tracking;
    let brand = if state.options.brand {
        Some(brand_block(state, h))
    } else {
        None
    };
    let reserved = brand
        .as_ref()
        .map_or(0.0, |(width, _)| width + s.brand.margin);
    let title = text(left)
        .key(format!("{index}-title"))
        .font(font(s, face, v.header_size, h, track, weight))
        .color(v.header_color)
        .h(h)
        .grow(1.0)
        .min_w(0.0);
    let class = text(right)
        .key(format!("{index}-class"))
        .font(font(s, face, v.header_size, h, track, weight))
        .color(v.header_color)
        .h(h);
    let mut root = root.child(
        row()
            .size(width - 2.0 * pad - reserved, h)
            .items_center()
            .gap(s.brand.margin)
            .child(title)
            .child(class)
            .pin(Some(pad), Some(y), None, None),
    );
    if let Some((brand_width, node)) = brand {
        root = root.child(node.pin(
            Some(width - pad - brand_width),
            Some(shift(s, Face::Display, y)),
            None,
            None,
        ));
    }
    root
}

/// Marca Vantare: símbolo y nombre, con su ancho para reservar el hueco.
fn brand_block(state: &Painter, height: f32) -> (f32, El) {
    let s = &state.style;
    let scale = s.brand.symbol_height / 41.0;
    let name = measure(
        s,
        "VANTARE",
        Face::Display,
        s.brand.size,
        height,
        600.0,
        s.brand.tracking,
    );
    let symbol = 46.0 * scale;
    let width = symbol + s.brand.gap + name;
    let points = [
        [9.0, 51.0],
        [32.0, 10.0],
        [55.0, 51.0],
        [42.0, 51.0],
        [32.0, 32.0],
        [22.0, 51.0],
    ]
    .map(|[x, y]| [(x - 9.0) * scale, (y - 10.0) * scale]);
    let node = row()
        .size(width, height)
        .items_center()
        .gap(s.brand.gap)
        .child(
            canvas(Shape::new().fill(points.to_vec(), s.brand.symbol))
                .key("brand")
                .size(symbol, s.brand.symbol_height),
        )
        .child(
            text("VANTARE")
                .key("brand-name")
                .font(font(
                    s,
                    Face::Display,
                    s.brand.size,
                    height,
                    s.brand.tracking,
                    600.0,
                ))
                .color(state.options.variant(s).header_color)
                .h(height),
        );
    (width, node)
}

fn big(state: &Painter, index: usize, y: f32, line: &Line, root: El) -> El {
    let Line::Big {
        left,
        left_label,
        right,
        right_label,
        tone,
        fraction,
        ..
    } = line
    else {
        return root;
    };
    let s = &state.style;
    let f = &s.fuel;
    let pad = state.pad();
    let width = state.plan.width;
    let inner = width - 2.0 * pad;
    let ink = state.ink(*tone);
    let mut root = root
        .child(cell(
            s,
            left,
            format!("{index}-big"),
            [pad, y, inner, f.big],
            Face::Display,
            f.big,
            600.0,
            0.5,
            Align::Start,
            s.colors.text,
            false,
        ))
        .child(cell(
            s,
            right,
            format!("{index}-big-right"),
            [
                0.0,
                y + f.big - f.big_secondary,
                width - pad,
                f.big_secondary,
            ],
            Face::Display,
            f.big_secondary,
            600.0,
            0.5,
            Align::End,
            ink,
            false,
        ))
        .child(cell(
            s,
            left_label,
            format!("{index}-big-label"),
            [pad, y + f.big + 2.0, inner, 16.0],
            Face::Body,
            s.fonts.small,
            400.0,
            0.0,
            Align::Start,
            s.colors.muted,
            false,
        ))
        .child(cell(
            s,
            right_label,
            format!("{index}-big-right-label"),
            [0.0, y + f.big + 2.0, width - pad, 16.0],
            Face::Body,
            s.fonts.small,
            400.0,
            0.0,
            Align::End,
            s.colors.muted,
            false,
        ));
    if fraction.is_some() {
        let top = y + f.big_height - f.bar - 4.0;
        root = root
            .child(
                el().key(format!("{index}-big-track"))
                    .size(inner, f.bar)
                    .radius(f.bar / 2.0)
                    .fill(f.track)
                    .pin(Some(pad), Some(top), None, None),
            )
            .child(bar(state, Bar::Compact, index, [pad, top, inner, f.bar]));
    }
    root
}

/// Relleno animado de una barra, sobre su pista.
fn bar(state: &Painter, kind: Bar, index: usize, area: [f32; 4]) -> El {
    let live = &state.bars[kind as usize];
    let [x, y, width, height] = area;
    el().key(format!("{index}-bar-{}", kind as usize))
        .size(width, height)
        .radius(height / 2.0)
        .pin(Some(x), Some(y), None, None)
        .live_rect(&live.rect)
        .live_fill(&live.fill)
}

fn gauge(state: &Painter, index: usize, y: f32, line: &Line, slot: Option<usize>, root: El) -> El {
    let Line::Gauge {
        bar: kind,
        pill,
        suffix,
        small,
        fraction,
        title,
        value,
        ..
    } = line
    else {
        return root;
    };
    let s = &state.style;
    let f = &s.fuel;
    let g = &s.geometry;
    let pad = state.pad();
    let width = state.plan.width;
    let inner = width - 2.0 * pad;
    let size = if *small {
        f.gauge_value_small
    } else {
        f.gauge_value
    };
    let suffix_width = if suffix.is_empty() {
        0.0
    } else {
        measure(
            s,
            suffix,
            Face::Body,
            f.gauge_suffix,
            f.gauge_value,
            400.0,
            0.0,
        )
    };
    let value_right = width - pad - suffix_width;
    let mut root = root
        .child(cell(
            s,
            title,
            format!("{index}-gauge-title"),
            [pad, y, inner, f.gauge_value],
            Face::Body,
            f.gauge_title,
            400.0,
            0.3,
            Align::Start,
            s.colors.muted,
            false,
        ))
        .child(cell(
            s,
            value,
            format!("{index}-gauge-value"),
            [0.0, y, value_right, f.gauge_value],
            Face::Display,
            size,
            600.0,
            0.5,
            Align::End,
            s.colors.text,
            false,
        ))
        .child(cell(
            s,
            suffix,
            format!("{index}-gauge-suffix"),
            [
                width - pad - suffix_width,
                y + 2.0,
                suffix_width,
                f.gauge_value,
            ],
            Face::Body,
            f.gauge_suffix,
            400.0,
            0.0,
            Align::Start,
            s.colors.muted,
            false,
        ));
    if let (Some(text), Some(slot)) = (pill, slot)
        && let Some(rect) = state.pills.get(slot)
    {
        let accent = state.options.accent(s);
        let width = pill_width(s, text);
        root = root.child(
            el().key(format!("{index}-gauge-pill"))
                .size(width, g.pill_height)
                .radius(g.chip_radius)
                .fill(alpha(accent, 0.2))
                .pin(Some(0.0), Some(0.0), None, None)
                .live_rect(rect)
                .child(cell(
                    s,
                    text,
                    format!("{index}-gauge-pill-text"),
                    [
                        g.pill_padding,
                        0.0,
                        width - 2.0 * g.pill_padding,
                        g.pill_height,
                    ],
                    Face::Body,
                    s.fonts.pill,
                    s.fonts.pill_weight,
                    s.fonts.pill_tracking,
                    Align::Start,
                    accent,
                    false,
                )),
        );
    }
    if fraction.is_some() {
        let top = y + f.gauge_height - f.gauge_bar - 8.0;
        root = root
            .child(
                el().key(format!("{index}-gauge-track"))
                    .size(inner, f.gauge_bar)
                    .radius(f.gauge_bar / 2.0)
                    .fill(f.track)
                    .pin(Some(pad), Some(top), None, None),
            )
            .child(bar(state, *kind, index, [pad, top, inner, f.gauge_bar]));
    }
    root
}

/// Etiqueta de fila: color de lectura, como `paint_row_text` en GPUI.
fn row_key_ink(style: &Style) -> Color {
    style.colors.text
}

fn row_line(state: &Painter, index: usize, y: f32, line: &Line, root: El) -> El {
    let Line::Row {
        key,
        value,
        tone,
        me,
    } = line
    else {
        return root;
    };
    let s = &state.style;
    let pad = state.pad();
    let width = state.plan.width;
    let mut root = root;
    if *me {
        let accent = state.options.accent(s);
        let x = pad - s.geometry.player_bleed;
        root = root.child(
            el().key(format!("{index}-row-me"))
                .size(width - 2.0 * x, s.geometry.row_height)
                .radius(state.options.variant(s).player_radius)
                .pin(Some(x), Some(y), None, None)
                .linear_gradient(
                    std::f32::consts::FRAC_PI_2,
                    [(0.0, alpha(accent, 0.32)), (1.0, alpha(accent, 0.06))],
                ),
        );
    }
    root.child(cell(
        s,
        key,
        format!("{index}-row-key"),
        [pad, y, width - 2.0 * pad, s.geometry.row_height],
        Face::Body,
        s.fuel.row_label,
        400.0,
        0.0,
        Align::Start,
        row_key_ink(s),
        false,
    ))
    .child(cell(
        s,
        value,
        format!("{index}-row-value"),
        [0.0, y, width - pad, s.geometry.row_height],
        Face::Mono,
        s.fonts.mono,
        400.0,
        0.0,
        Align::End,
        state.ink(*tone),
        false,
    ))
}

fn tiles_line(
    state: &Painter,
    index: usize,
    y: f32,
    tiles: &[(String, String, Ink)],
    root: El,
) -> El {
    let s = &state.style;
    let f = &s.fuel;
    let pad = state.pad();
    let inner = state.plan.width - 2.0 * pad;
    let top = y + f.tile_margin;
    let count = tiles.len().max(1) as f32;
    let cell_width = (inner - (count - 1.0)) / count;
    let mut root = root.child(
        el().key(format!("{index}-tiles"))
            .size(inner, f.tile_height)
            .radius(f.tile_radius)
            .fill(f.tile_line)
            .pin(Some(pad), Some(top), None, None),
    );
    for (column, (label, value, tone)) in tiles.iter().enumerate() {
        let x = pad + column as f32 * (cell_width + 1.0);
        let radius = if column == 0 || column + 1 == tiles.len() {
            f.tile_radius
        } else {
            0.0
        };
        root = root
            .child(
                el().key(format!("{index}-tile-{column}"))
                    .size(cell_width, f.tile_height)
                    .radius(radius)
                    .fill(f.tile_fill)
                    .pin(Some(x), Some(top), None, None),
            )
            .child(cell(
                s,
                label,
                format!("{index}-tile-label-{column}"),
                [x + 8.0, top + 6.0, cell_width - 16.0, 14.0],
                Face::Body,
                f.tile_label,
                400.0,
                0.3,
                Align::Start,
                s.colors.muted,
                false,
            ))
            .child(cell(
                s,
                value,
                format!("{index}-tile-value-{column}"),
                [x + 8.0, top + 20.0, cell_width - 12.0, f.tile_value],
                Face::Display,
                f.tile_value,
                600.0,
                0.3,
                Align::Start,
                state.ink(*tone),
                true,
            ));
    }
    root
}

fn sub(state: &Painter, index: usize, y: f32, left: &str, right: &str, root: El) -> El {
    let s = &state.style;
    let f = &s.fuel;
    let v = state.options.variant(s);
    let pad = v.padding_x;
    let width = state.plan.width;
    let height = f.sub_height - 6.0;
    root.child(cell(
        s,
        left,
        format!("{index}-sub-left"),
        [pad, y + 6.0, width - 2.0 * pad, height],
        Face::Body,
        v.header_size,
        400.0,
        v.header_tracking,
        Align::Start,
        v.header_color,
        false,
    ))
    .child(cell(
        s,
        right,
        format!("{index}-sub-right"),
        [0.0, y + 6.0, width - pad, height],
        Face::Body,
        v.header_size,
        400.0,
        v.header_tracking,
        Align::End,
        s.colors.header_em,
        false,
    ))
}

fn spark(state: &Painter, y: f32, values: &[f32], average: f32, root: El) -> El {
    let s = &state.style;
    let f = &s.fuel;
    let pad = state.pad();
    let width = state.plan.width;
    let inner = width - 2.0 * pad;
    let height = f.spark_height;
    let points: Vec<[f32; 2]> = (0..values.len())
        .map(|index| spark_point(index, values.len(), values[index], inner, height))
        .collect();
    let accent = state.options.accent(s);
    let mut root = root.child(
        el().key("spark-average")
            .size(inner, 1.0)
            .fill(f.average_line)
            .pin(
                Some(pad),
                Some(y + height - 2.0 - average * (height - 4.0)),
                None,
                None,
            ),
    );
    if points.len() >= 2 {
        root = root.child(
            canvas(Shape::new().stroke(points.clone(), f.spark_stroke, accent))
                .key("spark")
                .size(inner, height)
                .pin(Some(pad), Some(y), None, None),
        );
        let [x, top] = points[points.len() - 1];
        root = root.child(
            el().key("spark-dot")
                .size(2.0 * f.spark_dot, 2.0 * f.spark_dot)
                .radius(f.spark_dot)
                .fill(f.now)
                .pin(
                    Some(pad + x - f.spark_dot),
                    Some(y + top - f.spark_dot),
                    None,
                    None,
                ),
        );
    }
    root
}

fn window(state: &Painter, y: f32, open: f32, close: f32, root: El) -> El {
    let s = &state.style;
    let f = &s.fuel;
    let pad = state.pad();
    let inner = state.plan.width - 2.0 * pad;
    let accent = state.options.accent(s);
    root.child(
        el().key("window-track")
            .size(inner, 4.0)
            .radius(2.0)
            .fill(f.track)
            .pin(Some(pad), Some(y + 7.0), None, None),
    )
    .child(
        el().key("window")
            .size(((close - open) * inner).max(4.0), 8.0)
            .radius(2.0)
            .fill(alpha(accent, f.window_fill))
            .border(1.0, accent)
            .pin(Some(pad + open * inner), Some(y + 5.0), None, None)
            .live_rect(&state.window),
    )
    .child(
        el().key("window-marker")
            .size(2.0, 16.0)
            .radius(1.0)
            .fill(f.now)
            .pin(Some(pad), Some(y + 1.0), None, None)
            .live_rect(&state.bars[Bar::Now as usize].rect),
    )
}

fn window_labels(state: &Painter, index: usize, y: f32, texts: [&String; 3], root: El) -> El {
    let s = &state.style;
    let pad = state.pad();
    let width = state.plan.width;
    let height = s.fuel.window_labels;
    let ink = s.colors.column;
    let boxes = [
        ([pad, y, width - 2.0 * pad, height], Align::Start),
        ([0.0, y, width, height], Align::Center),
        ([0.0, y, width - pad, height], Align::End),
    ];
    let mut root = root;
    for (position, (area, align)) in boxes.into_iter().enumerate() {
        root = root.child(cell(
            s,
            texts[position],
            format!("{index}-window-{position}"),
            area,
            Face::Mono,
            10.0,
            400.0,
            0.0,
            align,
            ink,
            false,
        ));
    }
    root
}

#[allow(clippy::too_many_arguments)] // Pie: textos, píldora y pulso de espera.
fn footer(
    state: &Painter,
    index: usize,
    y: f32,
    left: &str,
    right: Option<&str>,
    pill: Option<&str>,
    pulse: bool,
    root: El,
) -> El {
    let s = &state.style;
    let g = &s.geometry;
    let c = &s.colors;
    let pad = state.pad();
    let width = state.plan.width;
    let top = y + g.footer_gap + 1.0 + g.footer_gap;
    let mut root = root.child(
        el().key(format!("{index}-footer-rule"))
            .size(width - 2.0 * pad, 1.0)
            .fill(c.line)
            .pin(Some(pad), Some(y + g.footer_gap), None, None),
    );
    let mut x = pad;
    if pulse {
        root = root.child(
            el().key(format!("{index}-footer-dot"))
                .size(g.pulse, g.pulse)
                .radius(g.pulse / 2.0)
                .fill(c.pulse)
                .pin(
                    Some(x),
                    Some(top + (g.footer_height - g.pulse) / 2.0),
                    None,
                    None,
                ),
        );
        x += g.pulse + 8.0;
    }
    root = root.child(cell(
        s,
        left,
        format!("{index}-footer-left"),
        [x, top, width - x - pad, g.footer_height],
        Face::Body,
        s.fonts.header,
        400.0,
        0.0,
        Align::Start,
        c.muted,
        false,
    ));
    if let Some(right) = right {
        root = root.child(cell(
            s,
            right,
            format!("{index}-footer-right"),
            [0.0, top, width - pad, g.footer_height],
            Face::Body,
            s.fonts.header,
            400.0,
            0.0,
            Align::End,
            c.muted,
            false,
        ));
    }
    if let Some(pill) = pill {
        let label = pill.to_uppercase();
        let width = pill_width(s, &label);
        root = root.child(
            el().key(format!("{index}-footer-pill"))
                .size(width, g.pill_height)
                .radius(g.chip_radius)
                .fill(c.stops_fill)
                .pin(
                    Some(state.plan.width - pad - width),
                    Some(
                        top + (g.footer_height - g.row_height) / 2.0
                            + (g.row_height - g.pill_height) / 2.0,
                    ),
                    None,
                    None,
                )
                .child(cell(
                    s,
                    &label,
                    format!("{index}-footer-pill-text"),
                    [
                        g.pill_padding,
                        0.0,
                        width - 2.0 * g.pill_padding,
                        g.pill_height,
                    ],
                    Face::Body,
                    s.fonts.pill,
                    s.fonts.pill_weight,
                    s.fonts.pill_tracking,
                    Align::Start,
                    c.stops_text,
                    false,
                )),
        );
    }
    root
}

fn banner(state: &Painter, band: Band, root: El) -> El {
    let s = &state.style;
    let g = &s.geometry;
    let f = &s.fuel;
    let c = &s.colors;
    let v = state.options.variant(s);
    let es = state.prefs.language == vantare_domain::format::Language::Es;
    let pad = v.padding_x;
    let width = state.plan.width;
    let (fill, ink, line, chequered, title, right) = match band {
        Band::Low => (
            f.low_fill,
            f.low_text,
            None,
            false,
            if es { "Combustible bajo" } else { "Low fuel" }.to_owned(),
            Some(
                if es {
                    "entra esta vuelta"
                } else {
                    "pit this lap"
                }
                .to_owned(),
            ),
        ),
        Band::Pits => (
            c.stops_fill,
            c.text,
            Some(c.line),
            false,
            if es { "En boxes" } else { "In the pits" }.to_owned(),
            None,
        ),
        Band::Fcy => (c.fcy_fill, c.fcy_text, None, false, "FCY".to_owned(), None),
        Band::Yellow(sector) => (
            c.yellow_fill,
            c.yellow_text,
            Some(c.yellow_line),
            false,
            format!(
                "{} · Sector {sector}",
                if es { "Amarilla" } else { "Yellow" }
            ),
            None,
        ),
        Band::Final(lap, total) => (
            c.final_fill,
            c.final_text,
            None,
            true,
            if es { "Última vuelta" } else { "Final lap" }.to_owned(),
            Some(format!("{lap}/{total}")),
        ),
    };
    let radius = (v.radius - 1.0).max(0.0);
    let mut root = root.child(
        el().key("banner")
            .size(width, g.banner_height)
            .corners([radius, radius, 0.0, 0.0])
            .fill(fill)
            .pin(Some(0.0), Some(0.0), None, None),
    );
    if let Some(line) = line {
        root = root.child(el().key("banner-line").size(width, 1.0).fill(line).pin(
            Some(0.0),
            Some(g.banner_height - 1.0),
            None,
            None,
        ));
    }
    let mut x = pad;
    if chequered {
        let top = (g.banner_height - 8.0) / 2.0;
        for (index, (col, row)) in [(0, 0), (2, 0), (1, 1), (3, 1)].into_iter().enumerate() {
            root = root.child(
                el().key(format!("chequered-{index}"))
                    .size(4.0, 4.0)
                    .fill(ink)
                    .pin(
                        Some(x + col as f32 * 4.0),
                        Some(top + row as f32 * 4.0),
                        None,
                        None,
                    ),
            );
        }
        x += 16.0 + 8.0;
    }
    if let Some(right) = right {
        root = root.child(cell(
            s,
            &right,
            "banner-right".to_owned(),
            [0.0, 0.0, width - pad, g.banner_height],
            Face::Mono,
            s.fonts.mono_small,
            400.0,
            0.0,
            Align::End,
            ink,
            false,
        ));
    }
    root.child(cell(
        s,
        &title.to_uppercase(),
        "banner-title".to_owned(),
        [x, 0.0, width - x - pad, g.banner_height],
        Face::Display,
        s.fonts.banner,
        600.0,
        s.fonts.banner_tracking,
        Align::Start,
        ink,
        false,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_texts_keep_the_canonical_baseline_shift() {
        let style = Style::compiled();
        assert_eq!(shift(&style, Face::Body, 10.0), 10.0);
        assert_eq!(shift(&style, Face::Mono, 10.0), 10.0);
        assert_eq!(
            shift(&style, Face::Display, 10.0),
            10.0 + style.fonts.display_baseline
        );
        assert!(style.fonts.display_baseline >= 1.0, "1 px como GPUI");
    }

    #[test]
    fn spark_points_are_local_to_the_canvas() {
        let style = Style::compiled();
        let height = style.fuel.spark_height;
        let inner = 436.0;
        let low = spark_point(0, 4, 0.0, inner, height);
        let high = spark_point(3, 4, 1.0, inner, height);
        assert_eq!(low, [2.0, height - 2.0]);
        assert_eq!(high, [inner - 2.0, 2.0]);
        for index in 0..4 {
            let [x, y] = spark_point(index, 4, 0.5, inner, height);
            assert!((2.0..=inner - 2.0).contains(&x));
            assert!(
                (2.0..=height - 2.0).contains(&y),
                "y local dentro del lienzo"
            );
        }
    }

    #[test]
    fn row_labels_use_the_reading_ink_not_the_muted_one() {
        let style = Style::compiled();
        assert_eq!(row_key_ink(&style), style.colors.text);
        assert_ne!(row_key_ink(&style), style.colors.muted);
    }
}
