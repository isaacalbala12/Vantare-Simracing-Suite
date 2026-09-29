use eframe::egui;
use serde_json::Value;
use std::{
    io::{BufRead, BufReader, Write},
    net::{SocketAddr, TcpStream},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

pub const ROUTE: &str = "/telemetry/overlay-v2/projection";
pub type LatestProjection = Arc<Mutex<Option<Projection>>>;

#[derive(Clone, Debug, PartialEq)]
pub struct Row {
    pub position: i64,
    pub driver: String,
    pub gap: String,
    pub best_lap: String,
    pub player: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Projection {
    pub source: String,
    pub session_clock: String,
    pub rows: Vec<Row>,
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
        let ms = (seconds * 1000.0).round() as i64;
        format!("{}:{:02}.{:03}", ms / 60_000, (ms / 1000) % 60, ms % 1000)
    } else if seconds == 0.0 {
        "—".into()
    } else {
        format!("{}{seconds:.2}s", if seconds > 0.0 { "+" } else { "" })
    }
}

pub fn parse(value: &Value) -> Result<Projection, String> {
    let frame = value.get("frame").ok_or("missing frame")?;
    if frame["contract"].as_i64() != Some(2) {
        return Err("unsupported Overlay V2 contract".into());
    }
    let source = value["source"]["state"]
        .as_str()
        .ok_or("missing source state")?
        .to_owned();
    let remaining = &frame["session"]["remaining"];
    let session_clock = if remaining["q"] == "fresh" {
        remaining["v"]
            .as_f64()
            .map(|seconds| {
                let seconds = seconds.max(0.0) as i64;
                if seconds >= 3600 {
                    format!(
                        "{:02}:{:02}:{:02}",
                        seconds / 3600,
                        seconds / 60 % 60,
                        seconds % 60
                    )
                } else {
                    format!("{:02}:{:02}", seconds / 60, seconds % 60)
                }
            })
            .unwrap_or_else(|| "—".into())
    } else {
        "—".into()
    };
    let standings = frame["standings"].as_array().ok_or("missing standings")?;
    let player_id = frame["player"]["id"].as_str().unwrap_or_default();
    let rows = standings
        .iter()
        .take(10)
        .map(|row| {
            let position = row["position"].as_i64().unwrap_or_default();
            let quality = row["q"]["q"].as_str().unwrap_or_default();
            Row {
                position,
                driver: row["driver"].as_str().unwrap_or_default().to_uppercase(),
                gap: if position == 1 {
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
        .collect();
    Ok(Projection {
        source,
        session_clock,
        rows,
    })
}

fn stream_once(
    address: SocketAddr,
    latest: &LatestProjection,
    stopped: &AtomicBool,
    ctx: &egui::Context,
) -> Result<(), String> {
    let mut stream =
        TcpStream::connect_timeout(&address, Duration::from_secs(2)).map_err(|e| e.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
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
    while !stopped.load(Ordering::Relaxed) {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => return Err("Go host disconnected".into()),
            Ok(_) => {}
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock
                ) =>
            {
                continue;
            }
            Err(error) => return Err(error.to_string()),
        }
        if line.len() > 4 * 1024 * 1024 || data.len() + line.len() > 4 * 1024 * 1024 {
            return Err("Go snapshot exceeds limit".into());
        }
        let content = line.trim_end_matches(['\r', '\n']);
        if content.is_empty() {
            if event == "telemetry:overlay-v2:snapshot" {
                let value: Value =
                    serde_json::from_str(&data).map_err(|e| format!("invalid Go snapshot: {e}"))?;
                let projection = parse(&value)?;
                if let Ok(mut slot) = latest.lock() {
                    *slot = Some(projection);
                }
                ctx.request_repaint();
            }
            event.clear();
            data.clear();
        } else if let Some(name) = content.strip_prefix("event: ") {
            event = name.into();
        } else if let Some(payload) = content.strip_prefix("data: ") {
            data.push_str(payload);
        }
    }
    Ok(())
}

pub fn connect_loop(
    address: SocketAddr,
    latest: LatestProjection,
    stopped: Arc<AtomicBool>,
    ctx: egui::Context,
) {
    while !stopped.load(Ordering::Relaxed) {
        if let Err(error) = stream_once(address, &latest, &stopped, &ctx) {
            eprintln!("Go overlay stream: {error}");
        }
        if stopped.load(Ordering::Relaxed) {
            break;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_quality_and_player_from_overlay_v2() {
        let input = serde_json::json!({"source":{"state":"live"},"frame":{"contract":2,"player":{"id":"p2"},"standings":[
            {"id":"p1","position":1,"driver":"Renan Azeredo","bestLap":{"v":102.198},"q":{"q":"fresh","bestLap":"fresh"}},
            {"id":"p2","position":2,"driver":"Marco Acunto","gap":{"v":0.8},"bestLap":{"v":102.089},"q":{"q":"fresh","gap":"missing","bestLap":"fresh"}}
        ]}});
        let result = parse(&input).unwrap();
        assert_eq!(result.rows[0].gap, "LÍDER");
        assert_eq!(result.rows[0].best_lap, "1:42.198");
        assert_eq!(result.rows[1].gap, "—");
        assert!(result.rows[1].player);
    }

    #[test]
    fn rejects_incompatible_contract() {
        let input =
            serde_json::json!({"source":{"state":"live"},"frame":{"contract":1,"standings":[]}});
        assert!(parse(&input).is_err());
    }
}
