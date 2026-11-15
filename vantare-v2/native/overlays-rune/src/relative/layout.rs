//! Pure Vantare column order, sizes, footer selection and labels ported from GPUI.
use crate::vantare::{Style, Variant, waiting};
use rune::Color;
use vantare_domain::{
    format::{Language, PLACEHOLDER},
    relative::{Banner, Board, Side},
    widget_settings::look::{Accent, Tone},
};
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
    fn from_settings(columns: &[vantare_domain::widget_settings::columns::ColumnSetting]) -> Self {
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

    pub(super) fn has(&self, kind: Kind) -> bool {
        self.order.contains(&kind)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Options {
    pub look: Tone,
    pub accent: Accent,
    pub cols: Cols,
    pub ahead: usize,
    pub behind: usize,
    pub name_mode: String,
    pub name_max: usize,
    /// Marca Vantare en la cabecera (`brandVisible`, decidido por la licencia).
    pub brand: bool,
}

impl Options {
    pub(crate) fn from_settings(
        settings: &vantare_domain::widget_settings::relative::Settings,
    ) -> Self {
        let columns = settings.columns.clone().unwrap_or_else(|| {
            vantare_domain::widget_settings::relative::vantare_template("standard")
        });
        let driver = columns.iter().find(|c| c.metric_id == "driverName");
        Self {
            look: settings.style,
            accent: settings.accent,
            cols: Cols::from_settings(&columns),
            ahead: settings
                .range_ahead
                .min(vantare_domain::widget_settings::relative::RELATIVE_RANGE_MAX),
            behind: settings
                .range_behind
                .min(vantare_domain::widget_settings::relative::RELATIVE_RANGE_MAX),
            name_mode: driver.map_or_default(|c| c.format.mode.clone()),
            name_max: driver
                .and_then(|c| c.format.max_chars)
                .unwrap_or(16)
                .min(vantare_domain::widget_settings::columns::MAX_CHARS_LIMIT),
            brand: settings.brand_visible == Some(true),
        }
    }

    pub(super) fn variant<'a>(&self, style: &'a Style) -> &'a Variant {
        match self.look {
            Tone::Neo => &style.styles.neo,
            Tone::Neutro => &style.styles.neutro,
        }
    }

    pub(super) fn accent(&self, style: &Style) -> Color {
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
            Preset::Lg if self.cols.has(Kind::Number) && !self.cols.has(Kind::Position) => {
                r.driver_lg - (style.geometry.number_min_width - r.col_position)
            }
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

// ---------------------------------------------------------------------------
// Layout (puro)
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Item {
    Banner,
    Header,
    Strip,
    Slot(usize),
    Skeleton(usize, bool),
    Footer(Footer),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Footer {
    Waiting,
    Traffic,
    Pits,
    Legend,
    Session,
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct Plan {
    pub width: f32,
    pub height: f32,
    pub content: f32,
    pub items: Vec<(f32, Item)>,
    pub columns: Vec<Placed>,
}

pub(super) fn plan(board: Option<&Board>, options: &Options, style: &Style) -> Plan {
    let variant = options.variant(style);
    let g = &style.geometry;
    let shown = board.filter(|b| !waiting(Some((b.source_state, b.player_present))));
    // Las columnas habilitadas conservan su espacio aunque el dato falte.
    let (columns, width) = options.layout(
        style,
        options.driver_max(style),
        style.relative.col_gap,
        &options.cols.order,
    );
    let mut items = Vec::new();
    let mut y = variant.padding_y + 1.0;
    if shown.is_some_and(|b| b.banner.is_some()) {
        items.push((0.0, Item::Banner));
        y += g.banner_height + g.banner_gap - variant.padding_y;
    }
    items.push((y, Item::Header));
    y += variant.header_height + variant.header_gap;
    if options.cols.strip {
        if shown.is_some() {
            items.push((y, Item::Strip));
        }
        y += style.relative.strip_height + style.relative.strip_gap;
    }
    match shown {
        None => {
            for index in 0..options.slots() {
                items.push((y, Item::Skeleton(index, index == options.ahead)));
                y += g.row_height;
            }
            y += g.footer_gap;
            items.push((y, Item::Footer(Footer::Waiting)));
            y += 1.0 + g.footer_gap + g.footer_height;
        }
        Some(board) => {
            // Mantener también los huecos ausentes: el jugador no se desplaza.
            for index in 0..options.slots() {
                items.push((y, Item::Slot(index)));
                y += g.row_height;
            }
            let footer = if board.player_in_pits && board.pit_exit.is_some() {
                Some(Footer::Pits)
            } else if board.traffic.is_some() {
                Some(Footer::Traffic)
            } else if options.cols.has(Kind::Trend) {
                Some(Footer::Legend)
            } else if !board.session.is_empty()
                && board.session != "CARRERA"
                && board.session != "RACE"
            {
                Some(Footer::Session)
            } else {
                None
            };
            if let Some(footer) = footer {
                y += g.footer_gap;
                items.push((y, Item::Footer(footer)));
                y += 1.0 + g.footer_gap + g.footer_height;
            }
        }
    }
    Plan {
        width,
        content: y + variant.padding_y + 1.0,
        height: 2.0
            + 2.0 * variant.padding_y
            + variant.header_height
            + variant.header_gap
            + options.slots() as f32 * g.row_height
            + if options.cols.strip {
                style.relative.strip_height + style.relative.strip_gap
            } else {
                0.0
            }
            + if options.cols.has(Kind::Trend) {
                2.0 * g.footer_gap + 1.0 + g.footer_height
            } else {
                0.0
            }
            + g.banner_height
            + g.banner_gap
            - variant.padding_y
            + 2.0 * g.footer_gap
            + 1.0
            + g.footer_height,
        items,
        columns,
    }
}

pub(super) struct Labels {
    pub title: String,
    pub header: String,
    pub yellow: String,
    pub traffic: String,
    pub exit: String,
    pub loss: String,
    pub rows: Vec<Option<RowLabels>>,
}
#[derive(Clone)]
pub(super) struct RowLabels {
    pub number: String,
    pub driver: String,
    pub detail: String,
    pub laps: String,
    pub trend: String,
}
impl Labels {
    pub(super) fn new(board: Option<&Board>, options: &Options, language: Language) -> Self {
        let es = language == Language::Es;
        let range = format!("±{}", options.ahead.max(options.behind));
        // Fuera de carrera el título lleva la sesión: «RELATIVE · CLASIFICACIÓN».
        let title = board
            .map(|b| b.session.as_str())
            .filter(|s| !s.is_empty() && *s != "CARRERA" && *s != "RACE")
            .map_or_else(|| "RELATIVE".to_owned(), |s| format!("RELATIVE · {s}"));
        Self {
            title,
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
                    row.as_ref()
                        .map(|row| RowLabels::new(row, options, language))
                })
                .collect(),
        }
    }
}

impl RowLabels {
    pub(super) fn new(
        row: &vantare_domain::relative::Row,
        options: &Options,
        language: Language,
    ) -> Self {
        let es = language == Language::Es;
        Self {
            number: if row.number.is_empty() {
                PLACEHOLDER.to_owned()
            } else {
                format!("#{}", row.number)
            },
            driver: if row.side == Side::Player {
                if es { "Tú" } else { "You" }.into()
            } else {
                driver_text(&row.driver, options)
            },
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
        }
    }
}
