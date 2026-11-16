//! Fuel Look plan and texts, ported from GPUI's Vantare look: pure, no painting.
use crate::fuel::scene::Bar;
use crate::vantare::{Style, Variant};
use rune::Color;
use vantare_domain::{
    format::{Language, PLACEHOLDER},
    fuel_strategy::{Banner, Board, Plan as Stop, Resource, Service, Tank},
    widget_session::Session,
    widget_settings::{
        fuel_strategy::Settings,
        look::{Accent, Tone},
    },
};

/// Tamaño del catálogo: 230, 300 o 460 de ancho.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Size {
    Compact,
    Standard,
    Expanded,
}

impl Size {
    fn from_name(name: &str) -> Self {
        match name {
            "compact" => Self::Compact,
            "expanded" => Self::Expanded,
            _ => Self::Standard,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct Options {
    pub tone: Tone,
    pub accent: Accent,
    pub size: Size,
    /// Marca Vantare en la cabecera (`brandVisible`, decidido por la licencia).
    pub brand: bool,
}

impl Options {
    pub(super) fn from_settings(settings: &Settings) -> Self {
        Self {
            tone: settings.style,
            accent: settings.accent,
            size: Size::from_name(&settings.size),
            brand: settings.brand_visible == Some(true),
        }
    }
    pub(super) fn variant<'a>(&self, style: &'a Style) -> &'a Variant {
        match self.tone {
            Tone::Neo => &style.styles.neo,
            Tone::Neutro => &style.styles.neutro,
        }
    }
    pub(super) fn accent(&self, style: &Style) -> Color {
        match self.accent {
            Accent::Red => style.accents.red,
            Accent::Amber => style.accents.amber,
            Accent::Green => style.accents.green,
            Accent::White => style.accents.white,
        }
    }
    fn width(&self, style: &Style) -> f32 {
        match self.size {
            Size::Compact => style.fuel.width_compact,
            Size::Standard => style.fuel.width_standard,
            Size::Expanded => style.fuel.width_expanded,
        }
    }
}

/// Color semántico de un valor, como el `Tone` de GPUI.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Ink {
    Plain,
    Hi,
    Red,
    Amber,
    Green,
    Accent,
}

/// Relleno de una barra.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Fill {
    Accent,
    Fuel,
    Refuel,
    Red,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Band {
    Low,
    Pits,
    Fcy,
    Yellow(u8),
    Final(u32, u32),
}

#[derive(Clone, Debug, PartialEq)]
pub(super) enum Line {
    Banner(Band),
    Header {
        left: String,
        right: String,
    },
    /// Compacto: vueltas grandes, parada a la derecha y barra del depósito.
    Big {
        left: String,
        left_label: String,
        right: String,
        right_label: String,
        tone: Ink,
        fraction: Option<f32>,
        fill: Fill,
    },
    Gauge {
        bar: Bar,
        title: String,
        pill: Option<String>,
        value: String,
        suffix: String,
        small: bool,
        fraction: Option<f32>,
        fill: Fill,
    },
    Row {
        key: String,
        value: String,
        tone: Ink,
        me: bool,
    },
    Tiles(Vec<(String, String, Ink)>),
    Sub {
        left: String,
        right: String,
    },
    /// Consumo por vuelta, normalizado 0–1, y su media.
    Spark {
        values: Vec<f32>,
        average: f32,
    },
    Window {
        open: f32,
        close: f32,
        now: f32,
    },
    WindowLabels(String, String, String),
    Footer {
        left: String,
        right: Option<String>,
        pill: Option<String>,
        pulse: bool,
    },
}

/// Alto de cada línea y del panel; el ancho lo fija el tamaño.
#[derive(Clone, Debug, PartialEq)]
pub(super) struct Plan {
    pub width: f32,
    /// Alto de la ventana del tamaño (137, 204 o 440).
    pub height: f32,
    /// Alto real del panel: lo que ocupa el contenido.
    pub content: f32,
    pub tops: Vec<f32>,
}

struct Words {
    es: bool,
}

impl Words {
    fn pick(&self, es: &'static str, en: &'static str) -> &'static str {
        if self.es { es } else { en }
    }
    fn laps(&self, laps: Option<f64>) -> String {
        laps.map_or_else(
            || PLACEHOLDER.into(),
            |l| format!("{l:.1} {}", self.pick("v", "laps")),
        )
    }
    fn lap(&self, lap: u32) -> String {
        format!("{} {lap}", self.pick("v", "lap"))
    }
}

fn litres(value: Option<f64>, decimals: usize) -> String {
    value.map_or_else(|| PLACEHOLDER.into(), |v| format!("{v:.decimals$} L"))
}

