use gpui::{
    App, Bounds, Context, Window, WindowBackgroundAppearance, WindowBounds, WindowKind,
    WindowOptions, div, prelude::*, px, rgb, rgba, size,
};
use serde_json::Value;
use std::{
    env,
    io::{BufRead, BufReader, Write},
    net::{SocketAddr, TcpStream},
    sync::mpsc::{self, Receiver, Sender},
    thread,
    time::{Duration, Instant},
};

const ROUTE: &str = "/telemetry/overlay-v2/projection";

struct Options {
    address: SocketAddr,
    mode: String,
    expected_rows: Option<usize>,
    expected_snapshots: usize,
    force_widget_refresh: bool,
}

fn options() -> Result<Options, String> {
    let mut endpoint = None;
    let mut mode = String::from("editor");
    let mut expected_rows = None;
    let mut expected_snapshots = 1;
    let mut force_widget_refresh = false;
    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--endpoint" => endpoint = args.next(),
            "--mode" => mode = args.next().ok_or("missing --mode value")?,
            "--expect-rows" => {
                expected_rows = Some(
                    args.next()
                        .ok_or("missing --expect-rows value")?
                        .parse()
                        .map_err(|_| "invalid --expect-rows")?,
                );
            }
            "--expect-snapshots" => {
                expected_snapshots = args
                    .next()
                    .ok_or("missing --expect-snapshots value")?
                    .parse()
                    .map_err(|_| "invalid --expect-snapshots")?;
            }
            "--force-widget-refresh" => force_widget_refresh = true,
            _ => return Err(format!("unknown argument: {arg}")),
        }
    }
    if !["control", "editor", "overlay", "efficiency"].contains(&mode.as_str()) {
        return Err("invalid --mode".into());
    }
    if expected_snapshots == 0 {
        return Err("--expect-snapshots must be positive".into());
    }
    let endpoint = endpoint.ok_or("missing --endpoint")?;
    let address = endpoint
        .strip_prefix("http://")
        .and_then(|rest| rest.strip_suffix(ROUTE))
        .ok_or("endpoint must be local Overlay V2 HTTP route")?
        .parse::<SocketAddr>()
        .map_err(|_| "invalid endpoint address")?;
    if !address.ip().is_loopback() {
        return Err("endpoint must use loopback".into());
    }
    Ok(Options {
        address,
        mode,
        expected_rows,
        expected_snapshots,
        force_widget_refresh,
    })
}

