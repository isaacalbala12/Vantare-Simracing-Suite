use serde_json::Value;
use slint::{ComponentHandle, ModelRc, SharedString, Timer, TimerMode, VecModel};
use std::{
    env,
    io::{BufRead, BufReader, Write},
    net::{SocketAddr, TcpStream},
    rc::Rc,
    sync::mpsc,
    thread,
    time::Duration,
};

slint::include_modules!();
const ROUTE: &str = "/telemetry/overlay-v2/projection";
const MAX_EVENT: usize = 4 * 1024 * 1024;

struct Options {
    address: SocketAddr,
    overlay: bool,
    expected: Option<usize>,
    expected_snapshots: usize,
    close_ms: Option<u64>,
}

fn options() -> Result<Options, String> {
    let args: Vec<_> = env::args().skip(1).collect();
    let (mut endpoint, mut overlay, mut expected, mut close_ms) = (None, false, None, None);
    let mut expected_snapshots = 1;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--endpoint" => {
                i += 1;
                endpoint = args.get(i).cloned();
            }
            "--mode" => {
                i += 1;
                overlay = match args.get(i).map(String::as_str) {
                    Some("overlay") => true,
                    Some("control") => false,
                    _ => return Err("invalid --mode".into()),
                };
            }
            "--expect-rows" => {
                i += 1;
                expected = Some(
                    args.get(i)
                        .ok_or("missing --expect-rows value")?
                        .parse()
                        .map_err(|_| "invalid --expect-rows")?,
                );
            }
            "--expect-snapshots" => {
                i += 1;
                expected_snapshots = args
                    .get(i)
                    .ok_or("missing --expect-snapshots value")?
                    .parse()
                    .map_err(|_| "invalid --expect-snapshots")?;
            }
            "--auto-close-ms" => {
                i += 1;
                close_ms = Some(
                    args.get(i)
                        .ok_or("missing --auto-close-ms value")?
                        .parse()
                        .map_err(|_| "invalid --auto-close-ms")?,
                );
            }
            "--help" | "-h" => {
                println!(
                    "--endpoint http://127.0.0.1:<port>{ROUTE} [--mode control|overlay] [--expect-rows 44] [--expect-snapshots N] [--auto-close-ms N]"
                );
                std::process::exit(0);
            }
            x => return Err(format!("unknown argument {x}")),
        }
        i += 1;
    }
    let endpoint = endpoint.ok_or("--endpoint is required")?;
    let authority = endpoint
        .strip_prefix("http://")
        .ok_or("endpoint must use http")?;
    let (host, path) = authority.split_once('/').ok_or("endpoint needs route")?;
    if path != &ROUTE[1..] {
        return Err("endpoint must use Overlay V2 route".into());
    }
    let address: SocketAddr = host
        .parse()
        .map_err(|_| "endpoint must use numeric loopback host and port")?;
    if !address.ip().is_loopback() || address.port() == 0 {
        return Err("endpoint must use loopback and a nonzero port".into());
    }
    if expected_snapshots == 0 || (expected_snapshots > 1 && expected.is_none()) {
        return Err("--expect-snapshots requires --expect-rows and a positive count".into());
    }
    Ok(Options {
        address,
        overlay,
        expected,
        expected_snapshots,
        close_ms,
    })
}

fn value_text(v: &Value, suffix: &str) -> SharedString {
    if matches!(
        v.get("q").and_then(Value::as_str),
        Some("missing" | "invalid")
    ) {
        return "—".into();
    }
    match v.get("v") {
        Some(Value::String(s)) => format!("{s}{suffix}").into(),
        Some(Value::Number(n)) => format!("{n}{suffix}").into(),
        _ => "—".into(),
    }
}

fn str_field(v: &Value, k: &str) -> String {
    v.get(k).and_then(Value::as_str).unwrap_or_default().into()
}

struct ViewData {
    rows: Vec<DriverRow>,
    relative: Vec<RelativeRow>,
    state: SharedString,
    track: SharedString,
    speed: SharedString,
    rpm: SharedString,
    gear: SharedString,
    session_id: SharedString,
}

enum FeedEvent {
    Snapshot(Value),
    Disconnected,
}
fn parse_snapshot(v: &Value) -> Result<ViewData, String> {
    let frame = v.get("frame").ok_or("missing frame")?;
    if frame.get("contract").and_then(Value::as_i64) != Some(2) {
        return Err("unsupported Go contract".into());
    }
    let player_id = frame
        .pointer("/player/id")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let rows = frame["standings"]
        .as_array()
        .ok_or("missing standings")?
        .iter()
        .map(|r| DriverRow {
            position: r["position"].as_i64().unwrap_or_default() as i32,
            driver: str_field(r, "driver").into(),
            vehicle_class: str_field(r, "classId").into(),
            laps: r["laps"].as_i64().unwrap_or_default() as i32,
            player: r["id"].as_str() == Some(player_id),
        })
        .collect();
    let relative = frame["relative"]
        .as_array()
        .ok_or("missing relative")?
        .iter()
        .map(|r| RelativeRow {
            position: r["position"].as_i64().unwrap_or_default() as i32,
            driver: str_field(r, "name").into(),
        })
        .collect();
    Ok(ViewData {
        rows,
        relative,
        state: v
            .pointer("/source/state")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .into(),
        track: value_text(&frame["session"]["track"], ""),
        speed: value_text(&frame["player"]["speed"], " m/s"),
        rpm: value_text(&frame["player"]["rpm"], " rpm"),
        gear: value_text(&frame["player"]["gear"], ""),
        session_id: str_field(frame, "sessionId").into(),
    })
}