fn percent(value: Option<f64>, decimals: usize) -> String {
    value.map_or_else(
        || PLACEHOLDER.into(),
        |v| format!("{:.decimals$} %", v * 100.0),
    )
}

fn amount(resource: Resource, value: Option<f64>, decimals: usize) -> String {
    match resource {
        Resource::Fuel => litres(value, decimals),
        Resource::Energy => percent(value, decimals),
    }
}

fn clock(seconds: f64) -> String {
    let total = seconds.max(0.0).round() as u64;
    let (h, m, s) = (total / 3600, total / 60 % 60, total % 60);
    if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m}:{s:02}")
    }
}

fn fraction(level: Option<f64>, capacity: Option<f64>) -> Option<f32> {
    let (level, capacity) = (level?, capacity?);
    (capacity > 0.0).then(|| (level / capacity).clamp(0.0, 1.0) as f32)
}

fn limiting(board: &Board) -> Tank {
    match board.limit {
        Resource::Fuel => board.fuel,
        Resource::Energy => board.energy.unwrap_or_default(),
    }
}

/// Vuelta de parada teniendo en cuenta el retraso por FCY.
fn stop_lap(board: &Board, lap: u32) -> u32 {
    board.fcy.map_or(lap, |fcy| {
        u32::try_from(i64::from(lap) + fcy.shift).unwrap_or(lap)
    })
}

fn band(board: &Board) -> Option<Band> {
    if board.banner == Some(Banner::InPits) {
        return Some(Band::Pits);
    }
    if board.plan == Stop::Now {
        return Some(Band::Low);
    }
    match board.banner {
        Some(Banner::FullCourseYellow) => Some(Band::Fcy),
        _ if board.final_lap => board
            .lap
            .zip(board.laps_total)
            .map(|(lap, total)| Band::Final(lap, total)),
        Some(Banner::LocalYellow(sector)) => Some(Band::Yellow(sector)),
        _ => None,
    }
}

/// Líneas del Look para este tablero, tamaño, sesión e idioma.
pub(super) fn lines(
    board: Option<&Board>,
    options: &Options,
    session: Option<Session>,
    language: Language,
) -> Vec<Line> {
    let w = Words {
        es: language == Language::Es,
    };
    let mut out = Vec::new();
    let Some(board) = board.filter(|b| !crate::fuel::scene::waiting(b)) else {
        out.push(header(None, options, &w));
        waiting_lines(board, options, &w, &mut out);
        return out;
    };
    let band = band(board);
    if let Some(band) = band {
        out.push(Line::Banner(band));
    }
    out.push(header(Some(board), options, &w));
    match options.size {
        Size::Compact => out.push(compact(board, &w)),
        Size::Standard => standard(board, &w, &mut out),
        Size::Expanded => expanded(board, &w, &mut out),
    }
    if let Some(session) = session.filter(|s| *s != Session::Race) {
        let label = match (session, w.es) {
            (Session::Qualifying, true) => "CLASIFICACIÓN",
            (Session::Qualifying, false) => "QUALIFYING",
            (_, true) => "PRÁCTICA",
            (_, false) => "PRACTICE",
        };
        if let Some(Line::Header { left, .. }) = out
            .iter_mut()
            .find(|line| matches!(line, Line::Header { .. }))
        {
            *left = format!("FUEL · {label}");
        }
        if options.size == Size::Standard && band.is_none() && board.service.is_none() {
            session_lines(board, session, &w, &mut out);
        }
    }
    out
}

fn header(board: Option<&Board>, options: &Options, w: &Words) -> Line {
    let stint = board.and_then(|b| b.stint.number);
    let left = match (options.size, stint) {
        (Size::Expanded, Some(stint)) => {
            format!("{} · STINT {stint}", w.pick("FUEL Y STINT", "FUEL & STINT"))
        }
        (Size::Expanded, None) => w.pick("FUEL Y STINT", "FUEL & STINT").into(),
        _ => "FUEL".into(),
    };
    Line::Header {
        left,
        right: board.map_or_else(String::new, |b| b.class.to_uppercase()),
    }
}

fn waiting_lines(board: Option<&Board>, options: &Options, w: &Words, out: &mut Vec<Line>) {
    let spectator = board.is_some_and(|b| {
        !b.player_present
            && !matches!(
                b.source_state,
                vantare_domain::SourceState::Waiting | vantare_domain::SourceState::Lost
            )
    });
    if options.size == Size::Compact {
        out.push(Line::Big {
            left: PLACEHOLDER.into(),
            left_label: w.pick("vueltas", "laps").into(),
            right: PLACEHOLDER.into(),
            right_label: w.pick("parar en", "pit on").into(),
            tone: Ink::Plain,
            fraction: None,
            fill: Fill::Accent,
        });
    } else {
        for (es, en) in [
            ("En depósito", "In tank"),
            ("Por vuelta", "Per lap"),
            ("Restan", "Laps left"),
            ("Parar en", "Pit on"),
        ] {
            out.push(Line::Row {
                key: w.pick(es, en).into(),
                value: PLACEHOLDER.into(),
                tone: Ink::Plain,
                me: false,
            });
        }
    }
    out.push(Line::Footer {
        left: if spectator {
            w.pick(
                "Sin coche propio · espectador",
                "No car of your own · spectator",
            )
        } else {
            w.pick("Esperando al simulador", "Waiting for the simulator")
        }
        .into(),
        right: None,
        pill: None,
        pulse: true,
    });
}

