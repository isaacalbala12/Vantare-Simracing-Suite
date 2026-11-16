//! Avisos de sesión: los textos y filas que se ven, a partir de la máquina de domain.
//! Sin colores, sin ventana y sin reloj: la opacidad y la hora llegan ya calculadas.
use vantare_domain::session_alerts::{Kind, Mini, Tone, View};
use vantare_domain::widget_settings::session_alerts::Settings;

/// Main panel and companion rows, as the GPUI painter lays them out.
pub const MAIN_WIDTH: f32 = 480.0;
pub const MAIN_HEIGHT: f32 = 88.0;
pub const MINI_WIDTH: f32 = 210.0;
pub const MINI_HEIGHT: f32 = 36.0;
pub const MINI_STEP: f32 = 44.0;

/// One companion row: label on the left, countdown on the right.
#[derive(Clone, Debug, PartialEq)]
pub struct Row {
    pub label: String,
    pub value: String,
    /// The row is not in its final minute, so its countdown is painted yellow.
    pub calm: bool,
}

/// The active notice, already composed into the strings GPUI paints.
#[derive(Clone, Debug, PartialEq)]
pub struct Notice {
    pub band: String,
    pub context: String,
    pub title: String,
    pub detail: String,
    pub value: String,
    pub small: String,
    pub tone: Tone,
}

/// What a widget without photos shows in the Studio.
#[derive(Clone, Debug, PartialEq)]
pub struct Placeholder {
    pub band: String,
    pub context: String,
    pub title: String,
    pub detail: String,
}

/// Everything the Look paints; `None` fields paint nothing.
#[derive(Clone, Debug, PartialEq)]
pub struct Scene {
    pub size: (f32, f32),
    pub scale: f32,
    pub opacity: f32,
    pub notice: Option<Notice>,
    pub placeholder: Option<Placeholder>,
    /// Companion without rows: the Studio hints where the countdown will appear.
    pub ghost: Option<String>,
    pub rows: Vec<Row>,
}

pub fn scale(settings: &Settings) -> f32 {
    match settings.mini_size.as_str() {
        "s" => 0.85,
        "l" => 1.25,
        _ => 1.0,
    }
}

/// Main panel, or the fixed block of companion rows; it only depends on the settings.
pub fn size(settings: &Settings) -> (f32, f32) {
    if settings.companion_for.is_none() {
        return (MAIN_WIDTH, MAIN_HEIGHT);
    }
    let rows = f32::from(settings.mini_limit.max(1));
    (
        MINI_WIDTH * scale(settings),
        (MINI_HEIGHT * rows + (MINI_STEP - MINI_HEIGHT) * (rows - 1.0)) * scale(settings),
    )
}

/// Pure sampling: same view, same strings, no colours and no clock.
pub fn sample(
    settings: &Settings,
    view: &View,
    counter: Option<&Mini>,
    live: bool,
    opacity: f32,
) -> Scene {
    let preview = !live;
    let rows: Vec<Row> = view
        .minis
        .iter()
        .map(|mini| Row {
            label: format!(
                "{}{}{}",
                if mini.scheduled { "FIN " } else { "" },
                mini.label,
                if mini.calendar { " · cal" } else { "" }
            ),
            value: mini.value(),
            calm: mini.tone() != Tone::Final,
        })
        .collect();
    let mut scene = Scene {
        size: size(settings),
        scale: scale(settings),
        opacity,
        notice: None,
        placeholder: None,
        ghost: None,
        rows,
    };
    let companion = settings.companion_for.is_some();
    if companion {
        // The companion only paints rows: the main notice belongs to the main widget.
        if settings.mini && preview && scene.rows.is_empty() {
            scene.ghost = Some("Mini cuenta atrás".into());
        }
        return scene;
    }
    let Some(notice) = &view.active else {
        if preview {
            scene.placeholder = Some(Placeholder {
                band: "Avisos de sesión".into(),
                context: "vista del Studio".into(),
                title: "SIN AVISOS".into(),
                detail: "En pista no ocupa nada si no hay avisos".into(),
            });
        }
        return scene;
    };
    scene.notice = Some(notice_texts(settings, view, notice, counter));
    scene
}

