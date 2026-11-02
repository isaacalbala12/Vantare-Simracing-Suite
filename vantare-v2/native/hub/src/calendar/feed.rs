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
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn colocated_feed_collides_with_private_alert_preferences() {
        let root = std::path::Path::new("C:/qa/1869/hub");
        // --data-dir=<root>, --layout=<root>/layout.json (README de desarrollo).
        assert_eq!(
            Calendar::alert_path(&root.join("layout.json")),
            root.join("calendar-alerts.json")
        );
    }
}
