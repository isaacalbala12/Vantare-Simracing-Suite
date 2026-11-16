//! Salida visible retenida de Standings, común a los pintores: textos, tintas y
//! rellenos ya decididos. Sin Rune, sin ventana y sin reloj.
use super::layout::{self, Layout};
use crate::vantare::Style;
use rune::{Align, Color};
use vantare_domain::{
    TyreCompound,
    format::{Language, PLACEHOLDER, Preferences},
    standings::{Banner, Mark, Pit, Plan, SelectedRow},
    widget_settings::{columns::ColumnSetting, standings::Settings},
};

#[derive(Clone, Debug, PartialEq)]
pub struct Cell {
    pub text: String,
    pub ink: Color,
    pub align: Align,
    pub segments: Vec<Color>,
    pub fill: Option<Color>,
}
#[derive(Clone, Debug, PartialEq)]
pub struct Row {
    pub id: u32,
    pub player: bool,
    pub class: String,
    pub cells: Vec<Cell>,
}
#[derive(Clone, Debug, PartialEq)]
pub struct Display {
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
                    .map(|column| {
                        let mut cell = cell(row, &column.setting, plan, &s);
                        if column.setting.metric_id == "driverName"
                            && layout.vehicle
                            && !row.vehicle.is_empty()
                        {
                            cell.text.push_str(" · ");
                            cell.text.push_str(&row.vehicle);
                        }
                        cell
                    })
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
        "sectors" => String::new(),
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
    let segments = if metric == "sectors" {
        row.sectors.iter().map(|m| mark(*m, style)).collect()
    } else {
        Vec::new()
    };
    let fill = match metric {
        "driverNumber" | "carNumber" => Some(style.class(&row.class).tint),
        "pit" => Some(if row.in_pits {
            style.colors.box_fill
        } else {
            style.colors.stops_fill
        }),
        "tireCompound" => row.compound.map(|compound| match compound {
            TyreCompound::Soft => style.colors.compound_soft,
            TyreCompound::Medium => style.colors.compound_medium,
            TyreCompound::Hard => style.colors.compound_hard,
            TyreCompound::Wet => style.colors.compound_wet,
        }),
        _ => None,
    };
    Cell {
        text,
        ink,
        align,
        segments,
        fill,
    }
}

fn mark(value: Mark, s: &Style) -> Color {
    match value {
        Mark::Fastest => s.colors.purple,
        Mark::Personal => s.colors.green,
        Mark::Slower => s.colors.yellow,
        Mark::Pending => s.colors.muted,
    }
}