fn notice_texts(
    settings: &Settings,
    view: &View,
    notice: &vantare_domain::session_alerts::Notice,
    counter: Option<&Mini>,
) -> Notice {
    let mut context = if notice.calendar {
        "cal".to_owned()
    } else {
        notice.label.clone()
    };
    if view.queued > 0 {
        context.push_str(&format!(" · 1/{}", view.queued + 1));
    }
    if !settings.sound {
        context.push_str(" · sin sonido");
    }
    let band = match notice.kind {
        Kind::Threshold(minutes) if notice.calendar => format!("Calendario · {minutes} min"),
        Kind::Threshold(minutes) if notice.scheduled => format!("Fin previsto · {minutes} min"),
        Kind::Threshold(1) => "Último minuto".into(),
        Kind::Threshold(minutes) => format!("Aviso · {minutes} min"),
        Kind::Finished {
            qualifying: true, ..
        } => "Qualy terminada".into(),
        Kind::Finished { .. } => "Prácticas terminadas".into(),
        Kind::Formation => "Vuelta de formación".into(),
        Kind::Start => "Salida".into(),
    };
    let base = match notice.kind {
        Kind::Finished {
            qualifying: true, ..
        } => "QUALY TERMINADA",
        Kind::Finished { .. } => "PRÁCTICAS TERMINADAS",
        Kind::Formation => "VUELTA DE FORMACIÓN",
        Kind::Start => "SALIDA INMINENTE",
        Kind::Threshold(_) if notice.calendar => "TU CARRERA EMPIEZA PRONTO",
        Kind::Threshold(_) => "LA SESIÓN ESTÁ POR TERMINAR",
    };
    let result = if let Kind::Finished { best_lap_ms, .. } = notice.kind {
        Some(best_lap_ms.map_or_else(
            || "SIN VUELTA VÁLIDA".to_owned(),
            |ms| {
                format!(
                    "MEJOR VUELTA {}",
                    vantare_domain::format::lap_time(Some(ms as f64 / 1000.0))
                )
            },
        ))
    } else {
        None
    };
    let countdown = matches!(notice.kind, Kind::Threshold(_)).then(|| {
        if notice.scheduled {
            format!("FIN PREVISTO · {}", notice.label)
        } else if notice.calendar {
            "TU CARRERA EMPIEZA PRONTO".to_owned()
        } else {
            format!("EMPIEZA {}", notice.label)
        }
    });
    let title = result.or(countdown).unwrap_or_else(|| base.to_owned());
    let detail = if notice.calendar {
        notice.label.clone()
    } else if matches!(notice.kind, Kind::Finished { .. }) {
        "Resultado de tu clase".to_owned()
    } else if notice.scheduled {
        "Horario programado · puede prolongarse".to_owned()
    } else {
        "Inicio anunciado por la sesión".to_owned()
    };
    let value = match notice.kind {
        Kind::Finished { position, .. } => {
            position.map_or_else(|| "—".to_owned(), |place| format!("P{place}"))
        }
        _ => counter.map_or_else(|| "—".to_owned(), Mini::value),
    };
    let small = if notice.scheduled {
        "FIN PREVISTO"
    } else if matches!(notice.kind, Kind::Finished { .. }) {
        "POSICIÓN"
    } else if counter.is_some_and(|mini| mini.distance_m.is_some()) {
        "A LA LÍNEA"
    } else {
        "RESTANTE"
    };
    Notice {
        band,
        context,
        title,
        detail,
        value,
        small: small.to_owned(),
        tone: notice.tone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::session_alerts::{Machine, Options, Phase, SessionInput};
    use vantare_domain::{SessionKind, SessionState};

    fn input(kind: SessionKind) -> SessionInput {
        SessionInput {
            epoch: 1,
            id: 7,
            kind,
            state: Some(SessionState::Running),
            remaining_s: None,
            elapsed_s: Some(0.0),
            started_at_s: Some(0.0),
            finished_at_s: None,
            next_kind: None,
            next_starts_at_s: None,
            position: None,
            best_lap_ms: None,
            phase: None,
            distance_m: None,
            distance_estimated: false,
        }
    }
    /// The machine of domain decides which notice exists; the scene only writes it.
    fn ticked(input: SessionInput, now: u64) -> (Machine, vantare_domain::session_alerts::View) {
        let options = Options::default();
        let mut machine = Machine::default();
        machine.session(Some(input), now, &options);
        let view = machine.tick(now, &options);
        (machine, view)
    }
    fn scene_of(view: &vantare_domain::session_alerts::View, counter: Option<&Mini>) -> Scene {
        sample(&Settings::default(), view, counter, true, 1.0)
    }
    fn mini(seconds: u64, distance_m: Option<u32>) -> Mini {
        Mini {
            event: "session:1:7".into(),
            label: "PRÁCTICAS".into(),
            calendar: false,
            seconds,
            distance_m,
            scheduled: false,
            distance_estimated: false,
        }
    }

    #[test]
    fn the_scheduled_end_warns_with_its_threshold_and_counts_down() {
        let mut session = input(SessionKind::Practice);
        session.remaining_s = Some(300.0);
        let (machine, view) = ticked(session, 1_000);
        let counter = machine.countdown("session:1:7", 1_000);
        let notice = scene_of(&view, counter.as_ref()).notice.expect("aviso");
        assert_eq!(notice.band, "Fin previsto · 5 min");
        assert_eq!(notice.title, "FIN PREVISTO · PRÁCTICAS");
        assert_eq!(notice.detail, "Horario programado · puede prolongarse");
        assert_eq!(notice.small, "FIN PREVISTO");
        assert_eq!(notice.value, "05:00");
        assert_eq!(notice.tone, Tone::Mild);
    }

    #[test]
    fn the_start_phase_counts_the_metres_to_the_line() {
        let mut session = input(SessionKind::Race);
        session.phase = Some(Phase::Start);
        session.distance_m = Some(120.0);
        let (machine, view) = ticked(session, 1_000);
        let counter = machine.countdown("session:1:7", 1_000);
        let notice = scene_of(&view, counter.as_ref()).notice.expect("aviso");
        assert_eq!(notice.band, "Salida");
        assert_eq!(notice.title, "SALIDA INMINENTE");
        assert_eq!(notice.value, "120 m");
        assert_eq!(notice.small, "A LA LÍNEA");
        assert_eq!(notice.tone, Tone::Final);
    }

    #[test]
    fn rows_prefix_scheduled_notices_and_warn_in_the_final_minute() {
        let view = vantare_domain::session_alerts::View {
            minis: vec![mini(90, None), mini(30, None)],
            ..Default::default()
        };
        let scene = scene_of(&view, None);
        assert_eq!(
            scene
                .rows
                .iter()
                .map(|row| (row.label.as_str(), row.value.as_str(), row.calm))
                .collect::<Vec<_>>(),
            [("PRÁCTICAS", "01:30", true), ("PRÁCTICAS", "00:30", false)]
        );
    }

    #[test]
    fn a_widget_without_photos_shows_the_studio_hint_and_the_track_shows_nothing() {
        let idle = vantare_domain::session_alerts::View::default();
        let studio = sample(&Settings::default(), &idle, None, false, 1.0);
        assert_eq!(
            studio.placeholder.as_ref().expect("pista").title,
            "SIN AVISOS"
        );
        let track = sample(&Settings::default(), &idle, None, true, 1.0);
        assert!(track.placeholder.is_none() && track.notice.is_none());
    }

    #[test]
    fn the_companion_keeps_its_fixed_block_and_hints_an_empty_row_in_the_studio() {
        let companion = Settings {
            companion_for: Some("main".into()),
            ..Settings::default()
        };
        let scene = sample(
            &companion,
            &vantare_domain::session_alerts::View::default(),
            None,
            false,
            1.0,
        );
        assert_eq!(scene.size, (210.0, 124.0));
        assert_eq!(scene.ghost.as_deref(), Some("Mini cuenta atrás"));
        for (mini_size, expected) in [("s", (178.5, 105.4)), ("l", (262.5, 155.0))] {
            let settings = Settings {
                mini_size: mini_size.into(),
                ..companion.clone()
            };
            assert_eq!(size(&settings), expected, "{mini_size}");
        }
    }
}
