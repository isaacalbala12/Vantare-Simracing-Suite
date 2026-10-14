//! Tiempo observado con reloj del llamador; no recoge actividad anterior al permiso.
use std::time::Duration;

#[derive(Default)]
pub struct Activity {
    previous: Option<Duration>,
}

impl Activity {
    /// Intervalos de hasta dos segundos: una suspensión o un heartbeat perdido
    /// no se convierte en tiempo de uso. El llamador agrega antes de emitir.
    pub fn observe(&mut self, now: Duration, allowed: bool) -> Duration {
        let previous = self.previous.replace(now);
        if !allowed {
            self.previous = None;
            return Duration::ZERO;
        }
        previous
            .and_then(|previous| now.checked_sub(previous))
            .filter(|elapsed| *elapsed <= Duration::from_secs(2))
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn consent_and_resume_start_new_intervals_without_backfill() {
        let mut activity = Activity::default();
        for seconds in [0, 1, 2] {
            assert_eq!(
                activity.observe(Duration::from_secs(seconds), false),
                Duration::ZERO
            );
        }
        assert_eq!(
            activity.observe(Duration::from_secs(3), true),
            Duration::ZERO
        );
        assert_eq!(
            activity.observe(Duration::from_secs(4), true),
            Duration::from_secs(1)
        );
        assert_eq!(
            activity.observe(Duration::from_secs(100), true),
            Duration::ZERO
        );
        assert_eq!(
            activity.observe(Duration::from_secs(101), false),
            Duration::ZERO
        );
        assert_eq!(
            activity.observe(Duration::from_secs(102), true),
            Duration::ZERO
        );
        assert_eq!(
            activity.observe(Duration::from_secs(103), true),
            Duration::from_secs(1)
        );
        assert_eq!(
            activity.observe(Duration::from_secs(99), true),
            Duration::ZERO
        );
    }
}
