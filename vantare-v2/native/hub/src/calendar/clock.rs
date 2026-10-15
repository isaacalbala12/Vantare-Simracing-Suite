//! Zona horaria elegida, etiquetas en español y semana LMU (martes a lunes).
//! `Local` sigue la zona del sistema, incluido el cambio de hora; `Fixed` y `Utc`
//! hacen deterministas los tests.
use chrono::{
    DateTime, Datelike, Duration, FixedOffset, Local, NaiveDate, NaiveDateTime, Offset, TimeZone,
    Timelike, Utc,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Zone {
    Local,
    Utc,
    /// Segundos al este de UTC.
    Fixed(i32),
}

const DAYS: [&str; 7] = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTHS: [&str; 12] = [
    "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
];

pub fn day_name(date: NaiveDate) -> &'static str {
    DAYS[date.weekday().num_days_from_sunday() as usize]
}
pub fn month_name(date: NaiveDate) -> &'static str {
    MONTHS[date.month0() as usize]
}

impl Zone {
    pub fn offset_secs(self, at: DateTime<Utc>) -> i32 {
        match self {
            Self::Utc => 0,
            Self::Fixed(secs) => secs,
            Self::Local => at.with_timezone(&Local).offset().fix().local_minus_utc(),
        }
    }
    pub fn naive(self, at: DateTime<Utc>) -> NaiveDateTime {
        (at + Duration::seconds(i64::from(self.offset_secs(at)))).naive_utc()
    }
    pub fn date(self, at: DateTime<Utc>) -> NaiveDate {
        self.naive(at).date()
    }
    pub fn hm(self, at: DateTime<Utc>) -> String {
        let local = self.naive(at);
        format!("{:02}:{:02}", local.hour(), local.minute())
    }
    /// Minutos desde medianoche local.
    pub fn minute_of_day(self, at: DateTime<Utc>) -> u32 {
        let local = self.naive(at);
        local.hour() * 60 + local.minute()
    }
    /// Instante de la medianoche civil; no suma 24 h, así los días de 23/25 h
    /// del cambio de hora salen bien.
    pub fn day_start(self, date: NaiveDate) -> DateTime<Utc> {
        let midnight = date.and_hms_opt(0, 0, 0).unwrap_or_default();
        match self {
            Self::Utc => midnight.and_utc(),
            Self::Fixed(secs) => FixedOffset::east_opt(secs)
                .and_then(|zone| zone.from_local_datetime(&midnight).earliest())
                .map_or_else(|| midnight.and_utc(), |at| at.with_timezone(&Utc)),
            Self::Local => Local
                .from_local_datetime(&midnight)
                .earliest()
                // Salto de hora justo a medianoche: la primera hora válida.
                .or_else(|| {
                    Local
                        .from_local_datetime(&(midnight + Duration::hours(1)))
                        .earliest()
                })
                .map_or_else(|| midnight.and_utc(), |at| at.with_timezone(&Utc)),
        }
    }
    /// «UTC», «+2» o «+5:30».
    pub fn short(self, at: DateTime<Utc>) -> String {
        if self == Self::Utc {
            return "UTC".into();
        }
        let secs = self.offset_secs(at);
        let (sign, abs) = (if secs < 0 { '-' } else { '+' }, secs.abs());
        match abs % 3600 / 60 {
            0 => format!("{sign}{}", abs / 3600),
            minutes => format!("{sign}{}:{minutes:02}", abs / 3600),
        }
    }
    /// «Madrid · UTC+2», «Tu hora · UTC+2» si no se conoce la ciudad, o «UTC».
    pub fn long(self, at: DateTime<Utc>) -> String {
        match self {
            Self::Utc => "UTC".into(),
            Self::Local => format!(
                "{} · UTC{}",
                local_city().unwrap_or("Tu hora"),
                self.short(at)
            ),
            Self::Fixed(_) => format!("Tu hora · UTC{}", self.short(at)),
        }
    }
    /// «hoy», «mañana» o «vie 9».
    pub fn day_rel(self, at: DateTime<Utc>, now: DateTime<Utc>) -> String {
        let (day, today) = (self.date(at), self.date(now));
        if day == today {
            "hoy".into()
        } else if day == today + Duration::days(1) {
            "mañana".into()
        } else {
            format!("{} {}", day_name(day), day.day())
        }
    }
    /// «vie 9 oct».
    pub fn day_long(self, at: DateTime<Utc>) -> String {
        let day = self.date(at);
        format!("{} {} {}", day_name(day), day.day(), month_name(day))
    }
}

