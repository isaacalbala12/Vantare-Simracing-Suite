//! Both Looks consume this exact visible output. No sorting, clocks or transport here.
use super::{
    Standings,
    layout::{self, Layout},
};
use crate::{
    eficiencia as ef,
    vantare::{
        self, Style,
        paint::{Face, font},
    },
};
use rune::{Align, Color, El, Spring, el, text};
use vantare_domain::{
    TyreCompound,
    format::{Language, PLACEHOLDER, Preferences},
    standings::{Banner, Mark, Pit, Plan, SelectedRow},
    widget_settings::{
        columns::ColumnSetting,
        look::{Accent, Look, Tone},
        standings::Settings,
    },
};

#[derive(Clone, Debug, PartialEq)]
pub(super) struct Cell {
    pub text: String,
    pub ink: Color,
    pub align: Align,
}
#[derive(Clone, Debug, PartialEq)]
pub(super) struct Row {
    pub id: u32,
    pub player: bool,
    pub class: String,
    pub cells: Vec<Cell>,
}
#[derive(Clone, Debug, PartialEq)]
pub(super) struct Display {
    pub title: String,
    pub right: String,
    pub banner: String,
    pub status: String,
    pub labels: Vec<String>,
    pub rows: Vec<Row>,
    pub footer: Vec<String>,
    pub paused: bool,
}
impl Display {
    pub fn new(
        settings: &Settings,
        prefs: Preferences,
        plan: &Plan,
        layout: &Layout,
        paused: bool,
    ) -> Self {
        let s = Style::compiled();
        let es = prefs.language == Language::Es;
        let title = if plan.session_label() == PLACEHOLDER {
            if es { "CLASIFICACIÓN" } else { "STANDINGS" }.into()
        } else {
            plan.session_label().to_uppercase()
        };
        let banner = plan
            .board
            .banner
            .as_ref()
            .map_or_else(String::new, |banner| match banner {
                Banner::FullCourseYellow => "FCY".into(),
                Banner::LocalYellow(sector) => format!(
                    "{} {sector}",
                    if es {
                        "AMARILLA · SECTOR"
                    } else {
                        "YELLOW · SECTOR"
                    }
                ),
                Banner::FinalLap => if es { "ÚLTIMA VUELTA" } else { "FINAL LAP" }.into(),
            });
        let rows = plan
            .rows
            .iter()
            .map(|row| Row {
                id: row.id.0,
                player: row.is_player,
                class: row.class.to_string(),
                cells: layout
                    .columns
                    .iter()
                    .map(|column| cell(row, &column.setting, plan, &s))
                    .collect(),
            })
            .collect();
        Self {
            title,
            right: format!("{} · {}", plan.active_class(), plan.remaining_text()),
            banner,
            status: plan.status.text(prefs.language).unwrap_or_default().into(),
            labels: layout
                .columns
                .iter()
                .map(|c| {
                    layout::label(
                        &c.setting.metric_id,
                        prefs.language,
                        plan.board.gap_to_best_lap,
                    )
                    .into()
                })
                .collect(),
            rows,
            footer: if settings.show_session_footer {
                plan.board
                    .footer_cells
                    .iter()
                    .map(|c| format!("{} {}", c.label, c.value))
                    .collect()
            } else {
                Vec::new()
            },
            paused,
        }
    }
}

fn cell(row: &SelectedRow, column: &ColumnSetting, plan: &Plan, style: &Style) -> Cell {
    let metric = column.metric_id.as_str();
    let text = match metric {
        "position" => {
            if plan.board.content.multiclass && row.class_position > 0 {
                row.class_position.to_string()
            } else {
                row.row.position.clone()
            }
        }
        "positionsGained" => row.gained.map_or_else(
            || PLACEHOLDER.into(),
            |n| {
                if n > 0 {
                    format!("+{n}")
                } else {
                    n.to_string()
                }
            },
        ),
        "driverNumber" | "carNumber" => row.number.clone(),
        "driverName" => vantare_domain::standings::driver_name(
            &row.driver,
            &column.format.mode,
            column.format.max_chars.unwrap_or(16),
        ),
        "class" | "vehicleClass" => row.class.to_string(),
        "lastLap" => plan.last_lap(row).into(),
        "bestLap" => plan.best_lap(row).into(),
        "gap" => row.classification_gap.clone(),
        "interval" => plan.interval(row).into(),
        "currentLap" => plan.current_lap(row).into(),
        "tireCompound" => row.compound.map_or_else(
            || PLACEHOLDER.into(),
            |c| {
                match c {
                    TyreCompound::Soft => "S",
                    TyreCompound::Medium => "M",
                    TyreCompound::Hard => "H",
                    TyreCompound::Wet => "W",
                }
                .into()
            },
        ),
        "pit" => match row.pit {
            Pit::InPits => "BOX".into(),
            Pit::Stops(n) => n.to_string(),
            Pit::Unknown => PLACEHOLDER.into(),
        },
        "sectors" => row
            .sectors
            .iter()
            .map(|m| if *m == Mark::Pending { "—" } else { "▪" })
            .collect::<Vec<_>>()
            .join(" "),
        _ => PLACEHOLDER.into(),
    };
    let ink = match metric {
        "positionsGained" => {
            if row.gained.unwrap_or(0) >= 0 {
                style.colors.gain
            } else {
                style.colors.loss
            }
        }
        "bestLap" => mark(row.best_mark, style),
        "driverNumber" | "carNumber" | "class" | "vehicleClass" => style.class(&row.class).ink,
        "pit" if row.in_pits => style.colors.box_text,
        "gap" | "interval" if plan.board.banner == Some(Banner::FullCourseYellow) => {
            style.colors.frozen
        }
        "driverName" => style.colors.text,
        _ => style.colors.value,
    };
    let align = match column.style.align.as_deref() {
        Some("left") => Align::Start,
        Some("center") => Align::Center,
        Some("right") => Align::End,
        _ => {
            if matches!(metric, "driverName" | "class" | "vehicleClass") {
                Align::Start
            } else {
                Align::End
            }
        }
    };
    Cell { text, ink, align }
}
fn mark(value: Mark, s: &Style) -> Color {
    match value {
        Mark::Fastest => s.colors.purple,
        Mark::Personal => s.colors.green,
        Mark::Slower => s.colors.yellow,
        Mark::Pending => s.colors.muted,
    }
}

