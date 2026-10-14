//! Persistencia, respaldo, caducidad y rotación de semanas del calendario.
use super::*;
use std::path::PathBuf;

const OFFICIAL: &str = include_str!("../../reference/fixtures/calendar-lmu-2026-10-06.json");
const BACKUP: &str = include_str!("../../reference/fixtures/calendar-racecontrol-fallback.json");

fn at(value: &str) -> DateTime<Utc> {
    value.parse().expect("fecha de prueba")
}

fn now() -> DateTime<Utc> {
    at("2026-10-08T17:47:13Z")
}

fn dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("vantare-cal-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("directorio de prueba");
    dir
}

fn calendar(name: &str) -> (Calendar, PathBuf) {
    let dir = dir(name);
    let mut calendar = Calendar::load(&dir).expect("carga");
    calendar.rebuild(now());
    (calendar, dir)
}

/// La semana siguiente: mismas series, fechas movidas siete días.
fn next_week() -> String {
    let mut value: serde_json::Value = serde_json::from_str(OFFICIAL).expect("json");
    value["validFrom"] = "2026-10-13T00:00:00Z".into();
    value["validUntil"] = "2026-10-20T00:00:00Z".into();
    serde_json::to_string(&value).expect("json")
}

#[test]
fn official_publication_is_saved_and_reloaded_after_restart() {
    let (mut calendar, dir) = calendar("persist");
    calendar
        .apply_publication(Some(OFFICIAL), None, now())
        .expect("publica");
    assert_eq!(calendar.health(), Health::Ok);
    assert_eq!(calendar.schedule().map(|s| s.series.len()), Some(11));
    assert_eq!(calendar.stamps.updated, now().timestamp());

    let mut reopened = Calendar::load(&dir).expect("recarga");
    reopened.rebuild(now());
    assert_eq!(reopened.schedule().map(|s| s.series.len()), Some(11));
    assert_eq!(reopened.stamps.checked, now().timestamp());
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn invalid_publication_never_replaces_the_last_valid_one() {
    let (mut calendar, dir) = calendar("invalid");
    calendar
        .apply_publication(Some(OFFICIAL), None, now())
        .expect("publica");
    assert!(
        calendar
            .apply_publication(Some("{\"version\":2}"), None, now())
            .is_err()
    );
    assert_eq!(calendar.schedule().map(|s| s.series.len()), Some(11));
    let mut reopened = Calendar::load(&dir).expect("recarga");
    reopened.rebuild(now());
    assert_eq!(reopened.schedule().map(|s| s.series.len()), Some(11));
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn backup_fills_only_what_the_official_schedule_lacks_and_is_marked() {
    let (mut calendar, dir) = calendar("backup");
    // Oficial sin Prototype Fixed ni WEC-Xperience; el respaldo trae las dos y una extra.
    let mut value: serde_json::Value = serde_json::from_str(OFFICIAL).expect("json");
    value["series"].as_array_mut().expect("series").retain(|s| {
        !matches!(
            s["name"].as_str(),
            Some("Prototype Fixed" | "WEC-Xperience")
        )
    });
    let incomplete = serde_json::to_string(&value).expect("json");
    calendar
        .apply_publication(Some(&incomplete), Some(BACKUP), now())
        .expect("publica");

    assert_eq!(calendar.health(), Health::Fallback);
    let schedule = calendar.schedule().expect("horario");
    assert_eq!(schedule.series.len(), 9 + 3);
    assert_eq!(calendar.fallback_count(), 3);
    assert!(
        schedule
            .by_id("intermediate-prototype-fixed")
            .is_some_and(Series::is_fallback)
    );
    assert!(
        schedule
            .by_id("beginner-lmgt3-fixed")
            .is_some_and(|s| !s.is_fallback())
    );

    // Cuando el oficial ya trae la serie, gana el oficial y desaparece la etiqueta.
    calendar
        .apply_publication(Some(OFFICIAL), Some(BACKUP), now())
        .expect("publica");
    let schedule = calendar.schedule().expect("horario");
    assert!(
        schedule
            .by_id("intermediate-prototype-fixed")
            .is_some_and(|s| !s.is_fallback())
    );
    assert_eq!(
        calendar.fallback_count(),
        1,
        "solo queda la serie que el oficial no lista"
    );
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn backup_alone_keeps_the_calendar_alive_when_official_is_missing() {
    let (mut calendar, dir) = calendar("backup-alone");
    calendar
        .apply_publication(None, Some(BACKUP), now())
        .expect("respaldo");
    assert_eq!(calendar.health(), Health::Fallback);
    assert_eq!(calendar.schedule().map(|s| s.series.len()), Some(3));
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn week_ends_and_the_previous_one_stays_read_only() {
    let (mut calendar, dir) = calendar("expired");
    calendar
        .apply_publication(Some(OFFICIAL), None, now())
        .expect("publica");
    calendar.rebuild(at("2026-10-13T08:12:40Z"));
    assert_eq!(calendar.health(), Health::Expired);
    assert!(calendar.schedule().is_none());
    assert!(calendar.last_week.is_some());
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn new_week_rotates_the_previous_one_and_the_history() {
    let (mut calendar, dir) = calendar("rotate");
    calendar
        .apply_publication(Some(OFFICIAL), None, now())
        .expect("publica");
    let later = at("2026-10-13T09:30:00Z");
    calendar
        .apply_publication(Some(&next_week()), None, later)
        .expect("semana nueva");
    assert_eq!(calendar.health(), Health::Ok);
    let (from, _) = calendar
        .schedule()
        .expect("horario")
        .window()
        .expect("ventana");
    assert_eq!(from, at("2026-10-13T00:00:00Z"));
    assert!(
        calendar.previous.is_some(),
        "la semana anterior queda en solo lectura"
    );
    assert_eq!(calendar.history.rotation("beginner-lmgt3-fixed").len(), 2);
    // Una publicación más antigua no pisa la nueva.
    calendar
        .apply_publication(Some(OFFICIAL), None, later)
        .expect("ignorada");
    let (from, _) = calendar
        .schedule()
        .expect("horario")
        .window()
        .expect("ventana");
    assert_eq!(from, at("2026-10-13T00:00:00Z"));
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn polling_is_every_15_minutes_and_5_on_monday_mornings() {
    assert_eq!(
        Calendar::poll_interval(at("2026-10-13T20:00:00Z")),
        Duration::minutes(15)
    );
    assert_eq!(
        Calendar::poll_interval(at("2026-10-12T08:00:00Z")),
        Duration::minutes(5)
    );
}

#[test]
fn automatic_launch_is_off_by_default_and_persists_when_enabled() {
    let (mut calendar, dir) = calendar("autolaunch");
    assert!(!calendar.alerts.auto_launch);
    calendar
        .edit_alerts(|alerts| {
            alerts.auto_launch = true;
            Ok(())
        })
        .expect("guarda");
    let reopened = Calendar::load(&dir).expect("recarga");
    assert!(reopened.alerts.auto_launch);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn following_a_series_is_saved_and_toggles() {
    let (mut calendar, dir) = calendar("follow");
    calendar
        .follow("beginner-lmgt3-fixed".into())
        .expect("sigue");
    assert_eq!(
        Calendar::load(&dir).expect("recarga").favorites(),
        ["beginner-lmgt3-fixed"]
    );
    calendar
        .follow("beginner-lmgt3-fixed".into())
        .expect("deja de seguir");
    assert!(
        Calendar::load(&dir)
            .expect("recarga")
            .favorites()
            .is_empty()
    );
    let _ = std::fs::remove_dir_all(dir);
}
