use gpui::{
    App, Bounds, Context, Window, WindowBounds, WindowOptions, div, prelude::*, px, rgb, size,
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
}

fn options() -> Result<Options, String> {
    let mut endpoint = None;
    let mut mode = String::from("editor");
    let mut expected_rows = None;
    let mut expected_snapshots = 1;
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
            _ => return Err(format!("unknown argument: {arg}")),
        }
    }
    if !["control", "editor", "overlay"].contains(&mode.as_str()) {
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

struct Row {
    position: i64,
    driver: String,
    class_id: String,
    laps: i64,
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
    snapshots: usize,
    started: Instant,
    expected_rows: Option<usize>,
    expected_snapshots: usize,
    mode: String,
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
            snapshots: 0,
            started: Instant::now(),
            expected_rows: opt.expected_rows,
            expected_snapshots: opt.expected_snapshots,
            mode: opt.mode,
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
            self.rows = standings
                .iter()
                .map(|row| Row {
                    position: row["position"].as_i64().unwrap_or_default(),
                    driver: row["driver"].as_str().unwrap_or_default().into(),
                    class_id: row["classId"].as_str().unwrap_or_default().into(),
                    laps: row["laps"].as_i64().unwrap_or_default(),
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
        let bounds = Bounds::centered(None, size(px(1280.0), px(720.0)), cx);
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(bounds)),
                ..Default::default()
            },
            |_, cx| cx.new(|cx| Trial::new(cx, receiver, opt)),
        )
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