fn stream_once(address: SocketAddr, sender: &Sender<Value>) -> Result<(), String> {
    let mut stream =
        TcpStream::connect_timeout(&address, Duration::from_secs(2)).map_err(|e| e.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(30)))
        .map_err(|e| e.to_string())?;
    write!(stream, "GET {ROUTE} HTTP/1.1\r\nHost: {address}\r\nAccept: text/event-stream\r\nConnection: close\r\n\r\n")
        .map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line).map_err(|e| e.to_string())?;
    if !line.starts_with("HTTP/1.1 200 ") && !line.starts_with("HTTP/1.0 200 ") {
        return Err(format!("Go HTTP status: {}", line.trim()));
    }
    loop {
        line.clear();
        if reader.read_line(&mut line).map_err(|e| e.to_string())? == 0 {
            return Err("Go host closed headers".into());
        }
        if line == "\r\n" || line == "\n" {
            break;
        }
    }
    let (mut event, mut data) = (String::new(), String::new());
    loop {
        line.clear();
        if reader.read_line(&mut line).map_err(|e| e.to_string())? == 0 {
            return Err("Go host disconnected".into());
        }
        if line.len() > 4 * 1024 * 1024 || data.len() + line.len() > 4 * 1024 * 1024 {
            return Err("Go snapshot exceeds limit".into());
        }
        let content = line.trim_end_matches(['\r', '\n']);
        if content.is_empty() {
            if event == "telemetry:overlay-v2:snapshot" {
                let value =
                    serde_json::from_str(&data).map_err(|e| format!("invalid Go snapshot: {e}"))?;
                if sender.send(value).is_err() {
                    return Ok(());
                }
            }
            event.clear();
            data.clear();
        } else if let Some(name) = content.strip_prefix("event: ") {
            event = name.into();
        } else if let Some(payload) = content.strip_prefix("data: ") {
            data.push_str(payload);
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
struct Row {
    position: i64,
    driver: String,
    class_id: String,
    laps: i64,
    gap: String,
    best_lap: String,
    player: bool,
}

fn timing(value: &Value, quality: &str, lap: bool) -> String {
    if quality != "fresh" {
        return "—".into();
    }
    let Some(seconds) = value.as_f64().or_else(|| value["v"].as_f64()) else {
        return "—".into();
    };
    if lap {
        if seconds <= 0.0 {
            return "—".into();
        }
        let milliseconds = (seconds * 1000.0).round() as i64;
        format!(
            "{}:{:02}.{:03}",
            milliseconds / 60_000,
            (milliseconds / 1000) % 60,
            milliseconds % 1000
        )
    } else if seconds == 0.0 {
        "—".into()
    } else {
        format!("{}{seconds:.2}s", if seconds > 0.0 { "+" } else { "" })
    }
}

fn efficiency_rows(frame: &Value) -> Vec<Row> {
    let player_id = frame["player"]["id"].as_str().unwrap_or_default();
    frame["standings"]
        .as_array()
        .into_iter()
        .flatten()
        .take(10)
        .map(|row| {
            let quality = row["q"]["q"].as_str().unwrap_or_default();
            Row {
                position: row["position"].as_i64().unwrap_or_default(),
                driver: row["driver"].as_str().unwrap_or_default().to_uppercase(),
                class_id: row["classId"].as_str().unwrap_or_default().into(),
                laps: row["laps"].as_i64().unwrap_or_default(),
                gap: if row["position"].as_i64() == Some(1) {
                    "LÍDER".into()
                } else {
                    timing(
                        &row["gap"],
                        row["q"]["gap"].as_str().unwrap_or(quality),
                        false,
                    )
                },
                best_lap: timing(
                    &row["bestLap"],
                    row["q"]["bestLap"].as_str().unwrap_or(quality),
                    true,
                ),
                player: !player_id.is_empty() && row["id"].as_str() == Some(player_id),
            }
        })
        .collect()
}

struct Trial {
    receiver: Receiver<Value>,
    rows: Vec<Row>,
    relative: Vec<(i64, String)>,
    track: String,
    speed: String,
    rpm: String,
    gear: String,
    session: String,
    source: String,
    clock: String,
    active_class: String,
    footer: String,
    snapshots: usize,
    started: Instant,
    expected_rows: Option<usize>,
    expected_snapshots: usize,
    mode: String,
    force_widget_refresh: bool,
}

impl Trial {
    fn new(cx: &mut Context<Self>, receiver: Receiver<Value>, opt: Options) -> Self {
        cx.spawn(async move |this, cx| {
            loop {
                cx.background_executor()
                    .timer(Duration::from_millis(50))
                    .await;
                if this.update(cx, |trial, cx| trial.poll(cx)).is_err() {
                    break;
                }
            }
        })
        .detach();
        Self {
            receiver,
            rows: Vec::new(),
            relative: Vec::new(),
            track: String::new(),
            speed: String::new(),
            rpm: String::new(),
            gear: String::new(),
            session: String::new(),
            source: String::from("connecting"),
            clock: String::from("—"),
            active_class: String::from("—"),
            footer: String::from("CIRCUITO —     VUELTAS —"),
            snapshots: 0,
            started: Instant::now(),
            expected_rows: opt.expected_rows,
            expected_snapshots: opt.expected_snapshots,
            mode: opt.mode,
            force_widget_refresh: opt.force_widget_refresh,
        }
    }

    fn poll(&mut self, cx: &mut Context<Self>) {
        while let Ok(value) = self.receiver.try_recv() {
            let Some(frame) = value.get("frame") else {
                continue;
            };
            if frame["contract"].as_i64() != Some(2) {
                continue;
            }
            let Some(standings) = frame["standings"].as_array() else {
                continue;
            };
            if self.mode == "efficiency" {
                let next_rows = efficiency_rows(frame);
                let remaining = (frame["session"]["remaining"]["q"] == "fresh")
                    .then(|| frame["session"]["remaining"]["v"].as_f64().unwrap_or(0.0));
                let next_clock = remaining
                    .map(|n| {
                        let seconds = n as i64;
                        if seconds >= 3600 {
                            format!(
                                "{:02}:{:02}:{:02}",
                                seconds / 3600,
                                (seconds % 3600) / 60,
                                seconds % 60
                            )
                        } else {
                            format!("{:02}:{:02}", seconds / 60, seconds % 60)
                        }
                    })
                    .unwrap_or_else(|| "—".into());
                let player_id = frame["player"]["id"].as_str().unwrap_or_default();
                let next_class = standings
                    .iter()
                    .find(|row| row["id"].as_str() == Some(player_id))
                    .or_else(|| standings.first())
                    .and_then(|row| row["classId"].as_str())
                    .filter(|id| !id.is_empty())
                    .unwrap_or("—")
                    .to_uppercase();
                let track = if frame["session"]["track"]["q"] == "fresh" {
                    frame["session"]["track"]["v"]
                        .as_str()
                        .filter(|s| !s.is_empty())
                        .unwrap_or("—")
                } else {
                    "—"
                };
                let laps = if frame["fuel"]["sessionLaps"]["q"] == "fresh" {
                    frame["fuel"]["sessionLaps"]["v"]
                        .as_i64()
                        .map(|n| format!("≈{n}"))
                        .unwrap_or_else(|| "≈0".into())
                } else {
                    "—".into()
                };
                let next_footer = format!("CIRCUITO {track}     VUELTAS {laps}");
                let changed = self.rows != next_rows
                    || self.clock != next_clock
                    || self.active_class != next_class
                    || self.footer != next_footer;
                self.rows = next_rows;
                self.clock = next_clock;
                self.active_class = next_class;
                self.footer = next_footer;
                self.snapshots += 1;
                if changed || self.force_widget_refresh {
                    cx.notify();
                }
                if self.expected_rows == Some(standings.len())
                    && self.snapshots >= self.expected_snapshots
                {
                    println!(
                        "GPUI efficiency received {} rows / {} snapshots",
                        standings.len(),
                        self.snapshots
                    );
                    std::process::exit(0);
                }
                continue;
            }
            self.rows = standings
                .iter()
                .map(|row| Row {
                    position: row["position"].as_i64().unwrap_or_default(),
                    driver: row["driver"].as_str().unwrap_or_default().into(),
                    class_id: row["classId"].as_str().unwrap_or_default().into(),
                    laps: row["laps"].as_i64().unwrap_or_default(),
                    gap: String::new(),
                    best_lap: String::new(),
                    player: false,
                })
                .collect();
            self.track = frame["session"]["track"]["v"]
                .as_str()
                .unwrap_or_default()
                .into();
            self.speed = frame["player"]["speed"]["v"]
                .as_f64()
                .map(|n| format!("{n:.1} m/s"))
                .unwrap_or_else(|| "—".into());
            self.rpm = frame["player"]["rpm"]["v"]
                .as_f64()
                .map(|n| format!("{n:.0} rpm"))
                .unwrap_or_else(|| "—".into());
            self.gear = frame["player"]["gear"]["v"]
                .as_i64()
                .map(|n| n.to_string())
                .unwrap_or_else(|| "—".into());
            self.session = frame["sessionId"].as_str().unwrap_or_default().into();
            self.relative = frame["relative"]
                .as_array()
                .map(|rows| {
                    rows.iter()
                        .map(|row| {
                            (
                                row["position"].as_i64().unwrap_or_default(),
                                row["name"].as_str().unwrap_or_default().to_owned(),
                            )
                        })
                        .collect()
                })
                .unwrap_or_default();
            self.source = value["source"]["state"].as_str().unwrap_or_default().into();
            self.snapshots += 1;
            cx.notify();
            if self.expected_rows == Some(self.rows.len())
                && self.snapshots >= self.expected_snapshots
            {
                println!(
                    "GPUI received {} rows / {} snapshots",
                    self.rows.len(),
                    self.snapshots
                );
                std::process::exit(0);
            }
        }
        if self.expected_rows.is_some() && self.started.elapsed() > Duration::from_secs(15) {
            eprintln!("GPUI expected Go snapshots not received");
            std::process::exit(6);
        }
    }
}

impl Render for Trial {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        if self.mode == "efficiency" {
            return self.render_efficiency();
        }
        let compact = self.mode == "overlay";
        let rows = self
            .rows
            .iter()
            .take(if compact { 10 } else { 44 })
            .map(|row| {
                div()
                    .flex()
                    .flex_row()
                    .justify_between()
                    .gap_2()
                    .px_2()
                    .py_1()
                    .bg(rgb(0x17232d))
                    .child(format!("{:02}", row.position))
                    .child(row.driver.clone())
                    .child(row.class_id.clone())
                    .child(format!("{} L", row.laps))
            });
        let relative = self.relative.iter().map(|(position, name)| {
            div()
                .flex()
                .flex_row()
                .gap_2()
                .py_1()
                .child(format!("{position:02}"))
                .child(name.clone())
        });
        let preview = self
            .rows
            .iter()
            .take(8)
            .map(|row| div().child(format!("{}  {}", row.position, row.driver)));
        div()
            .flex()
            .flex_col()
            .size_full()
            .gap_3()
            .p_4()
            .bg(rgb(0x090d13))
            .text_color(rgb(0xe8f0f4))
            .child(
                div()
                    .flex()
                    .flex_row()
                    .justify_between()
                    .child(
                        div()
                            .text_color(rgb(0x5fe1ee))
                            .child("VANTARE  Native Go trial"),
                    )
                    .child(format!("{} · {} snapshots", self.source, self.snapshots)),
            )
            .child(
                div()
                    .flex()
                    .flex_row()
                    .gap_3()
                    .h(px(92.0))
                    .child(
                        div()
                            .w(px(400.0))
                            .p_3()
                            .bg(rgb(0x15212b))
                            .child("CIRCUITO")
                            .child(self.track.clone()),
                    )
                    .child(
                        div()
                            .w(px(400.0))
                            .p_3()
                            .bg(rgb(0x15212b))
                            .child("PILOTO · VELOCIDAD")
                            .child(self.speed.clone()),
                    )
                    .child(
                        div()
                            .w(px(400.0))
                            .p_3()
                            .bg(rgb(0x15212b))
                            .child("MOTOR · MARCHA")
                            .child(format!("{} · {}", self.rpm, self.gear)),
                    ),
            )
            .child(
                div()
                    .flex()
                    .flex_row()
                    .gap_3()
                    .size_full()
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .w(px(650.0))
                            .h_full()
                            .p_2()
                            .gap_2()
                            .bg(rgb(0x101820))
                            .child(
                                div()
                                    .text_color(rgb(0x5fe1ee))
                                    .child(format!("STANDINGS · {} coches", self.rows.len())),
                            )
                            .child(
                                div()
                                    .id("standings-scroll")
                                    .flex()
                                    .flex_col()
                                    .size_full()
                                    .gap_1()
                                    .overflow_y_scroll()
                                    .children(rows),
                            ),
                    )
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .w(px(245.0))
                            .h_full()
                            .p_2()
                            .gap_2()
                            .bg(rgb(0x15212b))
                            .child(div().text_color(rgb(0x5fe1ee)).child("RELATIVE"))
                            .children(relative)
                            .child(format!("Sesión: {}", self.session)),
                    )
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .w(px(295.0))
                            .h_full()
                            .p_2()
                            .gap_2()
                            .bg(rgb(0x15212b))
                            .child(
                                div()
                                    .text_color(rgb(0x5fe1ee))
                                    .child("EDITOR · BORRADOR LOCAL"),
                            )
                            .child("Título del overlay")
                            .child(div().p_1().bg(rgb(0x263642)).child("STANDINGS"))
                            .child("Filas visibles: 8")
                            .child(div().p_1().bg(rgb(0x263642)).child("8"))
                            .child("Opacidad: 90%")
                            .child("Color de acento: Turquesa")
                            .child("Mostrar Relative")
                            .child(
                                div()
                                    .flex()
                                    .flex_col()
                                    .gap_1()
                                    .p_2()
                                    .bg(rgb(0x090d13))
                                    .child(div().text_color(rgb(0x5fe1ee)).child("VISTA PREVIA"))
                                    .children(preview),
                            )
                            .child("Restablecer borrador"),
                    ),
            )
    }
}

