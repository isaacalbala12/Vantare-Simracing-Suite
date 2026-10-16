//! Adaptador mínimo para #1640: solo las salidas marcadas del horario vigente.
use super::{Calendar, Utc};
use chrono::{DateTime, Duration};
use vantare_ipc::session_alerts::{Event, Feed};
impl Calendar {
    pub(crate) fn alert_feed(&self, now: DateTime<Utc>) -> Result<Feed, String> {
        let updated_at_ms = u64::try_from(now.timestamp_millis()).map_err(|_| "reloj inválido")?;
        let mut events = vec![];
        // Las escenas Studio/demo y la agenda de prueba no envían avisos de producto.
        if self.demo_now.is_none()
            && self.test_session.is_none()
            && self.schedule.is_current(now)?
        {
            for series in self
                .schedule
                .series
                .iter()
                .filter(|s| self.following.reminder_ids.contains(&s.id))
            {
                for at in self.schedule.starts(
                    series,
                    now - Duration::seconds(2),
                    now + Duration::minutes(61),
                )? {
                    events.push(Event {
                        id: format!("{}:{}", series.id, at.timestamp()),
                        label: format!("{} · {}", series.name, series.track),
                        starts_at_ms: u64::try_from(at.timestamp_millis())
                            .map_err(|_| "salida inválida")?,
                    });
                }
            }
        }
        events.sort_by_key(|e| e.starts_at_ms);
        if events.len() > 256 {
            return Err("más de 256 avisos de calendario".into());
        }
        Ok(Feed {
            version: 1,
            updated_at_ms,
            events,
        })
    }
    pub fn alert_path(layout: &std::path::Path) -> std::path::PathBuf {
        vantare_ipc::session_alerts::calendar_path(layout)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_marked_series_from_current_schedule_reach_overlay_feed() {
        let dir = std::env::temp_dir().join(format!("vantare-alerts-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temporal");
        let mut calendar = Calendar::load(&dir).expect("calendario");
        let now = super::super::timestamp("2026-08-26T16:00:00Z").expect("hora del horario");
        assert!(calendar.alert_feed(now).expect("vacío").events.is_empty());
        let id = calendar.schedule.series[0].id.clone();
        calendar.following.reminder_ids.push(id.clone());
        let feed = calendar.alert_feed(now).expect("marcadas");
        assert!(!feed.events.is_empty());
        assert!(
            feed.events
                .iter()
                .all(|e| e.id.starts_with(&format!("{id}:")))
        );
        assert!(
            calendar
                .alert_feed(now + Duration::days(3650))
                .expect("fuera de vigencia")
                .events
                .is_empty()
        );
        std::fs::remove_dir(&dir).expect("limpiar propio");
    }
}