/// Explicitly settled migration draft. No implicit springs or permanent animation wake.
/// Position/alert animation will use the common visual scene, never a Look's clock.
pub(super) fn view(state: &Standings) -> El {
    match state.settings.design_system {
        Look::Vantare => vantare_view(state),
        Look::Eficiencia => eficiencia_view(state),
    }
}
fn vantare_view(state: &Standings) -> El {
    let s = Style::compiled();
    let v = if state.settings.style == Tone::Neo {
        &s.styles.neo
    } else {
        &s.styles.neutro
    };
    let accent = match state.settings.accent {
        Accent::Red => s.accents.red,
        Accent::Amber => s.accents.amber,
        Accent::Green => s.accents.green,
        Accent::White => s.accents.white,
    };
    let l = &state.layout;
    let mut root = el()
        .key("standings-vantare")
        .size(l.width, l.height)
        .motion(Spring::NONE)
        .child(
            el().key("panel")
                .size(l.width, l.content_height)
                .radius(v.radius)
                .linear_gradient(90.0, [(0.0, v.top), (1.0, v.bottom)])
                .border(
                    1.0,
                    if v.border_accent > 0.0 {
                        vantare::alpha(accent, v.border_accent)
                    } else {
                        v.border
                    },
                ),
        );
    let header_y = if l.banner > 0.0 { l.banner } else { 0.0 };
    root = root.child(vlabel(
        &s,
        "title",
        &state.display.title,
        l.pad,
        header_y,
        l.width * 0.55,
        l.header,
        if v.header_display {
            Face::Display
        } else {
            Face::Body
        },
        v.header_size,
        v.header_color,
    ));
    root = root.child(vlabel(
        &s,
        "session",
        &state.display.right,
        l.width * 0.55,
        header_y,
        l.width * 0.45 - l.pad,
        l.header,
        Face::Body,
        s.fonts.small,
        s.colors.muted,
    ));
    if state
        .settings
        .brand_visible
        .unwrap_or(state.settings.show_brand)
    {
        root = root.child(vlabel(
            &s,
            "brand",
            "VANTARE",
            l.width - 90.0,
            header_y,
            80.0,
            12.0,
            Face::Display,
            12.0,
            accent,
        ));
    }
    root = table(root, state, |key, value, x, y, w, h, ink, align| {
        vlabel(&s, key, value, x, y, w, h, Face::Body, s.fonts.body, ink).align(align)
    });
    footer(root, state, |key, value, x, y, w, h| {
        vlabel(
            &s,
            key,
            value,
            x,
            y,
            w,
            h,
            Face::Body,
            s.fonts.small,
            s.colors.muted,
        )
    })
}

#[allow(clippy::too_many_arguments)] // A positioned text cell; no presentation policy hidden in it.
fn vlabel(
    s: &Style,
    key: &str,
    value: &str,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    face: Face,
    size: f32,
    ink: Color,
) -> El {
    text(value)
        .key(key)
        .absolute(x, y)
        .size(w.max(0.0), h)
        .color(ink)
        .font(font(s, face, size, h, 0.0, s.fonts.regular_weight))
        .truncate_fade_width(0.0)
}

