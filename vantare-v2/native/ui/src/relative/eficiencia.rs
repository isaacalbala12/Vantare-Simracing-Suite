//! Eficiencia: presentación del Board común, sin Snapshot, proyección ni historial.
use super::motion::Visual as RowVisual;
use super::{
    App, BAND, BorderStyle, ContentMask, Corners, EDGES, Edges, FOOTER, Ink, Instant, Language,
    Motion, Paint, Preferences, ROW, SCALE, SIZE, Settings, Side, ViewModel, Wake, Window, col,
    ink, linear_color_stop, linear_gradient, paint_rect, px, quad, rect, text, tokens,
};
use std::sync::Arc;
pub(crate) struct Visual {
    pub(super) vm: Arc<ViewModel>,
    settings: Arc<Settings>,
    footer_rows: usize,
    workshop: bool,
    idle_rows: Option<Arc<Vec<RowVisual>>>,
}
impl Visual {
    pub(super) fn new(settings: &Settings, board: Arc<ViewModel>) -> Self {
        Self {
            vm: board,
            settings: Arc::new(settings.clone()),
            footer_rows: 1,
            workshop: false,
            idle_rows: None,
        }
    }
    pub(super) fn workshop_layout(&mut self) {
        self.workshop = true;
    }
    pub(super) fn size(&self) -> (f32, f32) {
        if self.workshop {
            let footer = if self.vm.footer_cells.is_empty() {
                FOOTER
            } else {
                (15.0 + self.footer_rows as f32 * 14.0).max(FOOTER) * SCALE
            };
            (
                SIZE.0,
                BAND + self.settings.slot_count() as f32 * ROW + footer,
            )
        } else {
            self.settings.size()
        }
    }
    pub(super) fn ingest(
        &mut self,
        next: Arc<ViewModel>,
        motion: &mut Motion,
        continuous: bool,
    ) -> bool {
        self.idle_rows = None;
        if continuous && same_visible(&self.vm, &next, &self.settings) {
            self.vm = next;
            return false;
        }
        let now = Instant::now();
        let interrupted = !continuous && motion.animating(now);
        if next.status.is_some() || self.vm.status.is_some() || !continuous {
            *motion = Motion::default();
        } else {
            motion.update(&self.vm, &next, now);
        }
        let changed = !same_visible(&self.vm, &next, &self.settings) || interrupted;
        self.footer_rows = 1;
        if next.footer_cells.len() > 5 {
            let total = next
                .footer_cells
                .iter()
                .map(|cell| {
                    cell.label.chars().count() as f32 * 5.5
                        + cell.value.chars().count() as f32 * 7.5
                        + 26.0
                })
                .sum::<f32>();
            self.footer_rows = (total / (SIZE.0 - 24.0)).ceil().max(1.0) as usize;
        }
        self.vm = next;
        changed
    }
    pub(super) fn frame(
        &mut self,
        prefs: Preferences,
        reduced: bool,
        motion: &Motion,
    ) -> (Paint, Wake) {
        let now = Instant::now();
        let active = !reduced && motion.animating(now);
        let rows = if active {
            self.idle_rows = None;
            Arc::new(motion.sample(&self.vm, now))
        } else {
            self.idle_rows
                .get_or_insert_with(|| {
                    Arc::new(if reduced {
                        Motion::default().sample(&self.vm, now)
                    } else {
                        motion.sample(&self.vm, now)
                    })
                })
                .clone()
        };
        let wake = if active { Wake::Frame } else { Wake::Idle };
        let vm = self.vm.clone();
        let settings = self.settings.clone();
        let size = self.size();
        let footer_rows = self.footer_rows;
        (
            Box::new(move |window, cx| {
                paint(
                    &vm,
                    &rows,
                    &settings,
                    &vm.footer_cells,
                    size,
                    footer_rows,
                    prefs,
                    window,
                    cx,
                );
            }),
            wake,
        )
    }
}
fn same_visible(a: &ViewModel, b: &ViewModel, settings: &Settings) -> bool {
    let last = settings.footer_slots.iter().any(|id| id == "lastLap")
        || settings
            .columns
            .iter()
            .flatten()
            .any(|c| c.enabled && c.metric_id == "lastLap");
    a.track == b.track
        && a.header_stale == b.header_stale
        && a.player_badge == b.player_badge
        && a.session == b.session
        && a.remaining == b.remaining
        && a.air == b.air
        && a.track_temperature == b.track_temperature
        && a.wind == b.wind
        && a.status == b.status
        && a.footer_cells == b.footer_cells
        && a.slots.len() == b.slots.len()
        && a.slots.iter().zip(&b.slots).all(|(a, b)| match (a, b) {
            (None, None) => true,
            (Some(a), Some(b)) => {
                (
                    a.id,
                    a.side,
                    &a.position,
                    &a.number,
                    &a.driver,
                    &a.class,
                    &a.gap,
                    &a.best_lap,
                    a.position_stale,
                    a.best_lap_stale,
                    a.gap_stale,
                    a.lap_delta,
                ) == (
                    b.id,
                    b.side,
                    &b.position,
                    &b.number,
                    &b.driver,
                    &b.class,
                    &b.gap,
                    &b.best_lap,
                    b.position_stale,
                    b.best_lap_stale,
                    b.gap_stale,
                    b.lap_delta,
                ) && (!last || (&a.last_lap, a.last_lap_stale) == (&b.last_lap, b.last_lap_stale))
            }
            _ => false,
        })
}

