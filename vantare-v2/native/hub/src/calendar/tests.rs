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

#[test]
fn new_week_notice_is_on_by_default_and_old_files_keep_it() {
    assert!(Alerts::default().notify_week);
    let old: Alerts = serde_json::from_str(r#"{"leadMin":10}"#).expect("archivo antiguo");
    assert!(old.notify_week);
}

#[test]
fn an_unreadable_alerts_file_does_not_stop_the_hub_from_opening() {
    let dir = dir("bad-alerts");
    for garbage in [
        &b"no es json"[..],
        br#"{"leadMin":7}"#,
        br#"{"campoNuevo":1}"#,
    ] {
        std::fs::write(dir.join("calendar-alerts.json"), garbage).expect("escribe");
        let calendar = Calendar::load(&dir).expect("el Hub abre igualmente");
        assert_eq!(calendar.alerts, Alerts::default());
        assert!(
            calendar
                .error
                .as_deref()
                .is_some_and(|e| e.contains("avisos")),
            "se avisa de que se empieza sin avisos"
        );
    }
    // Un guardado posterior reemplaza el archivo dañado y vuelve a cargar bien.
    let mut calendar = Calendar::load(&dir).expect("carga");
    calendar
        .edit_alerts(|alerts| {
            alerts.auto_launch = true;
            Ok(())
        })
        .expect("guarda");
    assert!(Calendar::load(&dir).expect("recarga").alerts.auto_launch);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn the_missing_series_notice_follows_what_is_left_in_avisos() {
    let (mut calendar, dir) = calendar("orphans");
    calendar
        .apply_publication(Some(OFFICIAL), None, now())
        .expect("publica");
    let band = |id: &str| alerts::Band {
        series_id: id.into(),
        from: 20 * 60,
        to: 22 * 60,
        days: alerts::Days::All,
        mode: alerts::Mode::Each,
    };
    calendar
        .edit_alerts(|a| {
            a.set_band("serie-fantasma-1", Some(band("serie-fantasma-1")))?;
            a.set_band("serie-fantasma-2", Some(band("serie-fantasma-2")))
        })
        .expect("guarda");
    calendar.report_orphans();
    let notice = calendar.error.clone().expect("cartel");
    assert!(notice.contains("serie-fantasma-1") && notice.contains("serie-fantasma-2"));
    // Quitar una: el cartel sigue, pero solo con la que queda.
    calendar.update_alerts(|a| a.set_band("serie-fantasma-1", None));
    let notice = calendar.error.clone().expect("sigue el cartel");
    assert!(!notice.contains("serie-fantasma-1") && notice.contains("serie-fantasma-2"));
    // Quitar la última: el cartel desaparece.
    calendar.update_alerts(|a| a.set_band("serie-fantasma-2", None));
    assert_eq!(calendar.error, None);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn paint_caches_are_invalidated_by_every_change_of_data() {
    let (mut calendar, dir) = calendar("revision");
    let mut seen = vec![calendar.revision];
    calendar
        .apply_publication(Some(OFFICIAL), None, now())
        .expect("publica");
    seen.push(calendar.revision);
    calendar
        .edit_alerts(|alerts| {
            alerts.auto_launch = true;
            Ok(())
        })
        .expect("guarda");
    seen.push(calendar.revision);
    calendar.set_utc(true);
    seen.push(calendar.revision);
    calendar
        .follow("beginner-lmgt3-fixed".into())
        .expect("sigue");
    seen.push(calendar.revision);
    assert!(
        seen.windows(2).all(|pair| pair[0] < pair[1]),
        "cada cambio sube la revisión: {seen:?}"
    );
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn an_unreadable_following_file_degrades_and_a_copy_is_kept() {
    let dir = dir("bad-following");
    let file = dir.join("calendar-following.json");
    let bad: [&[u8]; 3] = [
        b"no es json",
        br#"{"seriesIds":["a","a"]}"#,
        br#"{"seriesIds":[" "]}"#,
    ];
    for (index, garbage) in bad.into_iter().enumerate() {
        std::fs::write(&file, garbage).expect("escribe");
        let mut calendar = Calendar::load(&dir).expect("el Hub abre igualmente");
        assert!(calendar.favorites().is_empty());
        let notice = calendar.error.clone().expect("se avisa");
        assert!(notice.contains("series seguidas") && notice.contains(".invalid"));
        // La copia conserva el contenido malo, sin pisar la anterior.
        let copies = std::fs::read_dir(&dir)
            .expect("lista")
            .filter_map(Result::ok)
            .filter(|e| e.file_name().to_string_lossy().contains(".invalid"))
            .count();
        assert!(copies >= 1, "ronda {index}");
        assert_eq!(
            std::fs::read(dir.join("calendar-following.json.invalid")).expect("copia"),
            bad[0]
        );
        // Seguir una serie reemplaza el archivo dañado y vuelve a cargar bien.
        calendar
            .follow("beginner-lmgt3-fixed".into())
            .expect("sigue");
        assert_eq!(
            Calendar::load(&dir).expect("recarga").favorites(),
            ["beginner-lmgt3-fixed"]
        );
    }
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn overlay_feed_uses_calendar_slots_channels_and_current_publication() {
    let (mut calendar, dir) = calendar("overlay-feed");
    calendar
        .apply_publication(Some(OFFICIAL), None, now())
        .expect("publica");
    assert!(
        calendar
            .alert_feed(now())
            .expect("sin avisos")
            .events
            .is_empty()
    );
    let start = at("2026-10-08T18:00:00Z");
    calendar
        .alerts
        .toggle_slot("weekly-wec-weekly", start)
        .expect("tanda");
    let feed = calendar.alert_feed(now()).expect("agenda");
    assert_eq!(feed.events.len(), 1);
    assert_eq!(
        feed.events[0].id,
        format!("weekly-wec-weekly:{}", start.timestamp())
    );
    assert_eq!(
        feed.events[0].starts_at_ms,
        u64::try_from(start.timestamp_millis()).expect("hora")
    );
    calendar.in_track = true;
    assert_eq!(
        calendar
            .alert_feed(now())
            .expect("tanda en pista")
            .events
            .len(),
        1
    );
    calendar.alerts.channels.windows = false;
    assert_eq!(
        calendar
            .alert_feed(now())
            .expect("canales independientes")
            .events
            .len(),
        1
    );
    calendar.alerts.channels.in_track = false;
    assert!(
        calendar
            .alert_feed(now())
            .expect("canal apagado")
            .events
            .is_empty()
    );
    calendar.alerts.channels.in_track = true;
    calendar.demo_now = Some(now());
    assert!(calendar.alert_feed(now()).expect("demo").events.is_empty());
    calendar.demo_now = None;
    assert!(
        calendar
            .alert_feed(now() + Duration::days(8))
            .expect("caducado")
            .events
            .is_empty()
    );
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn overlay_feed_obeys_bands_and_suppresses_them_in_track() {
    let (mut calendar, dir) = calendar("overlay-band");
    calendar
        .apply_publication(Some(OFFICIAL), None, now())
        .expect("publica");
    calendar
        .alerts
        .set_band(
            "beginner-lmgt3-fixed",
            Some(alerts::Band {
                series_id: "beginner-lmgt3-fixed".into(),
                from: 0,
                to: 1440,
                days: alerts::Days::All,
                mode: alerts::Mode::Each,
            }),
        )
        .expect("franja");
    assert!(
        !calendar
            .alert_feed(now())
            .expect("franja")
            .events
            .is_empty()
    );
    calendar.in_track = true;
    assert!(
        calendar
            .alert_feed(now())
            .expect("en pista")
            .events
            .is_empty()
    );
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn invalid_alert_preferences_are_copied_before_the_next_save() {
    let dir = dir("invalid-alert-copy");
    let original = b"avisos anteriores ilegibles";
    std::fs::write(dir.join("calendar-alerts.json"), original).expect("original");
    let mut calendar = Calendar::load(&dir).expect("abre degradado");
    assert_eq!(calendar.alerts, Alerts::default());
    assert_eq!(
        std::fs::read(dir.join("calendar-alerts.json.invalid")).expect("copia"),
        original
    );
    calendar
        .edit_alerts(|alerts| {
            alerts.auto_launch = true;
            Ok(())
        })
        .expect("guarda");
    assert_eq!(
        std::fs::read(dir.join("calendar-alerts.json.invalid")).expect("copia intacta"),
        original
    );
    assert!(Calendar::load(&dir).expect("recarga").alerts.auto_launch);
    let _ = std::fs::remove_dir_all(dir);
}