/// Parada (o llegada) como texto, su color y la etiqueta de la fila.
fn plan_text(board: &Board, w: &Words) -> (&'static str, String, Ink) {
    match board.plan {
        Stop::Stop(lap) => (
            w.pick("Parar en", "Pit on"),
            w.lap(stop_lap(board, lap)),
            Ink::Plain,
        ),
        Stop::Now => (
            w.pick("Parar en", "Pit on"),
            w.pick("esta vuelta", "this lap").into(),
            Ink::Red,
        ),
        Stop::Finish(spare) => (
            w.pick("Llegada", "Finish"),
            format!(
                "{} {}",
                w.pick("sobran", "spare"),
                amount(board.limit, Some(spare.max(0.0)), 1)
            ),
            Ink::Green,
        ),
        Stop::Unknown => (w.pick("Parar en", "Pit on"), PLACEHOLDER.into(), Ink::Plain),
    }
}

fn compact(board: &Board, w: &Words) -> Line {
    if let Some(service) = board.service {
        return Line::Big {
            left: service
                .added_l
                .map_or_else(|| PLACEHOLDER.into(), |l| format!("{l:.1}")),
            left_label: service.target_l.map_or_else(
                || w.pick("L cargados", "L added").into(),
                |t| format!("/ {t:.1} L"),
            ),
            right: service
                .remaining_s
                .map_or_else(|| PLACEHOLDER.into(), |s| format!("{s:.1} s")),
            right_label: w.pick("faltan", "left").into(),
            tone: Ink::Plain,
            fraction: refuel_fraction(&service),
            fill: Fill::Refuel,
        };
    }
    let tank = limiting(board);
    let low = board.plan == Stop::Now;
    let (right, right_label, tone) = match board.plan {
        Stop::Stop(lap) => (
            w.lap(stop_lap(board, lap)),
            w.pick("parar en", "pit on"),
            Ink::Accent,
        ),
        Stop::Now => (
            w.pick("ahora", "now").into(),
            w.pick("entra esta vuelta", "pit this lap"),
            Ink::Red,
        ),
        Stop::Finish(spare) => (
            format!("+{}", amount(board.limit, Some(spare.max(0.0)), 1)),
            w.pick("llegas", "you finish"),
            Ink::Green,
        ),
        Stop::Unknown => (
            PLACEHOLDER.into(),
            w.pick("parar en", "pit on"),
            Ink::Accent,
        ),
    };
    Line::Big {
        left: board
            .laps_left
            .map_or_else(|| PLACEHOLDER.into(), |l| format!("{l:.1}")),
        left_label: w.pick("vueltas", "laps").into(),
        right,
        right_label: right_label.into(),
        tone,
        fraction: fraction(tank.level, tank.capacity),
        fill: if low { Fill::Red } else { Fill::Accent },
    }
}