fn paint(
    vm: &ViewModel,
    rows: &[RowVisual],
    settings: &Settings,
    footer: &[vantare_domain::standings::InfoCell],
    size: (f32, f32),
    footer_rows: usize,
    prefs: Preferences,
    window: &mut Window,
    cx: &mut App,
) {
    let (width, height) = size;
    let panel = rect(0.0, 0.0, width, height);
    let radius = Corners::all(px(tokens::RADIUS * SCALE));
    let no_border = Edges::all(px(0.0));
    window.paint_quad(quad(
        panel,
        radius,
        col(tokens::PANEL, 0.87),
        no_border,
        col(0, 0.0),
        BorderStyle::default(),
    ));
    window.paint_quad(quad(
        panel,
        radius,
        linear_gradient(
            120.0,
            linear_color_stop(col(0xffffff, 0.03), 0.0),
            linear_color_stop(col(0xffffff, 0.0), 0.38),
        ),
        no_border,
        col(0, 0.0),
        BorderStyle::default(),
    ));
    let has_meta = !vm.track.is_empty() || !vm.player_badge.is_empty();
    let meta_bottom = if has_meta { BAND } else { 0.0 };
    let top = meta_bottom
        + if vm.status.is_some() {
            38.0 * SCALE
        } else {
            0.0
        };
    if let Some(status) = &vm.status {
        let font = ink(12.0 * SCALE, 700.0, 0.0, col(0xe2c568, 1.0));
        text::draw(
            window,
            cx,
            status,
            12.0 * SCALE,
            meta_bottom + text::baseline(10.0, 18.0, 12.0) * SCALE,
            &font,
        );
    }
    if has_meta {
        line(window, BAND - SCALE, tokens::INK, 0.1);
        let (label, _) = labels(prefs.language);
        let font = ink(
            14.0 * SCALE,
            650.0,
            -0.01,
            col(
                tokens::INK,
                if vm.header_stale.player_badge {
                    0.6
                } else {
                    1.0
                },
            ),
        );
        let badge_width = text::width(window, &vm.player_badge, &font);
        let label_width = text::width(
            window,
            label,
            &ink(11.0, 600.0, 0.1, col(tokens::MUTED, 1.0)),
        );
        let track = text::fit(
            window,
            &vm.track,
            &font,
            (width - badge_width - label_width - 42.0).max(0.0),
        );
        item(
            window,
            cx,
            12.0 * SCALE,
            0.0,
            (label, &track, vm.header_stale.track),
        );
        let x = width - 12.0 * SCALE - badge_width;
        text::draw(
            window,
            cx,
            &vm.player_badge,
            x,
            text::baseline(0.0, BAND, font.size),
            &font,
        );
    }
    let footer_height = if footer.is_empty() {
        FOOTER
    } else {
        (15.0 + footer_rows as f32 * 14.0).max(FOOTER) * SCALE
    };
    let row_height =
        ((height - footer_height - top) / settings.slot_count().max(1) as f32).min(ROW);
    window.with_content_mask(
        Some(ContentMask {
            bounds: rect(0.0, top, width, height - footer_height - top),
        }),
        |window| {
            for row in rows {
                if settings.columns.is_some() {
                    paint_configured_row(
                        row,
                        top,
                        row_height,
                        settings,
                        prefs.language,
                        window,
                        cx,
                    );
                } else {
                    paint_row(
                        row,
                        top,
                        row_height,
                        settings.slot_count(),
                        prefs.language,
                        window,
                        cx,
                    );
                }
            }
            if rows.is_empty() && vm.status.is_none() {
                let message = if prefs.language == Language::Es {
                    "SIN DATOS"
                } else {
                    "NO DATA"
                };
                let font = ink(12.0 * SCALE, 600.0, 0.0, col(tokens::MUTED, 1.0));
                text::draw(window, cx, message, 12.0 * SCALE, top + 22.0 * SCALE, &font);
            }
        },
    );
    let session = [&vm.session, &vm.remaining]
        .into_iter()
        .filter(|v| !v.is_empty())
        .cloned()
        .collect::<Vec<_>>()
        .join(" ");
    let (_, weather) = labels(prefs.language);
    let fields = [
        ("", session.as_str(), false),
        (weather[0], vm.air.as_str(), vm.header_stale.air),
        (
            weather[1],
            vm.track_temperature.as_str(),
            vm.header_stale.track_temperature,
        ),
        (weather[2], vm.wind.as_str(), vm.header_stale.wind),
    ];
    let visible = fields
        .iter()
        .filter(|(_, value, _)| !value.is_empty())
        .collect::<Vec<_>>();
    if !footer.is_empty() && vm.status.is_none() {
        crate::standings::view::paint_info_cells(
            footer,
            width,
            height,
            footer_height,
            true,
            SCALE,
            SIZE.0,
            window,
            cx,
        );
    } else if !visible.is_empty() {
        let y = height - FOOTER;
        line(window, y, tokens::INK, 0.1);
        let widths = visible
            .iter()
            .map(|(label, value, _)| item_width(window, label, value))
            .collect::<Vec<_>>();
        let gap = 16.0 * SCALE;
        let total = widths.iter().sum::<f32>() + gap * (visible.len() - 1) as f32;
        let mut x = (width - total) / 2.0;
        for ((label, value, stale), w) in visible.into_iter().zip(widths) {
            if label.is_empty() && (vm.header_stale.session || vm.header_stale.remaining) {
                // Solo el valor obsoleto se atenúa; el texto fresco conserva su tinta.
                item(window, cx, x, y, ("", &vm.session, vm.header_stale.session));
                let advance = if vm.session.is_empty() || vm.remaining.is_empty() {
                    0.0
                } else {
                    item_width(window, "", &vm.session) + item_width(window, "", " ")
                };
                item(
                    window,
                    cx,
                    x + advance,
                    y,
                    ("", &vm.remaining, vm.header_stale.remaining),
                );
            } else {
                item(window, cx, x, y, (label, value, *stale));
            }
            x += w + gap;
        }
    }
    window.paint_quad(quad(
        panel,
        radius,
        col(0, 0.0),
        Edges::all(px(SCALE)),
        col(0xffffff, 0.085),
        BorderStyle::default(),
    ));
    window.paint_quad(quad(
        rect(0.0, 0.0, width, 6.0 * SCALE),
        Corners {
            top_left: px(tokens::RADIUS * SCALE),
            top_right: px(tokens::RADIUS * SCALE),
            bottom_left: px(0.0),
            bottom_right: px(0.0),
        },
        col(0, 0.0),
        Edges {
            top: px(SCALE),
            right: px(0.0),
            bottom: px(0.0),
            left: px(0.0),
        },
        col(0xffffff, 0.085),
        BorderStyle::default(),
    ));
}

