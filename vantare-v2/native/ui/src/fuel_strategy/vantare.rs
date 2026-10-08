//! Fuel y stint en el sistema de diseño Vantare (#1497), según el catálogo r10b.
//!
//! El ViewModel es puro (`vantare_domain::fuel_vantare`); aquí se eligen las
//! líneas de cada tamaño (compacto, estándar, ampliado) y estado, se miden y se
//! pintan con el kit Vantare. Las barras se deslizan al cambiar de valor y el
//! borde late con combustible bajo.

use crate::app::Wake;
use crate::efficiency::preview::PaintWindow as Window;
use crate::efficiency::text;
use crate::standings::{Accent, Look};
use crate::vantare::paint::{Face, Kit, round_rect};
use crate::vantare::style::{Color, Style, Variant};
use gpui::{App, BorderStyle, Corners, Edges, PathBuilder, point, px, quad};
use std::sync::Arc;
use std::time::{Duration, Instant};
use vantare_domain::format::{Language, PLACEHOLDER};
use vantare_domain::fuel_vantare::{Banner, Board, Plan, Resource, Tank};
use vantare_domain::{SourceState, TyreCompound};

// ---------------------------------------------------------------------------
// Opciones
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) enum Size {
    Compact,
    #[default]
    Standard,
    Expanded,
}

