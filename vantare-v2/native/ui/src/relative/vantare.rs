//! Relative en el sistema de diseño Vantare (#1497), según el catálogo r10b.
//!
//! El ViewModel es puro (`vantare_domain::relative`); aquí se decide
//! la geometría y se pinta con el kit Vantare (`crate::vantare`): columnas en
//! el orden de `columns` (el punto de clase queda fijo a la izquierda), tira de
//! pista opcional, avisos de tráfico y boxes, y movimiento de filas y puntos.

use crate::app::Wake;
use crate::efficiency::preview::PaintWindow as Window;
use crate::efficiency::text;
use crate::standings::{Accent, Look};
use crate::vantare::columns::ColumnBoxes;
use crate::vantare::motion::{Flash, Motion, Sample};
use crate::vantare::paint::{BOX, Face, Kit, WHITE, estimate, estimate_mono, round_rect};
use crate::vantare::style::{Color, Style, Variant, with_opacity};
use gpui::{App, BorderStyle, Corners, Edges, px, quad};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};
use vantare_domain::DriverRating;
use vantare_domain::SourceState;
#[cfg(test)]
use vantare_domain::format::Preferences;
use vantare_domain::format::{Language, PLACEHOLDER};
use vantare_domain::relative::{Banner, Board, Row, Side};

// ---------------------------------------------------------------------------
// Opciones
// ---------------------------------------------------------------------------

/// Columna colocable; el punto de clase va siempre primero y no está aquí.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Kind {
    Position,
    Number,
    Driver,
    Laps,
    Rating,
    Safety,
    Trend,
    Gap,
}

impl Kind {
    fn from_metric(metric: &str) -> Option<Self> {
        Some(match metric {
            "position" => Self::Position,
            "carNumber" | "driverNumber" => Self::Number,
            "driverName" => Self::Driver,
            "lapDelta" => Self::Laps,
            "driverRating" => Self::Rating,
            "safetyRating" => Self::Safety,
            "trend" => Self::Trend,
            "gap" => Self::Gap,
            _ => return None,
        })
    }

    pub(crate) fn metric(self) -> &'static str {
        match self {
            Self::Position => "position",
            Self::Number => "carNumber",
            Self::Driver => "driverName",
            Self::Laps => "lapDelta",
            Self::Rating => "driverRating",
            Self::Safety => "safetyRating",
            Self::Trend => "trend",
            Self::Gap => "gap",
        }
    }
}

/// Anchura máxima del piloto (`widthPreset`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Preset {
    Sm,
    Md,
    Lg,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Cols {
    pub order: Vec<Kind>,
    pub vehicle: bool,
    pub strip: bool,
    pub driver: Preset,
}

impl Cols {
    fn from_settings(columns: &[crate::standings::options::ColumnSetting]) -> Self {
        let mut order: Vec<Kind> = Vec::new();
        for column in columns {
            if let Some(kind) = Kind::from_metric(&column.metric_id)
                && (column.enabled || kind == Kind::Driver)
                && !order.contains(&kind)
            {
                order.push(kind);
            }
        }
        if !order.contains(&Kind::Driver) {
            let at = order
                .iter()
                .position(|k| *k == Kind::Number)
                .map_or(0, |i| i + 1);
            order.insert(at, Kind::Driver);
        }
        let on = |id: &str| columns.iter().any(|c| c.enabled && c.metric_id == id);
        Self {
            order,
            vehicle: on("vehicle"),
            strip: on("trackStrip"),
            driver: match columns
                .iter()
                .find(|c| c.metric_id == "driverName")
                .map(|c| c.width_preset.as_str())
            {
                Some("sm" | "xs") => Preset::Sm,
                Some("lg") => Preset::Lg,
                _ => Preset::Md,
            },
        }
    }

    fn has(&self, kind: Kind) -> bool {
        self.order.contains(&kind)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Options {
    pub look: Look,
    pub accent: Accent,
    pub cols: Cols,
    pub ahead: usize,
    pub behind: usize,
    pub same_class: bool,
    pub name_mode: String,
    pub name_max: usize,
    /// Marca Vantare en la cabecera (`brandVisible`, decidido por la licencia).
    pub brand: bool,
}

impl Options {
    pub(crate) fn from_settings(settings: &super::Settings) -> Self {
        let columns = settings
            .columns
            .clone()
            .unwrap_or_else(|| super::vantare_template("standard"));
        let driver = columns.iter().find(|c| c.metric_id == "driverName");
        Self {
            look: settings.style,
            accent: settings.accent,
            cols: Cols::from_settings(&columns),
            ahead: settings.range_ahead.min(8),
            behind: settings.range_behind.min(8),
            same_class: settings.class_scope == "sameClass",
            name_mode: driver.map(|c| c.format.mode.clone()).unwrap_or_default(),
            name_max: driver
                .and_then(|c| c.format.max_chars)
                .unwrap_or(16)
                .min(64),
            brand: settings.brand_visible == Some(true),
        }
    }

    fn variant<'a>(&self, style: &'a Style) -> &'a Variant {
        match self.look {
            Look::Neo => &style.styles.neo,
            Look::Neutro => &style.styles.neutro,
        }
    }

    fn accent(&self, style: &Style) -> Color {
        match self.accent {
            Accent::Red => style.accents.red,
            Accent::Amber => style.accents.amber,
            Accent::Green => style.accents.green,
            Accent::White => style.accents.white,
        }
    }

    fn driver_max(&self, style: &Style) -> f32 {
        let r = &style.relative;
        match self.cols.driver {
            Preset::Sm => r.driver_sm,
            Preset::Md => r.driver_md,
            Preset::Lg => r.driver_lg,
        }
    }

    /// Columnas colocadas de izquierda a derecha y ancho total del panel.
    fn layout(
        &self,
        style: &Style,
        driver: f32,
        gap_width: f32,
        order: &[Kind],
    ) -> (Vec<Placed>, f32) {
        let g = &style.geometry;
        let r = &style.relative;
        let gap = g.cell_gap;
        let mut x = self.variant(style).padding_x + g.class_dot;
        let mut placed = Vec::with_capacity(order.len());
        for &kind in order {
            let width = match kind {
                Kind::Position => r.col_position,
                Kind::Number => g.number_min_width,
                Kind::Driver => driver,
                Kind::Laps => r.col_laps,
                Kind::Rating => r.col_rating,
                Kind::Safety => r.col_safety,
                Kind::Trend => r.col_trend,
                Kind::Gap => gap_width,
            };
            x += gap;
            placed.push(Placed { kind, x, width });
            x += width;
        }
        (placed, x + self.variant(style).padding_x)
    }