// Un borde CSS escalado mide menos de 1 px: el snap del kit puede vaciarlo.
// Se reparte su cobertura entre como máximo dos píxeles, sin tocar el kit.
fn line(window: &mut Window, y: f32, color: u32, alpha: f32) {
    let (_, origin_y) = text::origin();
    let start = y + origin_y;
    let first = start.floor();
    for pixel in [first, first + 1.0] {
        let coverage = ((start + SCALE).min(pixel + 1.0) - start.max(pixel)).max(0.0);
        if coverage > 0.0 {
            paint_rect(
                window,
                0.0,
                pixel - origin_y,
                SIZE.0,
                1.0,
                col(color, alpha * coverage),
            );
        }
    }
}

fn labels(language: Language) -> (&'static str, [&'static str; 3]) {
    match language {
        Language::Es => ("PISTA", ["AIRE", "PISTA", "VIENTO"]),
        Language::En => ("TRACK", ["AIR", "TRACK", "WIND"]),
    }
}

fn item_width(window: &Window, label: &str, value: &str) -> f32 {
    let label_font = ink(11.0 * SCALE, 600.0, 0.1, col(tokens::MUTED, 1.0));
    let font = ink(14.0 * SCALE, 650.0, -0.01, col(tokens::INK, 1.0));
    text::width(window, value, &font)
        + if label.is_empty() {
            0.0
        } else {
            text::width(window, label, &label_font) + 6.0 * SCALE
        }
}

