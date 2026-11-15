//! Dibujo de Relative Eficiencia. Recibe la proyección canónica; no ordena coches,
//! no calcula gaps ni cadencias. La captura usa exactamente esta vista.
use crate::eficiencia::{self as kit, INK, MUTED, baseline, color, fit, font, label, rect, width};
use rune::{El, el};
use vantare_domain::{
    format::Language,
    relative::{Board, Row, Side},
    standings::InfoCell,
    widget_settings::{columns::ColumnSetting, relative::Settings},
};

pub const WIDTH: f32 = 470.0;
const BAND: f32 = 36.0;
const FOOTER: f32 = 38.0;
const ROW: f32 = 29.0;

/// Muestra ya resuelta por el movimiento común, en unidades de fila.
pub struct RowPaint<'a> {
    pub row: &'a Row,
    pub y: f32,
    pub opacity: f32,
    pub cue: Option<(u32, f32)>,
}

pub fn natural_size(settings: &Settings) -> (f32, f32) {
    let settings = settings.normalized();
    let slots = settings.range_ahead + settings.range_behind + usize::from(settings.include_player);
    (WIDTH, BAND + FOOTER + slots as f32 * ROW)
}

/// Vista asentada: también es el punto de entrada para capturar una escena fija.
pub fn view(board: &Board, settings: &Settings, language: Language) -> El {
    let rows: Vec<_> = board
        .slots
        .iter()
        .enumerate()
        .filter_map(|(slot, row)| {
            row.as_ref().map(|row| RowPaint {
                row,
                y: slot as f32,
                opacity: 1.0,
                cue: None,
            })
        })
        .collect();
    view_rows(board, settings, language, &rows)
}