    fn slots(&self) -> usize {
        self.ahead + self.behind + 1
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Placed {
    pub kind: Kind,
    pub x: f32,
    pub width: f32,
}

/// Coche junto al piloto: con dorsal propio, el coche completo; sin él, la
/// marca y el dorsal (`Ferrari #50`), como el catálogo.
fn vehicle_detail(vehicle: &str, number: &str, cols: &Cols) -> String {
    if !cols.vehicle {
        return String::new();
    }
    let number = (!cols.has(Kind::Number) && !number.is_empty()).then(|| format!(" #{number}"));
    let vehicle = if cols.has(Kind::Number) {
        vehicle.to_owned()
    } else {
        vehicle.split_whitespace().next().unwrap_or("").to_owned()
    };
    let detail = format!("{vehicle}{}", number.unwrap_or_default());
    let detail = detail.trim();
    if detail.is_empty() {
        String::new()
    } else {
        format!(" · {detail}")
    }
}

fn driver_text(driver: &str, options: &Options) -> String {
    if driver.is_empty() {
        PLACEHOLDER.to_owned()
    } else {
        vantare_domain::standings::driver_name(driver, &options.name_mode, options.name_max)
    }
}

/// Piloto ajustado al nombre más largo de la sesión, sin pasar del preset.
fn driver_width(board: Option<&Board>, options: &Options, style: &Style) -> f32 {
    let max = options.driver_max(style);
    let widest = board
        .into_iter()
        .flat_map(|b| &b.names)
        .filter(|name| name.visible)
        .map(|name| {
            let (driver, vehicle, number) = (&name.driver, &name.vehicle, &name.number);
            estimate(&driver_text(driver, options), style.fonts.body)
                + estimate(
                    &vehicle_detail(vehicle, number, &options.cols),
                    style.fonts.small,
                )
        })
        .fold(0.0_f32, f32::max);
    if widest <= 0.0 {
        return max;
    }
    (widest + 4.0).clamp(style.geometry.driver_xs.min(max), max)
}

/// Gap ajustado al valor más ancho de las filas visibles (`+10.0` ocupa más
/// que `-3.8`), sin pasar del ancho del estilo.
fn gap_width(board: Option<&Board>, style: &Style) -> f32 {
    let max = style.relative.col_gap;
    let widest = board
        .into_iter()
        .flat_map(|b| b.slots.iter().flatten())
        .map(|row| estimate_mono(&row.rich_gap, style.fonts.mono))
        .fold(0.0_f32, f32::max);
    if widest <= 0.0 {
        return max;
    }
    (widest + 2.0).min(max)
}

// ---------------------------------------------------------------------------
// Layout (puro)
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Item {
    Banner,
    Header,
    Strip,
    Slot(usize),
    Skeleton(usize, bool),
    Footer(Footer),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Footer {
    Waiting,
    Traffic,
    Pits,
    Legend,
}

#[derive(Clone, Debug, PartialEq)]
struct Plan {
    width: f32,
    height: f32,
    items: Vec<(f32, Item)>,
    columns: Vec<Placed>,
    /// Franja vertical de las filas (para editar columnas).
    rows: (f32, f32),
}

fn waiting(board: Option<&Board>) -> bool {
    board.is_none_or(|b| {
        !b.player_present || matches!(b.source_state, SourceState::Waiting | SourceState::Lost)
    })
}

fn plan(board: Option<&Board>, options: &Options, style: &Style) -> Plan {
    #[cfg(feature = "parity-capture")]
    crate::benchmark::mark(crate::benchmark::Work::Plan);
    let variant = options.variant(style);
    let g = &style.geometry;
    let shown = board.filter(|b| !waiting(Some(b)));
    // Vueltas de diferencia y tendencia suelen ir vacías: no ocupan sitio
    // mientras ningún coche visible tenga dato (la tendencia no se pinta en FCY).
    let order: Vec<Kind> = options
        .cols
        .order
        .iter()
        .copied()
        .filter(|kind| {
            let rows = || shown.into_iter().flat_map(|b| b.slots.iter().flatten());
            match kind {
                Kind::Laps => rows().any(|row| row.lap_delta.is_some_and(|v| v != 0)),
                Kind::Trend => {
                    shown.is_some_and(|b| b.banner != Some(Banner::FullCourseYellow))
                        && rows().any(|row| row.trend.is_some())
                }
                _ => true,
            }
        })
        .collect();
    let (columns, width) = options.layout(
        style,
        driver_width(shown, options, style),
        gap_width(shown, style),
        &order,
    );
    let mut items = Vec::new();
    let mut y = variant.padding_y;
    if shown.is_some_and(|b| b.banner.is_some()) {
        items.push((0.0, Item::Banner));
        y = g.banner_height + g.banner_gap;
    }
    items.push((y, Item::Header));
    y += variant.header_height + variant.header_gap;
    let top;
    let bottom;
    match shown {
        None => {
            top = y;
            for index in 0..options.slots() {
                items.push((y, Item::Skeleton(index, index == options.ahead)));
                y += g.row_height;
            }
            bottom = y;
            y += g.footer_gap;
            items.push((y, Item::Footer(Footer::Waiting)));
            y += 1.0 + g.footer_gap + g.footer_height;
        }
        Some(board) => {
            if options.cols.strip {
                items.push((y, Item::Strip));
                y += style.relative.strip_height + style.relative.strip_gap;
            }
            top = y;
            // Solo los huecos con coche: el panel se ajusta a los que hay.
            for (index, _) in board.slots.iter().enumerate().filter(|(_, s)| s.is_some()) {
                items.push((y, Item::Slot(index)));
                y += g.row_height;
            }
            bottom = y;
            let mut footers = Vec::new();
            if board.player_in_pits && board.pit_exit.is_some() {
                footers.push(Footer::Pits);
            }
            if board.traffic.is_some() {
                footers.push(Footer::Traffic);
            }
            if options.cols.has(Kind::Trend) {
                footers.push(Footer::Legend);
            }
            for footer in footers {
                y += g.footer_gap;
                items.push((y, Item::Footer(footer)));
                y += 1.0 + g.footer_gap + g.footer_height;
            }
        }
    }
    let rows = (top, bottom.max(top + g.row_height));
    Plan {
        width,
        height: y + variant.padding_y,
        items,
        columns,
        rows,
    }
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

/// Texto del Look activo, preparado al cambiar datos o idioma, nunca por frame.
struct Labels {
    language: Language,
    header: String,
    yellow: String,
    traffic: String,
    exit: String,
    loss: String,
    rows: Vec<Option<RowLabels>>,
    fitted: OnceLock<Vec<Option<Fitted>>>,
}
struct RowLabels {
    number: String,
    driver: String,
    detail: String,
    laps: String,
    trend: String,
}
struct Fitted {
    driver: String,
    detail: String,
    used: f32,
}
impl Labels {
    fn new(board: Option<&Board>, options: &Options, language: Language) -> Self {
        #[cfg(feature = "parity-capture")]
        crate::benchmark::mark(crate::benchmark::Work::Labels);
        let es = language == Language::Es;
        let range = format!("±{}", options.ahead.max(options.behind));
        Self {
            language,
            header: board.and_then(|b| b.slower_class.as_ref()).map_or_else(
                || range.clone(),
                |class| format!("{} · {range}", class.to_uppercase()),
            ),
            yellow: match board.and_then(|b| b.banner.as_ref()) {
                Some(Banner::LocalYellow(sector)) => format!(
                    "{} · Sector {sector}",
                    if es { "Amarilla" } else { "Yellow" }
                ),
                _ => String::new(),
            },
            traffic: board
                .and_then(|b| b.traffic.as_ref())
                .map_or_else(String::new, |t| {
                    format!(
                        "{} {} {}",
                        t.count,
                        t.class,
                        if es { "a menos de 6 s" } else { "within 6 s" }
                    )
                }),
            exit: board
                .and_then(|b| b.pit_exit.as_ref())
                .map_or_else(String::new, |exit| match (&exit.ahead, &exit.behind, es) {
                    (Some(a), Some(b), true) => format!("Sales entre {a} y {b}"),
                    (Some(a), Some(b), false) => format!("You rejoin between {a} and {b}"),
                    (Some(a), None, true) => format!("Sales tras {a}"),
                    (Some(a), None, false) => format!("You rejoin behind {a}"),
                    (None, Some(b), true) => format!("Sales delante de {b}"),
                    (None, Some(b), false) => format!("You rejoin ahead of {b}"),
                    (None, None, true) => "Sales con pista libre".to_owned(),
                    (None, None, false) => "You rejoin on a clear track".to_owned(),
                }),
            loss: board
                .and_then(|b| b.pit_exit.as_ref())
                .map_or_else(String::new, |exit| {
                    format!("{} {}", if es { "pérdida" } else { "loss" }, exit.loss)
                }),
            rows: board
                .into_iter()
                .flat_map(|b| &b.slots)
                .map(|row| {
                    row.as_ref().map(|row| RowLabels {
                        number: if row.number.is_empty() {
                            PLACEHOLDER.to_owned()
                        } else {
                            format!("#{}", row.number)
                        },
                        driver: driver_text(&row.driver, options),
                        detail: vehicle_detail(&row.vehicle, &row.number, &options.cols),
                        laps: row
                            .lap_delta
                            .filter(|n| *n != 0)
                            .map_or_else(String::new, |n| {
                                format!(
                                    "{}{} {}",
                                    if n < 0 { "−" } else { "+" },
                                    n.unsigned_abs(),
                                    if es { "V" } else { "L" }
                                )
                            }),
                        trend: row.trend.as_ref().map_or_else(String::new, |t| {
                            format!("{} {}", if t.closing { "▲" } else { "▼" }, t.value)
                        }),
                    })
                })
                .collect(),
            fitted: OnceLock::new(),
        }
    }
    fn prepare(
        &self,
        board: Option<&Board>,
        plan: &Plan,
        kit: &Kit<'_>,
        window: &Window,
    ) -> Vec<Option<Fitted>> {
        let f = &kit.style.fonts;
        let c = &kit.style.colors;
        let ink = kit.ink(Face::Body, f.body, 0.0, c.text.hsla());
        let small = kit.ink(Face::Body, f.small, 0.0, c.muted.hsla());
        let column = plan.columns.iter().find(|c| c.kind == Kind::Driver);
        self.rows
            .iter()
            .enumerate()
            .map(|(i, row)| {
                let row = row.as_ref()?;
                let column = column?;
                let in_pits = board?.slots[i].as_ref()?.in_pits;
                let available = (column.width
                    - if in_pits {
                        kit.pill_width(window, BOX) + kit.style.geometry.cell_gap
                    } else {
                        0.0
                    })
                .max(0.0);
                let driver = text::fit(window, &row.driver, &ink, available);
                let used = text::width(window, &driver, &ink);
                let rest = available - used;
                let detail = if !row.detail.is_empty() && rest > 12.0 {
                    text::fit(window, &row.detail, &small, rest)
                } else {
                    String::new()
                };
                Some(Fitted {
                    driver,
                    detail,
                    used,
                })
            })
            .collect()
    }
}

#[derive(Clone)]
pub(crate) struct Visual {
    pub options: Arc<Options>,
    pub style: Arc<Style>,
    pub board: Option<Arc<Board>>,
    plan: Arc<Plan>,
    labels: Arc<Labels>,
}

impl Visual {
    pub(crate) fn new(options: Options) -> Self {
        let style = Style::compiled();
        let plan = plan(None, &options, &style);
        let labels = Labels::new(None, &options, Language::Es);
        Self {
            options: Arc::new(options),
            style,
            board: None,
            plan: Arc::new(plan),
            labels: Arc::new(labels),
        }
    }

    /// Filas visibles: el lado decide los destellos (pasar de delante a
    /// detrás es adelantar; de detrás a delante, ser adelantado).
    pub(crate) fn row_samples(&self) -> Vec<Sample> {
        let Some(board) = &self.board else {
            return Vec::new();
        };
        self.plan
            .items
            .iter()
            .filter_map(|&(y, item)| {
                let Item::Slot(index) = item else { return None };
                let row = board.slots.get(index)?.as_ref()?;
                Some(Sample {
                    id: row.id,
                    y,
                    position: match row.side {
                        Side::Ahead => 2,
                        Side::Player => 1,
                        Side::Behind => 0,
                    },
                    fastest: false,
                    in_pits: row.in_pits,
                    leader: false,
                })
            })
            .collect()
    }

    /// Puntos de la tira: la x es su «posición» y se desliza al cambiar.
    pub(crate) fn dot_samples(&self) -> Vec<Sample> {
        let Some(board) = &self.board else {
            return Vec::new();
        };
        board
            .strip
            .iter()
            .map(|dot| Sample {
                id: dot.id,
                y: strip_x(&self.plan, &self.options, &self.style, dot.offset_s),
                position: 0,
                fastest: false,
                in_pits: false,
                leader: false,
            })
            .collect()
    }

    pub(crate) fn ingest_shared(
        &mut self,
        board: Arc<Board>,
        movement: &mut Arc<Movement>,
    ) -> bool {
        if self
            .board
            .as_deref()
            .is_some_and(|old| same_visible(old, &board))
        {
            self.board = Some(board);
            return false;
        }
        self.board = Some(board);
        self.plan = Arc::new(plan(self.board.as_deref(), &self.options, &self.style));
        self.relabel(self.labels.language);
        let movement = Arc::make_mut(movement);
        let timing = self.style.motion.timing();
        let now = Instant::now();
        let rows = self.row_samples();
        movement.rows.update_rows(
            self.board.as_deref().expect("Board adjunto"),
            &rows,
            timing,
            now,
        );
        let dots = self.dot_samples();
        movement.dots.update(&dots, timing, now);
        true
    }

    pub(super) fn attach(&mut self, board: Arc<Board>, motion: &mut Movement) {
        self.board = Some(board);
        self.plan = Arc::new(plan(self.board.as_deref(), &self.options, &self.style));
        self.relabel(self.labels.language);
        motion.rows.relayout(
            self.board.as_deref().expect("Board adjunto"),
            &self.row_samples(),
            self.style.geometry.row_height,
            self.plan.rows.0,
        );
        motion.dots.attach(&self.dot_samples());
    }
    pub(crate) fn set_style(&mut self, style: Arc<Style>, movement: &mut Movement) {
        self.style = style;
        self.plan = Arc::new(plan(self.board.as_deref(), &self.options, &self.style));
        self.relabel(self.labels.language);
        let rows = self.row_samples();
        movement.rows.snap(&rows);
        let dots = self.dot_samples();
        movement.dots.snap(&dots);
    }

    pub(crate) fn size(&self) -> (f32, f32) {
        (self.plan.width, self.plan.height)
    }

    fn relabel(&mut self, language: Language) {
        self.labels = Arc::new(Labels::new(self.board.as_deref(), &self.options, language));
    }

    pub(crate) fn presentation(&mut self, language: Language) {
        if self.labels.language != language {
            self.relabel(language);
        }
    }

    fn traffic_pulsing(&self) -> bool {
        self.board.as_deref().is_some_and(|b| {
            b.banner != Some(Banner::FullCourseYellow)
                && b.slots.iter().flatten().any(|row| row.fast_traffic)
        })
    }

    pub(crate) fn wake(&self, movement: &Movement, now: Instant) -> Wake {
        let timing = self.style.motion.timing();
        match (
            movement.rows.wake(timing, now),
            movement.dots.wake(timing, now),
        ) {
            (Wake::Frame, _) | (_, Wake::Frame) => Wake::Frame,
            // El pulso de tráfico es lento: unos 20 fotogramas por segundo bastan.
            _ if self.traffic_pulsing() => Wake::At(Duration::from_millis(50)),
            _ => Wake::Idle,
        }
    }

    pub(crate) fn columns(&self) -> Option<ColumnBoxes> {
        if waiting(self.board.as_deref()) {
            return None;
        }
        Some(ColumnBoxes {
            columns: self
                .plan
                .columns
                .iter()
                .map(|c| (c.kind.metric(), c.x, c.width))
                .collect(),
            top: self.plan.rows.0,
            bottom: self.plan.rows.1,
            gap: self.style.geometry.cell_gap,
        })
    }

    pub(crate) fn paint(
        &self,
        movement: &Movement,
        language: Language,
        window: &mut Window,
        cx: &mut App,
    ) {
        let kit = Kit {
            style: &self.style,
            variant: self.options.variant(&self.style),
            accent: self.options.accent(&self.style),
            language,
            width: self.plan.width,
        };
        // El ajuste real necesita la ventana/fuentes. Se prepara una vez por
        // Board/Presentation, antes de entrar en el pintor de solo lectura.
        let fitted = self.labels.fitted.get_or_init(|| {
            self.labels
                .prepare(self.board.as_deref(), &self.plan, &kit, window)
        });
        Painter {
            kit,
            options: &self.options,
            board: self.board.as_deref(),
            plan: &self.plan,
            labels: &self.labels,
            fitted,
            rows: &movement.rows,
            dots: &movement.dots,
            now: Instant::now(),
            started: movement.started,
        }
        .paint(window, cx);
    }
}

pub(crate) use super::motion::Motion as Movement;
fn same_visible(a: &Board, b: &Board) -> bool {
    (
        a.source_state,
        a.player_present,
        a.player_in_pits,
        a.pit_limiter,
        &a.banner,
        &a.strip,
        &a.slower_class,
        &a.traffic,
        &a.pit_exit,
    ) == (
        b.source_state,
        b.player_present,
        b.player_in_pits,
        b.pit_limiter,
        &b.banner,
        &b.strip,
        &b.slower_class,
        &b.traffic,
        &b.pit_exit,
    ) && a
        .names
        .iter()
        .filter(|n| n.visible)
        .map(|n| (&n.driver, &n.vehicle, &n.number))
        .eq(b
            .names
            .iter()
            .filter(|n| n.visible)
            .map(|n| (&n.driver, &n.vehicle, &n.number)))
        && a.slots.len() == b.slots.len()
        && a.slots.iter().zip(&b.slots).all(|(a, b)| match (a, b) {
            (None, None) => true,
            (Some(a), Some(b)) => {
                (
                    (
                        a.id,
                        a.side,
                        &a.class,
                        &a.class_position,
                        &a.number,
                        &a.driver,
                        &a.vehicle,
                    ),
                    (
                        a.lap_delta.filter(|v| *v != 0),
                        &a.rich_gap,
                        a.rating,
                        &a.safety,
                        &a.trend,
                        a.is_player,
                        a.in_pits,
                        a.fast_traffic,
                    ),
                ) == (
                    (
                        b.id,
                        b.side,
                        &b.class,
                        &b.class_position,
                        &b.number,
                        &b.driver,
                        &b.vehicle,
                    ),
                    (
                        b.lap_delta.filter(|v| *v != 0),
                        &b.rich_gap,
                        b.rating,
                        &b.safety,
                        &b.trend,
                        b.is_player,
                        b.in_pits,
                        b.fast_traffic,
                    ),
                )
            }
            _ => false,
        })
}
#[cfg(test)]
struct State {
    visual: Visual,
    movement: Arc<Movement>,
}
#[cfg(test)]
impl std::ops::Deref for State {
    type Target = Visual;
    fn deref(&self) -> &Visual {
        &self.visual
    }
}
#[cfg(test)]
impl State {
    fn new(options: Options) -> Self {
        Self {
            visual: Visual::new(options),
            movement: Arc::new(Movement::default()),
        }
    }
    fn project(&self, snapshot: &vantare_domain::Snapshot) -> Board {
        vantare_domain::relative::project_content(
            snapshot,
            Preferences::default(),
            vantare_domain::relative::Content {
                range_ahead: self.options.ahead,
                range_behind: self.options.behind,
                same_class: self.options.same_class,
                ..Default::default()
            },
        )
    }
    fn ingest(&mut self, board: Board) -> bool {
        self.visual
            .ingest_shared(Arc::new(board), &mut self.movement)
    }
    fn wake(&self, now: Instant) -> Wake {
        self.visual.wake(&self.movement, now)
    }
}

/// x de un punto de la tira para un gap con el signo de la tabla.
fn strip_x(plan: &Plan, options: &Options, style: &Style, offset_s: f64) -> f32 {
    let pad = options.variant(style).padding_x;
    let span = plan.width - 2.0 * pad;
    let t = ((offset_s + vantare_domain::relative::STRIP_S)
        / (2.0 * vantare_domain::relative::STRIP_S))
        .clamp(0.0, 1.0) as f32;
    pad + t * span
}

// ---------------------------------------------------------------------------
// Pintado
// ---------------------------------------------------------------------------

struct Painter<'a> {
    kit: Kit<'a>,
    options: &'a Options,
    board: Option<&'a Board>,
    plan: &'a Plan,
    labels: &'a Labels,
    fitted: &'a [Option<Fitted>],
    rows: &'a super::motion::Rows,
    dots: &'a Motion,
    now: Instant,
    started: Instant,
}

impl<'a> std::ops::Deref for Painter<'a> {
    type Target = Kit<'a>;
    fn deref(&self) -> &Self::Target {
        &self.kit
    }
}

impl Painter<'_> {
    fn paint(&self, window: &mut Window, cx: &mut App) {
        self.panel(window, self.plan.height);
        for &(y, item) in &self.plan.items {
            match item {
                Item::Banner => self.banner(window, cx),
                Item::Header => self.header(window, cx, y),
                Item::Strip => self.strip(window, cx, y),
                Item::Slot(index) => self.slot(window, cx, y, index),
                Item::Skeleton(index, me) => {
                    if me {
                        let own = if self.variant.player_white > 0.0 {
                            WHITE
                        } else {
                            self.accent
                        };
                        self.highlight(window, y, own, 0.6);
                    }
                    self.skeleton(window, y, index);
                }
                Item::Footer(footer) => self.footer(window, cx, y, footer),
            }
        }
    }

    fn banner(&self, window: &mut Window, cx: &mut App) {
        let Some(board) = self.board else { return };
        let Some(banner) = &board.banner else { return };
        let c = &self.style.colors;
        let es = self.es();
        match banner {
            Banner::FullCourseYellow => {
                self.band(window, cx, c.fcy_fill, c.fcy_text, "FCY", None, false, None);
            }
            Banner::LocalYellow(_) => {
                let line = Some(c.yellow_line);
                self.band(
                    window,
                    cx,
                    c.yellow_fill,
                    c.yellow_text,
                    &self.labels.yellow,
                    None,
                    false,
                    line,
                );
            }
            Banner::InPits => {
                let title = if es { "En boxes" } else { "In the pits" };
                let right = board
                    .pit_limiter
                    .then_some(if es { "limitador" } else { "limiter" });
                let line = Some(c.line);
                self.band(window, cx, c.stops_fill, c.text, title, right, false, line);
            }
        }
    }

    fn header(&self, window: &mut Window, cx: &mut App, y: f32) {
        let v = self.variant;
        let h = v.header_height - if v.header_rule > 0.0 { 6.0 } else { 0.0 };
        let (pad, w) = (v.padding_x, self.width);
        let face = if v.header_display {
            Face::Display
        } else {
            Face::Body
        };
        let ink = self.ink(
            face,
            v.header_size,
            v.header_tracking,
            v.header_color.hsla(),
        );
        self.label(window, cx, "RELATIVE", pad, None, y, h, face, &ink);
        let mut edge = w - pad;
        if self.options.brand {
            edge -= self.brand(window, cx, edge, y, h) + self.style.brand.margin;
        }
        self.label(
            window,
            cx,
            &self.labels.header,
            0.0,
            Some(edge),
            y,
            h,
            face,
            &ink,
        );
        if v.header_rule > 0.0 {
            round_rect(
                window,
                pad,
                y + v.header_height - 1.0,
                w - 2.0 * pad,
                1.0,
                0.0,
                self.accent.alpha(v.header_rule),
            );
        }
    }

    fn strip(&self, window: &mut Window, cx: &mut App, y: f32) {
        let Some(board) = self.board else { return };
        let r = &self.style.relative;
        let pad = self.variant.padding_x;
        let w = self.width;
        round_rect(
            window,
            pad,
            y + 10.0,
            w - 2.0 * pad,
            2.0,
            0.0,
            r.strip_line.hsla(),
        );
        round_rect(
            window,
            w / 2.0,
            y + 4.0,
            1.0,
            14.0,
            0.0,
            r.strip_tick.hsla(),
        );
        let ink = self.ink(Face::Mono, r.strip_label, 0.0, r.strip_text.hsla());
        self.label(
            window,
            cx,
            "−10 s",
            pad,
            None,
            y + 17.0,
            11.0,
            Face::Mono,
            &ink,
        );
        self.label(
            window,
            cx,
            "+10 s",
            0.0,
            Some(w - pad),
            y + 17.0,
            11.0,
            Face::Mono,
            &ink,
        );
        let timing = self.style.motion.timing();
        let mut me = None;
        for dot in &board.strip {
            let x = strip_x(self.plan, self.options, self.style, dot.offset_s)
                + self.dots.pose(dot.id, timing, self.now).offset;
            if dot.is_player {
                me = Some(x);
                continue;
            }
            let size = r.strip_dot;
            let class = self.style.class(&dot.class);
            round_rect(
                window,
                x - size / 2.0,
                y + 11.0 - size / 2.0,
                size,
                size,
                size / 2.0,
                class.dot.hsla(),
            );
        }
        if let Some(x) = me {
            let size = r.strip_me;
            window.paint_quad(quad(
                crate::efficiency::rect(x - size / 2.0, y + 11.0 - size / 2.0, size, size),
                Corners::all(px(size / 2.0)),
                self.accent.hsla(),
                Edges::all(px(2.0)),
                WHITE.hsla(),
                BorderStyle::default(),
            ));
        }
    }

    fn slot(&self, window: &mut Window, cx: &mut App, y: f32, index: usize) {
        let Some(row) = self
            .board
            .and_then(|b| b.slots.get(index))
            .and_then(Option::as_ref)
        else {
            return;
        };
        let pose = self.rows.pose(row.id, self.style.motion.timing(), self.now);
        let y = y + pose.offset;
        with_opacity(pose.alpha, || {
            self.row(window, cx, y, row, index, pose.flash);
        });
    }

    fn pulse(&self) -> f32 {
        let period = self.style.relative.pulse_ms.max(1.0) / 1000.0;
        let t = self
            .now
            .saturating_duration_since(self.started)
            .as_secs_f32()
            / period;
        0.5 - 0.5 * (t * std::f32::consts::TAU).cos()
    }

    fn row(
        &self,
        window: &mut Window,
        cx: &mut App,
        y: f32,
        row: &Row,
        index: usize,
        flash: Option<(Flash, f32)>,
    ) {
        let Some(board) = self.board else { return };
        let labels = self.labels.rows[index].as_ref().expect("fila presentada");
        let g = &self.style.geometry;
        let f = &self.style.fonts;
        let c = &self.style.colors;
        let r = &self.style.relative;
        let v = self.variant;
        let h = g.row_height;
        let fcy = board.banner == Some(Banner::FullCourseYellow);
        let strength = flash.map_or(0.0, |(_, s)| s);
        if row.is_player {
            let own = if v.player_white > 0.0 {
                WHITE
            } else {
                self.accent
            };
            self.highlight(window, y, own, 1.0 - strength);
        }
        if row.fast_traffic && !fcy {
            self.highlight(window, y, c.flash_loss, r.pulse_alpha * self.pulse());
        }
        if let Some((kind, strength)) = flash {
            let color = match kind {
                Flash::Gain | Flash::PersonalBest => c.flash_gain,
                Flash::Loss => c.flash_loss,
                Flash::Lead => c.leader,
                Flash::Best => c.purple,
                Flash::Pit => c.box_fill,
            };
            self.highlight(window, y, color, strength * self.style.motion.flash_boost);
        }
        let class = self.style.class(&row.class);
        self.class_dot(window, v.padding_x, y, class);
        for column in &self.plan.columns {
            let (x, right) = (column.x, column.x + column.width);
            match column.kind {
                Kind::Position => {
                    let ink = self.ink(Face::Display, r.position_size, 0.0, c.muted.hsla());
                    self.label(
                        window,
                        cx,
                        &row.class_position,
                        0.0,
                        Some(right),
                        y,
                        h,
                        Face::Display,
                        &ink,
                    );
                }
                Kind::Number => {
                    self.chip(window, cx, &labels.number, class, x, y);
                }
                Kind::Driver => {
                    let name_right = right;
                    if row.in_pits {
                        let width = self.pill_width(window, BOX);
                        self.pill(
                            window,
                            cx,
                            BOX,
                            name_right - width,
                            y,
                            c.box_fill.hsla(),
                            c.box_text.hsla(),
                        );
                    }
                    self.name(window, cx, index, x, y);
                }
                Kind::Laps => {
                    if let Some(laps) = row.lap_delta.filter(|v| *v != 0) {
                        let (fill, ink) = if laps < 0 {
                            (r.laps_down_fill, r.laps_down_text)
                        } else {
                            (r.laps_up_fill, r.laps_up_text)
                        };
                        self.pill(window, cx, &labels.laps, x, y, fill.hsla(), ink.hsla());
                    }
                }
                Kind::Rating => self.rating(window, cx, row.rating, x, column.width, y),
                Kind::Safety => {
                    let ink = self.ink(Face::Mono, f.mono, 0.0, c.muted.hsla());
                    self.label(
                        window,
                        cx,
                        &row.safety,
                        0.0,
                        Some(right),
                        y,
                        h,
                        Face::Mono,
                        &ink,
                    );
                }
                Kind::Trend => {
                    if let Some(trend) = row.trend.as_ref().filter(|_| !fcy) {
                        let color = if trend.good { c.gain } else { c.loss };
                        let ink = self.ink(Face::Mono, f.mono, 0.0, color.hsla());
                        self.label(
                            window,
                            cx,
                            &labels.trend,
                            0.0,
                            Some(right),
                            y,
                            h,
                            Face::Mono,
                            &ink,
                        );
                    }
                }
                Kind::Gap => {
                    let color = if fcy {
                        c.frozen
                    } else if row.is_player {
                        c.text
                    } else {
                        c.value
                    };
                    let ink = self.ink(Face::Mono, f.mono, 0.0, color.hsla());
                    self.label(
                        window,
                        cx,
                        &row.rich_gap,
                        0.0,
                        Some(right),
                        y,
                        h,
                        Face::Mono,
                        &ink,
                    );
                }
            }
        }
    }

    fn name(&self, window: &mut Window, cx: &mut App, index: usize, x: f32, y: f32) {
        let Some(name) = self.fitted[index].as_ref() else {
            return;
        };
        let f = &self.style.fonts;
        let c = &self.style.colors;
        let h = self.style.geometry.row_height;
        let ink = self.ink(Face::Body, f.body, 0.0, c.text.hsla());
        self.label(window, cx, &name.driver, x, None, y, h, Face::Body, &ink);
        if !name.detail.is_empty() {
            let small = self.ink(Face::Body, f.small, 0.0, c.muted.hsla());
            self.label(
                window,
                cx,
                &name.detail,
                x + name.used,
                None,
                y,
                h,
                Face::Body,
                &small,
            );
        }
    }

    fn rating(
        &self,
        window: &mut Window,
        cx: &mut App,
        rating: Option<DriverRating>,
        x: f32,
        width: f32,
        y: f32,
    ) {
        let r = &self.style.relative;
        let g = &self.style.geometry;
        let es = self.es();
        let Some(rating) = rating else {
            let ink = self.ink(
                Face::Body,
                self.style.fonts.small,
                0.0,
                self.style.colors.even.hsla(),
            );
            self.label(
                window,
                cx,
                PLACEHOLDER,
                x,
                None,
                y,
                g.row_height,
                Face::Body,
                &ink,
            );
            return;
        };
        let (label, fill, ink) = match (rating, es) {
            (DriverRating::Platinum, true) => ("PLATINO", r.platinum_fill, r.platinum_text),
            (DriverRating::Platinum, false) => ("PLATINUM", r.platinum_fill, r.platinum_text),
            (DriverRating::Gold, true) => ("ORO", r.gold_fill, r.gold_text),
            (DriverRating::Gold, false) => ("GOLD", r.gold_fill, r.gold_text),
            (DriverRating::Silver, true) => ("PLATA", r.silver_fill, r.silver_text),
            (DriverRating::Silver, false) => ("SILVER", r.silver_fill, r.silver_text),
            (DriverRating::Bronze, true) => ("BRONCE", r.bronze_fill, r.bronze_text),
            (DriverRating::Bronze, false) => ("BRONZE", r.bronze_fill, r.bronze_text),
        };
        // Píldora de ancho fijo con el texto centrado, como el catálogo.
        let top = y + (g.row_height - g.pill_height) / 2.0;
        round_rect(
            window,
            x,
            top,
            width,
            g.pill_height,
            g.chip_radius,
            fill.hsla(),
        );
        let ink = self.pill_ink(ink.hsla());
        let text_width = text::width(window, label, &ink);
        self.label(
            window,
            cx,
            label,
            x + (width - text_width) / 2.0,
            None,
            top,
            g.pill_height,
            Face::Body,
            &ink,
        );
    }

    fn footer(&self, window: &mut Window, cx: &mut App, y: f32, footer: Footer) {
        let g = &self.style.geometry;
        let f = &self.style.fonts;
        let c = &self.style.colors;
        let r = &self.style.relative;
        let (pad, w) = (self.variant.padding_x, self.width);
        self.rule(window, y);
        let top = y + 1.0 + g.footer_gap;
        let h = g.footer_height;
        let ink = self.ink(Face::Body, f.header, 0.0, c.muted.hsla());
        let es = self.es();
        match footer {
            Footer::Waiting => {
                let pulse = g.pulse;
                round_rect(
                    window,
                    pad,
                    top + (h - pulse) / 2.0,
                    pulse,
                    pulse,
                    pulse / 2.0,
                    c.pulse.hsla(),
                );
                let text = if es {
                    "Esperando al simulador"
                } else {
                    "Waiting for the simulator"
                };
                let x = pad + pulse + g.cell_gap;
                self.label(window, cx, text, x, None, top, h, Face::Body, &ink);
            }
            Footer::Traffic => {
                let arrow = self.ink(Face::Body, f.header, 0.0, c.loss.hsla());
                let mut x = pad;
                x += self.label(window, cx, "▲ ", x, None, top, h, Face::Body, &arrow);
                self.label(
                    window,
                    cx,
                    &self.labels.traffic,
                    x,
                    None,
                    top,
                    h,
                    Face::Body,
                    &ink,
                );
                let hint = if es {
                    "deja hueco en la curva"
                } else {
                    "leave room in the corner"
                };
                self.label(
                    window,
                    cx,
                    hint,
                    0.0,
                    Some(w - pad),
                    top,
                    h,
                    Face::Body,
                    &ink,
                );
            }
            Footer::Pits => {
                self.label(
                    window,
                    cx,
                    &self.labels.exit,
                    pad,
                    None,
                    top,
                    h,
                    Face::Body,
                    &ink,
                );
                self.label(
                    window,
                    cx,
                    &self.labels.loss,
                    0.0,
                    Some(w - pad),
                    top,
                    h,
                    Face::Body,
                    &ink,
                );
            }
            Footer::Legend => {
                let text = if es {
                    "▲▼ s/vuelta recortados"
                } else {
                    "▲▼ s/lap gained"
                };
                self.label(window, cx, text, pad, None, top, h, Face::Body, &ink);
                let (down, up) = if es {
                    ("doblado", "te dobla")
                } else {
                    ("lapped", "laps you")
                };
                let mut right = w - pad;
                right -= self.label(window, cx, up, 0.0, Some(right), top, h, Face::Body, &ink);
                let plus = if es { "+V" } else { "+L" };
                right -= 6.0 + self.pill_width(window, plus);
                self.pill(
                    window,
                    cx,
                    plus,
                    right,
                    top + (h - g.row_height) / 2.0,
                    r.laps_up_fill.hsla(),
                    r.laps_up_text.hsla(),
                );
                right -= g.cell_gap;
                right -= self.label(window, cx, down, 0.0, Some(right), top, h, Face::Body, &ink);
                let minus = if es { "−V" } else { "−L" };
                right -= 6.0 + self.pill_width(window, minus);
                self.pill(
                    window,
                    cx,
                    minus,
                    right,
                    top + (h - g.row_height) / 2.0,
                    r.laps_down_fill.hsla(),
                    r.laps_down_text.hsla(),
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_reuse_until_visible_facts_or_presentation_change() {
        let photos = frames(include_str!("../../fixtures/relative-vantare.scene.json"));
        let mut state = State::new(options("expanded"));
        state.ingest(state.project(&photos[0]));
        let labels = state.labels.clone();
        state.ingest(state.project(&photos[0]));
        state.visual.presentation(Language::Es);
        assert!(Arc::ptr_eq(&labels, &state.labels));
        state.visual.presentation(Language::En);
        assert!(!Arc::ptr_eq(&labels, &state.labels));
        assert!(
            state
                .labels
                .rows
                .iter()
                .flatten()
                .any(|row| row.laps.contains('L'))
        );
        let english = state.labels.clone();
        state.visual.presentation(Language::En);
        assert!(Arc::ptr_eq(&english, &state.labels));
        state.ingest(state.project(&photos[2]));
        assert!(!Arc::ptr_eq(&english, &state.labels));
        assert!(state.labels.exit.starts_with("You rejoin"));
        let current = state.labels.clone();
        let style = state.style.clone();
        state
            .visual
            .set_style(style, Arc::make_mut(&mut state.movement));
        assert!(
            !Arc::ptr_eq(&current, &state.labels),
            "fuentes/anchos invalidan ajuste"
        );
    }

    /// Opciones de una plantilla con su alcance (±2, ±3 o ±4), como Workshop.
    fn options(name: &str) -> Options {
        let range = match name {
            "compact" => 2,
            "expanded" => 4,
            _ => 3,
        };
        let mut options = Options::from_settings(&super::super::Settings {
            columns: Some(super::super::vantare_template(name)),
            range_ahead: range,
            range_behind: range,
            ..super::super::Settings::default()
        });
        // Las escenas del catálogo prueban también tráfico entre clases.
        // El filtro propio se verifica aparte; no depende del default de Studio.
        options.same_class = false;
        options
    }

    fn frames(json: &str) -> Vec<vantare_domain::Snapshot> {
        let scene: serde_json::Value = serde_json::from_str(json).expect("escena");
        scene["frames"]
            .as_array()
            .expect("fases")
            .iter()
            .map(|f| vantare_ipc::snapshot_from_json(&f["snapshot"].to_string()).expect("foto"))
            .collect()
    }

    #[test]
    fn templates_reproduce_the_catalogue_widths() {
        let style = Style::compiled();
        for (name, width) in [("compact", 280.0), ("standard", 420.0), ("expanded", 600.0)] {
            let options = options(name);
            let (_, w) = options.layout(
                &style,
                options.driver_max(&style),
                style.relative.col_gap,
                &options.cols.order,
            );
            assert_eq!(w, width, "{name}");
        }
        assert!(options("expanded").cols.strip && !options("standard").cols.strip);
    }

    #[test]
    fn catalogue_scene_paints_ratings_traffic_and_pit_exit() {
        let photos = frames(include_str!("../../fixtures/relative-vantare.scene.json"));
        let mut state = State::new(options("expanded"));
        state.ingest(state.project(&photos[0]));
        let board = state.board.as_deref().cloned().expect("tablero");
        let me = board
            .slots
            .iter()
            .flatten()
            .find(|r| r.is_player)
            .expect("jugador");
        assert_eq!(
            (me.rich_gap.as_ref(), me.class_position.as_ref()),
            ("0.0", "P3")
        );
        let jarvis = board.slots[0].as_ref().expect("Jarvis");
        assert_eq!(
            (jarvis.rich_gap.as_ref(), jarvis.lap_delta),
            ("-8.9", Some(-1))
        );
        assert_eq!(jarvis.rating, Some(DriverRating::Gold));
        assert_eq!(board.strip.len(), 9);
        let gt = state.project(&photos[1]);
        assert_eq!(gt.traffic.as_ref().map(|t| t.count), Some(2));
        assert_eq!(gt.slower_class.as_deref(), Some("LMGT3"));
        let pits = state.project(&photos[2]);
        let exit = pits.pit_exit.expect("salida");
        assert_eq!(exit.ahead.as_deref(), Some("Rossi (#46)"));
        assert_eq!(exit.behind.as_deref(), Some("Buemi (#8)"));
        assert_eq!(
            state.project(&photos[3]).banner,
            Some(Banner::FullCourseYellow)
        );
        assert!(!state.project(&photos[4]).player_present);
        let boxes = state.columns().expect("columnas editables");
        assert_eq!(boxes.columns.len(), options("expanded").cols.order.len());
    }

    #[test]
    fn empty_lap_and_trend_columns_take_no_space_until_some_car_has_data() {
        let photos = frames(include_str!("../../fixtures/relative-vantare.scene.json"));
        let mut options = options("expanded");
        options.same_class = true;
        let mut state = State::new(options);
        state.ingest(state.project(&photos[0]));
        let metrics: Vec<_> = state.plan.columns.iter().map(|c| c.kind).collect();
        assert!(!metrics.contains(&Kind::Laps), "ningún Hypercar doblado");
        assert!(metrics.contains(&Kind::Trend));
        let narrow = state.size().0;
        Arc::make_mut(&mut state.visual.options).same_class = false;
        state.ingest(state.project(&photos[0]));
        assert!(state.plan.columns.iter().any(|c| c.kind == Kind::Laps));
        assert!(
            state.size().0 > narrow,
            "aparece la columna y el panel se ensancha"
        );
        state.ingest(state.project(&photos[3]));
        assert!(
            !state.plan.columns.iter().any(|c| c.kind == Kind::Trend),
            "sin tendencia en FCY"
        );
    }

    #[test]
    fn brand_only_shows_when_the_host_decides_it() {
        let mut settings = super::super::Settings::default();
        assert!(
            !Options::from_settings(&settings).brand,
            "sin decisión, sin marca"
        );
        settings.brand_visible = Some(true);
        assert!(Options::from_settings(&settings).brand);
        let json = serde_json::to_value(super::super::Settings::default()).expect("json");
        assert!(
            json.get("brandVisible").is_none(),
            "no cambia el JSON guardado"
        );
    }

    #[test]
    fn gap_column_fits_the_widest_visible_gap() {
        let photos = frames(include_str!("../../fixtures/relative-vantare.scene.json"));
        let mut state = State::new(options("expanded"));
        state.ingest(state.project(&photos[0]));
        let gap = |state: &State| {
            state
                .plan
                .columns
                .iter()
                .find(|c| c.kind == Kind::Gap)
                .expect("gap")
                .width
        };
        let mut board = state.board.as_deref().cloned().expect("tablero");
        for row in board.slots.iter_mut().flatten() {
            Arc::make_mut(row).rich_gap = "+3.8".into();
        }
        let mut far = board.clone();
        if let Some(row) = far.slots.iter_mut().flatten().next() {
            Arc::make_mut(row).rich_gap = "+10.0".into();
        }
        state.ingest(far);
        let wide = gap(&state);
        state.ingest(board);
        assert!(gap(&state) < wide, "sin decenas la columna se estrecha");
        assert!(gap(&state) >= estimate_mono("+3.8", state.style.fonts.mono));
    }

    #[test]
    fn race_scene_flashes_overtakes_moves_dots_and_pulses_traffic() {
        let photos = frames(include_str!(
            "../../fixtures/relative-vantare-carrera.scene.json"
        ));
        let mut state = State::new(options("expanded"));
        let timing = state.style.motion.timing();
        let mut flashes = Vec::new();
        let mut dots_moved = false;
        for photo in &photos {
            assert!(state.ingest(state.project(photo)));
            let now = Instant::now();
            for sample in state.row_samples() {
                if let Some((flash, _)) = state.movement.rows.pose(sample.id, timing, now).flash {
                    flashes.push(flash);
                }
            }
            dots_moved |= state
                .dot_samples()
                .iter()
                .any(|s| state.movement.dots.pose(s.id, timing, now).offset != 0.0);
        }
        assert!(flashes.contains(&Flash::Gain), "adelantar destella verde");
        assert!(
            flashes.contains(&Flash::Loss),
            "ser adelantado destella rojo"
        );
        assert!(dots_moved, "los puntos de la tira se deslizan");
        // Con tráfico más rápido detrás el widget sigue pidiendo fotogramas lentos.
        let later = Instant::now() + timing.flash + timing.reorder;
        assert!(matches!(state.wake(later), Wake::At(_) | Wake::Idle));
    }
}