fn item(
    window: &mut Window,
    cx: &mut App,
    x: f32,
    y: f32,
    (label, value, stale): (&str, &str, bool),
) {
    if value.is_empty() {
        return;
    }
    let label_font = ink(11.0 * SCALE, 600.0, 0.1, col(tokens::MUTED, 1.0));
    let font = ink(
        14.0 * SCALE,
        650.0,
        -0.01,
        col(tokens::INK, if stale { 0.6 } else { 1.0 }),
    );
    let advance = if label.is_empty() {
        0.0
    } else {
        text::width(window, label, &label_font) + 6.0 * SCALE
    };
    text::draw(
        window,
        cx,
        label,
        x,
        y + text::baseline(0.0, BAND, font.size),
        &label_font,
    );
    text::draw(
        window,
        cx,
        value,
        x + advance,
        y + text::baseline(0.0, BAND, font.size),
        &font,
    );
}

fn paint_row(
    visual: &RowVisual,
    top: f32,
    row_height: f32,
    slot_count: usize,
    language: Language,
    window: &mut Window,
    cx: &mut App,
) {
    let row = &visual.row;
    let y = top + visual.y * row_height;
    let opacity = visual.opacity;
    let player = row.side == Side::Player;
    if player {
        paint_rect(
            window,
            0.0,
            y,
            SIZE.0,
            row_height,
            col(0xbfc2ca, 0.23 * opacity),
        );
        window.paint_quad(quad(
            rect(0.0, y, SIZE.0, row_height),
            Corners::all(px(0.0)),
            linear_gradient(
                180.0,
                linear_color_stop(col(0xffffff, 0.04 * opacity), 0.0),
                linear_color_stop(col(0xffffff, 0.0), 0.6),
            ),
            Edges::all(px(0.0)),
            col(0, 0.0),
            BorderStyle::default(),
        ));
        line(window, y, 0xffffff, 0.13 * opacity);
    }
    if let Some((color, alpha)) = visual.cue {
        paint_rect(
            window,
            0.0,
            y,
            SIZE.0,
            row_height,
            col(color, alpha * opacity),
        );
    }
    if visual.y < slot_count.saturating_sub(1) as f32 {
        let (color, alpha) = if player {
            (0xffffff, 0.08)
        } else {
            (tokens::INK, 0.1)
        };
        line(window, y + row_height - SCALE, color, alpha * opacity);
    }
    let edges = EDGES;
    let position = ink(
        13.0 * SCALE,
        600.0,
        -0.02,
        col(
            if player { 0xffffff } else { 0xb9bbc1 },
            opacity * if row.position_stale { 0.6 } else { 1.0 },
        ),
    );
    // Posición 2ch + hueco 4 + tick 3, centrado como el grid del productivo.
    let two_ch = text::width(window, "00", &ink(13.0 * SCALE, 600.0, 0.0, position.color));
    let identity_x = (edges[1] - two_ch - 7.0 * SCALE) / 2.0;
    let pos_x = identity_x + (two_ch - text::width(window, &row.position, &position)) / 2.0;
    text::draw(
        window,
        cx,
        &row.position,
        pos_x,
        text::baseline(y, row_height, position.size),
        &position,
    );
    let color = match row.class.to_uppercase().as_str() {
        "HYPERCAR" => 0xc1121f,
        "LMP2" => 0x0055a4,
        "LMP3" => 0xf59e0b,
        "GT3" | "LMGT3" => 0x2ecc71,
        _ => 0x6b7280,
    };
    paint_rect(
        window,
        identity_x + two_ch + 4.0 * SCALE,
        y + (row_height - 14.0) / 2.0,
        3.0 * SCALE,
        14.0 * SCALE,
        col(color, position.color.a),
    );
    let number = ink(11.0 * SCALE, 600.0, -0.02, col(0xa5a5ab, opacity));
    cell(
        window,
        cx,
        &row.number,
        edges[2],
        edges[3],
        text::baseline(y, row_height, number.size),
        &number,
        true,
    );
    let name = ink(14.0 * SCALE, 700.0, -0.025, col(tokens::INK, opacity));
    let badge = row
        .lap_delta
        .filter(|delta| *delta != 0 && !player)
        .map(|delta| {
            format!(
                "{}{} {}",
                if delta > 0 { "+" } else { "−" },
                delta.unsigned_abs(),
                if language == Language::Es { "V" } else { "L" }
            )
        });
    let badge_font = ink(8.0 * SCALE, 650.0, 0.01, col(0xc6c6cb, opacity));
    let badge_width = badge.as_ref().map_or(0.0, |value| {
        text::width(window, value, &badge_font) + 10.0 * SCALE
    });
    let value = text::fit(
        window,
        &row.driver.to_uppercase(),
        &name,
        edges[4]
            - edges[3]
            - 10.0 * SCALE
            - if badge.is_some() {
                badge_width + 7.0 * SCALE
            } else {
                0.0
            },
    );
    // Cada tamaño de letra comparte el centro vertical de la fila.
    text::draw(
        window,
        cx,
        &value,
        edges[3],
        text::baseline(y, row_height, name.size),
        &name,
    );
    if let Some(value) = badge {
        let x = edges[4] - 10.0 * SCALE - badge_width;
        window.paint_quad(quad(
            rect(x, y + (row_height - 14.0) / 2.0, badge_width, 14.0 * SCALE),
            Corners::all(px(3.0 * SCALE)),
            col(0, 0.0),
            Edges::all(px(SCALE)),
            col(tokens::INK, 0.16 * opacity),
            BorderStyle::default(),
        ));
        text::draw(
            window,
            cx,
            &value,
            x + 5.0 * SCALE,
            y + 17.0 * SCALE,
            &badge_font,
        );
    }
    let gap = ink(
        16.0 * SCALE,
        650.0,
        -0.02,
        col(tokens::INK, opacity * if row.gap_stale { 0.6 } else { 1.0 }),
    );
    cell(
        window,
        cx,
        &row.gap,
        edges[4],
        edges[5],
        text::baseline(y, row_height, gap.size),
        &gap,
        false,
    );
    let lap = ink(
        13.0 * SCALE,
        600.0,
        -0.02,
        col(
            0xe6e5e9,
            opacity * if row.best_lap_stale { 0.6 } else { 1.0 },
        ),
    );
    cell(
        window,
        cx,
        &row.best_lap,
        edges[5],
        edges[6],
        text::baseline(y, row_height, lap.size),
        &lap,
        false,
    );
}

