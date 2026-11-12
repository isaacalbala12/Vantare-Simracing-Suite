//! Fixed standard Vantare preset. Fonts and tokens are copied byte-for-byte from ui.
use super::*;
use rune::{Align, Color, Family, Span, TextStyle, col, el, text};
use std::sync::OnceLock;
use vantare_domain::{SourceState, relative::Banner};

pub const FONTS: &[&[u8]] = &[
    include_bytes!("../assets/fonts/Inter-400.ttf"),
    include_bytes!("../assets/fonts/Inter-500.ttf"),
    include_bytes!("../assets/fonts/Inter-600.ttf"),
    include_bytes!("../assets/fonts/Inter-650.ttf"),
    include_bytes!("../assets/fonts/Inter-700.ttf"),
    include_bytes!("../assets/fonts/Inter-750.ttf"),
    include_bytes!("../assets/fonts/Inter-800.ttf"),
    include_bytes!("../assets/fonts/Rajdhani.ttf"),
    include_bytes!("../assets/fonts/SpaceMono.ttf"),
];
fn tokens() -> &'static serde_json::Value {
    static TOKENS: OnceLock<serde_json::Value> = OnceLock::new();
    TOKENS.get_or_init(|| {
        serde_json::from_str(include_str!("../assets/vantare.json")).expect("frozen Vantare tokens")
    })
}