fn standard(board: &Board, w: &Words, out: &mut Vec<Line>) {
    if let Some(service) = board.service {
        out.push(refuel_gauge(&service, w));
        let tyres = match (service.tyres, service.compound) {
            (Some(0), _) => w.pick("sin cambio", "no change").into(),
            (Some(n), Some(c)) => format!("{n} {} · {}", w.pick("nuevos", "new"), compound(c)),
            (Some(n), None) => format!("{n} {}", w.pick("nuevos", "new")),
            (None, _) => PLACEHOLDER.into(),
        };
        let exit = match (service.exit_l, service.exit_laps) {
            (Some(l), Some(laps)) => format!("{l:.1} L · {}", w.laps(Some(laps))),
            (Some(l), None) => format!("{l:.1} L"),
            _ => PLACEHOLDER.into(),
        };
        for (es, en, value, tone, me) in [
            (
                "Faltan",
                "Remaining",
                service
                    .remaining_s
                    .map_or_else(|| PLACEHOLDER.into(), |s| format!("{s:.1} s")),
                Ink::Hi,
                false,
            ),
            ("Neumáticos", "Tyres", tyres, Ink::Plain, false),
            ("Sales con", "Leave with", exit, Ink::Plain, true),
        ] {
            out.push(Line::Row {
                key: w.pick(es, en).into(),
                value,
                tone,
                me,
            });
        }
        return;
    }
    let tank = limiting(board);
    let low = board.plan == Stop::Now;
    let fcy = board.fcy;
    let (level_key, level, per_lap) = match board.limit {
        Resource::Fuel => (
            w.pick("En depósito", "In tank"),
            litres(tank.level, 1),
            litres(fcy.map(|f| f.per_lap_l).or(tank.per_lap), 2),
        ),
        Resource::Energy => (
            w.pick("Energía virtual", "Virtual energy"),
            percent(tank.level, 1),
            percent(tank.per_lap, 2),
        ),
    };
    let laps_tone = match board.plan {
        Stop::Now => Ink::Red,
        Stop::Finish(_) => Ink::Green,
        _ if fcy.is_some() => Ink::Amber,
        _ => Ink::Plain,
    };
    let (plan_key, plan_value, plan_tone) = plan_text(board, w);
    for (key, value, tone, me) in [
        (
            level_key,
            level,
            if low { Ink::Red } else { Ink::Hi },
            false,
        ),
        (
            w.pick("Por vuelta", "Per lap"),
            per_lap,
            if fcy.is_some() {
                Ink::Amber
            } else {
                Ink::Plain
            },
            false,
        ),
        (
            w.pick("Restan", "Laps left"),
            w.laps(fcy.map(|f| f.laps).or(board.laps_left)),
            laps_tone,
            false,
        ),
        (plan_key, plan_value, plan_tone, true),
    ] {
        out.push(Line::Row {
            key: key.into(),
            value,
            tone,
            me,
        });
    }
    secondary_footer(board, w, out);
    fcy_footer(board, w, out);
}

fn compound(compound: vantare_domain::TyreCompound) -> &'static str {
    match compound {
        vantare_domain::TyreCompound::Soft => "S",
        vantare_domain::TyreCompound::Medium => "M",
        vantare_domain::TyreCompound::Hard => "H",
        vantare_domain::TyreCompound::Wet => "W",
    }
}

fn refuel_gauge(service: &Service, w: &Words) -> Line {
    Line::Gauge {
        bar: Bar::Refuel,
        title: w.pick("REPOSTANDO", "REFUELLING").into(),
        pill: None,
        value: service
            .added_l
            .map_or_else(|| PLACEHOLDER.into(), |l| format!("{l:.1}")),
        suffix: service
            .target_l
            .map_or_else(|| " L".into(), |t| format!(" / {t:.1} L")),
        small: false,
        fraction: refuel_fraction(service),
        fill: Fill::Refuel,
    }
}

/// Barra de repostaje: solo con objetivo positivo (un cero no divide).
fn refuel_fraction(service: &Service) -> Option<f32> {
    let (added, target) = (service.added_l?, service.target_l?);
    (target > 0.0).then(|| (added / target).clamp(0.0, 1.0) as f32)
}

/// Con energía virtual: el otro recurso abajo y cuál limita.
fn secondary_footer(board: &Board, w: &Words, out: &mut Vec<Line>) {
    let Some(energy) = board.energy else {
        return;
    };
    let (left, pill) = match board.limit {
        Resource::Energy => (
            format!(
                "{} {} · {}",
                w.pick("Combustible", "Fuel"),
                litres(board.fuel.level, 1),
                w.laps(board.fuel.laps)
            ),
            w.pick("Limita: energía", "Limit: energy"),
        ),
        Resource::Fuel => (
            format!(
                "{} {} · {}",
                w.pick("Energía", "Energy"),
                percent(energy.level, 1),
                w.laps(energy.laps)
            ),
            w.pick("Limita: combustible", "Limit: fuel"),
        ),
    };
    out.push(Line::Footer {
        left,
        right: None,
        pill: Some(pill.into()),
        pulse: false,
    });
}

fn fcy_footer(board: &Board, w: &Words, out: &mut Vec<Line>) {
    let Some(fcy) = board.fcy else {
        return;
    };
    out.push(Line::Footer {
        left: format!(
            "{} −{:.0} %",
            w.pick("Ahorro FCY", "FCY saving"),
            fcy.saving * 100.0
        ),
        right: Some(format!(
            "{} {:+} {}",
            w.pick("parada", "stop"),
            fcy.shift,
            w.pick("v", "laps")
        )),
        pill: None,
        pulse: false,
    });
}

