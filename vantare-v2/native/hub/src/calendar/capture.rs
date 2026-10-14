//! Escenas de captura del calendario (solo con `parity-capture`).
//!
//! Sin `VANTARE_CAPTURE_CALENDAR` se usa el calendario de la demo, igual que
//! antes. Con ella, la escena sale de pares `clave=valor;...`:
//! `state` (ok, nofav, offline, fallback, expired, nosched, loading),
//! `view` (proximas, mias, dia, semana, mes, eventos, serie), `week`, `day`,
//! `ficha`, `slot`, `modal` (avisos, ics), `serie`, `only` (fav), `full`, `utc`.
use super::{
    Calendar, Following, Schedule,
    alerts::{Alerts, Band, Days, Mode},
    ui::{Ficha, Modal, Span, View},
};
use crate::demo::DemoData;
use chrono::{DateTime, TimeZone, Utc};
use std::collections::HashMap;

const OCTOBER: &[u8] = include_bytes!("../../reference/fixtures/calendar-lmu-2026-10-06.json");

fn at(y: i32, mo: u32, d: u32, h: u32, mi: u32, s: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(y, mo, d, h, mi, s)
        .single()
        .unwrap_or_default()
}

pub(super) fn apply(calendar: &mut Calendar, demo: &DemoData) -> Result<(), String> {
    let Ok(spec) = std::env::var("VANTARE_CAPTURE_CALENDAR") else {
        calendar.official = Some(Schedule::parse(&demo.calendar_json()?)?);
        let now = calendar.now();
        calendar.rebuild(now);
        return Ok(());
    };
    let opts: HashMap<&str, &str> = spec.split(';').filter_map(|p| p.split_once('=')).collect();
    let get = |key: &str| opts.get(key).copied();
    let state = get("state").unwrap_or("ok");
    let now = match (state, get("slot")) {
        ("expired", _) => at(2026, 10, 13, 8, 12, 40),
        (_, _) if get("modal") == Some("toast") => at(2026, 10, 8, 17, 50, 0),
        _ => at(2026, 10, 8, 17, 47, 13),
    };
    calendar.demo_now = Some(now);

    if state != "nosched" && state != "loading" {
        let mut value: serde_json::Value =
            serde_json::from_slice(OCTOBER).map_err(|error| error.to_string())?;
        if state == "fallback" {
            for series in value["series"].as_array_mut().into_iter().flatten() {
                if matches!(
                    series["id"].as_str(),
                    Some("intermediate-prototype-fixed" | "advanced-wec-xperience")
                ) {
                    series["source"] = "racecontrol".into();
                }
            }
        }
        calendar.official = Some(Schedule::parse(
            &serde_json::to_vec(&value).map_err(|e| e.to_string())?,
        )?);
    }
    calendar.refreshing = state == "loading";
    calendar.refresh_failed = state == "offline";
    calendar.stamps.checked = at(2026, 10, 8, 8, 2, 0).timestamp();
    calendar.stamps.updated = calendar.stamps.checked;

    if !matches!(state, "nofav" | "nosched" | "loading") {
        calendar.following = Following {
            series_ids: [
                "beginner-lmgt3-fixed",
                "weekly-wec-weekly",
                "weekly-10-hours-of-road-atlanta",
            ]
            .map(str::to_owned)
            .into(),
        };
        let mut alerts = Alerts::default();
        alerts.bands.push(Band {
            series_id: "beginner-lmgt3-fixed".into(),
            from: 20 * 60,
            to: 23 * 60,
            days: Days::All,
            mode: Mode::Each,
        });
        for (id, when) in [
            ("weekly-wec-weekly", at(2026, 10, 8, 20, 0, 0)),
            ("weekly-10-hours-of-road-atlanta", at(2026, 10, 10, 9, 0, 0)),
        ] {
            alerts.toggle_slot(id, when)?;
        }
        calendar.alerts = alerts;
    }
    calendar.prefs.utc = get("utc").is_some();
    calendar.profile = Some("Carrera LMU".into());
    calendar.rebuild(now);

    let ui = &mut calendar.ui;
    ui.view = match get("view") {
        Some("mias") => View::Mias,
        Some("dia" | "semana" | "mes") => View::Calendario,
        Some("eventos") => View::Eventos,
        Some("serie") => View::Serie,
        _ => View::Proximas,
    };
    ui.span = match get("view") {
        Some("dia") => Span::Dia,
        Some("mes") => Span::Mes,
        _ => Span::Semana,
    };
    ui.prev = View::Proximas;
    ui.week = get("week").and_then(|w| w.parse().ok()).unwrap_or(0);
    ui.day = get("day").and_then(|d| d.parse().ok());
    ui.filter.only_favs = get("only") == Some("fav");
    ui.full = get("full").is_some();
    ui.serie = get("serie")
        .map(str::to_owned)
        .or_else(|| (ui.view == View::Serie).then(|| "beginner-lmgt3-fixed".to_owned()));
    ui.ficha = get("ficha").map(|id| Ficha {
        id: id.to_owned(),
        at: get("slot").and_then(|s| s.parse::<DateTime<Utc>>().ok()),
    });
    ui.modal = match get("modal") {
        Some("avisos") => Some(Modal::Avisos),
        Some("ics") => Some(Modal::Ics),
        _ => None,
    };
    Ok(())
}
