//! Agenda efímera del overlay, separada de las preferencias privadas del calendario.
use super::{Calendar, alerts::Cause};
use chrono::{DateTime, Duration, Utc};
use vantare_ipc::session_alerts::{Event, Feed};

impl Calendar {
    pub(crate) fn alert_feed(&self, now: DateTime<Utc>) -> Result<Feed, String> {
        let mut feed = Feed {
            version: 1,
            updated_at_ms: u64::try_from(now.timestamp_millis()).map_err(|_| "reloj inválido")?,
            events: vec![],
        };
        // Capturas/demo, el canal apagado y la semana caducada no publican carreras.
        let Some(schedule) = self
            .current
            .as_ref()
            .filter(|_| self.demo_now.is_none() && self.alerts.channels.in_track)
        else {
            return Ok(feed);
        };
        if !schedule.is_current(now)? {
            return Ok(feed);
        }
        for series in &schedule.series {
            for at in schedule.starts(
                series,
                now - Duration::seconds(2),
                now + Duration::minutes(61),
            )? {
                match self.alerts.cause(schedule, series, at) {
                    // Igual que el calendario: una franja se calla si ya estás en pista.
                    Some(Cause::Band) if self.in_track => continue,
                    Some(_) => {}
                    None => continue,
                }
                feed.events.push(Event {
                    id: format!("{}:{}", series.id, at.timestamp()),
                    label: format!("{} · {}", series.name, series.track),
                    starts_at_ms: u64::try_from(at.timestamp_millis())
                        .map_err(|_| "salida inválida")?,
                });
            }
        }
        feed.events.sort_by_key(|e| e.starts_at_ms);
        if feed.events.len() > 256 {
            return Err("más de 256 avisos de calendario".into());
        }
        Ok(feed)
    }

    pub fn alert_path(layout: &std::path::Path) -> std::path::PathBuf {
        vantare_ipc::session_alerts::calendar_path(layout)
    }

    /// Cambios inmediatos; sin cambios, heartbeat cada 5 s para conservar el TTL de 10 s.
    /// El reloj viene en `Feed`, igual que en `alert_feed`; no hay esperas en los tests.
    pub(crate) fn publish_alert_feed(
        layout: &std::path::Path,
        feed: &Feed,
    ) -> Result<bool, String> {
        let path = Self::alert_path(layout);
        let old = match std::fs::metadata(&path) {
            Ok(_) => Some(crate::files::read(&path, 65536)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(error.to_string()),
        };
        if let Some(previous) = old
            .as_deref()
            .and_then(|bytes| serde_json::from_slice::<Feed>(bytes).ok())
            && previous.version == feed.version
            && previous.events == feed.events
            && feed
                .updated_at_ms
                .checked_sub(previous.updated_at_ms)
                .is_some_and(|elapsed| elapsed < 5000)
        {
            return Ok(false);
        }
        let bytes = serde_json::to_vec(feed).map_err(|error| error.to_string())?;
        crate::files::save(&path, &bytes, old.as_deref())?;
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn qa() -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!(
            "vantare-1869-feed-{}",
            vantare_services::random_id().expect("QA id")
        ));
        std::fs::create_dir_all(&root).expect("QA root");
        root
    }

    fn feed(now: u64) -> Feed {
        Feed {
            version: 1,
            updated_at_ms: now,
            events: vec![Event {
                id: "qa:race".into(),
                label: "QA Spa".into(),
                starts_at_ms: 1_000_000,
            }],
        }
    }

    fn saved(layout: &std::path::Path) -> Feed {
        serde_json::from_slice(&std::fs::read(Calendar::alert_path(layout)).expect("saved bytes"))
            .expect("saved feed")
    }