fn expanded(board: &Board, w: &Words, out: &mut Vec<Line>) {
    if let Some(service) = board.service {
        out.push(refuel_gauge(&service, w));
    }
    let limit_pill = || Some(w.pick("LIMITA", "LIMIT").into());
    if let Some(energy) = board.energy {
        let limits = board.limit == Resource::Energy;
        out.push(Line::Gauge {
            bar: Bar::Energy,
            title: w.pick("ENERGÍA VIRTUAL", "VIRTUAL ENERGY").into(),
            pill: if limits { limit_pill() } else { None },
            value: percent(energy.level, 1),
            suffix: String::new(),
            small: !limits,
            fraction: energy.level.map(|l| l.clamp(0.0, 1.0) as f32),
            fill: if limits { Fill::Accent } else { Fill::Fuel },
        });
    }
    let fuel_limits = board.limit == Resource::Fuel;
    out.push(Line::Gauge {
        bar: Bar::Fuel,
        title: w.pick("COMBUSTIBLE", "FUEL").into(),
        pill: if fuel_limits && board.energy.is_some() {
            limit_pill()
        } else {
            None
        },
        value: litres(board.fuel.level, 1),
        suffix: board
            .fuel
            .capacity
            .map_or_else(String::new, |c| format!(" / {c:.0}")),
        small: !fuel_limits,
        fraction: fraction(board.fuel.level, board.fuel.capacity),
        fill: match (fuel_limits, board.plan) {
            (true, Stop::Now) => Fill::Red,
            (true, _) => Fill::Accent,
            (false, _) => Fill::Fuel,
        },
    });
    out.push(tiles(board, w));
    if let Some((values, average)) = spark(board) {
        let average_text = board.fuel.per_lap.map(|l| format!("{l:.2} L"));
        let energy = board
            .energy
            .and_then(|e| e.per_lap)
            .map(|e| percent(Some(e), 2));
        let right = [average_text, energy]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();
        out.push(Line::Sub {
            left: w
                .pick("CONSUMO · ÚLTIMAS 10 VUELTAS", "CONSUMPTION · LAST 10 LAPS")
                .into(),
            right: if right.is_empty() {
                String::new()
            } else {
                format!(
                    "{} {}",
                    w.pick("MEDIA 3 VUELTAS", "LAST 3 AVG"),
                    right.join(" · ")
                )
            },
        });
        out.push(Line::Spark { values, average });
    }
    window_lines(board, w, out);
    stint_footer(board, w, out);
    // Los medidores ya dicen qué recurso limita: sin pie secundario.
    fcy_footer(board, w, out);
}

fn tiles(board: &Board, w: &Words) -> Line {
    let tank = limiting(board);
    let fcy = board.fcy.filter(|_| board.limit == Resource::Fuel);
    let per_lap = match board.limit {
        Resource::Fuel => litres(fcy.map(|f| f.per_lap_l).or(tank.per_lap), 2),
        Resource::Energy => percent(tank.per_lap, 2),
    };
    let (stop, stop_tone) = match board.plan {
        Stop::Stop(lap) => (w.lap(stop_lap(board, lap)), Ink::Accent),
        Stop::Now => (w.pick("ahora", "now").into(), Ink::Red),
        Stop::Finish(_) => (w.pick("meta", "finish").into(), Ink::Green),
        Stop::Unknown => (PLACEHOLDER.into(), Ink::Accent),
    };
    let add = match (board.finish, board.plan) {
        (Some(finish), _) => format!("+{:.1} L", finish.add_l),
        (None, Stop::Finish(_)) => "0 L".into(),
        _ => PLACEHOLDER.into(),
    };
    Line::Tiles(vec![
        (
            w.pick("POR VUELTA", "PER LAP").into(),
            per_lap,
            if fcy.is_some() { Ink::Amber } else { Ink::Hi },
        ),
        (
            w.pick("RESTAN", "LAPS LEFT").into(),
            w.laps(fcy.map(|f| f.laps).or(board.laps_left)),
            match board.plan {
                Stop::Now => Ink::Red,
                _ if fcy.is_some() => Ink::Amber,
                _ => Ink::Hi,
            },
        ),
        (w.pick("PARAR EN", "PIT ON").into(), stop, stop_tone),
        (w.pick("AÑADIR", "ADD").into(), add, Ink::Hi),
    ])
}

/// Consumo normalizado de las vueltas válidas y su media, si hay dos o más.
fn spark(board: &Board) -> Option<(Vec<f32>, f32)> {
    let values: Vec<f64> = board.positive_history().collect();
    if values.len() < 2 {
        return None;
    }
    let average = values.iter().sum::<f64>() / values.len() as f64;
    let low = values.iter().copied().fold(f64::INFINITY, f64::min);
    let high = values.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let margin = ((high - low) * 0.15).max(0.05);
    let (low, high) = (low - margin, high + margin);
    let at = |value: f64| ((value - low) / (high - low)) as f32;
    Some((values.iter().map(|&v| at(v)).collect(), at(average)))
}

