//! E5c: the plan as text to copy and as a spreadsheet (CSV) to save.
//!
//! One generator builds a `Report` of the plan and the text and the CSV are two
//! writings of it, so they say the same things. The CSV is written by the host, to
//! a path that only a ticket of the main process can bring: the renderer sees the
//! text and the NAME of the file, never a path.
use super::{
    PRIMARY, State, StrategyFile, StrategyView,
    accepted::{self, StrategyAcceptedState, StrategyUnreachable, StrategyUnreachableCause},
    calculation::{
        StrategyCalculationView, StrategyCertificate, StrategyComputeForm, StrategyPit,
        StrategyPitPinned, StrategyPitService, StrategyReason, StrategyServiceSteps,
    },
    file::{
        INTERNAL_IDS, Kind, STRATEGY_PICK_LIFETIME, Ticket, checked_path, device_name, direct,
        file_of, invisible, same_file, valid_file_name,
    },
};
use crate::protocol::HostError;
use serde::{Deserialize, Serialize};
use std::{
    fmt::Display,
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU32, Ordering},
    time::Instant,
};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;

/// The most bytes of the text and of the CSV. Every text of the plan is bounded
/// (`TEXT_LIMIT`) and a plan has at most 17 stints, so a real export is a fraction
/// of this: a test builds the biggest one.
pub const STRATEGY_EXPORT_LIMIT: usize = 64 * 1024;

/// What is exported: a plan the renderer can name, never a path or a file.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum StrategyExportTarget {
    /// The proposal on screen (`plan.result`), as the calculation `computeId`
    /// names it: a plan with a timeline, calculated or partial, not being edited.
    Proposal {
        #[serde(rename = "computeId")]
        compute_id: u32,
    },
    /// The plan accepted for the active variant (`plan.accepted`), in any of its
    /// states, stale ones included.
    Accepted {},
}

/// The answer of `strategy.export`: the plan as text, ready to copy.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(deny_unknown_fields)]
pub struct StrategyExportText {
    pub text: String,
}

/// The answers of `strategy.exportFile`: the acknowledgement of the ticket and,
/// later, the final one.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum StrategyExportFileValue {
    /// The ticket is recorded: the main process opens its dialog with this name
    /// as the suggestion. Only the main process sees this answer.
    Ticket {
        #[serde(rename = "suggestedName")]
        suggested_name: String,
    },
    /// The CSV is written. `file` is its name, never its path.
    Saved { file: StrategyFile },
    /// The dialog was cancelled: nothing was written.
    Cancelled,
}

/// The answer of the trusted message of the main process: a view (`open`,
/// `saveAs`) or the end of an export.
pub(crate) enum Picked {
    View(Box<StrategyView>),
    Export(StrategyExportFileValue),
}

// -------------------------------------------------------------------- the report

/// What the plan on offer is.
pub(super) enum Origin<'a> {
    Proposal,
    Accepted {
        at: &'a str,
        state: StrategyAcceptedState,
        unreachable: Option<StrategyUnreachable>,
    },
}

/// Everything the export reads: the plan, the entries it was calculated from and
/// the two labels the person sees (the race and the strategy as they are named now).
pub(super) struct Source<'a> {
    pub origin: Origin<'a>,
    pub race: &'a str,
    pub strategy: &'a str,
    pub entries: &'a StrategyComputeForm,
    pub result: &'a StrategyCalculationView,
}

#[derive(Clone, Copy)]
struct Load {
    fuel: f64,
    energy: f64,
}

#[derive(Clone, Copy)]
enum Service {
    Parallel,
    Sequential,
}

impl Service {
    fn words(self) -> &'static str {
        match self {
            Self::Parallel => "a la vez",
            Self::Sequential => "uno tras otro",
        }
    }
}

enum Row {
    Stint {
        number: usize,
        from: u32,
        to: u32,
        pilot: String,
    },
    Stop {
        number: usize,
        lap: u32,
        fuel: f64,
        energy: f64,
        new_tyres: bool,
        service: Service,
        seconds: f64,
        pinned: StrategyPitPinned,
    },
}

struct Data {
    tank: Option<f64>,
    fuel_per_lap: Option<f64>,
    energy_per_lap: Option<f64>,
    pace_seconds: f64,
    service: Option<Service>,
}

pub(super) struct Report {
    status: String,
    notices: Vec<String>,
    race: String,
    strategy: String,
    track: String,
    class: String,
    race_minutes: Option<f64>,
    guarantee: Vec<String>,
    laps: u32,
    stops: u32,
    seconds: f64,
    left_laps: Option<f64>,
    asked_laps: f64,
    start: Load,
    finish: Load,
    rows: Vec<Row>,
    data: Data,
}

fn parse(text: &str) -> Option<f64> {
    text.trim().parse::<f64>().ok().filter(|value| value.is_finite())
}

/// «78», «2,316», «0,5»: up to three decimals, no trailing zero, comma decimal.
fn figure(value: f64) -> String {
    let mut text = format!("{value:.3}");
    while text.ends_with('0') {
        text.pop();
    }
    if text.ends_with('.') {
        text.pop();
    }
    if text == "-0" {
        text = "0".into();
    }
    text.replace('.', ",")
}