impl Trial {
    fn render_efficiency(&self) -> gpui::Div {
        let rows = self.rows.iter().map(|row| {
            let bg = if row.player {
                0x343538ab
            } else if row.position <= 3 {
                0x191a1c77
            } else {
                0x11121400
            };
            div()
                .flex()
                .flex_row()
                .items_center()
                .h(px(30.0))
                .w_full()
                .bg(rgba(bg))
                .text_size(px(14.0))
                .border_b_1()
                .border_color(rgb(0x292a2d))
                .child(div().w(px(2.0)).h(px(20.0)).bg(rgba(if row.player {
                    0xed2431ff
                } else {
                    0x11121400
                })))
                .child(
                    div()
                        .w(px(28.0))
                        .text_center()
                        .text_color(rgb(0xb9bbc1))
                        .child(row.position.to_string()),
                )
                .child(
                    div()
                        .w(px(236.0))
                        .overflow_hidden()
                        .pl_2()
                        .whitespace_nowrap()
                        .text_ellipsis()
                        .font_weight(gpui::FontWeight::BOLD)
                        .child(if row.player {
                            format!("{}  TÚ", row.driver)
                        } else {
                            row.driver.clone()
                        }),
                )
                .child(div().w(px(86.0)).text_center().child(row.gap.clone()))
                .child(
                    div()
                        .w(px(76.0))
                        .text_right()
                        .pr_2()
                        .child(row.best_lap.clone()),
                )
        });
        div()
            .flex()
            .flex_col()
            .w(px(428.0))
            .h(px(364.0))
            .rounded(px(6.0))
            .overflow_hidden()
            .bg(rgba(0x111214de))
            .text_color(rgb(0xf5f5f5))
            .child(
                div()
                    .flex()
                    .flex_row()
                    .items_center()
                    .h(px(42.0))
                    .bg(rgba(0x18191be6))
                    .px_2()
                    .text_size(px(11.0))
                    .whitespace_nowrap()
                    .child(
                        div()
                            .w(px(85.0))
                            .text_size(px(12.0))
                            .text_color(rgb(0xe32530))
                            .font_weight(gpui::FontWeight::BOLD)
                            .child("VANTARE"),
                    )
                    .child(
                        div()
                            .w(px(95.0))
                            .whitespace_nowrap()
                            .child(format!("CARRERA {}", self.clock)),
                    )
                    .child(
                        div()
                            .w(px(48.0))
                            .bg(rgb(0xc1121f))
                            .text_center()
                            .child(self.active_class.chars().take(3).collect::<String>()),
                    )
                    .child(
                        div()
                            .w(px(105.0))
                            .text_center()
                            .text_size(px(10.0))
                            .child("AL LÍDER"),
                    )
                    .child(
                        div()
                            .w(px(90.0))
                            .text_right()
                            .text_size(px(10.0))
                            .child("MEJOR V."),
                    ),
            )
            .child(div().flex().flex_col().h(px(300.0)).children(rows))
            .child(
                div()
                    .flex()
                    .flex_row()
                    .items_center()
                    .justify_center()
                    .h(px(22.0))
                    .bg(rgba(0x18191be6))
                    .text_size(px(10.0))
                    .text_color(rgb(0xb9b9bd))
                    .child(self.footer.clone()),
            )
    }
}