/// «en 13 min», «en 1 h 05 min», «en 2 d 3 h».
pub fn in_txt(delta: Duration) -> String {
    let minutes = (delta.num_seconds().max(0) + 59) / 60;
    match minutes {
        0..60 => format!("en {minutes} min"),
        60..1440 => format!("en {} h {:02} min", minutes / 60, minutes % 60),
        _ => format!("en {} d {} h", minutes / 1440, minutes % 1440 / 60),
    }
}

/// Cuenta atrás «12:47» o «1:02:03».
pub fn countdown(delta: Duration) -> String {
    let secs = delta.num_seconds().max(0);
    let (h, m, s) = (secs / 3600, secs / 60 % 60, secs % 60);
    if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m:02}:{s:02}")
    }
}

/// «40 min», «1 h», «1 h 40 min».
pub fn duration_txt(minutes: u32) -> String {
    match (minutes / 60, minutes % 60) {
        (0, m) => format!("{m} min"),
        (h, 0) => format!("{h} h"),
        (h, m) => format!("{h} h {m} min"),
    }
}

/// «20:00» desde minutos del día.
pub fn hhmm(minutes: u32) -> String {
    format!("{:02}:{:02}", minutes / 60, minutes % 60)
}

/// Martes 00:00 UTC más reciente: la semana LMU se publica de martes a martes.
pub fn week_start(now: DateTime<Utc>) -> DateTime<Utc> {
    let back = (i64::from(now.weekday().num_days_from_monday()) - 1).rem_euclid(7);
    (now.date_naive() - Duration::days(back))
        .and_hms_opt(0, 0, 0)
        .unwrap_or_default()
        .and_utc()
}

/// Los siete días civiles de la semana, de martes a lunes.
pub fn week_days(start: DateTime<Utc>) -> [NaiveDate; 7] {
    let first = start.date_naive();
    std::array::from_fn(|i| first + Duration::days(i as i64))
}

/// «6–12 oct» o «29 sep–5 oct».
pub fn week_title(days: &[NaiveDate; 7]) -> String {
    let (a, b) = (days[0], days[6]);
    if a.month() == b.month() {
        format!("{}–{} {}", a.day(), b.day(), month_name(b))
    } else {
        format!(
            "{} {}–{} {}",
            a.day(),
            month_name(a),
            b.day(),
            month_name(b)
        )
    }
}

/// Ciudad de la zona del sistema (Windows), si se conoce: «Madrid».
fn local_city() -> Option<&'static str> {
    static CITY: std::sync::OnceLock<Option<&'static str>> = std::sync::OnceLock::new();
    *CITY.get_or_init(|| {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let out = std::process::Command::new("tzutil")
                .arg("/g")
                .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
                .output()
                .ok()?;
            city_of(String::from_utf8_lossy(&out.stdout).trim())
        }
        #[cfg(not(windows))]
        None
    })
}

/// Id de zona de Windows -> ciudad de referencia; lo que no esté aquí se queda en «Local».
fn city_of(id: &str) -> Option<&'static str> {
    Some(match id {
        "Romance Standard Time" => "Madrid",
        "W. Europe Standard Time" => "Berlín",
        "Central Europe Standard Time" => "Budapest",
        "Central European Standard Time" => "Varsovia",
        "GMT Standard Time" => "Londres",
        "E. Europe Standard Time" => "Bucarest",
        "FLE Standard Time" => "Kiev",
        "GTB Standard Time" => "Atenas",
        "Russian Standard Time" => "Moscú",
        "Turkey Standard Time" => "Estambul",
        "Eastern Standard Time" => "Nueva York",
        "Central Standard Time" => "Chicago",
        "Mountain Standard Time" => "Denver",
        "Pacific Standard Time" => "Los Ángeles",
        "Atlantic Standard Time" => "Halifax",
        "Central Standard Time (Mexico)" => "Ciudad de México",
        "Argentina Standard Time" => "Buenos Aires",
        "E. South America Standard Time" => "São Paulo",
        "Pacific SA Standard Time" => "Santiago",
        "SA Pacific Standard Time" => "Bogotá",
        "AUS Eastern Standard Time" => "Sídney",
        "W. Australia Standard Time" => "Perth",
        "Tokyo Standard Time" => "Tokio",
        "China Standard Time" => "Pekín",
        "India Standard Time" => "Calcuta",
        "South Africa Standard Time" => "Johannesburgo",
        _ => return None,
    })
}

