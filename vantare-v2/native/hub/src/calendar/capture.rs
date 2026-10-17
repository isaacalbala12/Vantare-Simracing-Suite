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
    history::Run,
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
    let spec = demo
        .capture_parameters
        .get("calendar")
        .cloned()
        .or_else(|| std::env::var("VANTARE_CAPTURE_CALENDAR").ok());
    let Some(spec) = spec else {
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
        // Desfases ilustrativos del contrato visual (minuto de salida en el intervalo).
        for (id, minute) in [
            ("beginner-lmp3-fixed", 5),
            ("beginner-logitech-mclaren-g-challenge-q1", 10),
            ("intermediate-lmgt3-sprint", 10),
            ("intermediate-elms-sprint", 15),
            ("advanced-one-stint-sprint", 5),
            ("advanced-elms-super-60", 25),
            ("advanced-wec-xperience", 15),
        ] {
            for series in value["series"].as_array_mut().into_iter().flatten() {
                if series["id"] == id {
                    series["startOffsetMinute"] = minute.into();
                }
            }
        }
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
        // La semana anterior que LMU ya publicó y el Hub guardó: sin el especial,
        // con el WEC Weekly en Spa.
        let mut previous = value.clone();
        previous["validFrom"] = "2026-09-29T00:00:00Z".into();
        previous["validUntil"] = "2026-10-06T00:00:00Z".into();
        if let Some(list) = previous["series"].as_array_mut() {
            list.retain(|series| series["id"] != "weekly-10-hours-of-road-atlanta");
            for series in list.iter_mut() {
                if series["id"] == "weekly-wec-weekly" {
                    series["track"] = "Spa-Francorchamps (WEC)".into();
                }
            }
        }
        calendar.previous = Some(Schedule::parse(
            &serde_json::to_vec(&previous).map_err(|e| e.to_string())?,
        )?);
    }
    calendar.refreshing = state == "loading";
    calendar.refresh_failed = state == "offline";
    calendar.stamps.checked = at(2026, 10, 8, 6, 2, 0).timestamp();
    calendar.stamps.updated = calendar.stamps.checked;
    if state == "expired" {
        // El lunes 12 a las 08:01 se publicó la semana que acaba de terminar.
        calendar.stamps.updated = at(2026, 10, 12, 6, 1, 0).timestamp();
        calendar.stamps.checked = (now - chrono::Duration::minutes(3)).timestamp();
    }

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
        // Las cuatro carreras del contrato visual («Ya corriste esta semana») y
        // las de la semana anterior, que solo cuentan en el Mes.
        calendar.runs = [
            (at(2026, 10, 7, 19, 15, 0), 4, 6, Some("2:01.384")),
            (at(2026, 10, 7, 18, 45, 0), 9, -2, None),
            (at(2026, 10, 7, 18, 0, 0), 6, 9, None),
            (at(2026, 10, 6, 20, 30, 0), 11, 7, None),
            (at(2026, 9, 30, 18, 0, 0), 8, 3, None),
            (at(2026, 9, 30, 19, 0, 0), 5, 4, None),
            (at(2026, 10, 1, 18, 0, 0), 7, 1, None),
            (at(2026, 10, 1, 18, 30, 0), 3, 5, None),
            (at(2026, 10, 1, 19, 0, 0), 9, -1, None),
            (at(2026, 10, 3, 18, 0, 0), 6, 2, None),
        ]
        .into_iter()
        .map(|(when, position, safety_tenths, lap)| Run {
            series_id: "beginner-lmgt3-fixed".into(),
            circuit: "Sebring".into(),
            at: when,
            position,
            safety_tenths,
            best_lap: lap.map(str::to_owned),
        })
        .collect();
    }
    if state != "nosched" && state != "loading" {
        // Las dos semanas anteriores que el contrato visual enseña «desde tu caché».
        calendar.history.seed_week(
            at(2026, 9, 22, 0, 0, 0),
            &[("beginner-lmgt3-fixed", "LMGT3 Fixed", "Imola")],
        );
        calendar.history.seed_week(
            at(2026, 9, 29, 0, 0, 0),
            &[
                ("beginner-lmgt3-fixed", "LMGT3 Fixed", "Spa-Francorchamps"),
                ("weekly-wec-weekly", "WEC Weekly", "Spa-Francorchamps"),
            ],
        );
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calendar_capture_batch_parameters_apply_per_entry() {
        let root =
            std::env::temp_dir().join(format!("vantare-calendar-batch-{}", std::process::id()));
        std::fs::create_dir_all(&root).expect("directorio QA");
        let manifest = root.join("batch.json");
        std::fs::write(&manifest, serde_json::to_vec(&serde_json::json!([
            {"scene": "calendario-r6-mes", "output": root.join("month.png"),
             "parameters": {"calendar": "state=nofav;view=mes;utc=1"}},
            {"scene": "calendario-r6-serie", "output": root.join("series.png"),
             "parameters": {"calendar": "state=ok;view=serie;serie=beginner-lmgt3-fixed;full=1"}}
        ])).expect("JSON")).expect("manifiesto");
        let requests = vantare_ui::capture_batch::read(&manifest).expect("lote");
        let demos = requests
            .into_iter()
            .map(|request| {
                let mut state = crate::demo::CaptureState::parse(&request.scene).expect("escena");
                state.parameters = request.parameters;
                let mut demo = DemoData::load().expect("demo");
                demo.apply_capture(&state).expect("datos de escena");
                demo
            })
            .collect::<Vec<_>>();
        // Exactly the equality used by capture_can_reuse_calendar: skipped QA
        // fields differ, so the replacement calendar must consume this entry.
        assert_eq!(
            serde_json::to_vec(&demos[0]).expect("demo1"),
            serde_json::to_vec(&demos[1]).expect("demo2")
        );
        let demo = &demos[0];
        let month = Calendar::load_demo(&root, demo).expect("primera entrada");
        assert_eq!(month.ui.view, View::Calendario);
        assert_eq!(month.ui.span, Span::Mes);
        assert!(month.prefs.utc);
        assert!(month.following.series_ids.is_empty());

        let demo = &demos[1];
        let series = Calendar::load_demo(&root, demo).expect("segunda entrada");
        assert_eq!(series.ui.view, View::Serie);
        assert!(series.ui.full);
        assert!(!series.prefs.utc);
        assert_eq!(series.ui.serie.as_deref(), Some("beginner-lmgt3-fixed"));
        std::fs::remove_dir_all(root).expect("limpiar QA");
    }
}