fn paint_configured_row(
    visual: &RowVisual,
    top: f32,
    height: f32,
    settings: &Settings,
    language: Language,
    window: &mut Window,
    cx: &mut App,
) {
    let row = &visual.row;
    let y = top + visual.y * height;
    if row.side == Side::Player {
        paint_rect(
            window,
            0.0,
            y,
            SIZE.0,
            height,
            col(0xbfc2ca, 0.23 * visual.opacity),
        );
    }
    if let Some((color, alpha)) = visual.cue {
        paint_rect(
            window,
            0.0,
            y,
            SIZE.0,
            height,
            col(color, alpha * visual.opacity),
        );
    }
    if visual.y < settings.slot_count().saturating_sub(1) as f32 {
        line(
            window,
            y + height - SCALE,
            tokens::INK,
            0.1 * visual.opacity,
        );
    }
    let columns: Vec<_> = settings
        .columns
        .iter()
        .flatten()
        .filter(|c| {
            c.enabled
                && [
                    "position",
                    "class",
                    "carNumber",
                    "driverName",
                    "gap",
                    "bestLap",
                    "lastLap",
                ]
                .contains(&c.metric_id.as_str())
        })
        .take(7)
        .collect();
    let total = columns
        .iter()
        .map(|c| c.relative_width())
        .sum::<f32>()
        .max(1.0);
    let has_position = columns.iter().any(|c| c.metric_id == "position");
    let has_class = columns.iter().any(|c| c.metric_id == "class");
    let mut x = 0.0;
    for column in columns {
        let w = column.relative_width() / total * SIZE.0;
        let stale = match column.metric_id.as_str() {
            "position" => row.position_stale,
            "gap" => row.gap_stale,
            "bestLap" => row.best_lap_stale,
            "lastLap" => row.last_lap_stale,
            _ => false,
        };
        let value = match column.metric_id.as_str() {
            "position" => row.position.to_string(),
            "class" => String::new(),
            "carNumber" => row.number.clone(),
            "driverName" => column.driver_name(&row.driver).to_uppercase(),
            "gap" => row.gap.to_string(),
            "bestLap" => row.best_lap.to_string(),
            "lastLap" => row.last_lap.to_string(),
            _ => "—".into(),
        };
        let centered = column.style.align.as_deref().map_or(
            matches!(
                column.metric_id.as_str(),
                "position" | "class" | "carNumber"
            ),
            |v| v == "center",
        );
        let font = ink(
            if column.metric_id == "driverName" {
                14.0
            } else if column.metric_id == "gap" {
                16.0
            } else {
                13.0
            } * SCALE,
            if column.metric_id == "driverName" {
                700.0
            } else {
                600.0
            },
            -0.02,
            col(tokens::INK, visual.opacity * if stale { 0.6 } else { 1.0 }),
        );
        let baseline = text::baseline(y, height, font.size);
        if (column.metric_id == "class" && !has_position)
            || (column.metric_id == "position" && has_class)
        {
            let color = match row.class.to_uppercase().as_str() {
                "HYPERCAR" => 0xc1121f,
                "LMP2" => 0x0055a4,
                "LMP3" => 0xf59e0b,
                "GT3" | "LMGT3" => 0x2ecc71,
                _ => 0x6b7280,
            };
            paint_rect(
                window,
                x + w - 4.0 * SCALE,
                y + (height - 14.0 * SCALE) / 2.0,
                3.0 * SCALE,
                14.0 * SCALE,
                col(color, visual.opacity),
            );
        }
        // Clase es un tick, nunca una celda de texto vacía recortada con elipsis.
        if column.metric_id == "class" {
            x += w;
            continue;
        }
        if column.style.align.as_deref() == Some("left")
            || (column.metric_id == "driverName" && column.style.align.is_none())
        {
            let badge = (column.metric_id == "driverName" && row.side != Side::Player)
                .then_some(row.lap_delta)
                .flatten()
                .filter(|delta| *delta != 0)
                .map(|delta| {
                    format!(
                        "{}{} {}",
                        if delta > 0 { "+" } else { "−" },
                        delta.unsigned_abs(),
                        if language == Language::Es { "V" } else { "L" }
                    )
                });
            let badge_font = ink(8.0 * SCALE, 650.0, 0.01, col(0xc6c6cb, visual.opacity));
            let badge_width = badge
                .as_ref()
                .map_or(0.0, |v| text::width(window, v, &badge_font) + 10.0 * SCALE);
            let reserve = if badge.is_some() {
                badge_width + 7.0 * SCALE
            } else {
                0.0
            };
            let fitted = text::fit(window, &value, &font, (w - 10.0 * SCALE - reserve).max(0.0));
            text::draw(window, cx, &fitted, x, baseline, &font);
            if let Some(badge) = badge {
                let bx = x + w - 10.0 * SCALE - badge_width;
                let by = y + (height - 14.0 * SCALE) / 2.0;
                window.paint_quad(quad(
                    rect(bx, by, badge_width, 14.0 * SCALE),
                    Corners::all(px(3.0 * SCALE)),
                    col(0, 0.0),
                    Edges::all(px(SCALE)),
                    col(tokens::INK, 0.16 * visual.opacity),
                    BorderStyle::default(),
                ));
                text::draw(
                    window,
                    cx,
                    &badge,
                    bx + 5.0 * SCALE,
                    by + 10.0 * SCALE,
                    &badge_font,
                );
            }
        } else {
            cell(window, cx, &value, x, x + w, baseline, &font, centered);
        }
        x += w;
    }
}

