//! Respaldo del horario: las carreras diarias de la portada de `RaceControl`.
//!
//! Solo se usa cuando el horario oficial falta o llega incompleto. La portada
//! lista las próximas salidas de cada serie diaria (horas en UTC); de ahí se
//! deduce el intervalo y el desfase y se devuelve el mismo contrato JSON que el
//! horario oficial, con `source: "racecontrol"`. Los eventos semanales y
//! especiales no se pueden deducir de la portada y no entran.
use crate::{Error, Result, http::Http};
use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Utc};
use serde_json::{Value, json};
use url::Url;

/// La portada ronda los 135 KiB; el tope deja margen sin aceptar páginas absurdas.
const PAGE_LIMIT: u64 = 512 * 1024;
/// Práctica (3) y clasificación (8), estimadas igual que en el horario oficial.
const LEAD_IN_MIN: u32 = 11;

pub fn fetch(http: &Http, url: &Url, now: DateTime<Utc>) -> Result<Option<String>> {
    let page = http.get_page(url, PAGE_LIMIT)?.success()?;
    let html = String::from_utf8(page.body).map_err(|_| Error::Protocol)?;
    schedule(&html, now)
}

struct Card {
    tier: String,
    name: String,
    track: String,
    minutes: u32,
    times: Vec<DateTime<Utc>>,
}

/// Contrato de horario con las series diarias de la portada; `None` si no hay.
pub(crate) fn schedule(html: &str, now: DateTime<Utc>) -> Result<Option<String>> {
    let (from, until) = week(now);
    let mut series: Vec<Value> = vec![];
    for card in html
        .split("scheduled-race-card")
        .skip(1)
        .filter_map(|c| card(c, now))
    {
        let Some(row) = series_json(&card) else {
            continue;
        };
        if series.iter().all(|known| known["id"] != row["id"]) {
            series.push(row);
        }
    }
    if series.is_empty() {
        return Ok(None);
    }
    let document = json!({
        "version": 1,
        "timezone": "UTC",
        "validFrom": from.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        "validUntil": until.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        "updated": now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        "sourceNotes": ["RaceControl (respaldo)"],
        "series": series,
    });
    serde_json::to_string(&document)
        .map(Some)
        .map_err(|_| Error::Protocol)
}

/// Semana LMU (martes 00:00 UTC a martes) que contiene `now`.
fn week(now: DateTime<Utc>) -> (DateTime<Utc>, DateTime<Utc>) {
    let since_tuesday = i64::from((now.weekday().num_days_from_monday() + 6) % 7);
    let day = now.date_naive() - Duration::days(since_tuesday);
    let from = Utc.from_utc_datetime(&day.and_hms_opt(0, 0, 0).unwrap_or_default());
    (from, from + Duration::days(7))
}

fn series_json(card: &Card) -> Option<Value> {
    let first = *card.times.first()?;
    let interval = (*card.times.get(1)? - first).num_minutes();
    // Solo patrones regulares: una serie con horas sueltas no se puede deducir.
    if !(5..=1440).contains(&interval)
        || card
            .times
            .windows(2)
            .any(|pair| (pair[1] - pair[0]).num_minutes() != interval)
    {
        return None;
    }
    let base = NaiveDate::from_ymd_opt(1, 1, 1)?
        .and_hms_opt(0, 0, 0)?
        .and_utc();
    let offset = (first - base).num_minutes().rem_euclid(interval);
    let race = card.minutes.saturating_sub(LEAD_IN_MIN).max(1);
    let license = match card.tier.as_str() {
        "beginner" => "Bronze SR",
        "intermediate" => "Silver SR",
        "advanced" => "Gold SR",
        _ => "",
    };
    Some(json!({
        "id": slug(&format!("{} {}", card.tier, card.name)),
        "name": card.name,
        "tier": card.tier,
        "eventKind": "daily",
        "format": "solo",
        "licenseLabel": license,
        "track": card.track,
        "vehicleClass": "",
        "classes": [],
        "raceDurationMin": race,
        "eventDurationMin": card.minutes,
        "sessions": [
            {"name": "practice", "durationMin": 3, "estimated": true},
            {"name": "qualifying", "durationMin": 8, "estimated": true},
            {"name": "race", "durationMin": race, "estimated": true},
        ],
        "source": "racecontrol",
        "startOffsetMinute": offset,
        "recurrence": {"kind": "interval", "intervalMinutes": interval},
    }))
}

