use super::{Field, Settings, Tab, boolean, choice, number};

#[allow(
    clippy::too_many_lines,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss
)]
// Tabla de controles existente; los rangos y normalized acotan los valores.
pub(super) fn fields(s: &vantare_ui::session_alerts::Settings) -> Vec<Field> {
    const LABELS: [&str; 5] = [
        "Umbral 1 (min; 0 desactiva)",
        "Umbral 2 (min; 0 desactiva)",
        "Umbral 3 (min; 0 desactiva)",
        "Umbral 4 (min; 0 desactiva)",
        "Umbral 5 (min; 0 desactiva)",
    ];
    const SETTERS: [fn(&mut Settings, f64); 5] = [
        |s, v| {
            if let Settings::SessionAlerts(s) = s {
                s.set_threshold(0, v as u8);
            }
        },
        |s, v| {
            if let Settings::SessionAlerts(s) = s {
                s.set_threshold(1, v as u8);
            }
        },
        |s, v| {
            if let Settings::SessionAlerts(s) = s {
                s.set_threshold(2, v as u8);
            }
        },
        |s, v| {
            if let Settings::SessionAlerts(s) = s {
                s.set_threshold(3, v as u8);
            }
        },
        |s, v| {
            if let Settings::SessionAlerts(s) = s {
                s.set_threshold(4, v as u8);
            }
        },
    ];
    let mut fields = vec![
        boolean(
            "Pitido al llegar a 0",
            Tab::Behavior,
            s.sound_zero,
            set!(SessionAlerts.sound_zero),
        ),
        boolean(
            "Mini del último minuto",
            Tab::Behavior,
            s.mini_final,
            set!(SessionAlerts.mini_final),
        ),
        boolean(
            "Cuenta atrás LMU",
            Tab::Content,
            s.session,
            set!(SessionAlerts.session),
        ),
        boolean(
            "Carreras del calendario",
            Tab::Content,
            s.calendar,
            set!(SessionAlerts.calendar),
        ),
        boolean(
            "Prácticas y qualy terminadas",
            Tab::Content,
            s.finished,
            set!(SessionAlerts.finished),
        ),
        boolean(
            "Formación y salida (señales pendientes)",
            Tab::Content,
            s.starts,
            set!(SessionAlerts.starts),
        ),
        number(
            "Duración (segundos)",
            f64::from(s.duration_seconds),
            4.0,
            15.0,
            1.0,
            set!(SessionAlerts.duration_seconds as u8),
        ),
        boolean("Sonido", Tab::Behavior, s.sound, set!(SessionAlerts.sound)),
        number(
            "Volumen (%)",
            f64::from(s.volume),
            0.0,
            100.0,
            5.0,
            set!(SessionAlerts.volume as u8),
        ),
        boolean(
            "Mini cuenta atrás",
            Tab::Behavior,
            s.mini,
            set!(SessionAlerts.mini),
        ),
        boolean(
            "Mini de la sesión",
            Tab::Behavior,
            s.mini_session,
            set!(SessionAlerts.mini_session),
        ),
        boolean(
            "Mini del calendario",
            Tab::Behavior,
            s.mini_calendar,
            set!(SessionAlerts.mini_calendar),
        ),
        boolean(
            "Mini de salida",
            Tab::Behavior,
            s.mini_start,
            set!(SessionAlerts.mini_start),
        ),
        number(
            "Mini: máximo a la vez",
            f64::from(s.mini_limit),
            1.0,
            3.0,
            1.0,
            set!(SessionAlerts.mini_limit as u8),
        ),
        choice(
            "Tamaño mini",
            Tab::Appearance,
            &s.mini_size,
            &[("S", "s"), ("M", "m"), ("L", "l")],
            set!(SessionAlerts.mini_size string),
        ),
        choice(
            "Estilo",
            Tab::Appearance,
            &s.style,
            &[
                ("Neo", "neo"),
                ("Carmín", "carmin"),
                ("Limpio", "limpio"),
                ("Transparente", "transparente"),
            ],
            set!(SessionAlerts.style string),
        ),
    ];
    for i in 0..5 {
        fields.push(number(
            LABELS[i],
            f64::from(s.thresholds.get(i).copied().unwrap_or(0)),
            0.0,
            60.0,
            1.0,
            SETTERS[i],
        ));
    }
    fields
}