    #[test]
    fn ten_identical_publications_write_once_and_never_touch_alert_preferences() {
        let root = qa();
        let layout = root.join("layout.json");
        let mut calendar = Calendar::load(&root).expect("QA calendar");
        calendar
            .save_alerts(super::super::alerts::Alerts::default())
            .expect("real preferences fixture");
        let preferences =
            std::fs::read(root.join("calendar-alerts.json")).expect("private preferences");
        let feed = feed(10_000);
        assert!(Calendar::publish_alert_feed(&layout, &feed).expect("first publication"));
        let path = Calendar::alert_path(&layout);
        assert_eq!(
            path.file_name().and_then(|name| name.to_str()),
            Some("session-alerts-feed.json")
        );
        // Un save adicional intentaría adquirir este lock y fallaría: prueba la ausencia de E/S de guardado.
        let guard = std::fs::OpenOptions::new()
            .write(true)
            .open(path.with_file_name("session-alerts-feed.json.lock"))
            .expect("writer lock");
        guard.try_lock().expect("hold writer lock");
        let mut writes = 1;
        for _ in 1..10 {
            writes += usize::from(Calendar::publish_alert_feed(&layout, &feed).expect("unchanged"));
        }
        assert_eq!(writes, 1);
        assert_eq!(saved(&layout), feed);
        assert_eq!(
            std::fs::read(root.join("calendar-alerts.json")).expect("private bytes"),
            preferences
        );
        drop(guard);
        std::fs::remove_dir_all(root).expect("QA cleanup");
    }

    #[test]
    fn five_second_heartbeat_keeps_feed_current_and_expires_after_the_publisher_stops() {
        let root = qa();
        let layout = root.join("layout.json");
        let mut writes = 0;
        for second in 0..10 {
            let now = 10_000 + second * 1000;
            writes +=
                usize::from(Calendar::publish_alert_feed(&layout, &feed(now)).expect("heartbeat"));
            assert_eq!(saved(&layout).current(now).len(), 1, "second {second}");
        }
        assert_eq!(writes, 2, "10 ticks now need 2 writes instead of 10");
        for second in 10..=35 {
            let now = 10_000 + second * 1000;
            Calendar::publish_alert_feed(&layout, &feed(now)).expect("injected clock");
            assert_eq!(saved(&layout).current(now).len(), 1);
        }
        let last = saved(&layout);
        assert_eq!(last.updated_at_ms, 45_000);
        assert_eq!(last.current(55_000).len(), 1);
        assert!(last.current(55_001).is_empty(), "original 10 s TTL");
        std::fs::remove_dir_all(root).expect("QA cleanup");
    }

    #[test]
    fn event_changes_clock_rollback_and_restarts_publish_immediately() {
        let root = qa();
        let layout = root.join("layout.json");
        Calendar::publish_alert_feed(&layout, &feed(10_000)).expect("first");
        // No estado en memoria del publicador: otro Hub ve los bytes publicados.
        assert!(!Calendar::publish_alert_feed(&layout, &feed(11_000)).expect("restart"));
        let mut changed = feed(11_001);
        changed.events[0].label = "QA Monza".into();
        assert!(Calendar::publish_alert_feed(&layout, &changed).expect("changed event"));
        assert_eq!(saved(&layout), changed);
        changed.updated_at_ms = 9000;
        assert!(Calendar::publish_alert_feed(&layout, &changed).expect("clock rollback"));
        changed.updated_at_ms = 9001;
        changed.events.clear();
        assert!(Calendar::publish_alert_feed(&layout, &changed).expect("disabled alerts"));
        assert!(saved(&layout).events.is_empty());
        std::fs::remove_dir_all(root).expect("QA cleanup");
    }

    #[test]
    fn beta_feed_changes_bytes_every_second_without_event_changes() {
        let root = std::env::temp_dir().join(format!(
            "vantare-1869-feed-{}",
            vantare_services::random_id().expect("QA id")
        ));
        std::fs::create_dir_all(&root).expect("QA root");
        let calendar = Calendar::load(&root).expect("QA calendar");
        let now = "2026-11-02T12:00:00Z"
            .parse::<DateTime<Utc>>()
            .expect("clock");
        let first = calendar.alert_feed(now).expect("feed");
        let second = calendar
            .alert_feed(now + Duration::seconds(1))
            .expect("feed");
        assert_eq!(first.events, second.events);
        assert_ne!(
            serde_json::to_vec(&first).expect("first wire feed"),
            serde_json::to_vec(&second).expect("second wire feed")
        );
        std::fs::remove_dir_all(root).expect("QA cleanup");
    }

    #[test]
    fn colocated_feed_has_its_own_name_beside_private_alert_preferences() {
        let root = std::path::Path::new("C:/qa/1869/hub");
        // --data-dir=<root>, --layout=<root>/layout.json (README de desarrollo).
        assert_ne!(
            Calendar::alert_path(&root.join("layout.json")),
            root.join("calendar-alerts.json")
        );
    }
}
