//! Delta Vantare scene: pure layout, texts and state flags. The painter owns
//! pixels and colours; nothing here keeps a clock or a previous board.
use crate::vantare::{Style, waiting};
use vantare_domain::{
    SourceState,
    delta::{Banner, Board, Pause, Phase, Reference, Sector, SectorTone},
    format::{self, Language, PLACEHOLDER, Preferences, lap_time},
    widget_settings::{
        delta::Settings,
        look::{Accent, Tone},
    },
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Size {
    Pill,
    Bar,
    Expanded,
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct Options {
    pub tone: Tone,
    pub accent: Accent,
    pub size: Size,
    pub reference: Reference,
    pub show_bar: bool,
    pub show_sectors: bool,
    pub transparent: bool,
    pub brand: bool,
}

impl Options {
    pub fn from_settings(settings: &Settings) -> Self {
        Self {
            tone: settings.style,
            accent: settings.accent,
            size: match settings.size.as_str() {
                "bar" => Size::Bar,
                "expanded" => Size::Expanded,
                _ => Size::Pill,
            },
            reference: reference(settings),
            show_bar: settings.show_bar,
            show_sectors: settings.show_sectors,
            transparent: settings.transparent_background,
            brand: settings.brand_visible == Some(true),
        }
    }
}

pub(super) fn reference(settings: &Settings) -> Reference {
    match settings.reference.as_str() {
        "optimal" => Reference::Optimal,
        "leader" => Reference::Leader,
        _ => Reference::PersonalBest,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Item {
    Banner,
    Header,
    Big,
    Message,
    Bar,
    Sectors,
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct SectorCell {
    pub title: String,
    pub value: String,
    pub tone: Option<SectorTone>,
    pub live: bool,
    pub progress: Option<f32>,
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct Labels {
    pub title: String,
    pub number: String,
    pub reference: String,
    pub predicted: String,
    pub lap: String,
    pub range: [String; 2],
    pub segments: [&'static str; 3],
    pub phase_note: Option<&'static str>,
    pub message: Option<(&'static str, &'static str)>,
    pub predicted_lead: &'static str,
    pub sectors: Vec<SectorCell>,
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct Scene {
    pub options: Options,
    pub width: f32,
    pub height: f32,
    /// Panel alto: la caja deja siempre 27 px para el aviso de boxes.
    pub content: f32,
    pub items: Vec<(f32, Item)>,
    pub labels: Labels,
    pub banner: Option<Banner>,
    pub phase: Phase,
    /// Fracción de media barra ya resuelta; 0 en la píldora y sin número.
    pub bar: f32,
    /// Delta negativo: verde en el número y en el sector en curso.
    pub gain: bool,
    /// Destello de récord bajo el número: 1 al marcar y baja a 0.
    pub flash: Option<f32>,
    /// Board con número que mostrar (ni espera ni espectador).
    pub live: bool,
    pub message: bool,
    pub grey: bool,
}

/// Sin número que mostrar: espera, sin jugador o sin referencia.
fn message(board: &Board) -> bool {
    waiting(Some((board.source_state, board.player_present))) || board.phase == Phase::NoReference
}

/// Gris: vuelta invalidada o delta en pausa.
fn grey(board: &Board) -> bool {
    matches!(board.phase, Phase::Invalid | Phase::Paused(_))
}

fn reference_name(reference: Reference, language: Language) -> &'static str {
    match (reference, language) {
        (Reference::PersonalBest, Language::Es) => "Mejor",
        (Reference::PersonalBest, Language::En) => "Best",
        (Reference::Optimal, Language::Es) => "Óptima",
        (Reference::Optimal, Language::En) => "Optimal",
        (Reference::Leader, Language::Es) => "Líder",
        (Reference::Leader, Language::En) => "Leader",
        (_, Language::Es) => "No disponible",
        (_, Language::En) => "Unavailable",
    }
}

/// `−0.214` (signo menos tipográfico) o `+0.382`.
fn signed(seconds: f64) -> String {
    let text = format!("{:.3}", seconds.abs());
    if seconds < 0.0 && text != "0.000" {
        format!("\u{2212}{text}")
    } else {
        format!("+{text}")
    }
}

/// Fracción de media barra, con signo: negativo crece a la izquierda.
#[must_use]
pub fn bar_target(delta: Option<f64>, phase: Phase, range_s: f32) -> f32 {
    if phase != Phase::Live {
        return 0.0;
    }
    delta.map_or(0.0, |d| (d as f32 / range_s.max(0.01)).clamp(-1.0, 1.0))
}

/// Pure sampling: layout and texts for the current board and settings.
#[must_use]
pub fn sample(board: &Board, settings: &Settings, prefs: Preferences, style: &Style) -> Scene {
    let options = Options::from_settings(settings);
    let d = &style.delta;
    let v = match options.tone {
        Tone::Neo => &style.styles.neo,
        Tone::Neutro => &style.styles.neutro,
    };
    let message = message(board);
    let grey = grey(board);
    let shown = !waiting(Some((board.source_state, board.player_present)));
    let mut items = Vec::new();
    let mut y = v.padding_y;
    if shown && board.banner.is_some() {
        items.push((0.0, Item::Banner));
        y += 27.0;
    }
    let height = if options.size == Size::Pill {
        d.pill_height
    } else {
        2.0 * v.padding_y
            + v.header_height
            + v.header_gap
            + d.message_height.max(d.big_height)
            + if options.show_bar {
                d.bar + d.tick_labels
            } else {
                0.0
            }
            + if options.size == Size::Expanded && options.show_sectors {
                d.sector_height
            } else {
                0.0
            }
            + 27.0
    };
    if options.size == Size::Pill {
        return Scene {
            options: options.clone(),
            width: d.pill_width,
            height,
            content: 34.0,
            items,
            labels: labels(board, &options, style, prefs.language),
            banner: None,
            phase: board.phase,
            bar: 0.0,
            gain: board.delta_s.is_some_and(|delta| delta < 0.0),
            flash: None,
            live: !message,
            message,
            grey,
        };
    }
    items.push((y, Item::Header));
    y += v.header_height + v.header_gap;
    items.push((y, if message { Item::Message } else { Item::Big }));
    y += d.message_height.max(d.big_height);
    if options.show_bar {
        items.push((y, Item::Bar));
        y += d.bar + d.tick_labels;
    }
    let sectors = shown && !board.sectors.is_empty() && !grey && !message && options.show_sectors;
    if options.size == Size::Expanded && sectors {
        items.push((y, Item::Sectors));
    }
    if options.size == Size::Expanded && options.show_sectors {
        y += d.sector_height;
    }
    Scene {
        options: options.clone(),
        width: match options.size {
            Size::Expanded => d.width_expanded,
            _ => d.width_bar,
        },
        height,
        content: y + v.padding_y,
        items,
        labels: labels(board, &options, style, prefs.language),
        banner: board.banner,
        phase: board.phase,
        bar: bar_target(board.delta_s, board.phase, d.range_s),
        gain: board.delta_s.is_some_and(|delta| delta < 0.0),
        flash: None,
        live: !message,
        message,
        grey,
    }
}

fn labels(board: &Board, options: &Options, style: &Style, language: Language) -> Labels {
    let es = language == Language::Es;
    let message = message(board);
    let live = board.phase != Phase::NoReference && !message;
    let number = if message {
        "-.---".into()
    } else if matches!(board.phase, Phase::Paused(_)) {
        "—.———".into()
    } else {
        signed(board.delta_s.unwrap_or(0.0))
    };
    let phase_note = match board.phase {
        Phase::Invalid => Some(if es {
            "Vuelta invalidada · límites de pista"
        } else {
            "Lap invalidated · track limits"
        }),
        Phase::Paused(Pause::Pits) => Some(if es { "En boxes" } else { "In the pits" }),
        Phase::Paused(Pause::OutLap) => Some(if es { "Vuelta de salida" } else { "Out lap" }),
        Phase::Paused(Pause::Fcy) => Some(if es {
            "FCY · en pausa"
        } else {
            "FCY · paused"
        }),
        _ => None,
    };
    let spectator = !board.player_present
        && !matches!(board.source_state, SourceState::Waiting | SourceState::Lost);
    let message_text = message.then(|| {
        if board.player_present && board.phase == Phase::NoReference {
            (
                if es { "SIN REFERENCIA" } else { "NO REFERENCE" },
                if es {
                    "Completa una vuelta lanzada para empezar"
                } else {
                    "Complete a flying lap to start"
                },
            )
        } else if spectator {
            (
                if es {
                    "SIN COCHE PROPIO"
                } else {
                    "NO CAR OF YOUR OWN"
                },
                if es {
                    "Modo espectador"
                } else {
                    "Spectator mode"
                },
            )
        } else {
            (
                format::waiting_text(language, true),
                if es {
                    "Abre el simulador y entra en una sesión"
                } else {
                    "Open the simulator and join a session"
                },
            )
        }
    });
    Labels {
        title: format!(
            "DELTA · VS {}",
            reference_name(options.reference, language).to_uppercase()
        ),
        number,
        reference: lap_time(board.reference_lap_s),
        predicted: lap_time(board.predicted_s),
        lap: match (board.lap, board.sector) {
            (Some(lap), Some(sector)) => {
                format!("{} {lap} · S{sector}", if es { "Vuelta" } else { "Lap" })
            }
            (Some(lap), None) => format!("{} {lap}", if es { "Vuelta" } else { "Lap" }),
            _ => String::new(),
        },
        range: [
            format!("−{:.1}", style.delta.range_s),
            format!("+{:.1}", style.delta.range_s),
        ],
        segments: [
            reference_name(Reference::PersonalBest, language),
            reference_name(Reference::Optimal, language),
            reference_name(Reference::Leader, language),
        ],
        phase_note,
        message: message_text,
        predicted_lead: if es { "Predicha " } else { "Predicted " },
        sectors: cells(board, live, language),
    }
}

fn cells(board: &Board, live: bool, language: Language) -> Vec<SectorCell> {
    if !live {
        return Vec::new();
    }
    let es = language == Language::Es;
    let closed: Option<f64> = board
        .sectors
        .iter()
        .map_while(|sector| match sector {
            Sector::Done(_, delta) => Some(*delta),
            _ => None,
        })
        .sum::<Option<f64>>();
    let running = board.delta_s.zip(closed).map(|(total, done)| total - done);
    board
        .sectors
        .iter()
        .enumerate()
        .map(|(index, sector)| {
            let title = if matches!(sector, Sector::Live(_)) {
                format!("S{} · {}", index + 1, if es { "en curso" } else { "live" })
            } else {
                format!("S{}", index + 1)
            };
            match sector {
                Sector::Done(tone, delta) => SectorCell {
                    title,
                    value: delta.map_or_else(|| PLACEHOLDER.into(), signed),
                    tone: Some(*tone),
                    live: false,
                    progress: None,
                },
                Sector::Live(progress) => SectorCell {
                    title,
                    value: running.map_or_else(String::new, signed),
                    tone: None,
                    live: true,
                    progress: progress.map(|p| p as f32),
                },
                Sector::Pending => SectorCell {
                    title,
                    value: PLACEHOLDER.into(),
                    tone: None,
                    live: false,
                    progress: None,
                },
            }
        })
        .collect()
}
