//! Pintor literal GPUI; sin movimiento hasta el seguimiento Motion.
use super::{PAUSE_HEIGHT, layout::*};
use crate::vantare::{
    Style, Variant, alpha,
    generated::ClassesItem as ClassColors,
    paint::{Face, WHITE, font},
    waiting,
};
use rune::{Color, El, Shape, TextStyle, canvas, el, text};
use vantare_domain::{
    TyreCompound,
    format::{Language, PLACEHOLDER},
    standings::{Banner, Board, Mark, Pit, Row},
};
const BOX: &str = "BOX";
pub(super) fn view(
    options: &Options,
    board: Option<&Board>,
    plan: &Plan,
    style: &Style,
    language: Language,
    paused: bool,
    frame: &super::motion::Frame,
) -> El {
    let v = options.variant(style);
    let mut p = Painter {
        options,
        board,
        plan,
        style,
        variant: v,
        accent: options.accent(style),
        language,
        nodes: Vec::new(),
    };
    for &(y, item) in &plan.items {
        match item {
            Item::Header => p.header(y),
            Item::Columns => p.columns(y),
            Item::Row(g, r) => {
                let Some(row) = board.and_then(|b| b.groups.get(g)?.rows.get(r)) else {
                    continue;
                };
                let pose = frame.get(&row.id).copied().unwrap_or_default();
                let missing = board.is_some_and(|b| b.gap_to_best_lap && row.best_lap_s.is_none());
                let first = p.nodes.len();
                p.row(0.0, g, r);
                let mut layer = el()
                    .key(format!("standings-row-{}", row.id.0))
                    .size(plan.width, style.geometry.row_height)
                    .opacity(pose.alpha * if missing { 0.45 } else { 1.0 })
                    .pin(Some(0.0), Some(y + pose.offset), None, None);
                for node in p.nodes.drain(first..) {
                    layer = layer.child(node);
                }
                p.nodes.push(layer);
            }
            Item::Banner => p.banner(),
            Item::Separator(g) => p.separator(y, g),
            Item::Wait => p.wait(y),
            Item::Skeleton(i) => p.skeleton(y, i),
            Item::Footer(f) => p.footer(y, f),
        }
    }
    let border = if v.border_accent > 0.0 {
        alpha(p.accent, v.border_accent)
    } else {
        v.border
    };
    let mut panel = el()
        .key("standings-panel")
        .size(plan.width, plan.content)
        .radius(v.radius)
        .linear_gradient(std::f32::consts::PI, [(0.0, v.top), (1.0, v.bottom)])
        .pin(Some(0.0), Some(0.0), None, None);
    if border.a > 0.0 {
        panel = panel.border(1.0, border);
    }
    if v.shadow_alpha > 0.0 {
        panel = panel.shadow(
            v.shadow_y,
            v.shadow_blur,
            alpha(
                Color {
                    a: 1.0,
                    ..style.colors.shadow
                },
                v.shadow_alpha,
            ),
        );
    }
    let mut root = el()
        .size(
            plan.width,
            plan.height + if paused { PAUSE_HEIGHT } else { 0.0 },
        )
        .motion(rune::Spring::NONE)
        .instant_changes()
        .child(panel);
    for node in p.nodes {
        root = root.child(node);
    }
    if paused {
        let title = if language == Language::Es {
            "EN PAUSA"
        } else {
            "PAUSED"
        };
        root = root.child(
            el().key("pause-band")
                .size(plan.width, PAUSE_HEIGHT)
                .fill(rune::color::hex("#101113f2").expect("pause color"))
                .pin(Some(0.0), Some(plan.height), None, None)
                .child(
                    text(title)
                        .font(font(style, Face::Body, 11.0, PAUSE_HEIGHT, 0.22, 600.0))
                        .color(WHITE)
                        .h(PAUSE_HEIGHT)
                        .pin(Some(8.0), Some(0.0), None, None),
                ),
        );
    }
    root
}
struct Painter<'a> {
    options: &'a Options,
    board: Option<&'a Board>,
    plan: &'a Plan,
    style: &'a Style,
    variant: &'a Variant,
    accent: Color,
    language: Language,
    nodes: Vec<El>,
}
impl Painter<'_> {
    fn es(&self) -> bool {
        self.language == Language::Es
    }
    fn ink(&self, face: Face, size: f32, tracking: f32, color: Color) -> (TextStyle, Color) {
        let weight = match face {
            Face::Body => self.style.fonts.regular_weight,
            Face::Display => 600.0,
            Face::Mono => 400.0,
        };
        let mut style = font(self.style, face, size, 1.0, tracking, weight);
        style.features = "'tnum' 1, 'kern' 1";
        (style, color)
    }
    fn width(&self, value: &str, ink: &(TextStyle, Color)) -> f32 {
        rune::text::measure(value, &[], ink.0, None).0
    }
    // GPUI efficiency/text.rs::fit_measured: tolerancia de 0,01 px y elipsis Unicode.
    fn fit(&self, value: &str, ink: &(TextStyle, Color), room: f32) -> String {
        crate::eficiencia::fit(value, ink.0, room)
    }
    #[allow(clippy::too_many_arguments)] // Mismos argumentos que Kit::label en GPUI.
    fn label(
        &mut self,
        value: &str,
        x: f32,
        right: Option<f32>,
        y: f32,
        h: f32,
        face: Face,
        ink: &(TextStyle, Color),
    ) -> f32 {
        let width = self.width(value, ink);
        let x = right.map_or(x, |r| r - width);
        let offset = match face {
            Face::Body => 0.0,
            Face::Display => self.style.fonts.display_baseline,
            Face::Mono => self.style.fonts.mono_baseline,
        };
        self.nodes.push(
            text(value)
                .font(TextStyle {
                    line_height: h,
                    ..ink.0
                })
                .color(ink.1)
                .size(width, h)
                .pin(Some(x), Some(y + offset), None, None),
        );
        width
    }
    #[allow(clippy::too_many_arguments)] // Rectángulo del pintor canónico.
    fn rect(&mut self, x: f32, y: f32, w: f32, h: f32, r: f32, c: Color) {
        self.nodes.push(
            el().size(w, h)
                .radius(r)
                .fill(c)
                .pin(Some(x), Some(y), None, None),
        );
    }
    fn highlight(&mut self, y: f32, color: Color) {
        let v = self.variant;
        let x = v.padding_x - self.style.geometry.player_bleed;
        let node = el()
            .size(self.plan.width - 2.0 * x, self.style.geometry.row_height)
            .radius(v.player_radius)
            .pin(Some(x), Some(y), None, None);
        self.nodes.push(if v.player_white > 0.0 {
            node.fill(alpha(color, v.player_white))
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
        });
    }
    fn class_dot(&mut self, x: f32, y: f32, class: &ClassColors) {
        let g = &self.style.geometry;
        let d = g.class_dot;
        self.rect(
            x,
            y + (g.row_height - d) / 2.0,
            d,
            d,
            if self.variant.square_dots {
                1.0
            } else {
                d / 2.0
            },
            class.dot,
        );
    }
    fn chip(&mut self, value: &str, class: &ClassColors, x: f32, y: f32) {
        let g = &self.style.geometry;
        let ink = self.ink(Face::Mono, self.style.fonts.mono_small, 0.0, class.ink);
        let used = self.width(value, &ink);
        let w = (used + 2.0 * g.number_padding).max(g.number_min_width);
        let top = y + (g.row_height - g.number_height) / 2.0;
        self.rect(x, top, w, g.number_height, g.chip_radius, class.tint);
        self.label(
            value,
            x + (w - used) / 2.0,
            None,
            top,
            g.number_height,
            Face::Mono,
            &ink,
        );
    }
    fn pill_ink(&self, color: Color) -> (TextStyle, Color) {
        let f = &self.style.fonts;
        let mut ink = self.ink(Face::Body, f.pill, f.pill_tracking, color);
        ink.0.weight = f.pill_weight;
        ink
    }
    fn pill_width(&self, value: &str) -> f32 {
        self.width(value, &self.pill_ink(WHITE)) + 2.0 * self.style.geometry.pill_padding
    }
    fn pill(&mut self, value: &str, x: f32, y: f32, fill: Color, color: Color) {
        let g = &self.style.geometry;
        let w = self.pill_width(value);
        let top = y + (g.row_height - g.pill_height) / 2.0;
        self.rect(x, top, w, g.pill_height, g.chip_radius, fill);
        self.label(
            value,
            x + g.pill_padding,
            None,
            top,
            g.pill_height,
            Face::Body,
            &self.pill_ink(color),
        );
    }
    fn brand(&mut self, right: f32, y: f32, h: f32) -> f32 {
        let b = &self.style.brand;
        let ink = self.ink(Face::Display, b.size, b.tracking, self.variant.header_color);
        let name = self.label("VANTARE", 0.0, Some(right), y, h, Face::Display, &ink);
        let scale = b.symbol_height / 41.0;
        let symbol = 46.0 * scale;
        let color = b.symbol;
        self.nodes.push(
            canvas(Shape::new().fill(
                vec![
                    [0.0, 41.0 * scale],
                    [23.0 * scale, 0.0],
                    [46.0 * scale, 41.0 * scale],
                    [33.0 * scale, 41.0 * scale],
                    [23.0 * scale, 22.0 * scale],
                    [13.0 * scale, 41.0 * scale],
                ],
                color,
            ))
            .size(symbol, b.symbol_height)
            .pin(
                Some(right - name - b.gap - symbol),
                Some(y + (h - b.symbol_height) / 2.0),
                None,
                None,
            ),
        );
        name + b.gap + symbol
    }
    fn header(&mut self, y: f32) {
        let v = self.variant;
        let h = v.header_height - if v.header_rule > 0.0 { 6.0 } else { 0.0 };
        let (pad, w) = (v.padding_x, self.plan.width);
        let face = if v.header_display {
            Face::Display
        } else {
            Face::Body
        };
        let ink = self.ink(face, v.header_size, v.header_tracking, v.header_color);
        let em_color = if v.header_display {
            self.accent
        } else {
            self.style.colors.header_em
        };
        let em = self.ink(face, v.header_size, v.header_tracking, em_color);
        let board = self
            .board
            .filter(|b| !waiting(Some((b.source_state, true))));
        let session = board.map_or_else(
            || {
                if self.es() {
                    "Clasificación"
                } else {
                    "Standings"
                }
                .to_owned()
            },
            |b| b.session.clone(),
        );
        let lap = board.map_or("", |b| b.lap.as_str());
        let mut x = pad;
        let left_end = if lap.is_empty() {
            let session = board.filter(|b| b.remaining != PLACEHOLDER).map_or_else(
                || session.clone(),
                |b| {
                    format!(
                        "{session} · {} {}",
                        header_clock(&b.remaining),
                        if self.es() { "restante" } else { "left" }
                    )
                },
            );
            x + self.label(&session.to_uppercase(), x, None, y, h, face, &ink)
        } else if self.narrow() {
            let text = format!("{session} · {} {lap}", if self.es() { "V" } else { "L" });
            x + self.label(&text.to_uppercase(), x, None, y, h, face, &ink)
        } else {
            let lead = format!("{session} · {} ", if self.es() { "Vuelta" } else { "Lap" });
            x += self.label(&lead.to_uppercase(), x, None, y, h, face, &ink);
            x + self.label(lap, x, None, y, h, face, &em)
        };
        let mut edge = w - pad;
        if self.options.brand {
            edge -= self.brand(edge, y, h) + self.style.brand.margin;
        }
        if let Some(board) = board {
            let classes: Vec<&str> = match self.options.mode {
                Mode::PlayerClass => shown_group(board)
                    .map(|g| board.groups[g].short.as_str())
                    .into_iter()
                    .collect(),
                Mode::AllClasses | Mode::Multiclass => board
                    .groups
                    .iter()
                    .map(|g| {
                        if board.gap_to_best_lap && board.groups.len() == 1 {
                            g.class.as_ref()
                        } else {
                            g.short.as_str()
                        }
                    })
                    .collect(),
            };
            let mut parts: Vec<String> = Vec::new();
            if self.plan.width >= self.style.geometry.wide_width
                && !board.gap_to_best_lap
                && board.remaining != PLACEHOLDER
            {
                parts.push(format!(
                    "{} {}",
                    board.remaining,
                    if self.es() { "restante" } else { "left" }
                ));
            }
            let named: Vec<&str> = classes.iter().copied().filter(|s| !s.is_empty()).collect();
            let mut unique: Vec<&str> = Vec::new();
            for class in &named {
                if !unique.contains(class) {
                    unique.push(class);
                }
            }
            let ambiguous = unique.len() < named.len();
            let room = edge - left_end - self.style.geometry.cell_gap;
            let listed = [
                parts.clone(),
                unique.iter().map(|s| (*s).to_owned()).collect(),
            ]
            .concat()
            .join(" · ")
            .to_uppercase();
            let counted = || {
                let mut parts = parts.clone();
                parts.push(format!(
                    "{} {}",
                    named.len(),
                    if self.es() { "clases" } else { "classes" }
                ));
                parts.join(" · ").to_uppercase()
            };
            let right = if !ambiguous && self.width(&listed, &ink) <= room {
                listed
            } else if named.len() > 1 && self.width(&counted(), &ink) <= room {
                counted()
            } else {
                self.fit(&listed, &ink, room.max(0.0))
            };
            self.label(&right, 0.0, Some(edge), y, h, face, &ink);
        }
        if v.header_rule > 0.0 {
            self.rect(
                pad,
                y + v.header_height - 1.0,
                w - 2.0 * pad,
                1.0,
                0.0,
                alpha(self.accent, v.header_rule),
            );
        }
    }
    fn columns(&mut self, y: f32) {
        let g = &self.style.geometry;
        let f = &self.style.fonts;
        let h = g.column_header_height;
        let ink = self.ink(
            Face::Body,
            f.column,
            f.column_tracking,
            self.style.colors.column,
        );
        let es = self.es();
        let pad = self.variant.padding_x;
        let put = |painter: &mut Self, value: &str, x: f32, right: Option<f32>| {
            painter.label(&value.to_uppercase(), x, right, y, h, Face::Body, &ink);
        };
        put(self, "P", 0.0, Some(pad + g.col_position));
        let number = self.options.cols.has(Kind::Number);
        for column in &self.plan.columns {
            if column.kind == Kind::Sectors && self.options.numeric_sectors() {
                for (i, label) in ["S1", "S2", "S3"].into_iter().enumerate() {
                    put(
                        self,
                        label,
                        0.0,
                        Some(column.x + g.col_gap + i as f32 * (g.col_gap + g.cell_gap)),
                    );
                }
                continue;
            }
            let label = match (column.kind, es) {
                (Kind::Gained, _) => "±",
                (Kind::Number, true) => "Dorsal",
                (Kind::Number, false) => "No.",
                (Kind::Driver, true) if self.options.cols.vehicle => "Piloto · coche",
                (Kind::Driver, false) if self.options.cols.vehicle => "Driver · car",
                (Kind::Driver, true) => "Piloto",
                (Kind::Driver, false) => "Driver",
                (Kind::Compound, _) => "N",
                (Kind::Pit, true) if self.board.is_some_and(|b| b.gap_to_best_lap) => "Estado",
                (Kind::Pit, false) if self.board.is_some_and(|b| b.gap_to_best_lap) => "State",
                (Kind::Pit, true) => "Par.",
                (Kind::Pit, false) => "Stops",
                (Kind::Laps, true) => "Vlt",
                (Kind::Laps, false) => "Laps",
                (Kind::Sectors, _) => "Sect.",
                (Kind::Last, true) => "Última",
                (Kind::Last, false) => "Last",
                (Kind::Best, true) => "Mejor",
                (Kind::Best, false) => "Best",
                (Kind::Interval, _) => "Int.",
                (Kind::Gap, true) if self.board.is_some_and(|b| b.gap_to_best_lap) => "Al mejor",
                (Kind::Gap, false) if self.board.is_some_and(|b| b.gap_to_best_lap) => "To best",
                (Kind::Gap, _) => "Gap",
            };
            let x = if column.kind == Kind::Driver && !number {
                column.x + g.class_dot + g.cell_gap
            } else {
                column.x
            };
            if column.kind.right_aligned() {
                put(self, label, 0.0, Some(column.x + column.width));
            } else {
                put(self, label, x, None);
            }
        }
    }
    fn narrow(&self) -> bool {
        self.plan.width < self.style.geometry.narrow_width
    }
    fn row(&mut self, y: f32, gi: usize, ri: usize) {
        let Some(board) = self.board else { return };
        let Some(group) = board.groups.get(gi) else {
            return;
        };
        let Some(row) = group.rows.get(ri) else {
            return;
        };
        let g = &self.style.geometry;
        let f = &self.style.fonts;
        let c = &self.style.colors;
        let v = self.variant;
        let h = g.row_height;
        let me = row.is_player && board.player_present;
        if me {
            self.highlight(
                y,
                if v.player_white > 0.0 {
                    WHITE
                } else {
                    self.accent
                },
            );
        }
        let class = self.style.class(&group.class);
        let position_color = c.muted;
        let ink = self.ink(Face::Display, f.position, 0.0, position_color);
        self.label(
            &row.position,
            0.0,
            Some(v.padding_x + g.col_position),
            y,
            h,
            Face::Display,
            &ink,
        );
        let frozen =
            matches!(board.banner, Some(Banner::FullCourseYellow)) || (me && board.player_in_pits);
        let has_pit = self.options.cols.has(Kind::Pit);
        let number = self.options.cols.has(Kind::Number);
        for column in &self.plan.columns {
            let (x, right) = (column.x, column.x + column.width);
            match column.kind {
                Kind::Gained => self.gained(row, x, y),
                Kind::Number => {
                    self.class_dot(x, y, class);
                    self.number(row, class, x + g.class_dot + g.cell_gap, y);
                }
                Kind::Driver => {
                    let mut start = x;
                    if !number {
                        self.class_dot(x, y, class);
                        start += g.class_dot + g.cell_gap;
                    }
                    let mut name_right = right;
                    if !has_pit && row.pit == Pit::InPits {
                        let width = self.pill_width(BOX);
                        self.pit(row, name_right - width, y, false);
                        name_right -= width + g.cell_gap;
                    }
                    self.name(row, start, name_right, y);
                }
                Kind::Compound => self.compound(row, x, y),
                Kind::Pit => {
                    if !board.gap_to_best_lap || row.in_pits {
                        self.pit(row, x, y, true);
                    }
                }
                Kind::Laps => {
                    let ink = self.ink(Face::Mono, f.mono, 0.0, c.value);
                    self.label(&row.laps, 0.0, Some(right), y, h, Face::Mono, &ink);
                }
                Kind::Sectors if self.options.numeric_sectors() => {
                    for index in 0..3 {
                        let value = self
                            .plan
                            .sector_times
                            .get(gi)
                            .and_then(|g| g.get(ri))
                            .expect("fila planificada")
                            .get(index)
                            .map_or(PLACEHOLDER, String::as_str);
                        let color = if row.sectors.get(index) == Some(&Mark::Fastest) {
                            c.purple
                        } else {
                            c.value
                        };
                        let ink = self.ink(Face::Mono, f.mono_small, 0.0, color);
                        self.label(
                            value,
                            0.0,
                            Some(x + g.col_gap + index as f32 * (g.col_gap + g.cell_gap)),
                            y,
                            h,
                            Face::Mono,
                            &ink,
                        );
                    }
                }
                Kind::Sectors => self.sectors(row, x, y),
                Kind::Last | Kind::Best => {
                    let (text, color) = if column.kind == Kind::Last {
                        (&row.last_lap, c.value)
                    } else {
                        (
                            &row.best_lap,
                            match row.best_mark {
                                Mark::Fastest => c.purple,
                                _ if me => c.best_personal,
                                Mark::Personal => c.best_personal,
                                _ => c.value,
                            },
                        )
                    };
                    let ink = self.ink(Face::Mono, f.mono, 0.0, color);
                    self.label(text, 0.0, Some(right), y, h, Face::Mono, &ink);
                }
                Kind::Interval | Kind::Gap => {
                    let is_gap = column.kind == Kind::Gap;
                    let gap = self
                        .plan
                        .gaps
                        .get(gi)
                        .and_then(|g| g.get(ri))
                        .expect("fila planificada");
                    let color = if is_gap && gap == "Pole" {
                        c.purple
                    } else if frozen {
                        c.frozen
                    } else if me {
                        c.text
                    } else {
                        c.value
                    };
                    let class_leader = (is_gap
                        && !board.gap_to_best_lap
                        && row.is_leader
                        && self.options.mode == Mode::AllClasses
                        && shown_group(board) != Some(gi))
                    .then_some(group.short.as_str());
                    let leader = class_leader.map(|class| {
                        format!("1º {}", if class == "LMGT3" { "GT3" } else { class })
                    });
                    let value =
                        leader
                            .as_deref()
                            .unwrap_or(if is_gap { gap } else { &row.interval });
                    let ink = self.ink(Face::Mono, f.mono, 0.0, color);
                    self.label(value, 0.0, Some(right), y, h, Face::Mono, &ink);
                }
            }
        }
    }
    fn gained(&mut self, row: &Row, x: f32, y: f32) {
        let c = &self.style.colors;
        let (value, color) = match row.gained {
            Some(n) if n > 0 => (format!("▲{n}"), c.gain),
            Some(n) if n < 0 => (format!("▼{}", -n), c.loss),
            Some(_) => ("–".to_owned(), c.even),
            None => (PLACEHOLDER.to_owned(), c.even),
        };
        let ink = self.ink(Face::Mono, self.style.fonts.mono_small, 0.0, color);
        self.label(
            &value,
            x,
            None,
            y,
            self.style.geometry.row_height,
            Face::Mono,
            &ink,
        );
    }
    fn number(&mut self, row: &Row, class: &ClassColors, x: f32, y: f32) {
        self.chip(&Self::number_text(row), class, x, y);
    }
    fn number_text(row: &Row) -> String {
        if row.number.is_empty() {
            PLACEHOLDER.to_owned()
        } else {
            format!("#{}", row.number)
        }
    }
    fn name(&mut self, row: &Row, x: f32, right: f32, y: f32) {
        let f = &self.style.fonts;
        let c = &self.style.colors;
        let h = self.style.geometry.row_height;
        let available = (right - x).max(0.0);
        let driver_ink = self.ink(Face::Body, f.body, 0.0, c.text);
        let driver = driver_text(row, self.options);
        let driver = self.fit(&driver, &driver_ink, available);
        let used = self.label(&driver, x, None, y, h, Face::Body, &driver_ink);
        let detail = if self.options.cols.vehicle
            && !self.options.cols.has(Kind::Number)
            && !row.number.is_empty()
        {
            format!(
                "{} #{}",
                vehicle_detail(row, &self.options.cols),
                row.number
            )
        } else {
            vehicle_detail(row, &self.options.cols)
        };
        if detail.is_empty() {
            return;
        }
        let small = self.ink(Face::Body, f.small, 0.0, c.muted);
        let rest = available - used;
        if rest > 12.0 {
            let detail = self.fit(&detail, &small, rest);
            self.label(&detail, x + used, None, y, h, Face::Body, &small);
        }
    }
    fn compound(&mut self, row: &Row, x: f32, y: f32) {
        let g = &self.style.geometry;
        let c = &self.style.colors;
        let f = &self.style.fonts;
        let size = g.compound_size;
        let top = y + (g.row_height - size) / 2.0;
        let Some(compound) = row.compound else {
            let ink = self.ink(Face::Body, f.small, 0.0, c.even);
            self.label(PLACEHOLDER, x, None, y, g.row_height, Face::Body, &ink);
            return;
        };
        let (color, letter) = match (compound, self.es()) {
            (TyreCompound::Soft, true) => (c.compound_soft, "B"),
            (TyreCompound::Soft, false) => (c.compound_soft, "S"),
            (TyreCompound::Medium, _) => (c.compound_medium, "M"),
            (TyreCompound::Hard, true) => (c.compound_hard, "D"),
            (TyreCompound::Hard, false) => (c.compound_hard, "H"),
            (TyreCompound::Wet, true) => (c.compound_wet, "LL"),
            (TyreCompound::Wet, false) => (c.compound_wet, "W"),
        };
        self.nodes.push(
            el().size(size, size)
                .radius(size / 2.0)
                .border(g.compound_border, color)
                .pin(Some(x), Some(top), None, None),
        );
        let mut ink = self.ink(
            Face::Body,
            if letter.len() > 1 {
                f.compound - 1.0
            } else {
                f.compound
            },
            0.0,
            c.text,
        );
        ink.0.weight = f.bold_weight;
        let width = self.width(letter, &ink);
        self.label(
            letter,
            x + (size - width) / 2.0,
            None,
            top,
            size,
            Face::Body,
            &ink,
        );
    }
    fn pit(&mut self, row: &Row, x: f32, y: f32, stops: bool) {
        let g = &self.style.geometry;
        let c = &self.style.colors;
        let (label, fill_color, ink_color) = match row.pit {
            Pit::InPits => (BOX.to_owned(), c.box_fill, c.box_text),
            Pit::Stops(n) if stops => (format!("{n} P"), c.stops_fill, c.stops_text),
            Pit::Unknown if stops => {
                let ink = self.ink(Face::Body, self.style.fonts.small, 0.0, c.even);
                self.label(PLACEHOLDER, x, None, y, g.row_height, Face::Body, &ink);
                return;
            }
            _ => return,
        };
        self.pill(&label, x, y, fill_color, ink_color);
    }
    fn sectors(&mut self, row: &Row, x: f32, y: f32) {
        let g = &self.style.geometry;
        let c = &self.style.colors;
        if row.sectors.is_empty() {
            let ink = self.ink(Face::Body, self.style.fonts.small, 0.0, c.even);
            self.label(PLACEHOLDER, x, None, y, g.row_height, Face::Body, &ink);
            return;
        }
        let top = y + (g.row_height - g.sector_height) / 2.0;
        for (index, mark) in row.sectors.iter().take(3).enumerate() {
            let color = match mark {
                Mark::Fastest => c.purple,
                Mark::Personal => c.green,
                Mark::Slower => c.yellow,
                Mark::Pending => c.sector_pending,
            };
            self.rect(
                x + index as f32 * (g.sector_width + g.sector_gap),
                top,
                g.sector_width,
                g.sector_height,
                g.sector_radius,
                color,
            );
        }
    }
    fn banner(&mut self) {
        let Some(board) = self.board else { return };
        let Some(banner) = &board.banner else { return };
        let c = &self.style.colors;
        let es = self.es();
        match banner {
            Banner::FullCourseYellow => {
                self.band(c.fcy_fill, c.fcy_text, "FCY", None, false, None);
            }
            Banner::LocalYellow(sector) => {
                let title = if es {
                    format!("Amarilla · Sector {sector}")
                } else {
                    format!("Yellow · Sector {sector}")
                };
                let line = Some(c.yellow_line);
                self.band(c.yellow_fill, c.yellow_text, &title, None, false, line);
            }
            Banner::FinalLap => {
                let title = if es { "Última vuelta" } else { "Final lap" };
                let lap = Some(board.lap.as_str());
                self.band(c.final_fill, c.final_text, title, lap, true, None);
            }
        }
    }
    fn separator(&mut self, y: f32, group: usize) {
        let Some(board) = self.board else { return };
        let Some(group) = board.groups.get(group) else {
            return;
        };
        let g = &self.style.geometry;
        let f = &self.style.fonts;
        let c = &self.style.colors;
        let (pad, w, h) = (self.variant.padding_x, self.plan.width, g.separator_height);
        self.rect(0.0, y, w, h, 0.0, c.separator_band);
        let class = self.style.class(&group.class);
        let name = if group.class.is_empty() {
            PLACEHOLDER.to_owned()
        } else {
            group.class.to_uppercase()
        };
        let ink = self.ink(Face::Display, f.separator, f.separator_tracking, class.ink);
        self.label(&name, pad, None, y, h, Face::Display, &ink);
        let detail = format!(
            "{} {} · {} {}",
            group.cars,
            match (self.es(), group.cars) {
                (true, 1) => "coche",
                (true, _) => "coches",
                (false, 1) => "car",
                (false, _) => "cars",
            },
            if self.es() { "mejor" } else { "best" },
            group.best_lap
        );
        let ink = self.ink(Face::Mono, f.mono_small, 0.0, c.muted);
        self.label(&detail, 0.0, Some(w - pad), y, h, Face::Mono, &ink);
    }
    fn footer(&mut self, y: f32, footer: Footer) {
        let Some(board) = self.board else { return };
        let g = &self.style.geometry;
        let f = &self.style.fonts;
        let c = &self.style.colors;
        let (pad, w) = (self.variant.padding_x, self.plan.width);
        self.rule(y);
        let top = y + 1.0 + g.footer_gap;
        let h = g.footer_height;
        let ink = self.ink(Face::Body, f.header, 0.0, c.muted);
        let es = self.es();
        match footer {
            Footer::Frozen => {
                let message = if es { "Gaps congelados" } else { "Gaps frozen" };
                self.label(message, pad, None, top, h, Face::Body, &ink);
            }
            Footer::Spectator => {
                let pulse = g.pulse;
                self.rect(
                    pad,
                    top + (h - pulse) / 2.0,
                    pulse,
                    pulse,
                    pulse / 2.0,
                    c.pulse,
                );
                let left = if es {
                    "No estás en esta sesión · modo espectador"
                } else {
                    "You are not in this session · spectator mode"
                };
                self.label(
                    left,
                    pad + pulse + g.cell_gap,
                    None,
                    top,
                    h,
                    Face::Body,
                    &ink,
                );
                let right = if es {
                    "Siguiendo al líder"
                } else {
                    "Following the leader"
                };
                self.label(right, 0.0, Some(w - pad), top, h, Face::Body, &ink);
            }
            Footer::Pits => {
                let width = self.pill_width(BOX);
                let pill_top = top + (h - g.pill_height) / 2.0;
                self.rect(
                    pad,
                    pill_top,
                    width,
                    g.pill_height,
                    g.chip_radius,
                    c.box_fill,
                );
                let pill = self.pill_ink(c.box_text);
                self.label(
                    BOX,
                    pad + g.pill_padding,
                    None,
                    pill_top,
                    g.pill_height,
                    Face::Body,
                    &pill,
                );
                let stops = board
                    .groups
                    .iter()
                    .flat_map(|group| &group.rows)
                    .find(|row| row.is_player)
                    .and_then(|row| match row.pit {
                        Pit::Stops(n) => Some(n),
                        _ => None,
                    });
                let text = match (stops, es) {
                    (Some(n), true) => format!("Parada {}", n + 1),
                    (Some(n), false) => format!("Stop {}", n + 1),
                    (None, true) => "En boxes".to_owned(),
                    (None, false) => "In the pits".to_owned(),
                };
                self.label(
                    &text,
                    pad + width + g.cell_gap,
                    None,
                    top,
                    h,
                    Face::Body,
                    &ink,
                );
            }
            Footer::Session => {
                let mut x = pad;
                let compact = self.narrow();
                if let Some((time, driver)) = &board.fastest {
                    let lead = if board.qualifying {
                        "Pole "
                    } else {
                        match (compact, es) {
                            (true, true) => "VR ",
                            (true, false) => "FL ",
                            (false, true) => "Vuelta rápida ",
                            (false, false) => "Fastest lap ",
                        }
                    };
                    x += self.label(lead, x, None, top, h, Face::Body, &ink);
                    let mono = self.ink(Face::Mono, f.mono_small, 0.0, c.purple);
                    x += self.label(time, x, None, top, h, Face::Mono, &mono);
                    self.label(&format!(" · {driver}"), x, None, top, h, Face::Body, &ink);
                } else {
                    let lead = if es {
                        "Vuelta rápida —"
                    } else {
                        "Fastest lap —"
                    };
                    self.label(lead, x, None, top, h, Face::Body, &ink);
                }
                let track = if board.gap_to_best_lap {
                    let own = board
                        .groups
                        .iter()
                        .flat_map(|g| &g.rows)
                        .find(|r| r.is_player)
                        .and_then(|r| r.classification_gap_s);
                    format!(
                        "{} {}",
                        if es { "Tuya" } else { "Yours" },
                        own.map_or_else(|| PLACEHOLDER.into(), |v| format!("+{v:.3}"))
                    )
                } else if compact {
                    format!("{} · {}", board.track_temperature, board.surface)
                } else {
                    format!(
                        "{} {} · {}",
                        if es { "Pista" } else { "Track" },
                        board.track_temperature,
                        board.surface
                    )
                };
                self.label(&track, 0.0, Some(w - pad), top, h, Face::Body, &ink);
            }
        }
    }
    fn wait(&mut self, y: f32) {
        let g = &self.style.geometry;
        let f = &self.style.fonts;
        let c = &self.style.colors;
        let center = self.plan.width / 2.0;
        let pulse = g.pulse;
        self.rect(
            center - pulse / 2.0,
            y + 10.0,
            pulse,
            pulse,
            pulse / 2.0,
            c.pulse,
        );
        let title = if self.es() {
            "ESPERANDO AL SIMULADOR"
        } else {
            "WAITING FOR THE SIMULATOR"
        };
        let ink = self.ink(
            Face::Display,
            f.wait_title,
            f.separator_tracking,
            c.header_em,
        );
        let width = self.width(title, &ink);
        self.label(
            title,
            center - width / 2.0,
            None,
            y + 22.0,
            f.wait_title,
            Face::Display,
            &ink,
        );
        let hint = if self.es() {
            "Abre el simulador y entra en una sesión"
        } else {
            "Open the simulator and join a session"
        };
        let ink = self.ink(Face::Body, f.small, 0.0, c.muted);
        let width = self.width(hint, &ink);
        self.label(
            hint,
            center - width / 2.0,
            None,
            y + 40.0,
            20.0,
            Face::Body,
            &ink,
        );
    }
    fn skeleton(&mut self, y: f32, index: usize) {
        let g = &self.style.geometry;
        let color = self.style.colors.skeleton;
        let (pad, w, h) = (self.variant.padding_x, self.plan.width, g.row_height);
        let bar = g.skeleton_bar;
        let top = y + (h - bar) / 2.0;
        let mut x = pad;
        self.rect(x, top, 16.0, bar, 2.0, color);
        x += 16.0 + g.cell_gap;
        let dot = g.class_dot;
        self.rect(x, y + (h - dot) / 2.0, dot, dot, dot / 2.0, color);
        x += dot + g.cell_gap;
        let name = 110.0 + ((index * 37) % 70) as f32;
        self.rect(x, top, name, bar, 2.0, color);
        self.rect(w - pad - 48.0, top, 48.0, bar, 2.0, color);
    }
    fn band(
        &mut self,
        fill: Color,
        ink: Color,
        title: &str,
        right: Option<&str>,
        chequered: bool,
        line: Option<Color>,
    ) {
        let f = &self.style.fonts;
        let g = &self.style.geometry;
        let (w, h) = (self.plan.width, g.banner_height);
        let radius = (self.variant.radius - 1.0).max(0.0);
        self.nodes.push(
            el().size(w, h)
                .fill(fill)
                .corners([radius, radius, 0.0, 0.0])
                .pin(Some(0.0), Some(0.0), None, None),
        );
        if let Some(line) = line {
            self.rect(0.0, h - 1.0, w, 1.0, 0.0, line);
        }
        let pad = self.variant.padding_x;
        let mut x = pad;
        if chequered {
            let top = (h - 8.0) / 2.0;
            for (col, row) in [(0, 0), (2, 0), (1, 1), (3, 1)] {
                self.rect(
                    x + col as f32 * 4.0,
                    top + row as f32 * 4.0,
                    4.0,
                    4.0,
                    0.0,
                    ink,
                );
            }
            x += 16.0 + 8.0;
        }
        if let Some(right) = right {
            let mono = self.ink(Face::Mono, f.mono_small, 0.0, ink);
            self.label(right, 0.0, Some(w - pad), 0.0, h, Face::Mono, &mono);
        }
        let display = self.ink(Face::Display, f.banner, f.banner_tracking, ink);
        self.label(
            &title.to_uppercase(),
            x,
            None,
            0.0,
            h,
            Face::Display,
            &display,
        );
    }
    fn rule(&mut self, y: f32) {
        let pad = self.variant.padding_x;
        self.rect(
            pad,
            y,
            self.plan.width - 2.0 * pad,
            1.0,
            0.0,
            self.style.colors.line,
        );
    }
}

#[cfg(test)]
#[path = "review_tests.rs"]
mod review_tests;