fn card(chunk: &str, now: DateTime<Utc>) -> Option<Card> {
    let tier = text(between(chunk, "tier-badge\">", "</span>")?).to_lowercase();
    let name = decode(&text(between(chunk, "<h4", "</h4>")?.split_once('>')?.1));
    let minutes = duration(&value_after(chunk, "Duration")?)?;
    let track = decode(&value_after(chunk, "Track")?);
    let marker = "bg-gray-900-40\">";
    let mut times: Vec<DateTime<Utc>> = chunk
        .match_indices(marker)
        .filter_map(|(at, _)| {
            let rest = &chunk[at + marker.len()..];
            moment(rest.split("</span>").next()?, now)
        })
        .collect();
    times.sort_unstable();
    times.dedup();
    (!name.is_empty() && !track.is_empty() && !tier.is_empty()).then_some(Card {
        tier,
        name,
        track,
        minutes,
        times,
    })
}

fn between<'a>(text: &'a str, start: &str, end: &str) -> Option<&'a str> {
    let from = text.find(start)? + start.len();
    let len = text[from..].find(end)?;
    Some(&text[from..from + len])
}

/// Valor de una fila «etiqueta ... valor»: el siguiente `fw-semibold` tras la etiqueta.
fn value_after(chunk: &str, label: &str) -> Option<String> {
    let rest = &chunk[chunk.find(label)? + label.len()..];
    Some(text(between(rest, "fw-semibold\">", "</span>")?))
}