fn cell(
    window: &mut Window,
    cx: &mut App,
    value: &str,
    left: f32,
    right: f32,
    baseline: f32,
    font: &Ink,
    centered: bool,
) {
    let fitted = text::fit(window, value, font, right - left - 12.0 * SCALE);
    let width = text::width(window, &fitted, font);
    let x = if centered {
        (left + right - width) / 2.0
    } else {
        right - 6.0 * SCALE - width
    };
    text::draw(window, cx, &fitted, x, baseline, font);
}

#[cfg(test)]
mod idle_tests {
    use super::*;
    #[test]
    fn idle_frame_reuses_rows_and_new_facts_invalidate_them() {
        let prefs = Preferences::default();
        let snapshot = crate::source::fixed();
        let board = Arc::new(vantare_domain::relative::project(&snapshot, prefs));
        let mut visual = Visual::new(&Settings::eficiencia(), board);
        let mut motion = Motion::default();
        assert_eq!(visual.frame(prefs, false, &motion).1, Wake::Idle);
        let idle = visual.idle_rows.clone().expect("filas quietas");
        assert!(!idle.is_empty());
        assert_eq!(visual.frame(prefs, false, &motion).1, Wake::Idle);
        assert!(Arc::ptr_eq(
            &idle,
            visual.idle_rows.as_ref().expect("misma presentación")
        ));
        let mut next = snapshot;
        next.state.source_state = vantare_domain::SourceState::Lost;
        visual.ingest(
            Arc::new(vantare_domain::relative::project(&next, prefs)),
            &mut motion,
            true,
        );
        assert!(visual.idle_rows.is_none());
        drop(visual.frame(prefs, false, &motion));
        assert!(!Arc::ptr_eq(
            &idle,
            visual.idle_rows.as_ref().expect("nuevo estado")
        ));
    }
}