/// «Madrid +2», o «Local +2» si no se conoce la ciudad.
pub fn local_label(at: DateTime<Utc>) -> String {
    format!(
        "{} {}",
        local_city().unwrap_or("Local"),
        Zone::Local.short(at)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(value: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(value)
            .expect("fecha")
            .with_timezone(&Utc)
    }

    #[test]
    fn lmu_week_runs_tuesday_to_monday() {
        // Martes 6, lunes 12 y martes 13 de octubre de 2026.
        assert_eq!(
            week_start(at("2026-10-06T00:00:00Z")),
            at("2026-10-06T00:00:00Z")
        );
        assert_eq!(
            week_start(at("2026-10-12T23:59:00Z")),
            at("2026-10-06T00:00:00Z")
        );
        assert_eq!(
            week_start(at("2026-10-13T00:00:00Z")),
            at("2026-10-13T00:00:00Z")
        );
        assert_eq!(
            week_start(at("2026-10-08T17:47:00Z")),
            at("2026-10-06T00:00:00Z")
        );
        let days = week_days(at("2026-10-06T00:00:00Z"));
        assert_eq!(days[0].weekday(), chrono::Weekday::Tue);
        assert_eq!(days[6].weekday(), chrono::Weekday::Mon);
        assert_eq!(week_title(&days), "6–12 oct");
        assert_eq!(
            week_title(&week_days(at("2026-09-29T00:00:00Z"))),
            "29 sep–5 oct"
        );
    }

    #[test]
    fn zone_formats_hours_and_relative_days() {
        let madrid = Zone::Fixed(2 * 3600);
        let now = at("2026-10-08T17:47:13Z");
        assert_eq!(madrid.hm(at("2026-10-08T18:00:00Z")), "20:00");
        assert_eq!(Zone::Utc.hm(at("2026-10-08T18:00:00Z")), "18:00");
        assert_eq!(madrid.day_rel(at("2026-10-08T18:00:00Z"), now), "hoy");
        assert_eq!(madrid.day_rel(at("2026-10-09T05:00:00Z"), now), "mañana");
        assert_eq!(madrid.day_rel(at("2026-10-10T09:00:00Z"), now), "sáb 10");
        // 22:30Z ya es mañana en Madrid.
        assert_eq!(madrid.day_rel(at("2026-10-08T22:30:00Z"), now), "mañana");
        assert_eq!(madrid.long(now), "Tu hora · UTC+2");
        assert_eq!(Zone::Fixed(19800).short(now), "+5:30");
        assert_eq!(
            madrid.day_start(now.date_naive()),
            at("2026-10-07T22:00:00Z")
        );
    }

    #[test]
    fn local_midnight_survives_daylight_saving_days() {
        // Un día civil Local nunca se calcula sumando 24 h: comprobamos que la
        // medianoche siguiente es posterior y que ambas caen en su fecha.
        let day = NaiveDate::from_ymd_opt(2026, 10, 25).expect("fecha");
        let (a, b) = (
            Zone::Local.day_start(day),
            Zone::Local.day_start(day + Duration::days(1)),
        );
        assert!(b > a);
        assert_eq!(Zone::Local.date(a), day);
    }

    #[test]
    fn windows_zone_ids_name_a_city() {
        assert_eq!(city_of("Romance Standard Time"), Some("Madrid"));
        assert_eq!(city_of("Zona Inventada"), None);
    }

    #[test]
    fn human_labels() {
        assert_eq!(in_txt(Duration::minutes(13)), "en 13 min");
        assert_eq!(in_txt(Duration::seconds(61)), "en 2 min");
        assert_eq!(in_txt(Duration::minutes(65)), "en 1 h 05 min");
        assert_eq!(in_txt(Duration::hours(51)), "en 2 d 3 h");
        assert_eq!(countdown(Duration::seconds(767)), "12:47");
        assert_eq!(countdown(Duration::seconds(3723)), "1:02:03");
        assert_eq!(countdown(Duration::seconds(-5)), "00:00");
        assert_eq!(duration_txt(100), "1 h 40 min");
        assert_eq!(duration_txt(600), "10 h");
        assert_eq!(duration_txt(20), "20 min");
    }
}
