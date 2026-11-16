//! Presentación del Look Vantare: solo geometría. Filtrar, ordenar, gaps y
//! formatos viven en domain.
use crate::vantare::Style;
use vantare_domain::{
    Snapshot,
    format::Language,
    standings::{Content, LapFormat, Plan},
    widget_session::Session,
    widget_settings::{
        columns::ColumnSetting,
        look::Tone,
        standings::{Settings, vantare_template},
    },
};

pub(super) fn columns(settings: &Settings, snapshot: Option<&Snapshot>) -> Vec<ColumnSetting> {
    let session = snapshot.and_then(|s| Session::of(&s.state.session.kind));
    let selected = match session {
        Some(Session::Practice) => settings.practice_columns.as_ref(),
        Some(Session::Qualifying) => settings.qualifying_columns.as_ref(),
        _ => None,
    }
    .or(settings.columns.as_ref());
    let mut columns = selected
        .cloned()
        .unwrap_or_else(|| vantare_template("standard"));
    columns.retain(|c| c.enabled);
    // Position and driver are structural, including custom column lists.
    columns.retain(|c| c.metric_id != "position");
    columns.insert(
        0,
        ColumnSetting {
            metric_id: "position".into(),
            ..Default::default()
        },
    );
    if !columns.iter().any(|c| c.metric_id == "driverName") {
        columns.insert(
            1,
            ColumnSetting {
                metric_id: "driverName".into(),
                ..Default::default()
            },
        );
    }
    let mut seen = std::collections::BTreeSet::new();
    columns.retain(|c| supported(&c.metric_id) && seen.insert(c.metric_id.clone()));
    columns
}
fn supported(metric: &str) -> bool {
    matches!(
        metric,
        "position"
            | "positionsGained"
            | "driverNumber"
            | "carNumber"
            | "driverName"
            | "vehicle"
            | "tireCompound"
            | "pit"
            | "sectors"
            | "currentLap"
            | "lastLap"
            | "bestLap"
            | "interval"
            | "gap"
    )
}
pub(super) fn content(settings: &Settings, columns: &[ColumnSetting]) -> Content {
    let lap = |metric: &str| {
        columns
            .iter()
            .find(|c| c.metric_id == metric)
            .map(|c| LapFormat {
                compact: c.format.display.as_deref() == Some("compact"),
                decimals: c.format.decimals.unwrap_or(3),
            })
    };
    let slots = settings.footer_slots.as_ref().filter(|v| !v.is_empty());
    Content {
        player_class: settings.class_scope != "all-classes",
        class_gaps: settings.class_scope != "all-classes"
            || settings.classification_mode == "multiclass",
        row_count: settings.row_count,
        player_window: settings.player_window,
        window_around: settings.window_around,
        multiclass: settings.classification_mode == "multiclass",
        last_lap_format: lap("lastLap"),
        best_lap_format: lap("bestLap"),
        lap_visible: columns.iter().any(|c| c.metric_id == "currentLap"),
        interval_visible: columns.iter().any(|c| c.metric_id == "interval"),
        footer_visible: settings.show_session_footer,
        legacy_track_visible: settings.show_session_footer
            && slots.is_none()
            && [&settings.footer_first, &settings.footer_second]
                .into_iter()
                .any(|v| v == "track"),
        footer_ids: slots.cloned().unwrap_or_else(|| {
            vec![
                settings.footer_first.clone(),
                settings.footer_second.clone(),
            ]
        }),
        footer_slots: slots.is_some(),
    }
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct Column {
    pub setting: ColumnSetting,
    pub x: f32,
    pub width: f32,
}
#[derive(Clone, Debug, PartialEq)]
pub(super) struct Layout {
    pub width: f32,
    pub height: f32,
    pub content_height: f32,
    pub header: f32,
    pub column_header: f32,
    pub row: f32,
    pub footer: f32,
    pub pad: f32,
    pub columns: Vec<Column>,
    pub rows: Vec<f32>,
    pub classes: Vec<(f32, String)>,
    pub banner: f32,
    pub vehicle: bool,
}
impl Layout {
    pub fn new(settings: &Settings, columns: &[ColumnSetting], plan: &Plan) -> Self {
        let style = Style::compiled();
        let variant = if settings.style == Tone::Neo {
            &style.styles.neo
        } else {
            &style.styles.neutro
        };
        let g = &style.geometry;
        let pad = variant.padding_x;
        let header = variant.header_height + variant.header_gap + variant.padding_y + 1.0;
        let column_header = g.column_header_height;
        let row = g.row_height;
        let banner = if plan.board.banner.is_some() {
            g.banner_height + g.banner_gap
        } else {
            0.0
        };
        let mut placed = Vec::new();
        let mut x = pad;
        for column in columns {
            if column.metric_id == "vehicle" {
                continue;
            } // Driver supplement, not another column.
            if !placed.is_empty() {
                x += g.cell_gap;
            }
            let width = width(column, &style);
            placed.push(Column {
                setting: column.clone(),
                x,
                width,
            });
            x += width;
        }
        let width = (x + pad).max(g.narrow_width);
        let mut rows = Vec::new();
        let mut classes = Vec::new();
        let mut y = header + column_header + banner;
        let mut last_class = None;
        for selected in &plan.rows {
            if settings.classification_mode == "multiclass"
                && last_class.as_ref() != Some(&selected.class)
            {
                classes.push((y, selected.class.to_string()));
                y += g.separator_height + g.separator_gap_top + g.separator_gap_bottom;
                last_class = Some(selected.class.clone());
            }
            rows.push(y);
            y += row;
        }
        // Signature keeps its configured capacity; the last two controls cannot clip.
        y += settings.row_count.saturating_sub(plan.rows.len()) as f32 * row;
        let footer = if settings.show_session_footer {
            g.footer_height + 2.0 * g.footer_gap + 1.0
        } else {
            0.0
        };
        let height = y + footer + variant.padding_y + 1.0;
        Self {
            width,
            height,
            content_height: height,
            header,
            column_header,
            row,
            footer,
            pad,
            columns: placed,
            rows,
            classes,
            banner,
            vehicle: columns.iter().any(|c| c.metric_id == "vehicle"),
        }
    }
}
fn width(c: &ColumnSetting, s: &Style) -> f32 {
    let g = &s.geometry;
    match c.metric_id.as_str() {
        "position" => g.col_position,
        "positionsGained" => g.col_gained,
        "driverNumber" | "carNumber" => g.class_dot + g.cell_gap + g.number_min_width,
        "driverName" => match c.width_preset.as_str() {
            "xs" => g.driver_xs,
            "sm" => g.driver_sm,
            "lg" => g.driver_lg,
            _ => g.driver_md,
        },
        "pit" => g.col_pit,
        "tireCompound" => g.compound_size,
        "currentLap" => 34.0,
        "sectors" => 3.0 * g.sector_width + 2.0 * g.sector_gap,
        "lastLap" | "bestLap" => g.col_lap,
        _ => g.col_gap,
    }
}
pub(super) fn label(metric: &str, language: Language, pace: bool) -> &'static str {
    let es = language == Language::Es;
    match metric {
        "position" => "POS",
        "positionsGained" => "+/-",
        "driverNumber" | "carNumber" => "NO",
        "driverName" => {
            if es {
                "PILOTO"
            } else {
                "DRIVER"
            }
        }
        "vehicleClass" | "class" => {
            if es {
                "CLASE"
            } else {
                "CLASS"
            }
        }
        "gap" => match (es, pace) {
            (true, true) => "AL MEJOR",
            (false, true) => "TO BEST",
            (true, false) => "AL LÍDER",
            _ => "TO LEADER",
        },
        "interval" => {
            if es {
                "INTERVALO"
            } else {
                "INTERVAL"
            }
        }
        "lastLap" => {
            if es {
                "ÚLT. VUELTA"
            } else {
                "LAST LAP"
            }
        }
        "bestLap" => {
            if es {
                "MEJOR V."
            } else {
                "BEST LAP"
            }
        }
        "currentLap" => {
            if es {
                "VUELTA"
            } else {
                "LAP"
            }
        }
        "pit" => "PIT",
        "sectors" => "S1 / S2 / S3",
        "tireCompound" => "TYRE",
        _ => "",
    }
}
