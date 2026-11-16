//! Port de paint_table/paint_column_label/paint_row/paint_cell de GPUI.
//! Canales de FLIP, presencia y efectos independientes de Eficiencia.
use super::{
    Visual,
    model::{self, Align, Column, Metric, Row},
    render::{ink, label, rect, session_header},
};
use crate::eficiencia::{baseline, color, fit, width};
use rune::El;
use vantare_domain::format::Language;

fn aligned_x(align: Align, left: f32, width: f32, text: f32) -> f32 {
    match align {
        Align::Left => left,
        Align::Center => left + (width - text) / 2.0,
        Align::Right => left + width - text,
    }
}
pub(super) fn paint(v: &Visual, language: Language) -> Vec<El> {
    let (c, p) = (&v.config, &v.plan);
    let s = &c.style;
    debug_assert_eq!(p.columns.len(), p.widths.len());
    debug_assert_eq!(p.visible_rows, p.row_tops.len());
    debug_assert!(p.identity_span <= p.columns.len());
    let mut nodes = Vec::new();
    if p.loose_header > 0.0 {
        nodes.extend(session_header(v, language, 0.0, p.brand_band));
    }
    let integrated = !c.broadcast && p.identity_span > 0 && !p.external_header;
    let (mut index, mut x) = (0, 0.0);
    while index < p.columns.len() {
        let span = if integrated && index == 0 {
            p.identity_span
        } else {
            1
        };
        let w: f32 = p.widths[index..index + span].iter().sum();
        nodes.push(
            rect(x, p.table_top, w, p.head_row)
                .key(format!("heading-fill-{index}"))
                .linear_gradient(
                    180.0f32.to_radians(),
                    [
                        (0.0, color(s.colors.white.0, 0.02)),
                        (1.0, color(s.colors.white.0, 0.0)),
                    ],
                ),
        );
        nodes.push(
            rect(x, p.table_top + p.head_row - 1.0, w, 1.0)
                .key(format!("heading-rule-{index}"))
                .fill(color(s.colors.ink.0, 0.10)),
        );
        if integrated && index == 0 {
            if p.has_header {
                nodes.extend(session_header(v, language, x, p.table_top));
            } else {
                nodes.push(label(
                    "driver-heading",
                    model::labels(language).driver_name,
                    x + 8.0,
                    p.table_top + 18.0,
                    ink(
                        s,
                        s.fonts.column_label_size,
                        s.fonts.semibold_weight,
                        0.025,
                        s.colors.muted.0,
                    ),
                ));
            }
        } else {
            nodes.push(column_label(v, language, p.columns[index], x, w));
        }
        x += w;
        index += span;
    }
    let body_top = p.table_top + p.head_row;
    for (index, (top, class)) in p.class_bands.iter().enumerate() {
        let y = body_top + top;
        let id = class.trim().to_uppercase();
        let rgb = if id.contains("HYPER") || ["HYP", "DP"].contains(&id.as_str()) {
            s.colors.hypercar.0
        } else if id.contains("LMP") || id == "P2" {
            s.colors.lmp.0
        } else if id.contains("GTE") || id.contains("GT3") {
            s.colors.gold.0
        } else {
            s.colors.muted.0
        };
        let alpha = if rgb == s.colors.muted.0 { 0.05 } else { 0.11 };
        nodes.push(
            rect(0.0, y, c.width, s.geometry.class_band_height)
                .key(format!("class-band-{index}"))
                .linear_gradient(
                    180.0f32.to_radians(),
                    [(0.0, color(rgb, alpha)), (1.0, color(rgb, 0.0))],
                ),
        );
        nodes.push(
            rect(0.0, y, c.width, 1.0)
                .key(format!("class-band-top-rule-{index}"))
                .fill(color(s.colors.ink.0, 0.10)),
        );
        nodes.push(
            rect(0.0, y + s.geometry.class_band_height - 1.0, c.width, 1.0)
                .key(format!("class-band-bottom-rule-{index}"))
                .fill(color(s.colors.ink.0, 0.10)),
        );
        nodes.push(
            rect(10.0, y + 7.0, 2.0, 14.0)
                .key(format!("class-band-tick-{index}"))
                .fill(color(rgb, 1.0)),
        );
        if !id.is_empty() {
            nodes.push(label(
                &format!("class-band-label-{index}"),
                &id,
                20.0,
                y + 18.0,
                ink(s, s.fonts.badge_size, s.fonts.bold_weight, 0.14, rgb),
            ));
        }
    }
    for ghost in &v.frame.ghosts {
        let top = body_top + ghost.top * s.geometry.row_height / model::ROW_HEIGHT;
        nodes.push(row_layer(v, &ghost.row, top, ghost.pose, true));
    }
    for (i, row) in v.content_plan.rows.iter().take(p.visible_rows).enumerate() {
        let top = body_top + p.row_tops[i];
        nodes.push(row_layer(
            v,
            row,
            top,
            v.frame.row(row.id),
            i + 1 == p.visible_rows,
        ));
    }
    nodes
}
fn row_layer(v: &Visual, row: &Row, top: f32, pose: super::motion::Pose, last: bool) -> El {
    let s = &v.config.style;
    let y = top + pose.offset * s.geometry.row_height / model::ROW_HEIGHT;
    let mut layer = rect(0.0, y, v.config.width, s.geometry.row_height)
        .key(format!("efficiency-row-{}", row.id.0));
    if pose.alpha < 0.999 {
        layer = layer.opacity(pose.alpha.max(0.0));
    }
    for node in paint_row(v, row, pose, last) {
        layer = layer.child(node);
    }
    layer
}
fn column_label(v: &Visual, language: Language, column: Column, x: f32, w: f32) -> El {
    let (c, p) = (&v.config, &v.plan);
    let s = &c.style;
    let labels = model::labels(language);
    let value = labels.metric(column.metric, v.content_plan.board.gap_to_best_lap);
    let mut cell = rect(x, p.table_top, w, p.head_row);
    let pad = s.geometry.cell_padding;
    if c.broadcast {
        cell = cell.fill(color(0, 0.13));
        let font = ink(
            s,
            s.fonts.column_label_size,
            s.fonts.semibold_weight,
            0.025,
            s.colors.column_label.0,
        );
        let align = match column.metric {
            Metric::Position | Metric::DriverNumber | Metric::Gap => Align::Center,
            Metric::DriverName => Align::Left,
            _ => Align::Right,
        };
        let pad = if column.metric == Metric::DriverName {
            s.geometry.broadcast_name_padding
        } else {
            pad
        };
        let tx = aligned_x(
            align,
            pad,
            w - pad - s.geometry.cell_padding,
            width(value, font.0),
        );
        return cell.child(label(
            "column-label",
            value,
            tx,
            baseline(
                (p.head_row - font.0.line_height) / 2.0,
                font.0.line_height,
                font.0.size,
            )
            .round(),
            font,
        ));
    }
    cell = cell.clip_rounded(0.0);
    let rgb = if v.content_plan.board.gap_to_best_lap && column.metric == Metric::BestLap {
        s.colors.ink.0
    } else {
        s.colors.column_label.0
    };
    let font = ink(
        s,
        s.fonts.column_label_size,
        s.fonts.semibold_weight,
        0.14,
        rgb,
    );
    let label_w = width(value, font.0);
    let align = match column.metric {
        Metric::Gap => Align::Center,
        Metric::DriverName => Align::Left,
        _ => column.align.unwrap_or(Align::Right),
    };
    let label_h = font.0.line_height + 4.0;
    let label_top = (p.head_row - 1.0 - label_h) / 2.0 + 2.0;
    let lx = aligned_x(align, pad, w - 2.0 * pad, label_w);
    cell = cell.child(label(
        "column-label",
        value,
        lx,
        baseline(label_top, font.0.line_height, font.0.size).round(),
        font,
    ));
    if c.study != "v2-focus" {
        let ux = if column.metric == Metric::Gap {
            lx + label_w / 2.0 - 8.5
        } else {
            lx
        };
        cell = cell.child(
            rect(ux, label_top + label_h - 1.0, 17.0, 1.0).fill(color(s.colors.ink.0, 0.35)),
        );
    }
    cell
}
fn paint_row(v: &Visual, row: &Row, pose:super::motion::Pose, last: bool) -> Vec<El> {
    let (c, p) = (&v.config, &v.plan);
    let s = &c.style;
    let (w, h) = (c.width, s.geometry.row_height);
    let mut nodes = Vec::new();
    if c.study == "default"
        && !c.multiclass
        && !row.is_player
        && v.content_plan.rows.iter().take(3).any(|r| r.id == row.id)
    {
        nodes.push(rect(0.0, 0.0, w, h).fill(color(s.colors.white.0, 0.03)));
    }
    if row.is_player {
        let mut bg = rect(0.0, 0.0, w, h).key("player-background").fill(color(
            s.colors.player.0,
            if c.broadcast {
                s.opacity.broadcast_player
            } else {
                s.opacity.player
            },
        ));
        if c.broadcast {
            bg = bg.radius(s.geometry.radius);
        }
        nodes.push(bg);
        nodes.push(rect(0.0, 0.0, w, h).linear_gradient(
            180.0f32.to_radians(),
            [
                (0.0, color(s.colors.white.0, 0.04)),
                (0.6, color(s.colors.white.0, 0.0)),
            ],
        ));
    }
    if pose.flash>0.0 {
        let rgb=if pose.flash_up {s.colors.gain.0}else{s.colors.loss.0};
        nodes.push(rect(0.0,0.0,w,h).key("position-flash").fill(color(rgb,0.12*pose.flash)));
    }
    if !last && c.study != "v2-focus" {
        if row.is_player {
            nodes.push(rect(0.0, 0.0, w, 1.0).fill(color(s.colors.white.0, 0.13)));
            nodes.push(
                rect(0.0, h - 1.0, w, 1.0)
                    .key("row-bottom-rule")
                    .fill(color(s.colors.white.0, 0.08)),
            );
        } else {
            nodes.push(
                rect(0.0, h - 1.0, w, 1.0)
                    .key("row-bottom-rule")
                    .fill(color(s.colors.ink.0, 0.10)),
            );
        }
    }
    let mut x = 0.0;
    for (index, (column, cw)) in p.columns.iter().zip(&p.widths).enumerate() {
        let mut cell = rect(x, 0.0, *cw, h).key(format!("efficiency-cell-{index}"));
        for node in paint_cell(v, row, pose, *column, 0.0, *cw) {
            cell = cell.child(node);
        }
        nodes.push(cell);
        x += cw;
    }
    if row.is_player && !c.broadcast {
        nodes.push(
            rect(
                3.0,
                (h - s.geometry.player_marker_height) / 2.0,
                s.geometry.player_marker_width,
                s.geometry.player_marker_height,
            )
            .key("player-marker")
            .fill(color(s.colors.player_marker.0, 1.0)),
        );
    }
    nodes
}
fn paint_cell(v: &Visual, row: &Row, pose:super::motion::Pose, column: Column, x: f32, cw: f32) -> Vec<El> {
    let (c, content) = (&v.config, &v.content_plan);
    let s = &c.style;
    let (f, g) = (&s.fonts, &s.geometry);
    let pace = content.board.gap_to_best_lap;
    let is_best = content
        .session_best
        .as_ref()
        .is_some_and(|(id, _)| *id == row.id);
    let base_for = |size: f32| {
        let line = (size * 1984.0 / 2048.0).round() + (size * 494.0 / 2048.0).round();
        baseline((g.row_height - line) / 2.0, line, size).round()
    };
    let mut nodes = Vec::new();
    match column.metric {
        Metric::Position => {
            let value = if row.position > 0 {
                row.position.to_string()
            } else {
                "—".into()
            };
            let font = ink(
                s,
                f.body_size,
                f.semibold_weight,
                -0.02,
                if row.is_player {
                    s.colors.white.0
                } else {
                    s.colors.position.0
                },
            );
            let tx = aligned_x(
                column.align.unwrap_or(Align::Center),
                x + g.position_padding,
                cw - g.cell_padding,
                width(&value, font.0),
            );
            nodes.push(label(
                "cell-position",
                &value,
                tx,
                base_for(f.body_size),
                font,
            ));
        }
        Metric::DriverNumber => {
            let font = ink(
                s,
                f.number_size,
                f.semibold_weight,
                -0.025,
                s.colors.number.0,
            );
            let tx = aligned_x(
                column.align.unwrap_or(Align::Center),
                x + g.cell_padding,
                cw - 2.0 * g.cell_padding,
                width(&row.number, font.0),
            );
            nodes.push(label(
                "cell-number",
                &row.number,
                tx,
                base_for(f.number_size),
                font,
            ));
        }
        Metric::DriverName => {
            let font = ink(s, f.body_size, f.bold_weight, -0.025, s.colors.ink.0);
            let name = vantare_domain::standings::driver_name(
                &row.driver,
                column.name_mode.as_str(),
                column.max_chars,
            )
            .to_uppercase();
            let pad = if c.broadcast {
                g.broadcast_name_padding
            } else {
                g.cell_padding
            };
            let avail = cw - pad - g.cell_padding - 19.0 - 7.0;
            let shown = fit(&name, font.0, avail);
            let tx = aligned_x(
                column.align.unwrap_or(Align::Left),
                x + pad,
                avail,
                width(&shown, font.0),
            );
            nodes.push(label("cell-name", &shown, tx, base_for(f.body_size), font));
            if let Some((places,alpha))=pose.chip {
                let sign=if places>0 {"+"}else{"−"};let text=format!("{sign}{}",places.abs());
                let mut ci=ink(s,f.badge_size,f.bold_weight,-0.039,s.colors.ink.0);
                ci.1=color(s.colors.ink.0,alpha);
                let x=x+g.cell_padding+avail+7.0+19.0-width(&text,ci.0);
                nodes.push(label("position-chip",&text,x,base_for(f.badge_size),ci));
            }
            if pose.battle>0.0 {
                nodes.push(rect(x+g.cell_padding,g.row_height-3.0,cw-2.0*g.cell_padding,2.0)
                    .key("battle-underline").linear_gradient(90.0f32.to_radians(),[
                        (0.0,color(s.colors.gold.0,0.55*pose.battle)),
                        (0.8,color(s.colors.gold.0,0.10*pose.battle)),
                    ]));
            }
        }
        Metric::Gap => {
            let value = &row.classification_gap;
            let (weight, rgb) = if pace {
                (f.medium_weight, s.colors.pace_gap.0)
            } else {
                (f.metric_weight, s.colors.ink.0)
            };
            let font = ink(s, f.body_size, weight, -0.025, rgb);
            if let Some((number, unit)) = split_seconds(value) {
                let unit_ink = ink(s, f.badge_size, f.medium_weight, 0.0, s.colors.unit.0);
                let nw = width(number, font.0);
                let total = nw + 2.0 + width(unit, unit_ink.0);
                let tx = aligned_x(
                    Align::Center,
                    x + g.cell_padding,
                    cw - 2.0 * g.cell_padding,
                    total,
                );
                let base = base_for(f.body_size);
                nodes.push(label("cell-gap", number, tx, base, font));
                nodes.push(label("cell-gap-unit", unit, tx + nw + 2.0, base, unit_ink));
            } else {
                let tx = aligned_x(
                    Align::Center,
                    x + g.cell_padding,
                    cw - 2.0 * g.cell_padding,
                    width(value, font.0),
                );
                nodes.push(label("cell-gap", value, tx, base_for(f.body_size), font));
            }
        }
        Metric::BestLap
        | Metric::LastLap
        | Metric::CurrentLap
        | Metric::Interval
        | Metric::VehicleClass => {
            let (value, is_lap) = match column.metric {
                Metric::BestLap => (content.best_lap(row), true),
                Metric::LastLap => (content.last_lap(row), true),
                Metric::CurrentLap => (content.current_lap(row), false),
                Metric::Interval => (content.interval(row), false),
                _ => (row.class.as_ref(), false),
            };
            let (weight, rgb) = if is_lap && pace && column.metric == Metric::BestLap {
                (f.metric_weight, s.colors.ink.0)
            } else if is_lap {
                (f.semibold_weight, s.colors.lap.0)
            } else {
                (f.metric_weight, s.colors.ink.0)
            };
            let rgb = if column.metric == Metric::BestLap && is_best {
                s.colors.best_lap.0
            } else {
                rgb
            };
            let font = ink(s, f.body_size, weight, -0.025, rgb);
            let align = column
                .align
                .unwrap_or(if column.metric == Metric::VehicleClass {
                    Align::Center
                } else {
                    Align::Right
                });
            let pad = if c.broadcast && is_lap {
                11.0
            } else {
                g.cell_padding
            };
            let tx = aligned_x(align, x + pad, cw - 2.0 * pad, width(value, font.0));
            if column.metric==Metric::BestLap && let Some((session,alpha,frac))=pose.sweep {
                let rgb=if session {s.colors.best_sweep.0}else{s.colors.gain.0};
                nodes.push(paint_sweep(x,cw,g.row_height,rgb,alpha*if session {0.45}else{0.35},frac));
            }
            if c.broadcast && is_lap {
                nodes.push(
                    rect(x + 6.0, 2.0, cw - 12.0, 26.0)
                        .radius(g.radius)
                        .linear_gradient(
                            145.0f32.to_radians(),
                            [
                                (0.0, color(s.colors.white.0, 0.09)),
                                (0.65, color(s.colors.white.0, 0.03)),
                            ],
                        ),
                );
            }
            nodes.push(label("cell-metric", value, tx, base_for(f.body_size), font));
            if column.metric==Metric::BestLap && pose.best_marker>0.0 {
                let mut mi=ink(s,f.marker_size,f.regular_weight,0.0,s.colors.best_marker.0);
                mi.1=color(s.colors.best_marker.0,pose.best_marker);
                let mw=width("◆",mi.0);
                let base=3.0+(f.marker_size*1984.0/2048.0).round();
                nodes.push(label("best-marker","◆",x+cw-3.0-mw,base,mi));
            }
        }
        Metric::Pit => {}
    }
    nodes
}
fn split_seconds(value: &str) -> Option<(&str, &str)> {
    let body = value.strip_suffix('s')?;
    let digits = body.strip_prefix(['+', '-']).unwrap_or(body);
    let mut parts = digits.splitn(2, '.');
    let int = parts.next()?;
    let frac = parts.next();
    let ok = !int.is_empty()
        && int.bytes().all(|b| b.is_ascii_digit())
        && frac.is_none_or(|f| !f.is_empty() && f.bytes().all(|b| b.is_ascii_digit()));
    ok.then_some((body, "s"))
}

fn paint_sweep(x:f32,cw:f32,height:f32,rgb:u32,alpha:f32,frac:f32)->El {
    rect(x,1.0,cw,height-2.0).key("best-sweep").clip_soft(0.0)
        .child(rect(frac*cw,0.0,cw,height-2.0).key("best-sweep-a")
            .linear_gradient(100.0f32.to_radians(),[(0.0,color(rgb,0.0)),(0.5,color(rgb,alpha))]))
        .child(rect(frac*cw+cw/2.0,0.0,cw/2.0,height-2.0).key("best-sweep-b")
            .linear_gradient(100.0f32.to_radians(),[(0.0,color(rgb,alpha)),(1.0,color(rgb,0.0))]))
}