/// Laps with two decimals, as the screen writes them: «1,14».
fn laps_figure(value: f64) -> String {
    format!("{value:.2}").replace('.', ",")
}

/// `value` times `factor`, rounded to a whole number: the seconds, tenths or
/// milliseconds of a time that is a few hours at most.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn scaled(value: f64, factor: f64) -> u64 {
    (value.max(0.0) * factor).round() as u64
}

/// 21664 s → «6:01:04».
fn clock(seconds: f64) -> String {
    let whole = scaled(seconds, 1.0);
    format!("{}:{:02}:{:02}", whole / 3600, whole % 3600 / 60, whole % 60)
}

/// 64.6 s → «1:04,6».
fn stop_time(seconds: f64) -> String {
    let tenths = scaled(seconds, 10.0);
    format!("{}:{:02},{}", tenths / 600, tenths % 600 / 10, tenths % 10)
}

/// 90.472 s → «1:30,472».
fn lap_time(seconds: f64) -> String {
    let millis = scaled(seconds, 1000.0);
    format!(
        "{}:{:02},{:03}",
        millis / 60_000,
        millis % 60_000 / 1000,
        millis % 1000
    )
}

/// 19/11/2026 18:42 in the zone given (the person's own zone in production).
fn date<Tz: chrono::TimeZone>(at: &str, zone: &Tz) -> Option<String>
where
    Tz::Offset: Display,
{
    chrono::DateTime::parse_from_rfc3339(at)
        .ok()
        .map(|moment| moment.with_timezone(zone).format("%d/%m/%Y %H:%M").to_string())
}