fn window_lines(board: &Board, w: &Words, out: &mut Vec<Line>) {
    let (Some(window), Some(lap)) = (board.window, board.lap) else {
        return;
    };
    let close = stop_lap(board, window.close);
    let total = window.total.max(close).max(1) as f32;
    out.push(Line::Sub {
        left: w.pick("VENTANA DE PARADA", "PIT WINDOW").into(),
        right: format!("{} – {}", w.lap(window.open), w.lap(close)).to_uppercase(),
    });
    out.push(Line::Window {
        open: (window.open.saturating_sub(1)) as f32 / total,
        close: close as f32 / total,
        now: lap as f32 / total,
    });
    out.push(Line::WindowLabels(
        w.lap(1),
        format!("{} {}", w.pick("actual", "now"), w.lap(lap)),
        w.lap(window.total.max(close)),
    ));
}

fn stint_footer(board: &Board, w: &Words, out: &mut Vec<Line>) {
    let mut left = Vec::new();
    left.push(
        board
            .stint
            .number
            .map_or_else(|| "Stint".to_owned(), |number| format!("Stint {number}")),
    );
    if let Some(laps) = board.stint.laps {
        left.push(format!("{laps} {}", w.pick("v", "laps")));
    }
    if let Some(seconds) = board.stint.elapsed_s {
        left.push(clock(seconds));
    }
    let right = match (board.finish, board.plan) {
        (Some(finish), _) => Some(format!(
            "{}: {} · +{:.1} L",
            w.pick("Para terminar", "To finish"),
            match (finish.stops, w.es) {
                (1, true) => "1 parada más".to_owned(),
                (1, false) => "1 more stop".to_owned(),
                (n, true) => format!("{n} paradas más"),
                (n, false) => format!("{n} more stops"),
            },
            finish.add_l
        )),
        (None, Stop::Finish(_)) => Some(w.pick("Llegas a meta", "You reach the finish").into()),
        _ => None,
    };
    if left.len() == 1 && board.stint.number.is_none() && right.is_none() {
        return;
    }
    out.push(Line::Footer {
        left: left.join(" · "),
        right,
        pill: None,
        pulse: false,
    });
}

/// Práctica o clasificación en el tamaño estándar: mismas filas, otros datos.
fn session_lines(board: &Board, session: Session, w: &Words, out: &mut Vec<Line>) {
    out.truncate(1);
    let qualifying = session == Session::Qualifying;
    let tank = limiting(board);
    let (level_key, level, average) = match board.limit {
        Resource::Fuel => (
            w.pick("En depósito", "In tank"),
            litres(tank.level, 1),
            litres(tank.per_lap, 2),
        ),
        Resource::Energy => (
            w.pick("Energía virtual", "Virtual energy"),
            percent(tank.level, 1),
            percent(tank.per_lap, 2),
        ),
    };
    let (plan_key, plan_value, plan_tone) = plan_text(board, w);
    let rows = [
        (level_key, level, Ink::Hi),
        (
            w.pick("Media últimas 3 v", "Last 3 laps avg"),
            average,
            Ink::Plain,
        ),
        (
            w.pick("Restan", "Laps left"),
            w.laps(board.laps_left),
            Ink::Plain,
        ),
        (plan_key, plan_value, plan_tone),
    ];
    for (index, (key, value, tone)) in rows.into_iter().enumerate() {
        if index == 2 && !qualifying {
            let last = (board.limit == Resource::Fuel)
                .then(|| board.history.last().and_then(|entry| entry.consumed))
                .flatten();
            out.push(Line::Row {
                key: w.pick("Última vuelta", "Last lap").into(),
                value: amount(board.limit, last, 2),
                tone: if last.zip(tank.per_lap).is_some_and(|(a, b)| a < b) {
                    Ink::Green
                } else {
                    Ink::Plain
                },
                me: false,
            });
        }
        out.push(Line::Row {
            key: key.into(),
            value,
            tone,
            me: index == 3,
        });
    }
    out.push(Line::Footer {
        left: if qualifying {
            w.pick("Carga mínima para el plan: —", "Minimum fuel for plan: —")
                .into()
        } else {
            format!(
                "{}: {}",
                w.pick("Tanda", "Run"),
                board.stint.laps.map_or_else(
                    || PLACEHOLDER.into(),
                    |n| format!("{n} {}", w.pick("v", "laps"))
                )
            )
        },
        right: None,
        pill: None,
        pulse: false,
    });
}