impl Size {
    pub(crate) fn from_name(name: &str) -> Self {
        match name {
            "compact" => Self::Compact,
            "expanded" => Self::Expanded,
            _ => Self::Standard,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Options {
    pub look: Look,
    pub accent: Accent,
    pub size: Size,
    /// Marca Vantare en la cabecera (`brandVisible`, decidido por la licencia).
    pub brand: bool,
}

impl Options {
    pub(crate) fn from_settings(settings: &super::Settings) -> Self {
        Self {
            look: settings.style,
            accent: settings.accent,
            size: Size::from_name(&settings.size),
            brand: settings.brand_visible == Some(true),
        }
    }

    fn variant<'a>(&self, style: &'a Style) -> &'a Variant {
        match self.look {
            Look::Neo => &style.styles.neo,
            Look::Neutro => &style.styles.neutro,
        }
    }

    fn accent(&self, style: &Style) -> Color {
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

// ---------------------------------------------------------------------------
// Líneas (puro)
// ---------------------------------------------------------------------------

/// Color de un valor.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Tone {
    Plain,
    Hi,
    Red,
    Amber,
    Green,
    Accent,
}

/// Relleno de una barra.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Fill {
    Accent,
    Fuel,
    Refuel,
    Red,
}

/// Barras animadas: cada una se desliza desde su valor anterior.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Bar {
    Compact,
    Energy,
    Fuel,
    Refuel,
    Now,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Band {
    Low,
    Pits,
    Fcy,
    Yellow(u8),
    Final(u32, u32),
}

#[derive(Clone, Debug, PartialEq)]
enum Line {
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
        tone: Tone,
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
        tone: Tone,
        me: bool,
    },
    Tiles(Vec<(String, String, Tone)>),
    Sub {
        left: String,
        right: String,
    },
    Spark,
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

/// Textos en el idioma del widget.
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

/// Cantidad del recurso en su unidad (litros o % de energía).
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

fn waiting(board: Option<&Board>) -> bool {
    board.is_none_or(|b| {
        !b.player_present || matches!(b.source_state, SourceState::Waiting | SourceState::Lost)
    })
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
    let in_pits = board.banner == Some(Banner::InPits);
    if in_pits {
        return Some(Band::Pits);
    }
    if board.plan == Plan::Now {
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

fn lines(board: Option<&Board>, options: &Options, es: bool) -> Vec<Line> {
    let w = Words { es };
    let mut out = Vec::new();
    let Some(board) = board.filter(|b| !waiting(Some(b))) else {
        out.push(header(None, options, &w));
        waiting_lines(board, options, &w, &mut out);
        return out;
    };
    if let Some(band) = band(board) {
        out.push(Line::Banner(band));
    }
    out.push(header(Some(board), options, &w));
    match options.size {
        Size::Compact => out.push(compact(board, &w)),
        Size::Standard => standard(board, &w, &mut out),
        Size::Expanded => expanded(board, &w, &mut out),
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
        !b.player_present && !matches!(b.source_state, SourceState::Waiting | SourceState::Lost)
    });
    if options.size == Size::Compact {
        out.push(Line::Big {
            left: PLACEHOLDER.into(),
            left_label: w.pick("vueltas", "laps").into(),
            right: PLACEHOLDER.into(),
            right_label: w.pick("parar en", "pit on").into(),
            tone: Tone::Plain,
            fraction: None,
            fill: Fill::Accent,
        });
    } else {
        for (key, me) in [
            (w.pick("En depósito", "In tank"), false),
            (w.pick("Por vuelta", "Per lap"), false),
            (w.pick("Restan", "Laps left"), false),
            (w.pick("Parar en", "Pit on"), false),
        ] {
            out.push(Line::Row {
                key: key.into(),
                value: PLACEHOLDER.into(),
                tone: Tone::Plain,
                me,
            });
        }
    }
    out.push(Line::Footer {
        left: if spectator {
            w.pick("Sin coche propio · espectador", "No car of your own · spectator")
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
fn plan_text(board: &Board, w: &Words) -> (&'static str, String, Tone) {
    match board.plan {
        Plan::Stop(lap) => (
            w.pick("Parar en", "Pit on"),
            w.lap(stop_lap(board, lap)),
            Tone::Plain,
        ),
        Plan::Now => (
            w.pick("Parar en", "Pit on"),
            w.pick("esta vuelta", "this lap").into(),
            Tone::Red,
        ),
        Plan::Finish(spare) => (
            w.pick("Llegada", "Finish"),
            format!(
                "{} {}",
                w.pick("sobran", "spare"),
                amount(board.limit, Some(spare.max(0.0)), 1)
            ),
            Tone::Green,
        ),
        Plan::Unknown => (w.pick("Parar en", "Pit on"), PLACEHOLDER.into(), Tone::Plain),
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
            tone: Tone::Plain,
            fraction: refuel_fraction(&service),
            fill: Fill::Refuel,
        };
    }
    let tank = limiting(board);
    let low = board.plan == Plan::Now;
    let (right, right_label, tone) = match board.plan {
        Plan::Stop(lap) => (
            w.lap(stop_lap(board, lap)),
            w.pick("parar en", "pit on"),
            Tone::Accent,
        ),
        Plan::Now => (
            w.pick("ahora", "now").into(),
            w.pick("entra esta vuelta", "pit this lap"),
            Tone::Red,
        ),
        Plan::Finish(spare) => (
            format!("+{}", amount(board.limit, Some(spare.max(0.0)), 1)),
            w.pick("llegas", "you finish"),
            Tone::Green,
        ),
        Plan::Unknown => (PLACEHOLDER.into(), w.pick("parar en", "pit on"), Tone::Accent),
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
        for (key, value, tone, me) in [
            (
                w.pick("Faltan", "Remaining"),
                service
                    .remaining_s
                    .map_or_else(|| PLACEHOLDER.into(), |s| format!("{s:.1} s")),
                Tone::Hi,
                false,
            ),
            (w.pick("Neumáticos", "Tyres"), tyres, Tone::Plain, false),
            (w.pick("Sales con", "Leave with"), exit, Tone::Plain, true),
        ] {
            out.push(Line::Row {
                key: key.into(),
                value,
                tone,
                me,
            });
        }
        return;
    }
    let tank = limiting(board);
    let low = board.plan == Plan::Now;
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
        Plan::Now => Tone::Red,
        Plan::Finish(_) => Tone::Green,
        _ if fcy.is_some() => Tone::Amber,
        _ => Tone::Plain,
    };
    let (plan_key, plan_value, plan_tone) = plan_text(board, w);
    for (key, value, tone, me) in [
        (level_key, level, if low { Tone::Red } else { Tone::Hi }, false),
        (
            w.pick("Por vuelta", "Per lap"),
            per_lap,
            if fcy.is_some() { Tone::Amber } else { Tone::Plain },
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

fn compound(compound: TyreCompound) -> &'static str {
    match compound {
        TyreCompound::Soft => "S",
        TyreCompound::Medium => "M",
        TyreCompound::Hard => "H",
        TyreCompound::Wet => "W",
    }
}

fn refuel_gauge(service: &vantare_domain::fuel_vantare::Service, w: &Words) -> Line {
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

/// Barra de repostaje: solo con objetivo.
fn refuel_fraction(service: &vantare_domain::fuel_vantare::Service) -> Option<f32> {
    let (added, target) = (service.added_l?, service.target_l?);
    Some((added / target).clamp(0.0, 1.0) as f32)
}

/// Con energía virtual: el otro recurso abajo y cuál limita.
fn secondary_footer(board: &Board, w: &Words, out: &mut Vec<Line>) {
    let Some(energy) = board.energy else { return };
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
    let Some(fcy) = board.fcy else { return };
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
            (true, Plan::Now) => Fill::Red,
            (true, _) => Fill::Accent,
            (false, _) => Fill::Fuel,
        },
    });
    out.push(tiles(board, w));
    if board.history.len() >= 2 {
        let average = board.fuel.per_lap.map(|l| format!("{l:.2} L"));
        let energy = board.energy.and_then(|e| e.per_lap).map(|e| percent(Some(e), 2));
        let right = [average, energy].into_iter().flatten().collect::<Vec<_>>();
        out.push(Line::Sub {
            left: w
                .pick(
                    "CONSUMO · ÚLTIMAS 10 VUELTAS",
                    "CONSUMPTION · LAST 10 LAPS",
                )
                .into(),
            right: if right.is_empty() {
                String::new()
            } else {
                format!("{} {}", w.pick("MEDIA", "AVG"), right.join(" · "))
            },
        });
        out.push(Line::Spark);
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
        Plan::Stop(lap) => (w.lap(stop_lap(board, lap)), Tone::Accent),
        Plan::Now => (w.pick("ahora", "now").into(), Tone::Red),
        Plan::Finish(_) => (w.pick("meta", "finish").into(), Tone::Green),
        Plan::Unknown => (PLACEHOLDER.into(), Tone::Accent),
    };
    let add = match (board.finish, board.plan) {
        (Some(finish), _) => format!("+{:.1} L", finish.add_l),
        (None, Plan::Finish(_)) => "0 L".into(),
        _ => PLACEHOLDER.into(),
    };
    Line::Tiles(vec![
        (
            w.pick("POR VUELTA", "PER LAP").into(),
            per_lap,
            if fcy.is_some() { Tone::Amber } else { Tone::Hi },
        ),
        (
            w.pick("RESTAN", "LAPS LEFT").into(),
            w.laps(fcy.map(|f| f.laps).or(board.laps_left)),
            match board.plan {
                Plan::Now => Tone::Red,
                _ if fcy.is_some() => Tone::Amber,
                _ => Tone::Hi,
            },
        ),
        (w.pick("PARAR EN", "PIT ON").into(), stop, stop_tone),
        (w.pick("AÑADIR", "ADD").into(), add, Tone::Hi),
    ])
}

fn window_lines(board: &Board, w: &Words, out: &mut Vec<Line>) {
    let (Some(window), Some(lap)) = (board.window, board.lap) else {
        return;
    };
    let close = stop_lap(board, window.close);
    let total = window.total.max(close).max(1) as f32;
    out.push(Line::Sub {
        left: w.pick("VENTANA DE PARADA", "PIT WINDOW").into(),
        right: format!(
            "{} – {}",
            w.lap(window.open),
            w.lap(close)
        )
        .to_uppercase(),
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
    // Sin número de paradas (ACC) el pie sigue diciendo de qué es el dato.
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
        (None, Plan::Finish(_)) => Some(w.pick("Llegas a meta", "You reach the finish").into()),
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

// ---------------------------------------------------------------------------
// Medidas
// ---------------------------------------------------------------------------

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
        Line::Spark => f.spark_height,
        Line::Window { .. } => f.window_height,
        Line::WindowLabels(..) => f.window_labels,
        Line::Footer { .. } => g.footer_gap + 1.0 + g.footer_gap + g.footer_height,
    }
}

#[derive(Clone, Debug, PartialEq)]
struct Plan2 {
    width: f32,
    height: f32,
    /// Tipo y y de cada línea (sin textos: no dependen del idioma).
    tops: Vec<f32>,
}

fn layout(board: Option<&Board>, options: &Options, style: &Style) -> Plan2 {
    let variant = options.variant(style);
    let mut y = variant.padding_y;
    let mut tops = Vec::new();
    for line in lines(board, options, true) {
        if matches!(line, Line::Banner(_)) {
            // La franja ocupa el borde superior del panel.
            tops.push(0.0);
            y = style.geometry.banner_height + style.geometry.banner_gap;
            continue;
        }
        tops.push(y);
        y += height(&line, style, variant);
    }
    Plan2 {
        width: options.width(style),
        height: y + variant.padding_y,
        tops,
    }
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

/// Deslizamiento de una barra entre dos fracciones.
#[derive(Clone, Copy, Debug)]
struct Ease {
    bar: Bar,
    from: f32,
    to: f32,
    start: Instant,
}

impl Ease {
    fn value(&self, now: Instant, duration: Duration) -> f32 {
        let t = if duration.is_zero() {
            1.0
        } else {
            (now.saturating_duration_since(self.start).as_secs_f32() / duration.as_secs_f32())
                .clamp(0.0, 1.0)
        };
        // Salida suave (cúbica).
        let k = 1.0 - (1.0 - t).powi(3);
        self.from + (self.to - self.from) * k
    }

    fn moving(&self, now: Instant, duration: Duration) -> bool {
        self.from != self.to && now.saturating_duration_since(self.start) < duration
    }
}

fn targets(board: Option<&Board>, options: &Options) -> Vec<(Bar, f32)> {
    lines(board, options, true)
        .into_iter()
        .filter_map(|line| match line {
            Line::Big { fraction, .. } => Some((Bar::Compact, fraction?)),
            Line::Gauge { bar, fraction, .. } => Some((bar, fraction?)),
            Line::Window { now, .. } => Some((Bar::Now, now)),
            _ => None,
        })
        .collect()
}

#[derive(Clone)]
pub(crate) struct State {
    pub options: Options,
    pub style: Arc<Style>,
    pub board: Option<Board>,
    plan: Plan2,
    bars: Vec<Ease>,
    started: Instant,
}

impl State {
    pub(crate) fn new(options: Options) -> Self {
        let style = Style::compiled();
        let plan = layout(None, &options, &style);
        Self {
            options,
            style,
            board: None,
            plan,
            bars: Vec::new(),
            started: Instant::now(),
        }
    }

    pub(crate) fn project(snapshot: &vantare_domain::Snapshot) -> Board {
        vantare_domain::fuel_vantare::project(snapshot)
    }

    fn duration(&self) -> Duration {
        self.style.motion.timing().reorder
    }

    pub(crate) fn ingest(&mut self, board: Board) -> bool {
        if self.board.as_ref() == Some(&board) {
            return false;
        }
        self.board = Some(board);
        self.plan = layout(self.board.as_ref(), &self.options, &self.style);
        let now = Instant::now();
        let duration = self.duration();
        let mut next = Vec::new();
        for (bar, to) in targets(self.board.as_ref(), &self.options) {
            // Aparecer no anima: solo cambiar de valor.
            let from = self
                .bars
                .iter()
                .find(|e| e.bar == bar)
                .map_or(to, |e| e.value(now, duration));
            next.push(Ease {
                bar,
                from,
                to,
                start: now,
            });
        }
        self.bars = next;
        true
    }

    pub(crate) fn settle(&mut self) {
        for ease in &mut self.bars {
            ease.from = ease.to;
        }
    }

    pub(crate) fn set_style(&mut self, style: Arc<Style>) {
        self.style = style;
        self.plan = layout(self.board.as_ref(), &self.options, &self.style);
    }

    pub(crate) fn size(&self) -> (f32, f32) {
        (self.plan.width, self.plan.height)
    }

    fn low(&self) -> bool {
        self.board
            .as_ref()
            .is_some_and(|b| !waiting(Some(b)) && b.plan == Plan::Now && b.service.is_none())
    }

    pub(crate) fn wake(&self, now: Instant) -> Wake {
        let duration = self.duration();
        if self.bars.iter().any(|e| e.moving(now, duration)) {
            Wake::Frame
        } else if self.low() {
            // El latido del borde es lento: unos 20 fotogramas por segundo bastan.
            Wake::At(Duration::from_millis(50))
        } else {
            Wake::Idle
        }
    }

    pub(crate) fn paint(&self, language: Language, window: &mut Window, cx: &mut App) {
        let now = Instant::now();
        let duration = self.duration();
        let bar = |bar: Bar, target: f32| {
            self.bars
                .iter()
                .find(|e| e.bar == bar)
                .map_or(target, |e| e.value(now, duration))
        };
        let painter = Painter {
            kit: Kit {
                style: &self.style,
                variant: self.options.variant(&self.style),
                accent: self.options.accent(&self.style),
                language,
                width: self.plan.width,
            },
            options: &self.options,
            board: self.board.as_ref(),
        };
        painter.panel(window, self.plan.height);
        if self.low() {
            let period = self.style.fuel.low_pulse_ms.max(1.0) / 1000.0;
            let phase = now.saturating_duration_since(self.started).as_secs_f32() / period;
            let alpha = 0.55 + 0.45 * (phase * std::f32::consts::TAU).cos().abs();
            painter.border(window, self.plan.height, alpha);
        }
        let es = language == Language::Es;
        for (line, &y) in lines(self.board.as_ref(), &self.options, es)
            .iter()
            .zip(&self.plan.tops)
        {
            painter.line(window, cx, line, y, &bar);
        }
    }
}

// ---------------------------------------------------------------------------
// Pintado
// ---------------------------------------------------------------------------

struct Painter<'a> {
    kit: Kit<'a>,
    options: &'a Options,
    board: Option<&'a Board>,
}

impl<'a> std::ops::Deref for Painter<'a> {
    type Target = Kit<'a>;
    fn deref(&self) -> &Self::Target {
        &self.kit
    }
}

impl Painter<'_> {
    fn tone(&self, tone: Tone) -> gpui::Hsla {
        let c = &self.style.colors;
        match tone {
            Tone::Plain => c.value.hsla(),
            Tone::Hi => c.text.hsla(),
            Tone::Red => c.loss.hsla(),
            Tone::Amber => c.yellow_text.hsla(),
            Tone::Green => c.gain.hsla(),
            Tone::Accent => self.accent.hsla(),
        }
    }

    fn fill(&self, fill: Fill) -> gpui::Hsla {
        let f = &self.style.fuel;
        match fill {
            Fill::Accent => self.accent.hsla(),
            Fill::Fuel => f.fuel_bar.hsla(),
            Fill::Refuel => f.refuel.hsla(),
            Fill::Red => f.low_border.hsla(),
        }
    }

    /// Borde rojo que late con combustible bajo.
    fn border(&self, window: &mut Window, height: f32, alpha: f32) {
        window.paint_quad(quad(
            crate::efficiency::rect(0.0, 0.0, self.width, height),
            Corners::all(px(self.variant.radius)),
            gpui::transparent_black(),
            Edges::all(px(1.0)),
            self.style.fuel.low_border.alpha(alpha),
            BorderStyle::default(),
        ));
    }

    /// Barra con pista y relleno desde la izquierda.
    fn bar(&self, window: &mut Window, x: f32, y: f32, w: f32, h: f32, value: f32, fill: Fill) {
        round_rect(window, x, y, w, h, h / 2.0, self.style.fuel.track.hsla());
        round_rect(
            window,
            x,
            y,
            w * value.clamp(0.0, 1.0),
            h,
            h / 2.0,
            self.fill(fill),
        );
    }

    fn line(
        &self,
        window: &mut Window,
        cx: &mut App,
        line: &Line,
        y: f32,
        bar: &dyn Fn(Bar, f32) -> f32,
    ) {
        match line {
            Line::Banner(band) => self.band_line(window, cx, *band),
            Line::Header { left, right } => self.header(window, cx, y, left, right),
            Line::Big {
                left,
                left_label,
                right,
                right_label,
                tone,
                fraction,
                fill,
            } => {
                self.big(window, cx, y, [left, left_label, right, right_label], *tone);
                if let Some(fraction) = fraction {
                    let f = &self.style.fuel;
                    let pad = self.variant.padding_x;
                    let top = y + f.big_height - f.bar - 4.0;
                    let value = bar(Bar::Compact, *fraction);
                    self.bar(window, pad, top, self.width - 2.0 * pad, f.bar, value, *fill);
                }
            }
            Line::Gauge {
                bar: kind,
                title,
                pill,
                value,
                suffix,
                small,
                fraction,
                fill,
            } => {
                self.gauge(window, cx, y, title, pill.as_deref(), value, suffix, *small);
                if let Some(fraction) = fraction {
                    let f = &self.style.fuel;
                    let pad = self.variant.padding_x;
                    let top = y + f.gauge_height - f.gauge_bar - 8.0;
                    let value = bar(*kind, *fraction);
                    self.bar(
                        window,
                        pad,
                        top,
                        self.width - 2.0 * pad,
                        f.gauge_bar,
                        value,
                        *fill,
                    );
                }
            }
            Line::Row {
                key,
                value,
                tone,
                me,
            } => self.row(window, cx, y, key, value, *tone, *me),
            Line::Tiles(tiles) => self.tiles(window, cx, y, tiles),
            Line::Sub { left, right } => self.sub(window, cx, y, left, right),
            Line::Spark => self.spark(window, y),
            Line::Window { open, close, now } => {
                self.pit_window(window, y, *open, *close, bar(Bar::Now, *now));
            }
            Line::WindowLabels(first, now, last) => {
                self.window_labels(window, cx, y, [first, now, last]);
            }
            Line::Footer {
                left,
                right,
                pill,
                pulse,
            } => self.footer(window, cx, y, left, right.as_deref(), pill.as_deref(), *pulse),
        }
    }

    fn band_line(&self, window: &mut Window, cx: &mut App, band: Band) {
        let c = &self.style.colors;
        let f = &self.style.fuel;
        let es = self.es();
        match band {
            Band::Low => self.band(
                window,
                cx,
                f.low_fill,
                f.low_text,
                if es { "Combustible bajo" } else { "Low fuel" },
                Some(if es { "entra esta vuelta" } else { "pit this lap" }),
                false,
                None,
            ),
            Band::Pits => self.band(
                window,
                cx,
                c.stops_fill,
                c.text,
                if es { "En boxes" } else { "In the pits" },
                None,
                false,
                Some(c.line),
            ),
            Band::Fcy => self.band(window, cx, c.fcy_fill, c.fcy_text, "FCY", None, false, None),
            Band::Yellow(sector) => {
                let title = if es {
                    format!("Amarilla · Sector {sector}")
                } else {
                    format!("Yellow · Sector {sector}")
                };
                self.band(
                    window,
                    cx,
                    c.yellow_fill,
                    c.yellow_text,
                    &title,
                    None,
                    false,
                    Some(c.yellow_line),
                );
            }
            Band::Final(lap, total) => self.band(
                window,
                cx,
                c.final_fill,
                c.final_text,
                if es { "Última vuelta" } else { "Final lap" },
                Some(&format!("{lap}/{total}")),
                true,
                None,
            ),
        }
    }

    fn header(&self, window: &mut Window, cx: &mut App, y: f32, left: &str, right: &str) {
        let v = self.variant;
        let h = v.header_height - if v.header_rule > 0.0 { 6.0 } else { 0.0 };
        let (pad, w) = (v.padding_x, self.width);
        let face = if v.header_display {
            Face::Display
        } else {
            Face::Body
        };
        let ink = self.ink(
            face,
            v.header_size,
            v.header_tracking,
            v.header_color.hsla(),
        );
        self.label(window, cx, left, pad, None, y, h, face, &ink);
        let mut edge = w - pad;
        if self.options.brand {
            edge -= self.brand(window, cx, edge, y, h) + self.style.brand.margin;
        }
        self.label(window, cx, right, 0.0, Some(edge), y, h, face, &ink);
        if v.header_rule > 0.0 {
            round_rect(
                window,
                pad,
                y + v.header_height - 1.0,
                w - 2.0 * pad,
                1.0,
                0.0,
                self.accent.alpha(v.header_rule),
            );
        }
    }

    fn big(&self, window: &mut Window, cx: &mut App, y: f32, text: [&String; 4], tone: Tone) {
        let f = &self.style.fuel;
        let c = &self.style.colors;
        let fonts = &self.style.fonts;
        let (pad, w) = (self.variant.padding_x, self.width);
        let big = self.ink(Face::Display, f.big, 0.5, c.text.hsla());
        self.label(window, cx, text[0], pad, None, y, f.big, Face::Display, &big);
        let second = self.ink(Face::Display, f.big_secondary, 0.5, self.tone(tone));
        self.label(
            window,
            cx,
            text[2],
            0.0,
            Some(w - pad),
            y + f.big - f.big_secondary,
            f.big_secondary,
            Face::Display,
            &second,
        );
        let small = self.ink(Face::Body, fonts.small, 0.0, c.muted.hsla());
        let label_top = y + f.big + 2.0;
        self.label(window, cx, text[1], pad, None, label_top, 16.0, Face::Body, &small);
        self.label(
            window,
            cx,
            text[3],
            0.0,
            Some(w - pad),
            label_top,
            16.0,
            Face::Body,
            &small,
        );
    }

    #[allow(clippy::too_many_arguments)] // Medidor: título, píldora, valor y sufijo.
    fn gauge(
        &self,
        window: &mut Window,
        cx: &mut App,
        y: f32,
        title: &str,
        pill: Option<&str>,
        value: &str,
        suffix: &str,
        small: bool,
    ) {
        let f = &self.style.fuel;
        let c = &self.style.colors;
        let (pad, w) = (self.variant.padding_x, self.width);
        let h = f.gauge_value;
        let title_ink = self.ink(Face::Body, f.gauge_title, 0.3, c.muted.hsla());
        self.label(window, cx, title, pad, None, y, h, Face::Body, &title_ink);
        let mut right = w - pad;
        if !suffix.is_empty() {
            let ink = self.ink(Face::Body, f.gauge_suffix, 0.0, c.muted.hsla());
            right -= self.label(window, cx, suffix, 0.0, Some(right), y + 2.0, h, Face::Body, &ink);
        }
        let size = if small { f.gauge_value_small } else { f.gauge_value };
        let ink = self.ink(Face::Display, size, 0.5, c.text.hsla());
        right -= self.label(window, cx, value, 0.0, Some(right), y, h, Face::Display, &ink);
        if let Some(pill) = pill {
            let width = self.pill_width(window, pill);
            let g = &self.style.geometry;
            self.pill(
                window,
                cx,
                pill,
                right - 8.0 - width,
                y + (h - g.row_height) / 2.0,
                self.accent.alpha(0.2),
                self.accent.hsla(),
            );
        }
    }

    #[allow(clippy::too_many_arguments)] // Fila: etiqueta, valor, color y si es la propia.
    fn row(
        &self,
        window: &mut Window,
        cx: &mut App,
        y: f32,
        key: &str,
        value: &str,
        tone: Tone,
        me: bool,
    ) {
        let c = &self.style.colors;
        let h = self.style.geometry.row_height;
        let (pad, w) = (self.variant.padding_x, self.width);
        if me {
            let own = if self.variant.player_white > 0.0 {
                crate::vantare::paint::WHITE
            } else {
                self.accent
            };
            self.highlight(window, y, own, 1.0);
        }
        let key_ink = self.ink(Face::Body, self.style.fuel.row_label, 0.0, c.text.hsla());
        self.label(window, cx, key, pad, None, y, h, Face::Body, &key_ink);
        let ink = self.ink(Face::Mono, self.style.fonts.mono, 0.0, self.tone(tone));
        self.label(window, cx, value, 0.0, Some(w - pad), y, h, Face::Mono, &ink);
    }

    fn tiles(&self, window: &mut Window, cx: &mut App, y: f32, tiles: &[(String, String, Tone)]) {
        let f = &self.style.fuel;
        let c = &self.style.colors;
        let pad = self.variant.padding_x;
        let top = y + f.tile_margin;
        let span = self.width - 2.0 * pad;
        round_rect(window, pad, top, span, f.tile_height, f.tile_radius, f.tile_line.hsla());
        let count = tiles.len().max(1) as f32;
        let cell = (span - (count - 1.0)) / count;
        for (index, (label, value, tone)) in tiles.iter().enumerate() {
            let x = pad + index as f32 * (cell + 1.0);
            let radius = if index == 0 || index + 1 == tiles.len() {
                f.tile_radius
            } else {
                0.0
            };
            round_rect(window, x, top, cell, f.tile_height, radius, f.tile_fill.hsla());
            let small = self.ink(Face::Body, f.tile_label, 0.3, c.muted.hsla());
            self.label(window, cx, label, x + 8.0, None, top + 6.0, 14.0, Face::Body, &small);
            let ink = self.ink(Face::Display, f.tile_value, 0.3, self.tone(*tone));
            let fitted = text::fit(window, value, &ink, cell - 12.0);
            self.label(
                window,
                cx,
                &fitted,
                x + 8.0,
                None,
                top + 20.0,
                f.tile_value,
                Face::Display,
                &ink,
            );
        }
    }

    fn sub(&self, window: &mut Window, cx: &mut App, y: f32, left: &str, right: &str) {
        let c = &self.style.colors;
        let v = self.variant;
        let (pad, w) = (v.padding_x, self.width);
        let top = y + 6.0;
        let h = self.style.fuel.sub_height - 6.0;
        let ink = self.ink(Face::Body, v.header_size, v.header_tracking, v.header_color.hsla());
        self.label(window, cx, left, pad, None, top, h, Face::Body, &ink);
        let em = self.ink(Face::Body, v.header_size, v.header_tracking, c.header_em.hsla());
        self.label(window, cx, right, 0.0, Some(w - pad), top, h, Face::Body, &em);
    }

    /// Gráfica de consumo: polilínea de las vueltas medidas y línea de media.
    fn spark(&self, window: &mut Window, y: f32) {
        let Some(board) = self.board else { return };
        let values = &board.history;
        if values.len() < 2 {
            return;
        }
        let f = &self.style.fuel;
        let pad = self.variant.padding_x;
        let (w, h) = (self.width - 2.0 * pad, f.spark_height);
        let average = values.iter().sum::<f64>() / values.len() as f64;
        let low = values.iter().copied().fold(f64::INFINITY, f64::min);
        let high = values.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        let margin = ((high - low) * 0.15).max(0.05);
        let (low, high) = (low - margin, high + margin);
        let (ox, oy) = text::origin();
        let at = |index: usize, value: f64| {
            let x = pad + 2.0 + index as f32 * (w - 4.0) / (values.len() - 1) as f32;
            let t = ((value - low) / (high - low)) as f32;
            (x, y + h - 2.0 - t * (h - 4.0))
        };
        let (_, average_y) = at(0, average);
        round_rect(window, pad, average_y, w, 1.0, 0.0, f.average_line.hsla());
        let mut path = PathBuilder::stroke(px(f.spark_stroke));
        for (index, value) in values.iter().enumerate() {
            let (x, y) = at(index, *value);
            let p = point(px(x + ox), px(y + oy));
            if index == 0 {
                path.move_to(p);
            } else {
                path.line_to(p);
            }
        }
        if let Ok(path) = path.build() {
            window.paint_path(path, self.accent.hsla());
        }
        let (x, y) = at(values.len() - 1, values[values.len() - 1]);
        let r = f.spark_dot;
        round_rect(window, x - r, y - r, 2.0 * r, 2.0 * r, r, f.now.hsla());
    }

    fn pit_window(&self, window: &mut Window, y: f32, open: f32, close: f32, now: f32) {
        let f = &self.style.fuel;
        let pad = self.variant.padding_x;
        let w = self.width - 2.0 * pad;
        round_rect(window, pad, y + 7.0, w, 4.0, 2.0, f.track.hsla());
        let left = pad + open * w;
        let width = ((close - open) * w).max(4.0);
        window.paint_quad(quad(
            crate::efficiency::rect(left, y + 5.0, width, 8.0),
            Corners::all(px(2.0)),
            self.accent.alpha(f.window_fill),
            Edges::all(px(1.0)),
            self.accent.hsla(),
            BorderStyle::default(),
        ));
        round_rect(window, pad + now * w - 1.0, y + 1.0, 2.0, 16.0, 1.0, f.now.hsla());
    }

    fn window_labels(&self, window: &mut Window, cx: &mut App, y: f32, text: [&String; 3]) {
        let c = &self.style.colors;
        let (pad, w) = (self.variant.padding_x, self.width);
        let h = self.style.fuel.window_labels;
        let ink = self.ink(Face::Mono, 10.0, 0.0, c.column.hsla());
        self.label(window, cx, text[0], pad, None, y, h, Face::Mono, &ink);
        let middle = text::width(window, text[1], &ink);
        self.label(
            window,
            cx,
            text[1],
            (w - middle) / 2.0,
            None,
            y,
            h,
            Face::Mono,
            &ink,
        );
        self.label(window, cx, text[2], 0.0, Some(w - pad), y, h, Face::Mono, &ink);
    }

    #[allow(clippy::too_many_arguments)] // Pie: textos, píldora y pulso de espera.
    fn footer(
        &self,
        window: &mut Window,
        cx: &mut App,
        y: f32,
        left: &str,
        right: Option<&str>,
        pill: Option<&str>,
        pulse: bool,
    ) {
        let g = &self.style.geometry;
        let c = &self.style.colors;
        let fonts = &self.style.fonts;
        let (pad, w) = (self.variant.padding_x, self.width);
        self.rule(window, y + g.footer_gap);
        let top = y + g.footer_gap + 1.0 + g.footer_gap;
        let h = g.footer_height;
        let mut x = pad;
        if pulse {
            let d = g.pulse;
            round_rect(window, x, top + (h - d) / 2.0, d, d, d / 2.0, c.pulse.hsla());
            x += d + 8.0;
        }
        let ink = self.ink(Face::Body, fonts.header, 0.0, c.muted.hsla());
        self.label(window, cx, left, x, None, top, h, Face::Body, &ink);
        if let Some(right) = right {
            self.label(window, cx, right, 0.0, Some(w - pad), top, h, Face::Body, &ink);
        }
        if let Some(pill) = pill {
            let width = self.pill_width(window, &pill.to_uppercase());
            self.pill(
                window,
                cx,
                &pill.to_uppercase(),
                w - pad - width,
                top + (h - g.row_height) / 2.0,
                c.stops_fill.hsla(),
                c.stops_text.hsla(),
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frames(json: &str) -> Vec<vantare_domain::Snapshot> {
        let scene: serde_json::Value = serde_json::from_str(json).expect("escena");
        scene["frames"]
            .as_array()
            .expect("fases")
            .iter()
            .map(|f| vantare_ipc::snapshot_from_json(&f["snapshot"].to_string()).expect("foto"))
            .collect()
    }

    fn options(size: Size) -> Options {
        Options {
            look: Look::Neo,
            accent: Accent::Red,
            size,
            brand: false,
        }
    }

    fn texts(lines: &[Line]) -> String {
        format!("{lines:?}")
    }

    #[test]
    fn catalogue_widths_and_every_state_have_their_lines() {
        let photos = frames(include_str!("../../fixtures/fuel-vantare.scene.json"));
        let style = Style::compiled();
        for (size, width) in [
            (Size::Compact, 230.0),
            (Size::Standard, 300.0),
            (Size::Expanded, 460.0),
        ] {
            assert_eq!(layout(None, &options(size), &style).width, width);
        }
        let board = |i: usize| State::project(&photos[i]);
        let standard = |i: usize| texts(&lines(Some(&board(i)), &options(Size::Standard), true));
        assert!(standard(0).contains("42.6 L") && standard(0).contains("v 24"));
        assert!(standard(1).contains("Energía virtual") && standard(1).contains("Limita: energía"));
        let low = standard(2);
        assert!(low.contains("Banner(Low)") && low.contains("esta vuelta"));
        let pits = standard(3);
        assert!(pits.contains("REPOSTANDO") && pits.contains("4 nuevos · M"));
        let fcy = standard(4);
        assert!(fcy.contains("Banner(Fcy)") && fcy.contains("1.41 L") && fcy.contains("Ahorro FCY"));
        let last = standard(5);
        assert!(last.contains("Final(38, 38)") && last.contains("sobran"));
        assert!(standard(6).contains("Esperando al simulador"));
        assert!(standard(7).contains("Sin coche propio"));
        let expanded = texts(&lines(Some(&board(1)), &options(Size::Expanded), true));
        for part in ["ENERGÍA VIRTUAL", "LIMITA", "AÑADIR", "Spark", "VENTANA DE PARADA", "Stint 2"] {
            assert!(expanded.contains(part), "{part}");
        }
    }

    #[test]
    fn bars_slide_between_laps_and_low_fuel_pulses() {
        let photos = frames(include_str!("../../fixtures/fuel-vantare-carrera.scene.json"));
        let mut state = State::new(options(Size::Expanded));
        assert!(state.ingest(State::project(&photos[0])));
        assert_eq!(state.wake(Instant::now()), Wake::Idle, "aparecer no anima");
        assert!(state.ingest(State::project(&photos[1])));
        assert_eq!(state.wake(Instant::now()), Wake::Frame, "la barra se desliza");
        state.settle();
        assert_eq!(state.wake(Instant::now()), Wake::Idle);
        let low = photos
            .iter()
            .position(|p| State::project(p).plan == Plan::Now)
            .expect("fase con combustible bajo");
        state.ingest(State::project(&photos[low]));
        state.settle();
        assert!(matches!(state.wake(Instant::now()), Wake::At(_)), "el borde late");
        assert!(!state.ingest(State::project(&photos[low])), "misma foto, sin repintar");
    }

    #[test]
    fn english_keeps_the_same_layout() {
        let photos = frames(include_str!("../../fixtures/fuel-vantare.scene.json"));
        for photo in &photos {
            let board = State::project(photo);
            for size in [Size::Compact, Size::Standard, Size::Expanded] {
                let es = lines(Some(&board), &options(size), true);
                let en = lines(Some(&board), &options(size), false);
                assert_eq!(es.len(), en.len());
            }
        }
    }
}