fn eficiencia_view(state: &Standings) -> El {
    let l = &state.layout;
    let mut root = ef::panel(l.width, l.content_height)
        .key("standings-eficiencia")
        .motion(Spring::NONE)
        .size(l.width, l.height)
        .child(ef::outline(l.width, l.content_height));
    if state.settings.show_session_header {
        root = root.child(eflabel(
            "title",
            &state.display.title,
            12.0,
            l.banner,
            l.width * 0.6,
            l.header,
            ef::color(ef::INK, 1.0),
            Align::Start,
        ));
        root = root.child(eflabel(
            "session",
            &state.display.right,
            l.width * 0.6,
            l.banner,
            l.width * 0.4 - 12.0,
            l.header,
            ef::color(ef::MUTED, 1.0),
            Align::End,
        ));
    }
    if state
        .settings
        .brand_visible
        .unwrap_or(state.settings.show_brand)
    {
        root = root.child(eflabel(
            "brand",
            "VANTARE",
            12.0,
            l.banner,
            100.0,
            12.0,
            ef::color(ef::INK, 1.0),
            Align::Start,
        ));
    }
    root = table(root, state, eflabel);
    footer(root, state, |key, value, x, y, w, h| {
        eflabel(
            key,
            value,
            x,
            y,
            w,
            h,
            ef::color(ef::MUTED, 1.0),
            Align::Start,
        )
    })
}
#[allow(clippy::too_many_arguments)] // Mirrors a fixed table cell.
fn eflabel(key: &str, value: &str, x: f32, y: f32, w: f32, h: f32, ink: Color, align: Align) -> El {
    text(value)
        .key(key)
        .absolute(x + 4.0, y)
        .size((w - 8.0).max(0.0), h)
        .color(ink)
        .align(align)
        .font(ef::font(14.0, 650, -0.025))
        .truncate_fade_width(0.0)
}

fn table(
    mut root: El,
    state: &Standings,
    label: impl Fn(&str, &str, f32, f32, f32, f32, Color, Align) -> El,
) -> El {
    let l = &state.layout;
    let s = Style::compiled();
    if !state.display.banner.is_empty() {
        root = root.child(
            el().key("banner")
                .size(l.width, l.banner)
                .fill(s.colors.fcy_fill)
                .child(label(
                    "banner-text",
                    &state.display.banner,
                    8.0,
                    0.0,
                    l.width - 16.0,
                    l.banner,
                    s.colors.fcy_text,
                    Align::Start,
                )),
        );
    }
    for (index, column) in l.columns.iter().enumerate() {
        root = root.child(label(
            &format!("column-{index}"),
            &state.display.labels[index],
            column.x,
            l.header + l.banner,
            column.width,
            l.column_header,
            s.colors.muted,
            Align::Start,
        ));
    }
    for (y, class) in &l.classes {
        root = root.child(label(
            &format!("class-{class}"),
            class,
            l.pad,
            *y,
            l.width - 2.0 * l.pad,
            20.0,
            s.class(class).ink,
            Align::Start,
        ));
    }
    for (index, row) in state.display.rows.iter().enumerate() {
        let y = l.rows[index];
        let mut item = el()
            .key(format!("car-{}", row.id))
            .absolute(0.0, y)
            .size(l.width, l.row)
            .motion(Spring::NONE);
        if row.player {
            item = item
                .child(
                    el().key("player-fill")
                        .size(l.width, l.row)
                        .fill(vantare::alpha(s.class(&row.class).tint, 0.17)),
                )
                .child(
                    el().key("player-marker")
                        .size(2.0, l.row - 4.0)
                        .absolute(0.0, 2.0)
                        .fill(s.accents.red),
                );
        }
        for (column_index, (cell, column)) in row.cells.iter().zip(&l.columns).enumerate() {
            item = item.child(label(
                &format!("cell-{column_index}"),
                &cell.text,
                column.x,
                0.0,
                column.width,
                l.row,
                cell.ink,
                cell.align,
            ));
        }
        root = root.child(item);
    }
    if !state.display.status.is_empty() {
        root = root.child(label(
            "status",
            &state.display.status,
            l.pad,
            l.header + l.column_header + l.banner,
            l.width - 2.0 * l.pad,
            22.0,
            s.colors.muted,
            Align::Center,
        ));
    }
    root
}
fn footer(
    mut root: El,
    state: &Standings,
    label: impl Fn(&str, &str, f32, f32, f32, f32) -> El,
) -> El {
    let l = &state.layout;
    if l.footer > 0.0 {
        let w = (l.width - 2.0 * l.pad) / 3.0;
        for (index, value) in state.display.footer.iter().enumerate() {
            root = root.child(label(
                &format!("footer-{index}"),
                value,
                l.pad + (index % 3) as f32 * w,
                l.content_height - l.footer + (index / 3) as f32 * 14.0,
                w,
                14.0,
            ));
        }
    }
    if state.display.paused {
        let text = if state.prefs.language == Language::Es {
            "Pausa · última imagen"
        } else {
            "Paused · last frame"
        };
        root = root.child(label("paused", text, 0.0, l.height - 22.0, l.width, 22.0));
    }
    root
}