fn height(line: &Line, style: &Style, variant: &Variant) -> f32 {
    let g = &style.geometry;
    let f = &style.fuel;
    match line {
        Line::Banner(_) => g.banner_height + g.banner_gap - variant.padding_y,
        Line::Header { .. } => variant.header_height + variant.header_gap,
        Line::Big { .. } => f.big_height,
        Line::Gauge { .. } => f.gauge_height,
        Line::Row { .. } => g.row_height,
        Line::Tiles(_) => f.tile_height + 2.0 * f.tile_margin,
        Line::Sub { .. } => f.sub_height,
        Line::Spark { .. } => f.spark_height,
        Line::Window { .. } => f.window_height,
        Line::WindowLabels(..) => f.window_labels,
        Line::Footer { .. } => g.footer_gap + 1.0 + g.footer_gap + g.footer_height,
    }
}

pub(super) fn plan(lines: &[Line], options: &Options, style: &Style) -> Plan {
    let variant = options.variant(style);
    let mut y = variant.padding_y;
    let mut tops = Vec::with_capacity(lines.len());
    for line in lines {
        if matches!(line, Line::Banner(_)) {
            // La franja ocupa el borde superior del panel.
            tops.push(0.0);
            y = style.geometry.banner_height + style.geometry.banner_gap;
            continue;
        }
        tops.push(y);
        y += height(line, style, variant);
    }
    Plan {
        width: options.width(style),
        content: y + variant.padding_y,
        height: match options.size {
            // Incluye el pie de espera y ambos márgenes: 137 px en Neo.
            Size::Compact => {
                2.0 * variant.padding_y
                    + variant.header_height
                    + variant.header_gap
                    + style.fuel.big_height
                    + 2.0 * style.geometry.footer_gap
                    + 1.0
                    + style.geometry.footer_height
            }
            Size::Standard => 204.0,
            Size::Expanded => 440.0,
        },
        tops,
    }
}