/// Texto sin etiquetas ni espacios sobrantes.
fn text(html: &str) -> String {
    let mut out = String::new();
    let mut tag = false;
    for c in html.chars() {
        match c {
            '<' => tag = true,
            '>' => tag = false,
            _ if !tag => out.push(c),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn decode(text: &str) -> String {
    text.replace("&amp;", "&")
        .replace("&#39;", "'")
        .replace("&quot;", "\"")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

/// «44 minutes», «1h 13 minutes» o «2 hours».
fn duration(text: &str) -> Option<u32> {
    let lower = text.to_lowercase();
    let mut total = 0;
    let mut number: Option<u32> = None;
    for token in lower.split_whitespace() {
        if let Ok(n) = token.parse::<u32>() {
            number = Some(n);
        } else if let Some(hours) = token.strip_suffix('h').and_then(|n| n.parse::<u32>().ok()) {
            total += hours * 60;
        } else if let Some(n) = number.take() {
            total += if token.starts_with('h') { n * 60 } else { n };
        }
    }
    (total > 0).then_some(total)
}

/// «14 Oct at 8:00pm» en UTC; el año es el que deja la fecha más cerca de `now`.
fn moment(text: &str, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
    const MONTHS: [&str; 12] = [
        "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
    ];
    let words: Vec<&str> = text.split_whitespace().collect();
    let [day, month, _, clock] = words[..] else {
        return None;
    };
    let day: u32 = day.parse().ok()?;
    let month = month.to_lowercase();
    let month = u32::try_from(MONTHS.iter().position(|m| month.starts_with(m))? + 1).ok()?;
    let clock = clock.to_lowercase();
    let (digits, pm) = match clock.strip_suffix("pm") {
        Some(digits) => (digits, true),
        None => (clock.strip_suffix("am")?, false),
    };
    let (hour, minute) = digits.split_once(':')?;
    let hour = hour.parse::<u32>().ok()? % 12 + if pm { 12 } else { 0 };
    let minute = minute.parse::<u32>().ok()?;
    [now.year() - 1, now.year(), now.year() + 1]
        .into_iter()
        .filter_map(|year| NaiveDate::from_ymd_opt(year, month, day)?.and_hms_opt(hour, minute, 0))
        .map(|naive| Utc.from_utc_datetime(&naive))
        .min_by_key(|at| (*at - now).num_seconds().abs())
}

fn slug(text: &str) -> String {
    let mut out = String::new();
    for c in text.to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    out.trim_end_matches('-').to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    const PAGE: &str = include_str!("testdata/racecontrol-daily.html");

    fn now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, 14, 17, 55, 0)
            .single()
            .unwrap_or_default()
    }

    #[test]
    fn moments_parse_in_utc_and_pick_the_nearest_year() {
        let at = |text: &str, now: DateTime<Utc>| moment(text, now);
        assert_eq!(
            at("14 Oct at 8:00pm", now()),
            Utc.with_ymd_and_hms(2026, 10, 14, 20, 0, 0).single()
        );
        assert_eq!(
            at("14 Oct at 12:15am", now()),
            Utc.with_ymd_and_hms(2026, 10, 14, 0, 15, 0).single()
        );
        let december = Utc
            .with_ymd_and_hms(2026, 12, 31, 23, 0, 0)
            .single()
            .unwrap_or_default();
        assert_eq!(
            at("1 Jan at 1:00am", december),
            Utc.with_ymd_and_hms(2027, 1, 1, 1, 0, 0).single()
        );
        assert_eq!(at("nonsense", now()), None);
    }

    #[test]
    fn durations_accept_minutes_and_hours() {
        assert_eq!(duration("44 minutes"), Some(44));
        assert_eq!(duration("1H 13 MINUTES"), Some(73));
        assert_eq!(duration("2 hours"), Some(120));
        assert_eq!(duration("soon"), None);
    }

    #[test]
    fn page_becomes_the_daily_schedule_contract() {
        let json = schedule(PAGE, now()).expect("parse").expect("series");
        let value: Value = serde_json::from_str(&json).expect("json");
        assert_eq!(value["validFrom"], "2026-10-13T00:00:00Z");
        assert_eq!(value["validUntil"], "2026-10-20T00:00:00Z");
        let series = value["series"].as_array().expect("series");
        // La carta con una sola hora no permite deducir el intervalo.
        assert_eq!(series.len(), 3);
        let by = |name: &str| series.iter().find(|s| s["name"] == name).expect(name);
        let mclaren = by("Logitech McLaren G Challenge Winter - Q2");
        assert_eq!(
            mclaren["id"],
            "beginner-logitech-mclaren-g-challenge-winter-q2"
        );
        assert_eq!(mclaren["recurrence"]["intervalMinutes"], 45);
        assert_eq!(mclaren["eventDurationMin"], 30);
        assert_eq!(mclaren["raceDurationMin"], 19);
        assert_eq!(mclaren["source"], "racecontrol");
        assert_eq!(by("ELMS Super 60")["recurrence"]["intervalMinutes"], 90);
        assert_eq!(by("ELMS Super 60")["eventDurationMin"], 73);
        // 20:00 UTC debe caer en una salida del patrón deducido.
        let base = NaiveDate::from_ymd_opt(1, 1, 1)
            .and_then(|d| d.and_hms_opt(0, 0, 0))
            .expect("base")
            .and_utc();
        let at = Utc
            .with_ymd_and_hms(2026, 10, 14, 20, 0, 0)
            .single()
            .expect("hora");
        let offset = mclaren["startOffsetMinute"].as_i64().expect("offset");
        assert_eq!(((at - base).num_minutes() - offset).rem_euclid(45), 0);
    }

    /// El Hub prueba su fusión con este fixture: debe tener la forma que produce el parser.
    #[test]
    fn output_has_the_same_shape_as_the_hub_fixture() {
        let hub: Value = serde_json::from_str(include_str!(
            "../../hub/reference/fixtures/calendar-racecontrol-fallback.json"
        ))
        .expect("fixture del Hub");
        let ours: Value =
            serde_json::from_str(&schedule(PAGE, now()).expect("parse").expect("series"))
                .expect("json");
        let keys = |value: &Value| {
            let mut keys: Vec<_> = value.as_object().expect("objeto").keys().cloned().collect();
            keys.sort();
            keys
        };
        assert_eq!(keys(&hub), keys(&ours));
        assert_eq!(keys(&hub["series"][0]), keys(&ours["series"][0]));
        assert_eq!(
            keys(&hub["series"][0]["recurrence"]),
            keys(&ours["series"][0]["recurrence"])
        );
    }

    #[test]
    fn pages_without_cards_give_no_fallback() {
        assert_eq!(schedule("<html></html>", now()).expect("parse"), None);
    }

    #[test]
    fn irregular_series_are_left_out() {
        let t = |h: u32, m: u32| {
            Utc.with_ymd_and_hms(2026, 10, 14, h, m, 0)
                .single()
                .expect("hora")
        };
        let card = Card {
            tier: "beginner".into(),
            name: "Irregular".into(),
            track: "Monza".into(),
            minutes: 30,
            times: vec![t(18, 0), t(18, 45), t(19, 40)],
        };
        assert!(series_json(&card).is_none());
    }
}
