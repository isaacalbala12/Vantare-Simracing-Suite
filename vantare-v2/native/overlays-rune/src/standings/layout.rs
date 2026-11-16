//! Geometría y selección copiadas de ui/src/standings/vantare.rs.
use crate::vantare::{Style, Variant, waiting};
use rune::Color;
use vantare_domain::{
    format::PLACEHOLDER,
    standings::{Banner, Board, Row},
    widget_settings::{
        look::{Accent, Tone},
        standings::{Settings, vantare_template},
    },
};
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Mode {
    PlayerClass,
    AllClasses,
    Multiclass,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Preset {
    Xs,
    Sm,
    Md,
    Lg,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Kind {
    Gained,
    Number,
    Driver,
    Compound,
    Pit,
    Laps,
    Sectors,
    Last,
    Best,
    Interval,
    Gap,
}
impl Kind {
    pub(super) fn from_metric(metric: &str) -> Option<Self> {
        Some(match metric {
            "positionsGained" => Self::Gained,
            "driverNumber" | "carNumber" => Self::Number,
            "driverName" => Self::Driver,
            "tireCompound" => Self::Compound,
            "pit" => Self::Pit,
            "currentLap" => Self::Laps,
            "sectors" => Self::Sectors,
            "lastLap" => Self::Last,
            "bestLap" => Self::Best,
            "interval" => Self::Interval,
            "gap" => Self::Gap,
            _ => return None,
        })
    }
    pub(super) fn right_aligned(self) -> bool {
        matches!(
            self,
            Self::Laps | Self::Last | Self::Best | Self::Interval | Self::Gap
        )
    }
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct Cols {
    pub order: Vec<Kind>,
    pub vehicle: bool,
    pub driver: Preset,
}
impl Cols {
    pub(super) fn from_settings(
        columns: &[vantare_domain::widget_settings::columns::ColumnSetting],
    ) -> Self {
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
        let driver = columns.iter().find(|c| c.metric_id == "driverName");
        Self {
            order,
            vehicle: columns
                .iter()
                .any(|c| c.enabled && c.metric_id == "vehicle"),
            driver: match driver.map(|c| c.width_preset.as_str()) {
                Some("xs") => Preset::Xs,
                Some("sm") => Preset::Sm,
                Some("lg") => Preset::Lg,
                _ => Preset::Md,
            },
        }
    }
    pub(super) fn has(&self, kind: Kind) -> bool {
        self.order.contains(&kind)
    }
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Placed {
    pub kind: Kind,
    pub x: f32,
    pub width: f32,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct Options {
    pub look: Tone,
    pub accent: Accent,
    pub mode: Mode,
    pub cols: Cols,
    pub rows: usize,
    pub name_mode: String,
    pub name_max: usize,
    pub brand: bool,
}
impl Options {
    pub(super) fn from_settings(settings: &Settings) -> Self {
        let columns = settings
            .columns
            .clone()
            .unwrap_or_else(|| vantare_template("standard"));
        let driver = columns.iter().find(|c| c.metric_id == "driverName");
        Self {
            look: settings.style,
            accent: settings.accent,
            mode: if settings.classification_mode == "multiclass" {
                Mode::Multiclass
            } else if settings.class_scope == "all-classes" {
                Mode::AllClasses
            } else {
                Mode::PlayerClass
            },
            cols: Cols::from_settings(&columns),
            rows: settings.row_count.clamp(
                vantare_domain::widget_settings::standings::STANDINGS_ROWS_MIN,
                vantare_domain::widget_settings::standings::STANDINGS_ROWS_MAX,
            ),
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
    pub(super) fn driver_max(&self, style: &Style) -> f32 {
        let g = &style.geometry;
        if self.numeric_sectors() && self.cols.driver == Preset::Lg {
            return (900.0 - self.layout(style, 0.0).1).max(g.driver_xs);
        }
        if self.cols.driver == Preset::Md
            && self.cols.has(Kind::Best)
            && !self.cols.has(Kind::Number)
            && !self.cols.has(Kind::Sectors)
        {
            return (520.0 - self.layout(style, 0.0).1).max(g.driver_xs);
        }
        match self.cols.driver {
            Preset::Xs => g.driver_xs,
            Preset::Sm => g.driver_sm,
            Preset::Md
                if !self.cols.has(Kind::Number)
                    && !self.cols.has(Kind::Sectors)
                    && !self.cols.has(Kind::Pit) =>
            {
                343.0
            }
            Preset::Md => g.driver_md,
            Preset::Lg => g.driver_lg,
        }
    }
    pub(super) fn layout(&self, style: &Style, driver: f32) -> (Vec<Placed>, f32) {
        let g = &style.geometry;
        let gap = g.cell_gap;
        let pad = self.variant(style).padding_x;
        let dot = g.class_dot + gap;
        let number = self.cols.has(Kind::Number);
        let mut x = pad + g.col_position;
        let mut placed = Vec::with_capacity(self.cols.order.len());
        for &kind in &self.cols.order {
            let width = match kind {
                Kind::Gained => g.col_gained,
                Kind::Number => dot + g.number_min_width,
                Kind::Driver => driver + if number { 0.0 } else { dot },
                Kind::Compound => g.compound_size,
                Kind::Pit
                    if self.cols.has(Kind::Best)
                        && !self.cols.has(Kind::Number)
                        && !self.cols.has(Kind::Sectors) =>
                {
                    56.0
                }
                Kind::Pit => g.col_pit,
                Kind::Laps => 34.0,
                Kind::Sectors if self.numeric_sectors() => 3.0 * g.col_gap + 2.0 * g.cell_gap,
                Kind::Sectors => 3.0 * g.sector_width + 2.0 * g.sector_gap,
                Kind::Last | Kind::Best => g.col_lap,
                Kind::Interval | Kind::Gap => g.col_gap,
            };
            x += gap;
            placed.push(Placed { kind, x, width });
            x += width;
        }
        (placed, x + pad)
    }
    pub(super) fn numeric_sectors(&self) -> bool {
        self.cols.has(Kind::Sectors) && self.cols.has(Kind::Best) && !self.cols.has(Kind::Last)
    }
}
pub(super) fn vehicle_detail(row: &Row, cols: &Cols) -> String {
    match (cols.vehicle, cols.driver) {
        (false, _) => String::new(),
        _ if row.vehicle.is_empty() => String::new(),
        (true, Preset::Lg) => format!(" · {}", row.vehicle),
        (true, _) => row
            .vehicle
            .split_whitespace()
            .next()
            .map_or_else(String::new, |short| format!(" · {short}")),
    }
}
pub(super) fn driver_text(row: &Row, options: &Options) -> String {
    if row.driver.is_empty() {
        PLACEHOLDER.to_owned()
    } else {
        vantare_domain::standings::driver_name(&row.driver, &options.name_mode, options.name_max)
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Item {
    Banner,
    Header,
    Columns,
    Separator(usize),
    Row(usize, usize),
    Wait,
    Skeleton(usize),
    Footer(Footer),
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Footer {
    Spectator,
    Pits,
    Session,
    Frozen,
}
#[derive(Clone, Debug, PartialEq)]
pub(super) struct Plan {
    pub width: f32,
    pub height: f32,
    pub content: f32,
    pub items: Vec<(f32, Item)>,
    pub columns: Vec<Placed>,
    pub gaps: Vec<Vec<String>>,
    pub sector_times: Vec<Vec<Vec<String>>>,
}
pub(super) fn gap_text(board: &Board, row: &Row) -> String {
    if board.gap_to_best_lap {
        row.classification_gap_s.map_or_else(
            || PLACEHOLDER.into(),
            |seconds| {
                if seconds <= 1e-6 {
                    if board.qualifying { "Pole" } else { "" }.into()
                } else {
                    format!("+{seconds:.3}")
                }
            },
        )
    } else {
        row.gap.clone()
    }
}
pub(super) fn header_clock(value: &str) -> String {
    if value.matches(':').count() == 1 && value.split(':').next().is_some_and(|s| s.len() == 1) {
        format!("0{value}")
    } else {
        value.into()
    }
}
pub(super) fn shown_group(board: &Board) -> Option<usize> {
    board
        .groups
        .iter()
        .position(|group| group.rows.iter().any(|row| row.is_player))
        .or_else(|| (!board.groups.is_empty()).then_some(0))
}
pub(super) fn rows(board: &Board, options: &Options) -> Vec<(usize, usize)> {
    let mut ordered: Vec<(usize, usize)> = match options.mode {
        Mode::PlayerClass => shown_group(board)
            .map_or_default(|g| (0..board.groups[g].rows.len()).map(|r| (g, r)).collect()),
        Mode::AllClasses | Mode::Multiclass => board
            .groups
            .iter()
            .enumerate()
            .flat_map(|(g, group)| (0..group.rows.len()).map(move |r| (g, r)))
            .collect(),
    };
    if options.mode == Mode::AllClasses {
        ordered.sort_by_key(|&(g, r)| {
            debug_assert!(
                board
                    .groups
                    .get(g)
                    .and_then(|group| group.rows.get(r))
                    .is_some()
            );
            board.groups[g].rows[r]
                .position
                .parse::<u32>()
                .unwrap_or(u32::MAX)
        });
    }

    let limit = options.rows.max(1);
    let player = ordered.iter().position(|&(g, r)| {
        debug_assert!(
            board
                .groups
                .get(g)
                .is_some_and(|group| r < group.rows.len())
        );
        board.groups[g].rows[r].is_player
    });
    match player {
        Some(index) if index >= limit && limit > 3 => {
            let start = (index - 1).min(ordered.len().saturating_sub(3));
            debug_assert!(limit - 3 <= ordered.len());
            let mut shown: Vec<_> = ordered[..limit - 3].to_vec();
            shown.extend_from_slice(&ordered[start..(start + 3).min(ordered.len())]);
            shown
        }
        _ => ordered.into_iter().take(limit).collect(),
    }
}
pub(super) fn plan(board: Option<&Board>, options: &Options, style: &Style) -> Plan {
    let variant = options.variant(style);
    let g = &style.geometry;
    let (columns, width) = options.layout(style, options.driver_max(style));
    let mut items = Vec::new();
    let mut y = variant.padding_y + 1.0;
    let shown = board.filter(|b| !waiting(Some((b.source_state, true))));
    if shown.is_some_and(|b| b.banner.is_some()) {
        items.push((0.0, Item::Banner));
        y += g.banner_height + g.banner_gap - variant.padding_y;
    }
    items.push((y, Item::Header));
    y += variant.header_height + variant.header_gap;
    match shown {
        None => {
            items.push((y, Item::Wait));
            y += g.wait_height;
            let count = if width < g.narrow_width { 4 } else { 5 };
            for index in 0..count {
                items.push((y, Item::Skeleton(index)));
                y += g.row_height;
            }
        }
        Some(board) => {
            if column_labels(options) {
                items.push((y, Item::Columns));
                y += g.column_header_height;
            }
            let mut group = None;
            for (gi, ri) in rows(board, options) {
                if options.mode == Mode::Multiclass && group != Some(gi) {
                    group = Some(gi);
                    y += g.separator_gap_top;
                    items.push((y, Item::Separator(gi)));
                    y += g.separator_height + g.separator_gap_bottom;
                }
                items.push((y, Item::Row(gi, ri)));
                y += g.row_height;
            }
            let footer = if matches!(board.banner, Some(Banner::FullCourseYellow)) {
                Some(Footer::Frozen)
            } else if board.player_in_pits {
                Some(Footer::Pits)
            } else if !board.player_present {
                Some(Footer::Spectator)
            } else if board.gap_to_best_lap
                || options.cols.has(Kind::Last)
                || options.cols.has(Kind::Best)
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
    let height = fixed_height(options, style);
    Plan {
        width,
        height,
        content: y + variant.padding_y + 1.0,
        items,
        columns,
        gaps: gap_labels(board, options),
        sector_times: sector_labels(board),
    }
}
pub(super) fn gap_labels(board: Option<&Board>, options: &Options) -> Vec<Vec<String>> {
    board.map_or_else(Vec::new, |b| {
        b.groups
            .iter()
            .map(|g| {
                g.rows
                    .iter()
                    .map(|r| {
                        if b.gap_to_best_lap
                            && !options.cols.has(Kind::Best)
                            && r.classification_gap_s.is_some_and(|v| v.abs() < 1e-6)
                        {
                            r.best_lap.clone()
                        } else {
                            gap_text(b, r)
                        }
                    })
                    .collect()
            })
            .collect()
    })
}
pub(super) fn sector_labels(board: Option<&Board>) -> Vec<Vec<Vec<String>>> {
    board.map_or_else(Vec::new, |b| {
        b.groups
            .iter()
            .map(|g| {
                g.rows
                    .iter()
                    .map(|r| {
                        r.best_sector_times_s
                            .iter()
                            .map(|seconds| {
                                seconds.map_or_else(
                                    || PLACEHOLDER.into(),
                                    |s| {
                                        if s < 60.0 {
                                            format!("{s:.3}")
                                        } else {
                                            vantare_domain::format::lap_time(Some(s))
                                        }
                                    },
                                )
                            })
                            .collect()
                    })
                    .collect()
            })
            .collect()
    })
}
pub(super) fn column_labels(options: &Options) -> bool {
    options.cols.has(Kind::Last) || options.cols.has(Kind::Laps) || options.cols.has(Kind::Sectors)
}
pub(super) fn fixed_height(options: &Options, style: &Style) -> f32 {
    let g = &style.geometry;
    let v = options.variant(style);
    let detailed = options.cols.has(Kind::Last) || options.cols.has(Kind::Best);
    let table = options.rows as f32 * g.row_height
        + if column_labels(options) {
            g.column_header_height
        } else {
            0.0
        }
        + if options.mode == Mode::Multiclass {
            3.0 * (g.separator_gap_top + g.separator_height + g.separator_gap_bottom)
        } else {
            0.0
        };
    let waiting = g.wait_height + 5.0 * g.row_height;
    2.0 + 2.0 * v.padding_y
        + v.header_height
        + v.header_gap
        + table.max(waiting)
        + if detailed {
            2.0 * g.footer_gap + 1.0 + g.footer_height
        } else {
            0.0
        }
        + g.banner_height
        + g.banner_gap
        - v.padding_y
        + if detailed {
            0.0
        } else {
            2.0 * g.footer_gap + 1.0 + g.footer_height
        }
}