fn run() -> Result<(), String> {
    let opt = options()?;
    let (sender, receiver) = mpsc::channel();
    let address = opt.address;
    thread::spawn(move || {
        loop {
            let _ = stream_once(address, &sender);
            thread::sleep(Duration::from_secs(1));
        }
    });
    gpui_platform::application().run(|cx: &mut App| {
        let bounds = if opt.mode == "efficiency" {
            Bounds::centered(None, size(px(428.0), px(364.0)), cx)
        } else {
            Bounds::centered(None, size(px(1280.0), px(720.0)), cx)
        };
        let mut window_options = WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(bounds)),
            ..Default::default()
        };
        if opt.mode == "efficiency" {
            window_options.titlebar = None;
            window_options.kind = WindowKind::PopUp;
            window_options.window_background = WindowBackgroundAppearance::Transparent;
        }
        cx.open_window(window_options, |_, cx| {
            cx.new(|cx| Trial::new(cx, receiver, opt))
        })
        .expect("GPUI trial window");
        cx.activate(true);
    });
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(2);
    }
}

#[cfg(test)]
mod tests {
    use super::{efficiency_rows, timing};
    use serde_json::json;

    #[test]
    fn efficiency_rows_keep_only_visible_real_cells_and_player() {
        let frame = json!({
            "player": {"id": "car-1"},
            "standings": [
                {"id":"car-1", "position": 1, "driver":"Isaac", "classId":"GT3", "laps":3,
                 "q":{"q":"fresh"}, "gap":0, "bestLap":89.123},
                {"id":"car-2", "position": 2, "driver":"Rival", "classId":"GT3", "laps":3,
                 "q":{"q":"fresh", "gap":"missing"}, "gap":2.345, "bestLap":91.234}
            ]
        });
        let rows = efficiency_rows(&frame);
        assert_eq!(rows.len(), 2);
        assert!(rows[0].player);
        assert_eq!(rows[0].driver, "ISAAC");
        assert_eq!(rows[0].best_lap, "1:29.123");
        assert_eq!(rows[0].gap, "LÍDER");
        assert_eq!(rows[1].gap, "—");
        assert!(!rows[1].player);
        assert_eq!(rows, efficiency_rows(&frame));
    }

    #[test]
    fn timing_does_not_show_missing_or_zero_as_valid_lap() {
        assert_eq!(timing(&json!(0), "fresh", true), "—");
        assert_eq!(timing(&json!(90.5), "missing", true), "—");
        assert_eq!(timing(&json!(90.5), "stale", true), "—");
        assert_eq!(timing(&json!(119.9995), "fresh", true), "2:00.000");
        assert_eq!(timing(&json!(2.5), "fresh", false), "+2.50s");
        assert_eq!(timing(&json!(-2.5), "fresh", false), "-2.50s");
    }
}
