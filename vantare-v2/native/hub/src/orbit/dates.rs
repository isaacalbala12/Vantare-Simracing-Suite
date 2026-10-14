//! Fechas de actividad en la zona de la sesión; reloj inyectable para QA.
use chrono::{DateTime, Datelike, FixedOffset};

pub fn activity_time(value: &str, now: DateTime<FixedOffset>) -> String {
    let Ok(parsed) = DateTime::parse_from_rfc3339(value) else {
        return "Fecha no disponible".into();
    };
    let date = parsed.with_timezone(now.offset());
    let age = now
        .date_naive()
        .signed_duration_since(date.date_naive())
        .num_days();
    let day = match age {
        0 => "Hoy".to_owned(),
        1 => "Ayer".to_owned(),
        2..=6 => ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
            [date.weekday().num_days_from_monday() as usize]
            .to_owned(),
        _ => date.format("%d/%m/%Y").to_string(),
    };
    format!("{day} {}", date.format("%H:%M"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn activity_uses_local_days_spanish_labels_and_explicit_missing_dates() {
        let now = DateTime::parse_from_rfc3339("2026-10-05T23:00:00+02:00").expect("reloj");
        for (value, expected) in [
            ("2026-10-05T18:02:00+02:00", "Hoy 18:02"),
            ("2026-10-04T21:40:00+02:00", "Ayer 21:40"),
            ("2026-10-03T22:10:00+02:00", "sáb 22:10"),
            ("2026-10-04T23:30:00Z", "Hoy 01:30"),
            ("2026-09-27T18:00:00+02:00", "27/09/2026 18:00"),
            ("2026-10-06T12:00:00+02:00", "06/10/2026 12:00"),
            ("fecha inválida", "Fecha no disponible"),
        ] {
            assert_eq!(activity_time(value, now), expected);
        }
        let midnight =
            DateTime::parse_from_rfc3339("2026-01-01T00:01:00+01:00").expect("medianoche");
        assert_eq!(
            activity_time("2025-12-31T22:30:00Z", midnight),
            "Ayer 23:30"
        );
    }
}