fn stream_once(address: SocketAddr, tx: &mpsc::Sender<FeedEvent>) -> Result<(), String> {
    let mut stream =
        TcpStream::connect_timeout(&address, Duration::from_secs(2)).map_err(|e| e.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(30)))
        .map_err(|e| e.to_string())?;
    write!(stream, "GET {ROUTE} HTTP/1.1\r\nHost: {address}\r\nAccept: text/event-stream\r\nConnection: close\r\n\r\n").map_err(|e| e.to_string())?;
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
        if line.len() > MAX_EVENT || data.len() + line.len() > MAX_EVENT {
            return Err("Go snapshot exceeds limit".into());
        }
        let content = line.trim_end_matches(['\r', '\n']);
        if content.is_empty() {
            if event == "telemetry:overlay-v2:snapshot" {
                let value =
                    serde_json::from_str(&data).map_err(|e| format!("invalid Go snapshot: {e}"))?;
                if tx.send(FeedEvent::Snapshot(value)).is_err() {
                    return Ok(());
                }
            }
            event.clear();
            data.clear();
        } else if let Some(name) = content.strip_prefix("event: ") {
            event = name.into();
        } else if let Some(value) = content.strip_prefix("data: ") {
            data.push_str(value);
        }
    }
}

#[cfg(windows)]
fn overlay_window() {
    use windows_sys::Win32::Foundation::{HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GWL_EXSTYLE, GetWindowLongPtrW, GetWindowThreadProcessId, HWND_TOPMOST,
        IsWindowVisible, SW_SHOWNOACTIVATE, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE,
        SWP_NOSIZE, SWP_SHOWWINDOW, SetWindowLongPtrW, SetWindowPos, ShowWindow, WS_EX_APPWINDOW,
        WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
    };
    struct Search {
        pid: u32,
        hwnd: HWND,
    }
    unsafe extern "system" fn find(hwnd: HWND, param: LPARAM) -> i32 {
        let s = unsafe { &mut *(param as *mut Search) };
        let mut pid = 0;
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
        if pid == s.pid && unsafe { IsWindowVisible(hwnd) } != 0 {
            s.hwnd = hwnd;
            return 0;
        }
        1
    }
    thread::spawn(move || unsafe {
        for _ in 0..500 {
            let mut s = Search {
                pid: std::process::id(),
                hwnd: std::ptr::null_mut(),
            };
            EnumWindows(Some(find), &mut s as *mut Search as isize);
            if !s.hwnd.is_null() {
                let style = GetWindowLongPtrW(s.hwnd, GWL_EXSTYLE);
                SetWindowLongPtrW(
                    s.hwnd,
                    GWL_EXSTYLE,
                    (style
                        | WS_EX_NOACTIVATE as isize
                        | WS_EX_TRANSPARENT as isize
                        | WS_EX_APPWINDOW as isize)
                        & !(WS_EX_TOOLWINDOW as isize),
                );
                SetWindowPos(
                    s.hwnd,
                    HWND_TOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED,
                );
                ShowWindow(s.hwnd, SW_SHOWNOACTIVATE);
                return;
            }
            thread::sleep(Duration::from_millis(10));
        }
    });
}

fn run() -> Result<(), String> {
    let opt = options()?;
    let ui = MainWindow::new().map_err(|e| e.to_string())?;
    ui.set_overlay_mode(opt.overlay);
    if opt.overlay {
        overlay_window();
    }
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        loop {
            let _ = stream_once(opt.address, &tx);
            if tx.send(FeedEvent::Disconnected).is_err() {
                break;
            }
            thread::sleep(Duration::from_secs(1));
        }
    });
    let feed_timer = Timer::default();
    let weak = ui.as_weak();
    let mut seen_snapshots = 0;
    feed_timer.start(TimerMode::Repeated, Duration::from_millis(30), move || {
        if let Some(ui) = weak.upgrade() {
            while let Ok(event) = rx.try_recv() {
                let FeedEvent::Snapshot(v) = event else {
                    ui.set_source_state("reconnecting".into());
                    continue;
                };
                if let Ok(data) = parse_snapshot(&v) {
                    let count = data.rows.len();
                    let overlay_rows: Vec<_> = data.rows.iter().take(10).cloned().collect();
                    ui.set_rows(ModelRc::from(Rc::new(VecModel::from(data.rows))));
                    ui.set_overlay_rows(ModelRc::from(Rc::new(VecModel::from(overlay_rows))));
                    ui.set_relative_rows(ModelRc::from(Rc::new(VecModel::from(data.relative))));
                    ui.set_source_state(data.state);
                    ui.set_track(data.track);
                    ui.set_speed(data.speed);
                    ui.set_rpm(data.rpm);
                    ui.set_gear(data.gear);
                    ui.set_session_id(data.session_id);
                    if opt.expected == Some(count) {
                        seen_snapshots += 1;
                    }
                    if seen_snapshots >= opt.expected_snapshots && opt.expected == Some(count) {
                        let _ = slint::quit_event_loop();
                    }
                } else {
                    ui.set_source_state("invalid Go snapshot".into());
                }
            }
        }
    });
    let close_timer = Timer::default();
    if let Some(ms) = opt.close_ms {
        close_timer.start(TimerMode::SingleShot, Duration::from_millis(ms), || {
            let _ = slint::quit_event_loop();
        });
    }
    let timeout_timer = Timer::default();
    if opt.expected.is_some() {
        let timeout = if opt.expected_snapshots > 1 { 15 } else { 5 };
        timeout_timer.start(TimerMode::SingleShot, Duration::from_secs(timeout), || {
            std::process::exit(6)
        });
    }
    ui.run().map_err(|e| e.to_string())?;
    drop((feed_timer, close_timer, timeout_timer));
    Ok(())
}

fn main() {
    if let Err(e) = run() {
        eprintln!("{e}");
        std::process::exit(2);
    }
}