fn hex(value: &str) -> Color {
    let value = value.strip_prefix('#').expect("hex token");
    let rgba = u32::from_str_radix(value, 16).expect("hex token");
    let (rgb, a) = if value.len() == 8 {
        (rgba >> 8, (rgba & 255) as f32 / 255.0)
    } else {
        (rgba, 1.0)
    };
    Color {
        r: ((rgb >> 16) & 255) as f32 / 255.0,
        g: ((rgb >> 8) & 255) as f32 / 255.0,
        b: (rgb & 255) as f32 / 255.0,
        a,
    }
}
fn color(group: &str, key: &str) -> Color {
    hex(tokens()[group][key].as_str().expect("color token"))
}
fn neo(key: &str) -> Color {
    hex(tokens()["styles"]["neo"][key].as_str().expect("Neo token"))
}
fn class_color(name: &str) -> Color {
    let lower = name.to_lowercase();
    let entry = tokens()["classes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|entry| lower.contains(entry["match"].as_str().unwrap()))
        .unwrap();
    hex(entry["dot"].as_str().unwrap())
}
fn font(family: &'static str, size: f32, weight: f32) -> TextStyle {
    TextStyle {
        family: Family::Named(family),
        features: "'tnum' 1",
        line_height: 24.0,
        ..TextStyle::new(size, weight)
    }
}
fn label(
    live: &LiveText,
    key: String,
    x: f32,
    width: f32,
    family: &'static str,
    size: f32,
    ink: Color,
) -> El {
    text(live.get().to_string())
        .key(key)
        .live_text(live)
        .font(font(family, size, 400.0))
        .color(ink)
        .size(width, ROW_HEIGHT)
        .align(Align::End)
        .pin(Some(x), Some(0.0), None, None)
}
pub fn waiting(board: &Board) -> bool {
    !board.player_present || matches!(board.source_state, SourceState::Waiting | SourceState::Lost)
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum Footer {
    None,
    Waiting,
    Traffic,
    Pits,
    Session,
}
fn footer(board: &Board) -> Footer {
    if waiting(board) {
        Footer::Waiting
    } else if board.player_in_pits && board.pit_exit.is_some() {
        Footer::Pits
    } else if board.traffic.is_some() {
        Footer::Traffic
    } else if !board.session.is_empty() && board.session != "CARRERA" && board.session != "RACE" {
        Footer::Session
    } else {
        Footer::None
    }
}
pub fn same_structure(a: &Board, b: &Board) -> bool {
    waiting(a) == waiting(b)
        && footer(a) == footer(b)
        && a.banner == b.banner
        && a.slots.len() == b.slots.len()
        && a.slots.iter().zip(&b.slots).all(|(a, b)| match (a, b) {
            (None, None) => true,
            (Some(a), Some(b)) => {
                a.id == b.id
                    && a.class == b.class
                    && a.is_player == b.is_player
                    && a.in_pits == b.in_pits
                    && a.driver == b.driver
                    && a.vehicle == b.vehicle
                    && a.number == b.number
                    && a.lap_delta.map(i32::signum) == b.lap_delta.map(i32::signum)
            }
            _ => false,
        })
}
pub fn labels(board: &Board) -> [String; 4] {
    let title = if board.session.is_empty() || board.session == "CARRERA" || board.session == "RACE"
    {
        "RELATIVE".into()
    } else {
        format!("RELATIVE · {}", board.session)
    };
    let right = board.slower_class.as_ref().map_or_else(
        || "±3".into(),
        |class| format!("{} · ±3", class.to_uppercase()),
    );
    let (left, end) = match footer(board) {
        Footer::None => (String::new(), String::new()),
        Footer::Waiting => ("Esperando al simulador".into(), String::new()),
        Footer::Traffic => {
            let t = board.traffic.as_ref().unwrap();
            (
                format!("▲ {} {} a menos de 6 s", t.count, t.class),
                "deja hueco en la curva".into(),
            )
        }
        Footer::Session => (
            if board.session.to_lowercase().starts_with("pr") {
                "Tanda —"
            } else {
                "Delta de vuelta lanzada —"
            }
            .into(),
            String::new(),
        ),
        Footer::Pits => {
            let p = board.pit_exit.as_ref().unwrap();
            let text = match (&p.ahead, &p.behind) {
                (Some(a), Some(b)) => format!("Sales entre {a} y {b}"),
                (Some(a), None) => format!("Sales tras {a}"),
                (None, Some(b)) => format!("Sales delante de {b}"),
                (None, None) => "Sales con pista libre".into(),
            };
            (text, format!("pérdida {}", p.loss))
        }
    };
    [title, right, left, end]
}
fn car_row(state: &Relative, index: usize) -> El {
    let mut root = el().size(WIDTH, ROW_HEIGHT);
    let Some(live) = &state.slots[index] else {
        return root.key(format!("empty-{index}"));
    };
    let data = state.board.slots[index].as_ref().unwrap();
    root = root.key(format!("car-{}", live.id.0));
    if data.is_player {
        let accent = color("accents", "red");
        root = root.child(
            el().size(WIDTH - 12.0, ROW_HEIGHT)
                .radius(6.0)
                .linear_gradient(
                    std::f32::consts::FRAC_PI_2,
                    [(0.0, accent.alpha(0.32)), (1.0, accent.alpha(0.06))],
                )
                .pin(Some(6.0), Some(0.0), None, None),
        );
    }
    root = root.child(
        el().size(7.0, 7.0)
            .radius(3.5)
            .fill(class_color(&data.class))
            .pin(Some(12.0), Some(8.5), None, None),
    );
    let position = label(
        &live.cells[0],
        format!("cell-{}-0", live.id.0),
        29.0,
        22.0,
        "Rajdhani",
        14.0,
        color("colors", "muted"),
    )
    .font(font("Rajdhani", 14.0, 600.0));
    let name = live.cells[1].get();
    let detail_start = name.find(" · ").unwrap_or(name.len());
    let mut driver = text(name.to_string())
        .key(format!("cell-{}-1", live.id.0))
        .font(font("Inter", 13.0, 400.0))
        .color(color("colors", "text"))
        .spans(vec![
            Span::new(detail_start, name.len())
                .size(12.0)
                .color(color("colors", "muted")),
        ])
        .size(239.0, ROW_HEIGHT)
        .truncate()
        .pin(Some(61.0), Some(0.0), None, None);
    if data.in_pits {
        driver = driver.w(207.0);
        root = root.child(
            text("BOX")
                .font(font("Inter", 10.0, 600.0))
                .color(color("colors", "box_text"))
                .fill(color("colors", "box_fill"))
                .radius(3.0)
                .padding(3.0)
                .pin(Some(269.0), Some(4.0), None, None),
        );
    }
    let mut laps = label(
        &live.cells[2],
        format!("cell-{}-2", live.id.0),
        310.0,
        40.0,
        "Inter",
        10.0,
        color(
            "relative",
            if data.lap_delta.unwrap_or(0) < 0 {
                "laps_down_text"
            } else {
                "laps_up_text"
            },
        ),
    );
    if data.lap_delta.is_some_and(|v| v != 0) {
        laps = laps
            .fill(color(
                "relative",
                if data.lap_delta.unwrap() < 0 {
                    "laps_down_fill"
                } else {
                    "laps_up_fill"
                },
            ))
            .radius(3.0);
    }
    let gap_color = if state.board.banner == Some(Banner::FullCourseYellow) {
        color("colors", "frozen")
    } else if data.is_player {
        color("colors", "text")
    } else {
        color("colors", "value")
    };
    root.child(position).child(driver).child(laps).child(label(
        &live.cells[3],
        format!("cell-{}-3", live.id.0),
        360.0,
        48.0,
        "Space Mono",
        12.0,
        gap_color,
    ))
}
pub fn view(state: &Relative) -> El {
    let board = &state.board;
    let banner = if waiting(board) {
        None
    } else {
        board.banner.as_ref()
    };
    let header_y = if banner.is_some() { 31.0 } else { 11.0 };
    let rows_y = header_y + 22.0;
    let footer_kind = footer(board);
    let footer_y = rows_y + state.slots.len() as f32 * ROW_HEIGHT + 6.0;
    let content = rows_y
        + state.slots.len() as f32 * ROW_HEIGHT
        + 11.0
        + if footer_kind == Footer::None {
            0.0
        } else {
            33.0
        };
    let mut root = el().key("relative").size(WIDTH, HEIGHT).child(
        el().size(WIDTH, content)
            .radius(10.0)
            .gradient(neo("top"), neo("bottom"))
            .border(1.0, neo("border"))
            .shadow(
                10.0,
                26.0,
                Color {
                    r: 0.0,
                    g: 0.0,
                    b: 0.0,
                    a: 0.45,
                },
            ),
    );
    if let Some(banner) = banner {
        let (caption, fill, ink) = match banner {
            Banner::FullCourseYellow => (
                "FCY".to_string(),
                color("colors", "fcy_fill"),
                color("colors", "fcy_text"),
            ),
            Banner::LocalYellow(sector) => (
                format!("Amarilla · Sector {sector}"),
                color("colors", "yellow_fill"),
                color("colors", "yellow_text"),
            ),
            Banner::InPits => (
                "En boxes".to_owned(),
                color("colors", "stops_fill"),
                color("colors", "text"),
            ),
        };
        root = root.child(
            text(caption)
                .font(font("Inter", 12.0, 600.0))
                .color(ink)
                .fill(fill)
                .w(WIDTH)
                .h(22.0)
                .px(12.0),
        );
    }
    root = root
        .child(
            text(state.labels[0].get().to_string())
                .key("header-title")
                .live_text(&state.labels[0])
                .font(font("Inter", 11.0, 400.0))
                .color(color("colors", "muted"))
                .size(230.0, 18.0)
                .truncate()
                .pin(Some(12.0), Some(header_y), None, None),
        )
        .child(
            text(state.labels[1].get().to_string())
                .key("header-range")
                .live_text(&state.labels[1])
                .font(font("Inter", 11.0, 400.0))
                .color(color("colors", "muted"))
                .size(80.0, 18.0)
                .align(Align::End)
                .pin(Some(246.0), Some(header_y), None, None),
        )
        .child(
            text("VANTARE")
                .font(TextStyle {
                    tracking: 1.6,
                    ..font("Rajdhani", 11.0, 600.0)
                })
                .color(color("colors", "muted"))
                .size(65.0, 18.0)
                .align(Align::End)
                .pin(Some(343.0), Some(header_y), None, None),
        );
    let rows = col()
        .w(WIDTH)
        .children((0..state.slots.len()).map(|index| {
            if waiting(board) {
                el().key(format!("skeleton-{index}"))
                    .size(WIDTH, ROW_HEIGHT)
                    .child(
                        el().size(170.0, 8.0)
                            .radius(4.0)
                            .fill(color("colors", "skeleton"))
                            .pin(Some(61.0), Some(8.0), None, None),
                    )
            } else {
                car_row(state, index)
            }
        }))
        .pin(Some(0.0), Some(rows_y), None, None);
    root = root.child(rows);
    if footer_kind != Footer::None {
        root = root
            .child(
                el().size(WIDTH - 24.0, 1.0)
                    .fill(color("colors", "line"))
                    .pin(Some(12.0), Some(footer_y), None, None),
            )
            .child(
                text(state.labels[2].get().to_string())
                    .key("footer-left")
                    .live_text(&state.labels[2])
                    .font(font("Inter", 11.0, 400.0))
                    .color(color("colors", "muted"))
                    .size(270.0, 20.0)
                    .pin(Some(12.0), Some(footer_y + 7.0), None, None),
            )
            .child(
                text(state.labels[3].get().to_string())
                    .key("footer-right")
                    .live_text(&state.labels[3])
                    .font(font("Inter", 11.0, 400.0))
                    .color(color("colors", "muted"))
                    .size(220.0, 20.0)
                    .align(Align::End)
                    .pin(Some(188.0), Some(footer_y + 7.0), None, None),
            );
    }
    root
}