pub fn view_rows(
    board: &Board,
    settings: &Settings,
    language: Language,
    rows: &[RowPaint<'_>],
) -> El {
    let settings = settings.normalized();
    let (w, h) = natural_size(&settings);
    let count = settings.range_ahead + settings.range_behind + usize::from(settings.include_player);
    let footer_h = if board.footer_cells.is_empty() {
        FOOTER
    } else {
        (15.0 + footer_rows(&board.footer_cells) as f32 * 14.0).max(FOOTER)
    };
    let has_meta = !board.track.is_empty() || !board.player_badge.is_empty();
    let meta_bottom = if has_meta { BAND } else { 0.0 };
    let top = meta_bottom + if board.status.is_some() { 38.0 } else { 0.0 };
    let row_h = ((h - footer_h - top).max(0.0) / count.max(1) as f32).min(ROW);
    let mut panel = kit::panel(w, h).key("relative-eficiencia");
    if has_meta {
        let track_label = if language == Language::Es {
            "PISTA"
        } else {
            "TRACK"
        };
        let value_font = font(14.0, 650, -0.01);
        let label_font = font(11.0, 600, 0.1);
        let badge_w = width(&board.player_badge, value_font);
        let track = fit(
            &board.track,
            value_font,
            (w - badge_w - width(track_label, label_font) - 42.0).max(0.0),
        );
        panel = panel
            .child(rect(0.0, BAND - 1.0, w, 1.0, color(INK, 0.1)))
            .child(pair(
                track_label,
                &track,
                board.header_stale.track,
                12.0,
                0.0,
            ))
            .child(
                label(
                    &board.player_badge,
                    w - 12.0 - badge_w,
                    baseline(0.0, BAND, 14.0),
                    value_font,
                    color(INK, alpha(board.header_stale.player_badge)),
                )
                .key("player-badge"),
            );
    }
    if let Some(status) = &board.status {
        panel = panel.child(
            label(
                status,
                12.0,
                meta_bottom + baseline(10.0, 18.0, 12.0),
                font(12.0, 700, 0.0),
                color(0xe2c568, 1.0),
            )
            .key("status"),
        );
    }
    let mut body = el()
        .absolute(0.0, top)
        .size(w, (h - footer_h - top).max(0.0))
        .clip_soft(0.0)
        .key("rows");
    for row in rows {
        body = body.child(paint_row(row, row_h, count, &settings, language));
    }
    if rows.is_empty() && board.status.is_none() {
        body = body.child(
            label(
                if language == Language::Es {
                    "SIN DATOS"
                } else {
                    "NO DATA"
                },
                12.0,
                22.0,
                font(12.0, 600, 0.0),
                color(MUTED, 1.0),
            )
            .key("empty"),
        );
    }
    panel = panel.child(body);
    if !board.footer_cells.is_empty() && board.status.is_none() {
        panel = panel.child(footer(&board.footer_cells, h));
    } else {
        let weather = if language == Language::Es {
            ["AIRE", "PISTA", "VIENTO"]
        } else {
            ["AIR", "TRACK", "WIND"]
        };
        let session = [&board.session, &board.remaining]
            .into_iter()
            .filter(|s| !s.is_empty())
            .map(String::as_str)
            .collect::<Vec<_>>()
            .join(" ");
        let fields = [
            (
                "",
                session.as_str(),
                board.header_stale.session || board.header_stale.remaining,
            ),
            (weather[0], board.air.as_str(), board.header_stale.air),
            (
                weather[1],
                board.track_temperature.as_str(),
                board.header_stale.track_temperature,
            ),
            (weather[2], board.wind.as_str(), board.header_stale.wind),
        ];
        let widths = fields.map(|(l, v, _)| pair_width(l, v));
        let present = fields.iter().filter(|(_, v, _)| !v.is_empty()).count();
        if present > 0 {
            let mut x = (w
                - widths
                    .iter()
                    .zip(fields)
                    .filter(|(_, (_, v, _))| !v.is_empty())
                    .map(|(w, _)| w)
                    .sum::<f32>()
                - 16.0 * present.saturating_sub(1) as f32)
                / 2.0;
            panel = panel.child(rect(0.0, h - FOOTER, w, 1.0, color(INK, 0.1)));
            for ((l, v, stale), advance) in fields
                .into_iter()
                .zip(widths)
                .filter(|((_, v, _), _)| !v.is_empty())
            {
                if l.is_empty() && stale {
                    // La calidad de sesión y tiempo es independiente en GPUI.
                    let offset = if board.session.is_empty() || board.remaining.is_empty() {
                        0.0
                    } else {
                        pair_width("", &board.session) + width(" ", font(14.0, 650, -0.01))
                    };
                    panel = panel
                        .child(pair(
                            "",
                            &board.session,
                            board.header_stale.session,
                            x,
                            h - FOOTER,
                        ))
                        .child(pair(
                            "",
                            &board.remaining,
                            board.header_stale.remaining,
                            x + offset,
                            h - FOOTER,
                        ));
                } else {
                    panel = panel.child(pair(l, v, stale, x, h - FOOTER));
                }
                x += advance + 16.0;
            }
        }
    }
    panel.child(kit::outline(w, h))
}

fn alpha(stale: bool) -> f32 {
    if stale { 0.6 } else { 1.0 }
}
fn pair_width(l: &str, v: &str) -> f32 {
    width(v, font(14.0, 650, -0.01))
        + if l.is_empty() {
            0.0
        } else {
            width(l, font(11.0, 600, 0.1)) + 6.0
        }
}
fn pair(l: &str, v: &str, stale: bool, x: f32, y: f32) -> El {
    let label_font = font(11.0, 600, 0.1);
    let advance = if l.is_empty() {
        0.0
    } else {
        width(l, label_font) + 6.0
    };
    let base = y + baseline(0.0, BAND, 14.0);
    el().absolute(0.0, 0.0)
        .child(label(l, x, base, label_font, color(MUTED, 1.0)))
        .child(label(
            v,
            x + advance,
            base,
            font(14.0, 650, -0.01),
            color(INK, alpha(stale)),
        ))
}

fn class_color(class: &str) -> u32 {
    match class {
        "HYPERCAR" => 0xc1121f,
        "LMP2" => 0x0055a4,
        "LMP3" => 0xf59e0b,
        "GT3" | "LMGT3" => 0x2ecc71,
        _ => 0x6b7280,
    }
}

fn badge(row: &Row, language: Language) -> Option<String> {
    row.lap_delta
        .filter(|v| *v != 0 && row.side != Side::Player)
        .map(|v| {
            format!(
                "{}{} {}",
                if v < 0 { "−" } else { "+" },
                v.unsigned_abs(),
                if language == Language::Es { "V" } else { "L" }
            )
        })
}

fn paint_row(
    paint: &RowPaint<'_>,
    height: f32,
    count: usize,
    settings: &Settings,
    language: Language,
) -> El {
    let row = paint.row;
    let mut node = el()
        .absolute(0.0, paint.y * height)
        .size(WIDTH, height)
        .key(format!("car-{}", row.id.0))
        .opacity(paint.opacity);
    let configured = settings.columns.is_some();
    if row.side == Side::Player {
        node = node.fill(color(0xbfc2ca, 0.23));
        if !configured {
            node = node
                .child(el().absolute(0.0, 0.0).size(WIDTH, height).linear_gradient(
                    180.0,
                    [(0.0, color(0xffffff, 0.04)), (0.6, color(0xffffff, 0.0))],
                ))
                .child(rect(0.0, 0.0, WIDTH, 1.0, color(0xffffff, 0.13)));
        }
    }
    if let Some((rgb, a)) = paint.cue {
        node = node.child(rect(0.0, 0.0, WIDTH, height, color(rgb, a)));
    }
    if paint.y < count.saturating_sub(1) as f32 {
        node = node.child(rect(
            0.0,
            height - 1.0,
            WIDTH,
            1.0,
            color(
                if row.side == Side::Player && !configured {
                    0xffffff
                } else {
                    INK
                },
                if row.side == Side::Player && !configured {
                    0.08
                } else {
                    0.1
                },
            ),
        ));
    }
    let lap_badge = badge(row, language);
    let badge_font = font(8.0, 650, 0.01);
    let badge_w = lap_badge
        .as_ref()
        .map_or(0.0, |v| width(v, badge_font) + 10.0);
    let cells = if let Some(selected) = &settings.columns {
        columns(selected)
    } else {
        legacy_columns()
    };
    let has_class = cells.iter().any(|c| c.metric == "class");
    let has_position = cells.iter().any(|c| c.metric == "position");
    for cell in &cells {
        if cell.metric == "class" && !has_position
            || cell.metric == "position" && has_class
            || !configured && cell.metric == "position"
        {
            let x = if configured {
                cell.x + cell.w - 4.0
            } else {
                (30.0 - width("00", font(13.0, 600, 0.0)) - 7.0) / 2.0
                    + width("00", font(13.0, 600, 0.0))
                    + 4.0
            };
            node = node.child(rect(
                x,
                (height - 14.0) / 2.0,
                3.0,
                14.0,
                color(
                    class_color(&row.class),
                    if cell.metric == "position" {
                        alpha(row.position_stale)
                    } else {
                        1.0
                    },
                ),
            ));
        }
        if cell.metric == "class" {
            continue;
        }
        let (value, stale) = match cell.metric.as_str() {
            "position" => (row.position.to_string(), row.position_stale),
            "carNumber" => (row.number.clone(), false),
            "driverName" => (
                vantare_domain::standings::driver_name(
                    &row.driver,
                    &cell.name_mode,
                    cell.max_chars,
                )
                .to_uppercase(),
                false,
            ),
            "gap" => (row.gap.to_string(), row.gap_stale),
            "lastLap" => (row.last_lap.to_string(), row.last_lap_stale),
            _ => (row.best_lap.to_string(), row.best_lap_stale),
        };
        let driver = cell.metric == "driverName";
        let reserve = if driver && lap_badge.is_some() {
            badge_w + 7.0
        } else {
            0.0
        };
        let value = fit(
            &value,
            cell.font,
            (cell.w - if cell.left { 10.0 + reserve } else { 12.0 }).max(0.0),
        );
        let value_w = width(&value, cell.font);
        let x = if !configured && cell.metric == "position" {
            let two_ch = width("00", font(13.0, 600, 0.0));
            (30.0 - two_ch - 7.0) / 2.0 + (two_ch - value_w) / 2.0
        } else if cell.left {
            cell.x
        } else if cell.centered {
            cell.x + (cell.w - value_w) / 2.0
        } else {
            cell.x + cell.w - 6.0 - value_w
        };
        let rgb = if configured {
            INK
        } else {
            match cell.metric.as_str() {
                "position" if row.side != Side::Player => 0xb9bbc1,
                "position" => 0xffffff,
                "carNumber" => 0xa5a5ab,
                "bestLap" => 0xe6e5e9,
                _ => INK,
            }
        };
        node = node.child(
            label(
                &value,
                x,
                baseline(0.0, height, cell.font.size),
                cell.font,
                color(rgb, alpha(stale)),
            )
            .key(format!("car-{}-cell-{}", row.id.0, cell.index)),
        );
        if driver
            && cell.left
            && let Some(value) = &lap_badge
        {
            let bx = cell.x + cell.w - 10.0 - badge_w;
            let by = (height - 14.0) / 2.0;
            node = node
                .child(
                    el().absolute(bx, by)
                        .size(badge_w, 14.0)
                        .radius(3.0)
                        .border(1.0, color(INK, 0.16)),
                )
                .child(
                    label(
                        value,
                        bx + 5.0,
                        if configured { by + 10.0 } else { 17.0 },
                        badge_font,
                        color(0xc6c6cb, 1.0),
                    )
                    .key(format!("car-{}-lap-delta", row.id.0)),
                );
        }
    }
    node
}

struct Column {
    index: usize,
    metric: String,
    x: f32,
    w: f32,
    centered: bool,
    left: bool,
    font: rune::TextStyle,
    name_mode: String,
    max_chars: usize,
}
fn columns(settings: &[ColumnSetting]) -> Vec<Column> {
    let selected: Vec<_> = settings
        .iter()
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
    let weight = |c: &ColumnSetting| match c.width_preset.as_str() {
        "xs" => 20.0,
        "sm" => 36.0,
        "md" => 60.0,
        "lg" => 90.0,
        _ => match c.metric_id.as_str() {
            "position" => 24.0,
            "class" => 6.0,
            "carNumber" => 28.0,
            "driverName" => 120.0,
            "gap" => 48.0,
            _ => 62.0,
        },
    };
    let total = selected.iter().map(|c| weight(c)).sum::<f32>().max(1.0);
    let mut x = 0.0;
    selected
        .into_iter()
        .enumerate()
        .map(|(index, c)| {
            let w = WIDTH * weight(c) / total;
            let default_align = c.style.align.is_none();
            let result = Column {
                index,
                metric: c.metric_id.clone(),
                x,
                w,
                centered: c.style.align.as_deref() == Some("center")
                    || default_align
                        && ["position", "class", "carNumber"].contains(&c.metric_id.as_str()),
                left: c.style.align.as_deref() == Some("left")
                    || default_align && c.metric_id == "driverName",
                font: font(
                    if c.metric_id == "driverName" {
                        14.0
                    } else if c.metric_id == "gap" {
                        16.0
                    } else {
                        13.0
                    },
                    if c.metric_id == "driverName" {
                        700
                    } else {
                        600
                    },
                    -0.02,
                ),
                name_mode: c.format.mode.clone(),
                max_chars: c.format.max_chars.unwrap_or(16).min(64),
            };
            x += w;
            result
        })
        .collect()
}
fn legacy_columns() -> Vec<Column> {
    [
        ("position", 0.0, 30.0, 13.0, 600, -0.02),
        ("carNumber", 38.0, 30.0, 11.0, 600, -0.02),
        ("driverName", 68.0, 232.0, 14.0, 700, -0.025),
        ("gap", 300.0, 64.0, 16.0, 650, -0.02),
        ("bestLap", 364.0, 106.0, 13.0, 600, -0.02),
    ]
    .into_iter()
    .enumerate()
    .map(|(index, (metric, x, w, size, weight, tracking))| Column {
        index,
        metric: metric.into(),
        x,
        w,
        centered: ["position", "carNumber"].contains(&metric),
        left: metric == "driverName",
        font: font(size, weight, tracking),
        name_mode: String::new(),
        max_chars: usize::MAX,
    })
    .collect()
}

fn footer_rows(cells: &[InfoCell]) -> usize {
    if cells.len() <= 5 {
        return usize::from(!cells.is_empty());
    }
    (cells
        .iter()
        .map(|c| c.label.chars().count() as f32 * 5.5 + c.value.chars().count() as f32 * 7.5 + 26.0)
        .sum::<f32>()
        / (WIDTH - 24.0))
        .ceil() as usize
}
fn footer(cells: &[InfoCell], height: f32) -> El {
    let estimated = cells
        .iter()
        .map(|c| c.label.chars().count() as f32 * 5.5 + c.value.chars().count() as f32 * 7.5 + 12.0)
        .sum::<f32>()
        + 14.0 * cells.len().saturating_sub(1) as f32;
    let factor = if cells.len() <= 5 {
        ((WIDTH - 24.0) * 0.97 / estimated.max(1.0)).min(1.0)
    } else {
        1.0
    };
    let lf = font(9.0 * factor, 600, 0.1);
    let vf = font(11.0 * factor, 650, -0.01);
    let mut lines: Vec<Vec<(&InfoCell, f32)>> = vec![Vec::new()];
    let mut used = 0.0;
    for cell in cells {
        let w = width(&cell.label, lf) + 6.0 + width(&cell.value, vf);
        if cells.len() > 5 && used > 0.0 && used + 14.0 + w > WIDTH - 24.0 {
            lines.push(Vec::new());
            used = 0.0;
        }
        if let Some(line) = lines.last_mut() {
            line.push((cell, w));
        }
        used += w + if used > 0.0 { 14.0 } else { 0.0 };
    }
    let top = height - (16.0 + vf.size + lines.len().saturating_sub(1) as f32 * (vf.size + 4.0));
    let mut result =
        el().absolute(0.0, 0.0)
            .key("footer")
            .child(rect(0.0, top, WIDTH, 1.0, color(INK, 0.1)));
    for (line_index, line) in lines.iter().enumerate() {
        let mut x = (WIDTH
            - line.iter().map(|(_, w)| w).sum::<f32>()
            - 14.0 * line.len().saturating_sub(1) as f32)
            / 2.0;
        let base =
            top + 8.0 + (vf.size * 1984.0 / 2048.0).round() + line_index as f32 * (vf.size + 4.0);
        for (index, (cell, w)) in line.iter().enumerate() {
            result = result
                .child(label(
                    &cell.label,
                    x,
                    base,
                    lf,
                    color(MUTED, alpha(cell.stale)),
                ))
                .child(
                    label(
                        &cell.value,
                        x + width(&cell.label, lf) + 6.0,
                        base,
                        vf,
                        color(INK, alpha(cell.stale)),
                    )
                    .key(format!("footer-{line_index}-{index}")),
                );
            x += w + 14.0;
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Cx, Env, Runtime};
    use std::sync::Arc;
    use vantare_domain::{CarId, Snapshot, format::Preferences, widget_settings::columns::Format};

    struct Scene {
        board: Board,
        settings: Settings,
        language: Language,
    }
    fn draw(scene: &Scene, _: &mut Cx<Scene>) -> El {
        view(&scene.board, &scene.settings, scene.language)
    }
    fn scene(settings: Settings) -> Scene {
        // La proyección pertenece a domain; aquí se fijan solo señales visibles
        // para probar texto, calidad y colocación sin añadir otro simulador.
        let mut board =
            vantare_domain::relative::project(&Snapshot::default(), Preferences::default());
        board.track = "SPA-FRANCORCHAMPS".into();
        board.player_badge = "P4".into();
        board.status = None;
        board.session.clear();
        board.remaining.clear();
        board.air.clear();
        board.track_temperature.clear();
        board.wind.clear();
        let count = settings.range_ahead + settings.range_behind + 1;
        board.slots = (0..count)
            .map(|slot| {
                let mut row = Row::default();
                row.id = CarId(slot as u32);
                row.side = if slot == settings.range_ahead {
                    Side::Player
                } else {
                    Side::Ahead
                };
                row.position = "12".into();
                row.number = "99".into();
                row.driver = "André Lotterer".into();
                row.class = "HYPERCAR".into();
                row.gap = "+1.20".into();
                row.best_lap = "2:01.456".into();
                row.last_lap = "2:02.789".into();
                row.lap_delta = Some(-2);
                Some(Arc::new(row))
            })
            .collect();
        Scene {
            board,
            settings,
            language: Language::Es,
        }
    }
    fn runtime(scene: Scene, scale: f32) -> Runtime<Scene> {
        let size = natural_size(&scene.settings);
        let mut rt = Runtime::with_text(
            scene,
            draw,
            size,
            Env::new(true, scale),
            rune::text::TextSystem::new(kit::FONTS, ("Inter W400", "Inter W400")),
        );
        rt.transparent = true;
        rt.frame(0.0);
        rt.settle_all();
        rt.frame(0.0);
        rt
    }

    #[test]
    fn natural_size_and_rows_match_gpui_at_three_scales_and_asymmetric_ranges() {
        for (ahead, behind) in [(3, 3), (1, 2), (0, 0), (8, 8)] {
            let settings = Settings {
                range_ahead: ahead,
                range_behind: behind,
                ..Settings::eficiencia()
            };
            let size = natural_size(&settings);
            assert_eq!(size, (470.0, 74.0 + (ahead + behind + 1) as f32 * 29.0));
            for scale in [1.0, 1.25, 1.5] {
                let mut rt = runtime(scene(settings.clone()), scale);
                assert_eq!(
                    rt.presented("relative-eficiencia").unwrap().0,
                    [0.0, 0.0, size.0, size.1]
                );
                for slot in 0..(ahead + behind + 1) {
                    let rect = rt.presented(&format!("car-{slot}")).unwrap().0;
                    assert_eq!(rect, [0.0, 36.0 + slot as f32 * 29.0, 470.0, 29.0]);
                    assert!(rect[1] + rect[3] <= size.1 - 38.0);
                }
                // Ningún loop ni timer de pintura de este Look tras asentarse.
                for _ in 0..30 {
                    assert!(!rt.frame(1.0));
                }
            }
        }
    }

    #[test]
    fn legacy_text_class_quality_and_translated_lap_badge_use_canonical_values() {
        let mut input = scene(Settings::eficiencia());
        Arc::make_mut(input.board.slots[0].as_mut().unwrap()).gap_stale = true;
        let rt = runtime(input, 1.0);
        let elements = rt.elements();
        let cell = |key: &str| {
            elements
                .iter()
                .find(|e| e.key.as_deref() == Some(key))
                .unwrap()
        };
        assert_eq!(cell("car-0-cell-2").text.as_deref(), Some("ANDRÉ LOTTERER"));
        assert_eq!(cell("car-0-cell-3").text.as_deref(), Some("+1.20"));
        assert_eq!(cell("car-0-cell-4").text.as_deref(), Some("2:01.456"));
        assert_eq!(cell("car-0-lap-delta").text.as_deref(), Some("−2 V"));
        assert!((cell("car-0-cell-3").text_color.unwrap().a - 0.6).abs() < 0.001);
        assert!(
            rt.presented("car-3-lap-delta").is_none(),
            "el jugador no lleva badge de vuelta"
        );
        assert!(
            elements
                .iter()
                .any(|e| e.fill == color(0xc1121f, 1.0) && e.rect[2] == 3.0)
        );
        let mut english = scene(Settings::eficiencia());
        english.language = Language::En;
        assert!(
            runtime(english, 1.0)
                .elements()
                .iter()
                .any(|e| e.text.as_deref() == Some("−2 L"))
        );
    }

    #[test]
    fn configured_columns_filter_disabled_unknown_and_format_names_and_last_lap() {
        let settings = Settings {
            columns: Some(vec![
                ColumnSetting {
                    metric_id: "driverName".into(),
                    format: Format {
                        mode: "initial".into(),
                        ..Format::default()
                    },
                    ..ColumnSetting::default()
                },
                ColumnSetting {
                    metric_id: "lastLap".into(),
                    ..ColumnSetting::default()
                },
                ColumnSetting {
                    metric_id: "gap".into(),
                    enabled: false,
                    ..ColumnSetting::default()
                },
                ColumnSetting {
                    metric_id: "future".into(),
                    ..ColumnSetting::default()
                },
            ]),
            ..Settings::eficiencia()
        };
        let cols = columns(settings.columns.as_ref().unwrap());
        assert_eq!(cols.len(), 2);
        assert!((cols.iter().map(|c| c.w).sum::<f32>() - WIDTH).abs() < 0.001);
        let rt = runtime(scene(settings), 1.0);
        let cells = rt.elements();
        assert!(
            cells
                .iter()
                .any(|e| e.text.as_deref() == Some("A. LOTTERER"))
        );
        assert!(cells.iter().any(|e| e.text.as_deref() == Some("2:02.789")));
        assert!(!cells.iter().any(|e| e.text.as_deref() == Some("+1.20")));
    }

    #[test]
    fn empty_status_and_many_footer_cells_preserve_panel_bounds() {
        let mut input = scene(Settings::eficiencia());
        input.board.slots.clear();
        let rt = runtime(input, 1.0);
        assert!(
            rt.elements()
                .iter()
                .any(|e| e.text.as_deref() == Some("SIN DATOS"))
        );
        let mut input = scene(Settings::eficiencia());
        input.board.slots.clear();
        input.board.status = Some("ESPERANDO SIMULADOR".into());
        let rt = runtime(input, 1.0);
        assert!(rt.find("status").is_some());
        assert!(rt.find("empty").is_none());
        let mut input = scene(Settings::eficiencia());
        input.board.footer_cells = (0..9)
            .map(|n| InfoCell {
                id: n.to_string(),
                label: "PISTA".into(),
                value: "26 °C".into(),
                stale: n == 0,
            })
            .collect();
        let rt = runtime(input, 1.0);
        let h = natural_size(&rt.state.settings).1;
        let cells: Vec<_> = rt
            .elements()
            .into_iter()
            .filter(|e| e.key.as_deref().is_some_and(|k| k.starts_with("footer-")))
            .collect();
        assert_eq!(cells.len(), 9);
        assert!(cells.iter().all(|e| e.rect[0] >= 0.0
            && e.rect[0] + e.rect[2] <= WIDTH
            && e.rect[1] + e.rect[3] <= h));
    }

    #[test]
    fn original_gpui_snapshot_uses_domain_projection_and_the_same_capture_view() {
        let snapshot = vantare_ipc::snapshot_from_saved_json(include_str!(
            "../../ui/fixtures/relative.snapshot.json"
        ))
        .expect("fixture guardado del Relative GPUI");
        for (ahead, behind, same_class) in [(3, 3, false), (1, 2, false), (3, 3, true)] {
            let settings = Settings {
                range_ahead: ahead,
                range_behind: behind,
                class_scope: if same_class { "sameClass" } else { "all" }.into(),
                ..Settings::eficiencia()
            };
            let board = vantare_domain::relative::project_cached(
                &snapshot,
                Preferences::default(),
                vantare_domain::relative::Content {
                    range_ahead: ahead,
                    range_behind: behind,
                    same_class,
                    include_player: true,
                },
                &[],
                None,
            );
            assert!(board.status.is_none());
            assert_eq!(board.track, "SEBRING", "el rótulo lo normaliza domain");
            assert!(board.slots.iter().flatten().any(|r| r.side == Side::Player));
            for scale in [1.0, 1.25, 1.5] {
                let size = crate::offscreen::Size::new(natural_size(&settings), scale).unwrap();
                let mut rt = runtime(
                    Scene {
                        board: (*board).clone(),
                        settings: settings.clone(),
                        language: Language::Es,
                    },
                    scale,
                );
                let before: Vec<_> = rt
                    .elements()
                    .into_iter()
                    .map(|e| (e.key, e.rect, e.text))
                    .collect();
                crate::offscreen::render_with::<_, crate::offscreen::Error>(
                    &mut rt,
                    size,
                    |rt, size| {
                        let after: Vec<_> = rt
                            .elements()
                            .into_iter()
                            .map(|e| (e.key, e.rect, e.text))
                            .collect();
                        assert_eq!(
                            before, after,
                            "captura y vista usan el mismo dibujo asentado"
                        );
                        assert!(
                            after
                                .iter()
                                .any(|(_, _, text)| text.as_deref() == Some("SEBRING"))
                        );
                        let (w, h) = size.pixels();
                        Ok(vec![0; w as usize * h as usize * 4])
                    },
                )
                .unwrap();
            }
        }
    }
}