/// Fracciones que el Look va a pintar; los demás canales conservan su estado.
pub(super) fn targets(lines: &[Line]) -> Vec<(Bar, f32)> {
    lines
        .iter()
        .filter_map(|line| match line {
            Line::Big { fraction, .. } => Some((Bar::Compact, (*fraction)?)),
            Line::Gauge { bar, fraction, .. } => Some((*bar, (*fraction)?)),
            Line::Window { now, .. } => Some((Bar::Now, *now)),
            _ => None,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn options(size: Size) -> Options {
        Options {
            tone: Tone::Neo,
            accent: Accent::Red,
            size,
            brand: false,
        }
    }
    /// Textos visibles en el orden en que se pintan (igual que el Look).
    fn texts(lines: &[Line]) -> Vec<String> {
        lines
            .iter()
            .flat_map(|line| match line {
                Line::Header { left, right } => vec![left.clone(), right.clone()],
                Line::Big {
                    left,
                    right,
                    left_label,
                    right_label,
                    ..
                } => vec![
                    left.clone(),
                    right.clone(),
                    left_label.clone(),
                    right_label.clone(),
                ],
                Line::Gauge {
                    title,
                    value,
                    suffix,
                    pill,
                    ..
                } => {
                    let mut cells = vec![title.clone(), value.clone(), suffix.clone()];
                    if let Some(pill) = pill {
                        cells.push(pill.clone());
                    }
                    cells
                }
                Line::Row { key, value, .. } => vec![key.clone(), value.clone()],
                Line::Tiles(tiles) => tiles
                    .iter()
                    .flat_map(|(label, value, _)| [label.clone(), value.clone()])
                    .collect(),
                Line::Sub { left, right } => vec![left.clone(), right.clone()],
                Line::WindowLabels(first, now, last) => {
                    vec![first.clone(), now.clone(), last.clone()]
                }
                Line::Footer { left, right, .. } => {
                    let mut cells = vec![left.clone()];
                    if let Some(right) = right {
                        cells.push(right.clone());
                    }
                    cells
                }
                Line::Banner(_) | Line::Spark { .. } | Line::Window { .. } => Vec::new(),
            })
            .collect()
    }
    fn of(board: &Board, size: Size, session: Option<Session>) -> Vec<Line> {
        lines(Some(board), &options(size), session, Language::Es)
    }

    #[test]
    fn catalogue_sizes_keep_their_widths_heights_and_rows() {
        let style = Style::compiled();
        let board = crate::fuel::board(11.3, 25);
        for (size, width, height) in [
            (Size::Compact, 230.0, 137.0),
            (Size::Standard, 300.0, 204.0),
            (Size::Expanded, 460.0, 440.0),
        ] {
            let rows = of(&board, size, Some(Session::Race));
            let plan = super::plan(&rows, &options(size), &style);
            assert_eq!((plan.width, plan.height), (width, height), "{size:?}");
            assert!(plan.content <= plan.height, "{size:?}: cabe en el marco");
        }
    }

    #[test]
    fn standard_race_rows_keep_the_gpui_values_and_order() {
        let board = crate::fuel::board(11.3, 25);
        let rows = of(&board, Size::Standard, Some(Session::Race));
        let values = texts(&rows);
        assert_eq!(
            values,
            [
                "FUEL",
                "",
                "En depósito",
                "4.4 L",
                "Por vuelta",
                "3.71 L",
                "Restan",
                "11.3 v",
                "Parar en",
                "v 32"
            ]
        );
    }

    #[test]
    fn low_fuel_adds_the_red_band_and_asks_to_stop_now() {
        let board = crate::fuel::board(1.2, 17);
        let rows = of(&board, Size::Standard, Some(Session::Race));
        assert_eq!(rows[0], Line::Banner(Band::Low));
        assert_eq!(
            texts(&rows),
            [
                "FUEL",
                "",
                "En depósito",
                "4.4 L",
                "Por vuelta",
                "3.71 L",
                "Restan",
                "1.2 v",
                "Parar en",
                "esta vuelta"
            ]
        );
    }

    #[test]
    fn expanded_paints_energy_tiles_spark_and_the_pit_window() {
        let mut photo = crate::fuel::photo(11.3, 25);
        let player = photo.state.player.as_mut().expect("player");
        player.fuel.energy = vantare_domain::Quality::Reliable(0.614);
        player.fuel.energy_per_lap = vantare_domain::Quality::Reliable(0.0482);
        for (slot, (lap, litres)) in [(10, 2.21), (11, 2.08), (12, 2.26), (13, 2.12)]
            .into_iter()
            .enumerate()
        {
            player.fuel.history[slot] = Some((lap, litres));
        }
        let board = crate::fuel::board_of(&photo);
        let rows = of(&board, Size::Expanded, Some(Session::Race));
        let values = texts(&rows);
        for expected in [
            "FUEL Y STINT · STINT 2",
            "ENERGÍA VIRTUAL",
            "LIMITA",
            "COMBUSTIBLE",
            "POR VUELTA",
            "AÑADIR",
            "CONSUMO · ÚLTIMAS 10 VUELTAS",
            "VENTANA DE PARADA",
            "Stint 2",
        ] {
            assert!(values.iter().any(|value| value == expected), "{expected}");
        }
        assert!(
            rows.iter()
                .any(|line| matches!(line, Line::Spark { values, .. } if values.len() == 4))
        );
    }

    #[test]
    fn practice_and_qualifying_relabel_the_same_rows() {
        let board = crate::fuel::board(11.3, 25);
        let practice = of(&board, Size::Standard, Some(Session::Practice));
        assert_eq!(
            practice[0],
            Line::Header {
                left: "FUEL · PRÁCTICA".into(),
                right: String::new(),
            }
        );
        assert_eq!(
            texts(&practice)
                .iter()
                .filter(|v| v.as_str() == "Última vuelta")
                .count(),
            1
        );
        let qualifying = of(&board, Size::Standard, Some(Session::Qualifying));
        assert_eq!(
            qualifying[0],
            Line::Header {
                left: "FUEL · CLASIFICACIÓN".into(),
                right: String::new(),
            }
        );
        assert!(!texts(&qualifying).iter().any(|v| v == "Última vuelta"));
    }

    #[test]
    fn waiting_keeps_the_frame_with_placeholders_and_the_simulator_text() {
        let mut photo = crate::fuel::photo(11.3, 25);
        photo.state.source_state = vantare_domain::SourceState::Waiting;
        let board = crate::fuel::board_of(&photo);
        let rows = of(&board, Size::Compact, None);
        let values = texts(&rows);
        assert_eq!(
            values,
            [
                "FUEL",
                "",
                "—",
                "—",
                "vueltas",
                "parar en",
                "Esperando al simulador"
            ]
        );
    }

    #[test]
    fn refuelling_switches_standard_rows_to_the_service() {
        let mut photo = crate::fuel::photo(11.3, 25);
        photo.state.cars[0].in_pits = vantare_domain::Quality::Reliable(true);
        let player = photo.state.player.as_mut().expect("player");
        player.pit_service.refuel_target_l = vantare_domain::Quality::Reliable(58.0);
        player.pit_service.refuel_added_l = vantare_domain::Quality::Reliable(34.1);
        player.pit_service.remaining_s = vantare_domain::Quality::Reliable(9.8);
        player.pit_service.tyres = vantare_domain::Quality::Reliable(4);
        let board = crate::fuel::board_of(&photo);
        let rows = of(&board, Size::Standard, Some(Session::Race));
        let values = texts(&rows);
        assert_eq!(rows[0], Line::Banner(Band::Pits));
        for expected in ["REPOSTANDO", "34.1", " / 58.0 L", "9.8 s", "4 nuevos · M"] {
            assert!(values.iter().any(|value| value == expected), "{expected}");
        }
    }
}