fn steps(steps: &StrategyServiceSteps) -> String {
    [
        steps
            .fuel_liters
            .as_ref()
            .and_then(serde_json::Number::as_f64)
            .map(|step| format!("de {0} L en {0} L", figure(step))),
        steps
            .ve_percent
            .as_ref()
            .and_then(serde_json::Number::as_f64)
            .map(|step| format!("de {0} % en {0} %", figure(step))),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(" y ")
}

fn guarantee(result: &StrategyCalculationView) -> Option<Vec<String>> {
    let steps = steps(&result.steps);
    match result.certificate? {
        StrategyCertificate::Proven if !result.degraded => Some(vec![if steps.is_empty() {
            "Comprobado: es el plan más rápido con estos datos".into()
        } else {
            format!("Comprobado: es el plan más rápido con estos datos ({steps})")
        }]),
        StrategyCertificate::Proven => Some(vec![
            "El paso de carga es más grueso que el que pediste".into(),
            if steps.is_empty() {
                "Es el plan más rápido con el paso de carga que ha usado el cálculo; con el que pediste podría haber uno algo más rápido".into()
            } else {
                format!("Es el plan más rápido cargando {steps}; con el paso que pediste podría haber uno algo más rápido")
            },
        ]),
        StrategyCertificate::NotProven => {
            let mut lines = vec![
                "SIN GARANTÍA: plan válido, pero no se ha comprobado que sea el más rápido"
                    .to_owned(),
            ];
            lines.push(
                match result.reason {
                    Some(StrategyReason::FineGridNoFallback) => {
                        "Con pasos de carga tan finos no se pudo completar el cálculo; prueba con pasos más gruesos"
                    }
                    _ => "La búsqueda se detuvo antes de poder comprobarlo",
                }
                .to_owned(),
            );
            if result.degraded {
                lines.push(if steps.is_empty() {
                    "El paso de carga es más grueso que el que pediste".into()
                } else {
                    format!("El paso de carga es más grueso que el que pediste: {steps}")
                });
            }
            Some(lines)
        }
        StrategyCertificate::NoSolution => None,
    }
}

fn unreachable_sentence(unreachable: StrategyUnreachable) -> String {
    let cause = match unreachable.cause {
        StrategyUnreachableCause::ResourceExhausted => match unreachable.fail_lap {
            Some(lap) => {
                format!("se queda sin combustible, energía o neumáticos en la vuelta {lap}")
            }
            None => "se queda sin combustible, energía o neumáticos antes de meta".into(),
        },
        StrategyUnreachableCause::ReserveNotMet => {
            "termina sin la reserva de combustible que pediste".into()
        }
        StrategyUnreachableCause::ScheduleMismatch => {
            "el calendario ya no cubre las vueltas de la carrera".into()
        }
        StrategyUnreachableCause::Other => "no se ha podido comprobar que llegue a meta".into(),
    };
    format!("Con los datos nuevos este plan NO llega a meta: {cause}")
}

fn service_of(pit: &StrategyPit) -> Service {
    match pit.service {
        StrategyPitService::Parallel => Service::Parallel,
        StrategyPitService::Sequential => Service::Sequential,
    }
}

/// The report of a plan; `None` when there is nothing to write (no figures, no
/// calendar or no solution). The zone is the one the date of the acceptance is
/// written in.
pub(super) fn report<Tz: chrono::TimeZone>(source: &Source, zone: &Tz) -> Option<Report>
where
    Tz::Offset: Display,
{
    let (metrics, timeline) = (
        source.result.metrics.as_ref()?,
        source.result.timeline.as_ref()?,
    );
    let guarantee = guarantee(source.result)?;
    let (status, notices) = match &source.origin {
        Origin::Proposal => ("PROPUESTA SIN ACEPTAR".to_owned(), Vec::new()),
        Origin::Accepted {
            at,
            state,
            unreachable,
        } => {
            let at = date(at, zone)?;
            match state {
                StrategyAcceptedState::Accepted => (format!("PLAN ACEPTADO · {at}"), Vec::new()),
                StrategyAcceptedState::Stale => (
                    format!("PLAN ACEPTADO · {at} · DESACTUALIZADO"),
                    vec![
                        "AVISO: los datos de la carrera han cambiado desde que se aceptó este plan"
                            .to_owned(),
                        "Con los datos nuevos el plan todavía llega a meta, pero puede que ya no sea el más rápido"
                            .to_owned(),
                    ],
                ),
                StrategyAcceptedState::StaleUnreachable => (
                    format!("PLAN ACEPTADO · {at} · DESACTUALIZADO · NO LLEGA A META"),
                    vec![
                        "AVISO: los datos de la carrera han cambiado desde que se aceptó este plan"
                            .to_owned(),
                        unreachable.map_or_else(
                            || "Con los datos nuevos este plan NO llega a meta".to_owned(),
                            unreachable_sentence,
                        ),
                    ],
                ),
            }
        }
    };
    let inputs = &source.entries.inputs;
    let fields = &source.entries.fields;
    let mut rows = Vec::new();
    for (index, stint) in timeline.stints.iter().enumerate() {
        rows.push(Row::Stint {
            number: index + 1,
            from: stint.from_lap,
            to: stint.to_lap,
            pilot: timeline.pilot.clone(),
        });
        if let Some(pit) = timeline.pits.get(index) {
            rows.push(Row::Stop {
                number: index + 1,
                lap: pit.lap,
                fuel: pit.fuel_liters.as_f64()?,
                energy: pit.ve_percent.as_f64()?,
                new_tyres: pit.change_tyres,
                service: service_of(pit),
                seconds: pit.pit_seconds.as_f64()?,
                pinned: pit.pinned,
            });
        }
    }
    Some(Report {
        status,
        notices,
        race: source.race.to_owned(),
        strategy: source.strategy.to_owned(),
        track: fields.track.clone(),
        class: fields.class.clone(),
        race_minutes: parse(&fields.duration_minutes),
        guarantee,
        laps: metrics.laps,
        stops: metrics.pit_count,
        seconds: metrics.total_seconds.as_f64()?,
        left_laps: metrics.fuel_reserve_real_laps.as_ref().and_then(serde_json::Number::as_f64),
        asked_laps: metrics.fuel_reserve_required_laps.as_f64()?,
        start: Load {
            fuel: timeline.fuel_start_liters.as_f64()?,
            energy: timeline.ve_start_percent.as_f64()?,
        },
        finish: Load {
            fuel: timeline.fuel_finish_liters.as_f64()?,
            energy: timeline.ve_finish_percent.as_f64()?,
        },
        rows,
        data: Data {
            tank: parse(&fields.fuel_capacity_liters),
            fuel_per_lap: parse(&inputs.fuel_per_lap_liters),
            energy_per_lap: parse(&inputs.ve_per_lap_percent),
            pace_seconds: timeline.base_pace_seconds.as_f64()?,
            service: match inputs.service_mode.as_str() {
                "parallel" => Some(Service::Parallel),
                "sequential" => Some(Service::Sequential),
                _ => None,
            },
        },
    })
}

// ------------------------------------------------------------------------ the text

fn stops_words(count: u32) -> String {
    match count {
        0 => "sin paradas".into(),
        1 => "1 parada".into(),
        many => format!("{many} paradas"),
    }
}

fn load_words(load: Load) -> String {
    [
        (load.fuel > 0.0).then(|| format!("{} L", figure(load.fuel))),
        (load.energy > 0.0).then(|| format!("{} %", figure(load.energy))),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(" · ")
}

/// The last line of the text and of the CSV: a product decision the root can drop
/// by emptying this constant.
const FOOTER: &str = "Hecho con Vantare";

const PINNED: &str = " (fijado a mano)";

/// What the stop does to the car, as the lines of the text say it.
fn stop_words(row: &Row) -> Option<String> {
    let Row::Stop {
        number,
        lap,
        fuel,
        energy,
        new_tyres,
        service,
        seconds,
        pinned,
    } = row
    else {
        return None;
    };
    let mark = |fixed: bool| if fixed { PINNED } else { "" };
    let mut parts = vec![format!("Parada {number}"), format!("vuelta {lap}")];
    let mut added = Vec::new();
    if *fuel > 0.0 || pinned.fuel_liters {
        added.push(format!("+{} L{}", figure(*fuel), mark(pinned.fuel_liters)));
    }
    if *energy > 0.0 || pinned.ve_percent {
        added.push(format!("+{} %{}", figure(*energy), mark(pinned.ve_percent)));
    }
    if added.is_empty() {
        added.push("sin carga".into());
    }
    parts.extend(added);
    parts.push(format!(
        "{}{}",
        if *new_tyres {
            "ruedas nuevas"
        } else {
            "mismas ruedas"
        },
        mark(pinned.change_tyres)
    ));
    parts.push(service.words().to_owned());
    parts.push(format!("{} en boxes", stop_time(*seconds)));
    Some(parts.join(" · "))
}

fn pit_laps(from: u32, to: u32) -> String {
    let count = to.saturating_sub(from) + 1;
    format!(
        "vueltas {from}–{to} ({count} {})",
        if count == 1 { "vuelta" } else { "vueltas" }
    )
}

/// The plan as lines to copy. Every line begins with a fixed word, never with a
/// text of the person: pasted into a spreadsheet, a name that starts with `=` would
/// otherwise be read as a formula.
pub(super) fn text(report: &Report) -> String {
    // the texts of the person are one line each, whatever they hold
    let one_line = |text: &str| {
        scrub(text)
            .chars()
            .map(|c| if c.is_control() { ' ' } else { c })
            .collect::<String>()
    };
    let mut lines = vec![report.status.clone()];
    lines.extend(report.notices.iter().cloned());
    lines.push(format!(
        "Carrera: {} · Estrategia: {}",
        one_line(&report.race),
        one_line(&report.strategy)
    ));
    let place = [
        (!report.track.is_empty()).then(|| format!("Circuito: {}", one_line(&report.track))),
        (!report.class.is_empty()).then(|| format!("Clase: {}", one_line(&report.class))),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>();
    if !place.is_empty() {
        lines.push(place.join(" · "));
    }
    lines.push(format!(
        "Carrera de {}{} vueltas",
        report
            .race_minutes
            .map_or_else(String::new, |minutes| format!("{} min · ", figure(minutes))),
        report.laps
    ));
    lines.push(format!(
        "Duración del plan {} · {} · {}",
        clock(report.seconds),
        stops_words(report.stops),
        report.left_laps.map_or_else(
            || format!("reserva pedida {} v", laps_figure(report.asked_laps)),
            |left| format!(
                "sobra {} v al final (pediste {} v)",
                laps_figure(left),
                laps_figure(report.asked_laps)
            )
        )
    ));
    lines.extend(report.guarantee.iter().cloned());
    lines.push(String::new());
    lines.push(format!("Salida con {}", load_words(report.start)));
    for row in &report.rows {
        match row {
            Row::Stint {
                number,
                from,
                to,
                pilot,
            } => lines.push(format!(
                "Stint {number} · {} · {}",
                pit_laps(*from, *to),
                one_line(pilot)
            )),
            Row::Stop { .. } => lines.extend(stop_words(row)),
        }
    }
    lines.push(format!("Llegada con {}", load_words(report.finish)));
    lines.push(String::new());
    let mut data = Vec::new();
    if let Some(tank) = report.data.tank {
        data.push(format!("depósito {} L", figure(tank)));
    }
    if let Some(consumption) = report.data.fuel_per_lap {
        data.push(format!("consumo {} L/v", figure(consumption)));
    }
    if let Some(energy) = report.data.energy_per_lap.filter(|energy| *energy > 0.0) {
        data.push(format!("energía {} %/v", figure(energy)));
    }
    data.push(format!("ritmo {}", lap_time(report.data.pace_seconds)));
    if let Some(service) = report.data.service {
        data.push(format!("servicio {}", service.words()));
    }
    lines.push(format!("Datos: {}", data.join(" · ")));
    lines.push(FOOTER.into());
    lines.join("\n")
}

// ------------------------------------------------------------------------- the CSV

/// A cell: a text of ours or of the person, a number that this module spelled
/// (digits, a comma and at most a minus) or nothing.
enum Cell {
    Text(String),
    Number(String),
    Empty,
}

/// A text with the characters that make a line read in another order or end in
/// the middle (bidirectional marks, U+2028, U+2029) turned into spaces.
fn scrub(text: &str) -> String {
    text.chars()
        .map(|c| {
            if invisible(c) || matches!(c, '\u{2028}' | '\u{2029}') {
                ' '
            } else {
                c
            }
        })
        .collect()
}

fn text_cell(value: &str) -> Cell {
    Cell::Text(scrub(value))
}

fn number_cell(value: f64) -> Cell {
    Cell::Number(figure(value))
}

/// The usual defence against a text that a spreadsheet would run: a cell that
/// starts with `=`, `+`, `-`, `@`, a tab, a carriage return or a line feed (or
/// that only has blanks before one of them) is led by an apostrophe, so it is read
/// as text. A reader with another list separator (`,`, `;`, a tab) or that ignores
/// the quotes starts a new cell after each of them, so the same goes for what
/// follows a separator inside the text. It is applied to every text, never to a
/// number this module wrote.
fn neutralized(text: &str) -> String {
    let danger = |c: char| matches!(c, '=' | '+' | '-' | '@' | '\t' | '\r' | '\n');
    let separator = |c: char| matches!(c, ',' | ';' | '\t' | '\r' | '\n');
    let mut out = String::with_capacity(text.len() + 1);
    // where the cell that is being written began, and whether only blanks (or
    // nothing) have been written in it since
    let (mut begin, mut blank) = (0, true);
    let mut previous = ' ';
    for c in text.chars() {
        // the line feed of a CRLF is the same line break, not another cell
        if blank && danger(c) && !(previous == '\r' && c == '\n') {
            out.insert(begin, '\'');
            blank = false;
        }
        out.push(c);
        if separator(c) {
            (begin, blank) = (out.len(), true);
        } else if !matches!(c, ' ' | '\u{a0}') {
            blank = false;
        }
        previous = c;
    }
    out
}

/// The cell as a field of the file: quoted when it holds a separator (of any
/// regional setting), a quote or a line break, with its quotes doubled. A number
/// this module wrote is never touched.
fn field(cell: &Cell) -> String {
    let text = match cell {
        Cell::Empty => return String::new(),
        Cell::Number(number) => return number.clone(),
        Cell::Text(text) => neutralized(text),
    };
    // `;` is ours; `,` and the tab are the list separators of other regional
    // settings, where a cell after one of them would start a formula
    if text.contains([';', ',', '\t', '"', '\r', '\n']) {
        format!("\"{}\"", text.replace('"', "\"\""))
    } else {
        text
    }
}

fn line(cells: &[Cell]) -> String {
    cells.iter().map(field).collect::<Vec<_>>().join(";")
}

fn pair(label: &str, value: Cell) -> String {
    line(&[text_cell(label), value])
}

fn origin_words(pinned: StrategyPitPinned) -> String {
    let fixed = [
        (pinned.fuel_liters, "combustible"),
        (pinned.ve_percent, "energía"),
        (pinned.change_tyres, "neumáticos"),
    ]
    .into_iter()
    .filter_map(|(on, name)| on.then_some(name))
    .collect::<Vec<_>>();
    if fixed.is_empty() {
        "Automático".into()
    } else {
        format!("Fijado a mano: {}", fixed.join(", "))
    }
}

/// UTF-8 with a byte order mark, `;` between fields, a decimal comma and CRLF at
/// the end of every line: what a spreadsheet in Spanish opens as it is.
pub(super) fn csv(report: &Report) -> Vec<u8> {
    let mut lines = Vec::new();
    csv_summary(report, &mut lines);
    csv_table(report, &mut lines);
    csv_data(report, &mut lines);
    lines.push(FOOTER.into());
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    for line in lines {
        bytes.extend_from_slice(line.as_bytes());
        bytes.extend_from_slice(b"\r\n");
    }
    bytes
}

/// The first block: who, what and the figures of the plan, as `label;value` rows.
fn csv_summary(report: &Report, lines: &mut Vec<String>) {
    lines.push(pair("Estado", text_cell(&report.status)));
    for notice in &report.notices {
        lines.push(pair("Aviso", text_cell(notice)));
    }
    lines.push(pair("Carrera", text_cell(&report.race)));
    lines.push(pair("Estrategia", text_cell(&report.strategy)));
    lines.push(pair("Circuito", text_cell(&report.track)));
    lines.push(pair("Clase", text_cell(&report.class)));
    if let Some(minutes) = report.race_minutes {
        lines.push(pair("Duración de la carrera (min)", number_cell(minutes)));
    }
    for guarantee in &report.guarantee {
        lines.push(pair("Garantía", text_cell(guarantee)));
    }
    lines.push(pair("Duración del plan", text_cell(&clock(report.seconds))));
    lines.push(pair("Vueltas", Cell::Number(report.laps.to_string())));
    lines.push(pair("Paradas", Cell::Number(report.stops.to_string())));
    if let Some(left) = report.left_laps {
        lines.push(pair(
            "Sobra al final (vueltas)",
            Cell::Number(laps_figure(left)),
        ));
    }
    lines.push(pair(
        "Reserva pedida (vueltas)",
        Cell::Number(laps_figure(report.asked_laps)),
    ));
    lines.push(pair("Combustible de salida (L)", number_cell(report.start.fuel)));
    lines.push(pair("Energía de salida (%)", number_cell(report.start.energy)));
    lines.push(pair("Combustible de llegada (L)", number_cell(report.finish.fuel)));
    lines.push(pair("Energía de llegada (%)", number_cell(report.finish.energy)));
}

/// The calendar: one row per stint and per stop, under one header.
fn csv_table(report: &Report, lines: &mut Vec<String>) {
    lines.push(String::new());
    lines.push(line(
        &[
            "Tipo",
            "Número",
            "Vuelta desde",
            "Vuelta hasta",
            "Vueltas",
            "Piloto",
            "Combustible (L)",
            "Energía (%)",
            "Neumáticos",
            "Servicio",
            "Tiempo en boxes (s)",
            "Origen",
        ]
        .map(text_cell),
    ));
    for row in &report.rows {
        lines.push(match row {
            Row::Stint {
                number,
                from,
                to,
                pilot,
            } => line(&[
                text_cell("Stint"),
                Cell::Number(number.to_string()),
                Cell::Number(from.to_string()),
                Cell::Number(to.to_string()),
                Cell::Number((to.saturating_sub(*from) + 1).to_string()),
                text_cell(pilot),
                Cell::Empty,
                Cell::Empty,
                Cell::Empty,
                Cell::Empty,
                Cell::Empty,
                Cell::Empty,
            ]),
            Row::Stop {
                number,
                lap,
                fuel,
                energy,
                new_tyres,
                service,
                seconds,
                pinned,
            } => line(&[
                text_cell("Parada"),
                Cell::Number(number.to_string()),
                Cell::Number(lap.to_string()),
                Cell::Number(lap.to_string()),
                Cell::Empty,
                Cell::Empty,
                number_cell(*fuel),
                number_cell(*energy),
                text_cell(if *new_tyres { "Nuevos" } else { "Los mismos" }),
                text_cell(service.words()),
                number_cell(*seconds),
                text_cell(&origin_words(*pinned)),
            ]),
        });
    }
}

/// The data the plan was calculated from.
fn csv_data(report: &Report, lines: &mut Vec<String>) {
    lines.push(String::new());
    if let Some(tank) = report.data.tank {
        lines.push(pair("Depósito (L)", number_cell(tank)));
    }
    if let Some(consumption) = report.data.fuel_per_lap {
        lines.push(pair("Consumo (L por vuelta)", number_cell(consumption)));
    }
    if let Some(energy) = report.data.energy_per_lap.filter(|energy| *energy > 0.0) {
        lines.push(pair("Energía (% por vuelta)", number_cell(energy)));
    }
    lines.push(pair(
        "Ritmo (s por vuelta)",
        number_cell(report.data.pace_seconds),
    ));
    if let Some(service) = report.data.service {
        lines.push(pair("Servicio en la parada", text_cell(service.words())));
    }
}

// ------------------------------------------------------------------------ the file

/// The name the dialog suggests: the race and the strategy, with nothing a file
/// name cannot hold, never a device, never a name the host would refuse.
pub(super) fn suggested_name(race: &str, strategy: &str) -> String {
    const FALLBACK: &str = "Plan de estrategia.csv";
    const STEM_BYTES: usize = 120;
    let clean = |text: &str| {
        text.chars()
            .map(|c| {
                if c.is_control() || invisible(c) || "<>:\"/\\|?*".contains(c) {
                    ' '
                } else {
                    c
                }
            })
            .collect::<String>()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .trim_matches([' ', '.'])
            .to_owned()
    };
    let joined = [clean(race), clean(strategy)]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" - ");
    let mut stem = String::new();
    for c in joined.chars() {
        if stem.len() + c.len_utf8() > STEM_BYTES {
            break;
        }
        stem.push(c);
    }
    let mut stem = stem.trim_matches([' ', '.']).to_owned();
    if stem.is_empty() {
        return FALLBACK.into();
    }
    if device_name(std::ffi::OsStr::new(&stem)) {
        stem.insert_str(0, "Plan ");
    }
    let name = format!("{stem}.csv");
    if valid_file_name(&name) && !name.to_ascii_lowercase().starts_with(".env") {
        name
    } else {
        FALLBACK.into()
    }
}

/// A sharing violation or a lock: another program (a spreadsheet, usually) has the
/// file open (`strategyFileInUse`). Everything else is a file that cannot be written.
fn write_error(error: &std::io::Error, replacing: Option<&Path>) -> HostError {
    // Replacing a file another program has open without sharing deletion says
    // «access denied» (5), as a permission that forbids it does. Asking to open the
    // file for DELETE, which is what the rename needs, tells them apart: it fails
    // with a sharing violation exactly when someone holds the file without sharing
    // deletion (a spreadsheet, Notepad), whatever else they share.
    let held = match error.raw_os_error() {
        Some(32 | 33) => true,
        Some(5) => replacing.is_some_and(held_without_sharing_deletion),
        _ => false,
    };
    if held {
        HostError::StrategyFileInUse
    } else {
        HostError::StrategyFileUnavailable
    }
}

/// Opens the file for `DELETE` only (no read, no write, nothing changes) and the
/// default sharing: it is refused with a sharing violation when another handle
/// does not share deletion.
#[cfg(windows)]
fn held_without_sharing_deletion(target: &Path) -> bool {
    use std::os::windows::fs::OpenOptionsExt;
    const DELETE: u32 = 0x0001_0000;
    const OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    std::fs::OpenOptions::new()
        .access_mode(DELETE)
        .custom_flags(OPEN_REPARSE_POINT)
        .open(target)
        .is_err_and(|probe| matches!(probe.raw_os_error(), Some(32 | 33)))
}

/// Only Windows answers «access denied» for a file that is in use.
#[cfg(not(windows))]
fn held_without_sharing_deletion(_: &Path) -> bool {
    false
}

static TEMPORARY: AtomicU32 = AtomicU32::new(0);

/// Writes the bytes beside the target and renames them over it: the target holds
/// the old bytes or the new ones, never half. Nothing is left behind when it
/// fails. A CSV that exists is replaced (the Windows dialog asked the person); a
/// folder, a link or a read-only file is not.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), HostError> {
    write_through(
        path,
        bytes,
        |file, bytes| file.write_all(bytes).and_then(|()| file.sync_all()),
        |temporary, target| {
            // the folder and the target are looked at again right before the
            // rename, so that the gap between the checks and the rename is as
            // narrow as the platform allows
            if !direct(target) || std::fs::symlink_metadata(target).is_ok_and(|now| !now.is_file())
            {
                return Err(std::io::Error::from(std::io::ErrorKind::InvalidInput));
            }
            std::fs::rename(temporary, target)
        },
    )
}

/// `write_atomic` with the two steps that can fail halfway as parameters, so that a
/// test can make each of them fail: whatever happens, the temporary file goes.
fn write_through(
    path: &Path,
    bytes: &[u8],
    put: impl FnOnce(&mut std::fs::File, &[u8]) -> std::io::Result<()>,
    publish: impl FnOnce(&Path, &Path) -> std::io::Result<()>,
) -> Result<(), HostError> {
    let unavailable = || HostError::StrategyFileUnavailable;
    if !direct(path) || !path.parent().is_some_and(Path::is_dir) {
        return Err(unavailable());
    }
    let mut replacing = None;
    match std::fs::symlink_metadata(path) {
        Ok(existing) => {
            replacing = Some(path);
            if !existing.is_file()
                || existing.file_type().is_symlink()
                || existing.permissions().readonly()
            {
                return Err(unavailable());
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err(unavailable()),
    }
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.subsec_nanos());
    // a short name of its own: it does not depend on the length of the target's
    let temporary = Temporary(path.with_file_name(format!(
        ".vantare-{}-{nanos}-{}.tmp",
        std::process::id(),
        TEMPORARY.fetch_add(1, Ordering::Relaxed)
    )));
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary.0)
        .map_err(|error| write_error(&error, None))?;
    put(&mut file, bytes)
        .map(|()| drop(file))
        .and_then(|()| publish(&temporary.0, path))
        .map_err(|error| write_error(&error, replacing))
}

/// The temporary file: it goes when this is dropped, however the write ends (an
/// error, a panic), unless the rename already moved it away.
struct Temporary(PathBuf);
impl Drop for Temporary {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

fn is_csv(path: &Path) -> bool {
    path.extension()
        .and_then(std::ffi::OsStr::to_str)
        .is_some_and(|extension| extension.eq_ignore_ascii_case("csv"))
}

// ------------------------------------------------------------------ the session

impl State {
    /// The plan the target names, as a report. `exportable` has already checked the
    /// session (`denied` without one), the revision (`rejected` when malformed,
    /// `strategyConflict` when old). The checks here run in this order and the first
    /// to fail answers: no document or no active variant (`strategyNothingToExport`),
    /// for a proposal another `computeId` (`strategyConflict`), a calculation running
    /// (`busy`), an edited schedule not recalculated (`strategyEditPending`), and no
    /// plan to write (`strategyNothingToExport`).
    fn report_of(&self, target: &StrategyExportTarget) -> Result<Report, HostError> {
        let doc = self.doc.as_ref().ok_or(HostError::StrategyNothingToExport)?;
        let (event, variant) =
            super::active_indices(doc).ok_or(HostError::StrategyNothingToExport)?;
        let current = super::ManualEvent::read(doc, event, variant);
        let zone = chrono::Local;
        let nothing = || HostError::StrategyNothingToExport;
        match target {
            StrategyExportTarget::Proposal { compute_id } => {
                let view = self.calculation.view();
                if view.compute_id != Some(*compute_id) {
                    return Err(self.conflict());
                }
                match view.state {
                    super::StrategyPlanState::Calculating => return Err(HostError::Busy),
                    super::StrategyPlanState::Edited => {
                        return Err(HostError::StrategyEditPending);
                    }
                    super::StrategyPlanState::Calculated | super::StrategyPlanState::Partial => {}
                    _ => return Err(nothing()),
                }
                let result = view.result.as_deref().ok_or_else(nothing)?;
                let entries = StrategyComputeForm::read(&current).ok_or_else(nothing)?;
                report(
                    &Source {
                        origin: Origin::Proposal,
                        race: &current.name,
                        strategy: &current.variant_name,
                        entries: &entries,
                        result,
                    },
                    &zone,
                )
                .ok_or_else(nothing)
            }
            StrategyExportTarget::Accepted {} => {
                let active = self.accepted.active.as_ref().ok_or_else(nothing)?;
                let kept = accepted::view(active, false, None);
                report(
                    &Source {
                        origin: Origin::Accepted {
                            at: &kept.accepted_at,
                            state: kept.state,
                            unreachable: kept.unreachable,
                        },
                        race: &current.name,
                        strategy: &current.variant_name,
                        entries: &active.plan.entries,
                        result: &active.plan.result,
                    },
                    &zone,
                )
                .ok_or_else(nothing)
            }
        }
    }

    /// When the accepted plan of the active variant was accepted: the identity of
    /// the plan an `accepted` export stands for. `None` for a proposal.
    fn accepted_stamp(&self, target: &StrategyExportTarget) -> Option<String> {
        match target {
            StrategyExportTarget::Proposal { .. } => None,
            StrategyExportTarget::Accepted {} => self
                .accepted
                .active
                .as_ref()
                .map(|active| active.plan.accepted_at.clone()),
        }
    }

    fn exportable(
        &self,
        revision: &str,
        target: &StrategyExportTarget,
    ) -> Result<Report, HostError> {
        self.require_revision(revision)?;
        self.report_of(target)
    }

    /// `strategy.export`: the plan as text. Nothing changes in the host.
    pub(crate) fn export_text(
        &self,
        revision: &str,
        target: &StrategyExportTarget,
    ) -> Result<StrategyExportText, HostError> {
        let text = text(&self.exportable(revision, target)?);
        if text.len() > STRATEGY_EXPORT_LIMIT {
            return Err(HostError::Io);
        }
        Ok(StrategyExportText { text })
    }

    /// `strategy.exportFile`: records the ticket of the dialog the main process is
    /// about to open and acknowledges with the name to suggest. The plan is checked
    /// now, so that no dialog opens for a plan that cannot be written, and again
    /// when the answer comes.
    pub(crate) fn export_file(
        &mut self,
        id: u32,
        revision: &str,
        target: StrategyExportTarget,
        now: Instant,
    ) -> Result<StrategyExportFileValue, HostError> {
        if !INTERNAL_IDS.contains(&id) {
            return Err(HostError::Denied);
        }
        let report = self.exportable(revision, &target)?;
        if self
            .ticket
            .as_ref()
            .is_some_and(|ticket| now < ticket.expires)
        {
            return Err(HostError::Busy);
        }
        let suggested_name = suggested_name(&report.race, &report.strategy);
        self.ticket = Some(Ticket {
            id,
            kind: Kind::Export {
                accepted_at: self.accepted_stamp(&target),
                target,
            },
            revision: revision.to_owned(),
            expires: now + STRATEGY_PICK_LIFETIME,
        });
        Ok(StrategyExportFileValue::Ticket { suggested_name })
    }

    /// The trusted answer of the main process. A ticket of a file dialog answers
    /// with the view as before; one of an export writes the CSV.
    pub(crate) fn picked(
        &mut self,
        selection: &super::StrategyFileSelection,
        now: Instant,
    ) -> Result<Picked, HostError> {
        let exporting = self.ticket.as_ref().is_some_and(|ticket| {
            ticket.id == selection.id && matches!(ticket.kind, Kind::Export { .. })
        });
        if exporting {
            self.picked_export(selection, now).map(Picked::Export)
        } else {
            self.picked_file(selection, now)
                .map(|view| Picked::View(Box::new(view)))
        }
    }

    fn picked_export(
        &mut self,
        selection: &super::StrategyFileSelection,
        now: Instant,
    ) -> Result<StrategyExportFileValue, HostError> {
        let ticket = self.ticket.take().ok_or(HostError::Denied)?;
        if now >= ticket.expires {
            return Err(HostError::StrategyPickExpired);
        }
        let Kind::Export {
            target,
            accepted_at,
        } = &ticket.kind
        else {
            return Err(HostError::Denied);
        };
        let Some(path) = &selection.path else {
            return Ok(StrategyExportFileValue::Cancelled);
        };
        self.require_open()?;
        // the same document and, for the accepted plan, the very plan that was asked for
        if ticket.revision != self.revision || *accepted_at != self.accepted_stamp(target) {
            return Err(self.conflict());
        }
        let path = checked_path(path)?;
        if !is_csv(&path) {
            return Err(HostError::StrategyExportNotCsv);
        }
        // a CSV never replaces the document it comes from, by any spelling
        if same_file(&path, &self.path) || same_file(&path, &self.root.join(PRIMARY)) {
            return Err(HostError::StrategyTargetExists);
        }
        let bytes = csv(&self.report_of(target)?);
        if bytes.len() > STRATEGY_EXPORT_LIMIT {
            return Err(HostError::StrategyFileTooLarge);
        }
        write_atomic(&path, &bytes)?;
        Ok(StrategyExportFileValue::Saved {
            file: file_of(&path).ok_or(HostError::StrategyFileUnavailable)?,
        })
    }
}

#[cfg(test)]
pub(super) fn write_for_tests(path: &Path, bytes: &[u8]) -> Result<(), HostError> {
    write_atomic(path, bytes)
}

#[cfg(test)]
pub(super) fn write_through_for_tests(
    path: &Path,
    bytes: &[u8],
    put: impl FnOnce(&mut std::fs::File, &[u8]) -> std::io::Result<()>,
    publish: impl FnOnce(&Path, &Path) -> std::io::Result<()>,
) -> Result<(), HostError> {
    write_through(path, bytes, put, publish)
}
