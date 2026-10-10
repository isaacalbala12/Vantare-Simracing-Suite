//! Fuel y stint: Board e historial de consumo únicos para todos los Looks (#1531).
//!
//! Combustible y, si la fuente la publica (Hypercar en LMU), energía virtual:
//! el recurso que se acaba antes decide las vueltas que quedan y la vuelta de
//! parada. Añade la ventana de parada, lo que falta para terminar, el ahorro
//! en FCY, el repostaje en curso y la confirmación de llegada. Solo valores
//! actuales; lo que la fuente no publica queda en `None` y se pinta `—`.

use crate::format::{self, Language, Preferences};
use crate::{
    Capability, Car, FlagKind, FlagScope, Player, Quality, Snapshot, SourceState, TyreCompound,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Config {
    pub history_rows: u8,
    pub show_projection: bool,
    pub virtual_energy: bool,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            history_rows: 4,
            show_projection: true,
            virtual_energy: false,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LapsBasis {
    Fuel,
    Session,
}

impl LapsBasis {
    pub fn label(self, language: Language) -> &'static str {
        match (self, language) {
            (Self::Fuel, Language::Es) => "combustible",
            (Self::Fuel, Language::En) => "fuel",
            (Self::Session, Language::Es) => "sesión",
            (Self::Session, Language::En) => "session",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Missing,
    Stale,
    Disconnected,
    VirtualUnavailable,
}
#[derive(Clone, Debug, PartialEq)]
pub struct HistoryEntry {
    pub lap: u32,
    pub consumed: Option<f64>,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Labels {
    pub show_projection: bool,
    pub status: Option<&'static str>,
    pub labels: [&'static str; 5],
    pub fuel: String,
    pub average: String,
    pub minimum: String,
    pub maximum: String,
    pub stops: String,
    pub stops_label: &'static str,
    pub laps: String,
    pub required: String,
    pub laps_basis: Option<LapsBasis>,
    pub finish: String,
    pub history_label: &'static str,
}

/// Con menos autonomía que esta, hay que entrar esta vuelta.
pub const LOW_LAPS: f64 = 1.5;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Resource {
    Fuel,
    Energy,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Board {
    pub identity: (u64, crate::SessionId, Option<crate::CarId>),
    pub content: Config,
    pub status: Option<Status>,
    pub raw_level: Quality<f64>,
    pub raw_capacity: Quality<f64>,
    pub raw_per_lap: Quality<f64>,
    pub raw_laps: Quality<f64>,
    pub session_laps: Quality<u32>,
    pub source_state: SourceState,
    pub player_present: bool,
    pub banner: Option<Banner>,
    /// Clase del coche propio (`Hypercar`, `LMGT3`).
    pub class: String,
    pub stint: Stint,
    /// Litros.
    pub fuel: Tank,
    /// Fracción 0–1; `None` si la fuente no publica energía virtual.
    pub energy: Option<Tank>,
    /// Recurso que se acaba antes (combustible si no hay energía).
    pub limit: Resource,
    /// Autonomía en vueltas del recurso que limita.
    pub laps_left: Option<f64>,
    /// Vuelta en curso y total de la carrera.
    pub lap: Option<u32>,
    pub laps_total: Option<u32>,
    /// Queda solo la vuelta en curso.
    pub final_lap: bool,
    pub plan: Plan,
    pub fcy: Option<Fcy>,
    pub service: Option<Service>,
    pub finish: Option<Finish>,
    pub window: Option<Window>,
    /// Historial único, antiguo a reciente; un dato inválido conserva su posición.
    pub history: Vec<HistoryEntry>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Tank {
    pub level: Option<f64>,
    pub capacity: Option<f64>,
    pub per_lap: Option<f64>,
    pub laps: Option<f64>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Stint {
    /// Paradas hechas + 1.
    pub number: Option<u32>,
    pub laps: Option<u32>,
    pub elapsed_s: Option<f64>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Plan {
    /// Última vuelta que se puede completar antes de entrar.
    Stop(u32),
    /// Autonomía por debajo de `LOW_LAPS`: entrar esta vuelta.
    Now,
    /// Se llega a meta; sobra esto del recurso que limita.
    Finish(f64),
    Unknown,
}

/// Consumo bajo FCY frente a la media.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Fcy {
    pub per_lap_l: f64,
    /// Autonomía si se mantuviera el ritmo de FCY.
    pub laps: f64,
    /// Fracción ahorrada frente a la media, 0–1.
    pub saving: f64,
    /// Vueltas que se retrasa la parada. La FCY no dura el stint entero: solo
    /// cuenta lo que se ahorra en la vuelta en curso.
    pub shift: i64,
}

/// Parada en curso.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Service {
    /// Litros que va a cargar la parada; sin él solo se ven los cargados.
    pub target_l: Option<f64>,
    pub added_l: Option<f64>,
    pub remaining_s: Option<f64>,
    pub tyres: Option<u8>,
    pub compound: Option<TyreCompound>,
    /// Litros y vueltas con los que se sale.
    pub exit_l: Option<f64>,
    pub exit_laps: Option<f64>,
}

/// Lo que falta para terminar la carrera.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Finish {
    pub stops: u32,
    pub add_l: f64,
}

/// Ventana de parada sobre el total de vueltas.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Window {
    pub open: u32,
    pub close: u32,
    pub total: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Banner {
    FullCourseYellow,
    LocalYellow(u8),
    InPits,
}

fn value(quality: &Quality<f64>) -> Option<f64> {
    quality
        .current()
        .copied()
        .filter(|v| v.is_finite() && *v >= 0.0)
}

fn positive(quality: &Quality<f64>) -> Option<f64> {
    value(quality).filter(|v| *v > 0.0)
}

fn tank(level: Option<f64>, capacity: Option<f64>, per_lap: Option<f64>) -> Tank {
    Tank {
        level,
        capacity,
        per_lap,
        laps: level.zip(per_lap).map(|(level, per_lap)| level / per_lap),
    }
}

pub fn project(snapshot: &Snapshot, prefs: Preferences) -> Board {
    project_with_config(snapshot, prefs, Config::default())
}
pub fn project_with_config(snapshot: &Snapshot, _prefs: Preferences, content: Config) -> Board {
    let state = &snapshot.state;
    let raw = state.player.as_ref().map(|p| &p.fuel);
    let status = status(state, content);
    let live = state.source_state == SourceState::Live;
    let car = state.player_car().filter(|_| live);
    let player = state.player.as_ref().filter(|_| car.is_some());
    let in_pits = car.is_some_and(|c| c.in_pits.current() == Some(&true));

    let fuel = player.map_or_else(Tank::default, |p| {
        let mut fuel = tank(
            value(&p.fuel.level_l),
            positive(&p.fuel.capacity_l),
            positive(&p.fuel.per_lap_l),
        );
        // El núcleo ya deriva la autonomía; se usa la suya si la publica.
        fuel.laps = value(&p.fuel.laps_left).or(fuel.laps);
        fuel
    });
    let energy = player
        .and_then(|p| Some((value(&p.fuel.energy)?, positive(&p.fuel.energy_per_lap))))
        .map(|(level, per_lap)| tank(Some(level.min(1.0)), Some(1.0), per_lap));
    let limit = match energy.and_then(|e| e.laps) {
        Some(energy_laps) if fuel.laps.is_none_or(|fuel_laps| energy_laps < fuel_laps) => {
            Resource::Energy
        }
        _ => Resource::Fuel,
    };
    let limiting = match limit {
        Resource::Fuel => fuel,
        Resource::Energy => energy.unwrap_or_default(),
    };
    let laps_left = limiting.laps;

    let completed = car.and_then(|c| c.laps.current().copied());
    let lap = completed.map(|laps| laps + 1);
    let remaining = state
        .session
        .laps_remaining
        .current()
        .copied()
        .filter(|_| car.is_some());

    let plan = plan(&limiting, remaining, completed);
    let banner = live.then(|| banner(snapshot, in_pits)).flatten();
    let fcy = player
        .filter(|_| banner == Some(Banner::FullCourseYellow) && limit == Resource::Fuel)
        .and_then(|p| fcy(&fuel, p));
    let service = player
        .filter(|_| in_pits)
        .and_then(|p| service(&fuel, p, car?));
    let finish = finish(&fuel, remaining);
    let window = match (plan, lap, completed, remaining) {
        (Plan::Stop(close), Some(lap), Some(done), Some(remaining)) => {
            let total = state
                .session
                .laps_total
                .current()
                .copied()
                .unwrap_or(done + remaining);
            Some(window(&limiting, finish, lap, close, total))
        }
        _ => None,
    };

    Board {
        identity: (
            snapshot.epoch,
            state.session.id,
            state.player.as_ref().map(|p| p.car),
        ),
        content,
        status,
        raw_level: raw.map_or(Quality::Unavailable, |f| f.level_l),
        raw_capacity: raw.map_or(Quality::Unavailable, |f| f.capacity_l),
        raw_per_lap: raw.map_or(Quality::Unavailable, |f| f.per_lap_l),
        raw_laps: raw.map_or(Quality::Unavailable, |f| f.laps_left),
        session_laps: state.session.laps_remaining,
        source_state: state.source_state,
        player_present: car.is_some(),
        banner,
        class: car.map_or_else(String::new, class_name),
        stint: player.map_or_else(Stint::default, |p| Stint {
            number: car.and_then(|c| c.pit_stops.current().map(|stops| stops + 1)),
            laps: p.stint.laps.current().copied(),
            elapsed_s: value(&p.stint.elapsed_s),
        }),
        fuel,
        energy,
        limit,
        laps_left,
        lap,
        laps_total: state
            .session
            .laps_total
            .current()
            .copied()
            .filter(|_| car.is_some()),
        final_lap: remaining == Some(1),
        plan,
        fcy,
        service,
        finish,
        window,
        history: history(raw),
    }
}

fn status(state: &crate::State, content: Config) -> Option<Status> {
    if state.source_state == SourceState::Lost {
        Some(Status::Disconnected)
    } else if state.source_state == SourceState::Waiting
        || state.player.is_none()
        || state.capabilities.fuel < Capability::WithData
    {
        Some(Status::Missing)
    } else if state.source_state == SourceState::Stale
        || state.capabilities.fuel == Capability::WithData
    {
        Some(Status::Stale)
    } else if content.virtual_energy {
        Some(Status::VirtualUnavailable)
    } else {
        None
    }
}
fn history(raw: Option<&crate::Fuel>) -> Vec<HistoryEntry> {
    raw.map_or_else(Vec::new, |f| {
        f.history
            .iter()
            .flatten()
            .map(|&(lap, consumed)| HistoryEntry {
                lap,
                consumed: (consumed.is_finite() && consumed >= 0.0).then_some(consumed),
            })
            .collect()
    })
}

/// Parada o llegada con la autonomía del recurso que limita.
fn plan(limiting: &Tank, remaining: Option<u32>, completed: Option<u32>) -> Plan {
    match (limiting.laps, remaining) {
        (Some(left), Some(remaining)) if left >= f64::from(remaining) => limiting
            .level
            .zip(limiting.per_lap)
            .map_or(Plan::Unknown, |(level, per_lap)| {
                Plan::Finish(level - per_lap * f64::from(remaining))
            }),
        (Some(left), _) if left < LOW_LAPS => Plan::Now,
        (Some(left), _) => completed.map_or(Plan::Unknown, |done| Plan::Stop(done + whole(left))),
        (None, _) => Plan::Unknown,
    }
}

fn fcy(fuel: &Tank, player: &Player) -> Option<Fcy> {
    let projection = positive(&player.fuel.lap_projection_l)?;
    let average = fuel.per_lap?;
    let level = fuel.level?;
    let fuel_laps = fuel.laps?;
    (projection < average).then(|| {
        let saving = 1.0 - projection / average;
        Fcy {
            per_lap_l: projection,
            laps: level / projection,
            saving,
            shift: i64::from(whole(fuel_laps + saving)) - i64::from(whole(fuel_laps)),
        }
    })
}

/// Repostaje en curso: con el objetivo o, al menos, los litros cargados.
fn service(fuel: &Tank, player: &Player, car: &Car) -> Option<Service> {
    let target = positive(&player.pit_service.refuel_target_l);
    let added = value(&player.pit_service.refuel_added_l);
    if target.is_none() && added.is_none() {
        return None;
    }
    let exit_l = target
        .zip(fuel.level)
        .map(|(target, level)| level + (target - added.unwrap_or(0.0)).max(0.0));
    Some(Service {
        target_l: target,
        added_l: added,
        remaining_s: value(&player.pit_service.remaining_s),
        tyres: player.pit_service.tyres.current().copied(),
        compound: car.tyre_compound.current().copied(),
        exit_l,
        exit_laps: exit_l.zip(fuel.per_lap).map(|(l, per_lap)| l / per_lap),
    })
}

fn finish(fuel: &Tank, remaining: Option<u32>) -> Option<Finish> {
    let (level, capacity, per_lap, remaining) =
        (fuel.level?, fuel.capacity?, fuel.per_lap?, remaining?);
    let needed = per_lap * f64::from(remaining) - level;
    (needed > 0.0).then(|| Finish {
        stops: whole((needed / capacity).ceil()),
        add_l: needed.min(capacity),
    })
}

/// Con una sola parada más, la ventana abre cuando un depósito lleno del
/// recurso que limita ya llega a meta; con más, abre ya.
fn window(limiting: &Tank, finish: Option<Finish>, lap: u32, close: u32, total: u32) -> Window {
    let tank_laps = limiting.capacity.zip(limiting.per_lap).map(|(c, p)| c / p);
    let open = match (finish, tank_laps) {
        (Some(Finish { stops: 1, .. }), Some(tank_laps)) => {
            total.saturating_sub(whole(tank_laps)).max(lap)
        }
        _ => lap,
    };
    Window {
        open: open.min(close),
        close,
        total: total.max(close),
    }
}

/// Parte entera de una cantidad de vueltas no negativa.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)] // Vueltas: 0..=u32.
fn whole(laps: f64) -> u32 {
    laps.floor().clamp(0.0, f64::from(u32::MAX)) as u32
}

fn class_name(car: &Car) -> String {
    car.class
        .as_ref()
        .map_or_else(String::new, |class| class.name.clone())
}

fn banner(snapshot: &Snapshot, in_pits: bool) -> Option<Banner> {
    if in_pits {
        return Some(Banner::InPits);
    }
    let flags = snapshot.state.flags.current();
    let yellow = |scope: fn(&FlagScope) -> Option<u8>| {
        flags
            .into_iter()
            .flatten()
            .filter(|flag| flag.kind == FlagKind::Yellow)
            .find_map(|flag| scope(&flag.scope))
    };
    if yellow(|s| matches!(s, FlagScope::Session).then_some(0)).is_some() {
        return Some(Banner::FullCourseYellow);
    }
    yellow(|s| match s {
        FlagScope::Sector(n) => Some(*n),
        _ => None,
    })
    .map(|sector| Banner::LocalYellow(sector + 1))
}

impl Board {
    pub fn status_text(&self, language: Language) -> Option<&'static str> {
        self.status.map(|status| match (status, language) {
            (Status::Missing, Language::Es) => "SIN DATOS",
            (Status::Missing, Language::En) => "NO DATA",
            (Status::Stale, Language::Es) => "DATOS ANTIGUOS",
            (Status::Stale, Language::En) => "DATA OUT OF DATE",
            (Status::Disconnected, Language::Es) => "DESCONECTADO",
            (Status::Disconnected, Language::En) => "DISCONNECTED",
            (Status::VirtualUnavailable, Language::Es) => {
                "ENERGÍA VIRTUAL NO DISPONIBLE EN LA SEÑAL EN VIVO"
            }
            (Status::VirtualUnavailable, Language::En) => "VIRTUAL ENERGY SIGNAL UNAVAILABLE",
        })
    }
    pub fn history_rows(&self) -> impl Iterator<Item = (usize, &HistoryEntry)> {
        self.history
            .iter()
            .enumerate()
            .rev()
            .take(usize::from(self.content.history_rows.clamp(1, 8)))
            .filter(|(_, row)| row.consumed.is_some() && self.status.is_none())
    }
    pub fn positive_history(&self) -> impl Iterator<Item = f64> + '_ {
        self.history
            .iter()
            .filter_map(|row| row.consumed)
            .filter(|v| *v > 0.0 && self.player_present)
    }
}
pub fn history_lap(lap: u32, language: Language) -> String {
    format!(
        "{} {lap}",
        if language == Language::Es {
            "VUELTA"
        } else {
            "LAP"
        }
    )
}
pub fn history_consumed(value: Option<f64>) -> String {
    liters(value, 1)
}
pub fn labels(board: &Board, prefs: Preferences) -> Labels {
    let config = board.content;
    let status = board.status_text(prefs.language);
    let current = |value: &Quality<f64>| {
        if status.is_some() {
            None
        } else {
            value
                .current()
                .copied()
                .filter(|v| v.is_finite() && *v >= 0.0)
        }
    };
    let session_laps = board.session_laps.current().copied();
    let (laps, laps_basis) = if let Some(laps) = current(&board.raw_laps) {
        (Some(laps), Some(LapsBasis::Fuel))
    } else if let Some(laps) = session_laps.filter(|_| status.is_none()) {
        (Some(f64::from(laps)), Some(LapsBasis::Session))
    } else {
        (None, None)
    };
    let required = liters(
        current(&required_fuel(board.raw_per_lap, board.session_laps)),
        1,
    );
    let required_label = match prefs.language {
        Language::Es => "NEC.",
        Language::En => "REQ",
    };
    let extremes = consumption_extremes(board);
    let stops = (status.is_none() && config.show_projection)
        .then(|| required_stops(board))
        .flatten();
    Labels {
        show_projection: config.show_projection,
        status,
        labels: match prefs.language {
            Language::Es => ["COMBUSTIBLE", "MED.", "VUELTAS", "NEC.", "EST. META:"],
            Language::En => ["FUEL", "AVG", "LAPS", "REQ", "EST. FINISH:"],
        },
        fuel: liters(current(&board.raw_level), 1),
        average: liters(current(&board.raw_per_lap), 2),
        minimum: liters(extremes.filter(|_| status.is_none()).map(|v| v.0), 2),
        maximum: liters(extremes.filter(|_| status.is_none()).map(|v| v.1), 2),
        stops: decimal(stops, 0),
        stops_label: if prefs.language == Language::Es {
            "PARADAS"
        } else {
            "STOPS"
        },
        laps: decimal(laps.filter(|_| config.show_projection), 1),
        laps_basis: laps_basis.filter(|_| config.show_projection),
        finish: if !config.show_projection {
            format::PLACEHOLDER.into()
        } else if required == format::PLACEHOLDER {
            required.clone()
        } else {
            format!("{required} {required_label}")
        },
        required: if config.show_projection {
            required
        } else {
            format::PLACEHOLDER.into()
        },
        history_label: if prefs.language == Language::Es {
            "HISTORIAL"
        } else {
            "HISTORY"
        },
    }
}

// Extremos sobre todo el historial valido, no solo las filas visibles.
fn consumption_extremes(board: &Board) -> Option<(f64, f64)> {
    let mut consumption = board
        .history
        .iter()
        .filter_map(|row| row.consumed)
        .filter(|v| *v > 0.0);
    let first = consumption.next()?;
    Some(consumption.fold((first, first), |(min, max), value| {
        (min.min(value), max.max(value))
    }))
}

fn required_stops(board: &Board) -> Option<f64> {
    let required = *required_fuel(board.raw_per_lap, board.session_laps).current()?;
    let level = *board.raw_level.current()?;
    let capacity = *board.raw_capacity.current()?;
    if !level.is_finite()
        || level < 0.0
        || !capacity.is_finite()
        || capacity <= 0.0
        || level > capacity
    {
        return None;
    }
    let stops = ((required - level).max(0.0) / capacity).ceil();
    stops.is_finite().then_some(stops)
}
/// Conserva la peor calidad de los dos operandos; no usa la autonomía del tanque.
fn required_fuel(per_lap: Quality<f64>, session_laps: Quality<u32>) -> Quality<f64> {
    let (per_lap, estimated, stale) = match per_lap {
        Quality::Reliable(v) => (v, false, false),
        Quality::Estimated(v) => (v, true, false),
        Quality::Stale(v) => (v, false, true),
        Quality::Unavailable => return Quality::Unavailable,
    };
    let (laps, estimated_laps, stale_laps) = match session_laps {
        Quality::Reliable(v) => (v, false, false),
        Quality::Estimated(v) => (v, true, false),
        Quality::Stale(v) => (v, false, true),
        Quality::Unavailable => return Quality::Unavailable,
    };
    let required = per_lap * f64::from(laps);
    if !per_lap.is_finite() || per_lap <= 0.0 || !required.is_finite() {
        Quality::Unavailable
    } else if stale || stale_laps {
        Quality::Stale(required)
    } else if estimated || estimated_laps {
        Quality::Estimated(required)
    } else {
        Quality::Reliable(required)
    }
}

fn liters(value: Option<f64>, decimals: u8) -> String {
    match value {
        Some(value) => format!("{} L", decimal(Some(value), decimals)),
        None => format::PLACEHOLDER.into(),
    }
}

// `format::to_fixed` es privado. Mantener aquí el desempate de JS hasta que el
// formateador compartido exponga decimales (2.25 → 2.3, no el empate al par).
#[allow(clippy::float_cmp)] // La igualdad exacta identifica el empate binario.
fn decimal(value: Option<f64>, decimals: u8) -> String {
    let Some(value) = value else {
        return format::PLACEHOLDER.into();
    };
    let scale = 10_f64.powi(i32::from(decimals));
    let scaled = value * scale;
    let tie = scaled.fract() == 0.5 && scaled / scale == value;
    let rounded = if tie {
        (scaled.floor() + 1.0) / scale
    } else {
        value
    };
    format!("{:.*}", usize::from(decimals), rounded)
}

#[cfg(test)]
mod legacy_tests {
    struct Formatted {
        values: Labels,
        history: Vec<HistoryRow>,
    }
    struct HistoryRow {
        lap: String,
        consumed: String,
    }
    impl std::ops::Deref for Formatted {
        type Target = Labels;
        fn deref(&self) -> &Labels {
            &self.values
        }
    }
    fn project(s: &Snapshot, p: Preferences) -> Formatted {
        project_with_config(s, p, Config::default())
    }
    fn project_with_config(s: &Snapshot, p: Preferences, c: Config) -> Formatted {
        let board = super::project_with_config(s, p, c);
        let history = board
            .history_rows()
            .map(|(_, row)| HistoryRow {
                lap: history_lap(row.lap, p.language),
                consumed: history_consumed(row.consumed),
            })
            .collect();
        Formatted {
            values: super::labels(&board, p),
            history,
        }
    }

    #[test]
    fn fuel_variants_clip_history_hide_projection_and_declare_virtual_energy() {
        let mut fuel = Fuel {
            level_l: Quality::Reliable(42.0),
            ..Fuel::default()
        };
        for (i, row) in fuel.history.iter_mut().enumerate() {
            *row = Some((u32::try_from(i).expect("index"), 2.0));
        }
        let data = snapshot(&fuel);
        for rows in [1, 4, 8] {
            let vm = project_with_config(
                &data,
                Preferences::default(),
                Config {
                    history_rows: rows,
                    ..Config::default()
                },
            );
            assert_eq!(vm.history.len(), usize::from(rows));
            assert_eq!(vm.history[0].lap, "VUELTA 9");
            assert_eq!(vm.history[0].consumed, "2.0 L");
        }
        let hidden = project_with_config(
            &data,
            Preferences::default(),
            Config {
                show_projection: false,
                ..Config::default()
            },
        );
        assert!(!hidden.show_projection);
        assert_eq!(hidden.laps, "—");
        assert_eq!(hidden.required, "—");
        let energy = project_with_config(
            &data,
            Preferences::default(),
            Config {
                virtual_energy: true,
                ..Config::default()
            },
        );
        assert_eq!(
            energy.status,
            Some("ENERGÍA VIRTUAL NO DISPONIBLE EN LA SEÑAL EN VIVO")
        );
        assert_eq!(energy.fuel, "—");
        assert!(energy.history.is_empty());
    }

    use super::*;
    use crate::{Capabilities, Fuel, Player, State};

    #[test]
    fn extremes_use_all_valid_history_and_stops_round_up_missing_fuel() {
        let mut fuel = Fuel {
            level_l: Quality::Reliable(10.0),
            capacity_l: Quality::Reliable(75.0),
            per_lap_l: Quality::Estimated(2.0),
            ..Fuel::default()
        };
        fuel.history[..6].copy_from_slice(&[
            Some((1, 1.25)),
            Some((2, 4.5)),
            Some((3, f64::NAN)),
            Some((4, -1.0)),
            Some((5, 0.0)),
            Some((6, 2.0)),
        ]);
        let mut data = snapshot(&fuel);
        data.state.session.laps_remaining = Quality::Reliable(43);
        let vm = project_with_config(
            &data,
            Preferences::default(),
            Config {
                history_rows: 1,
                ..Config::default()
            },
        );
        assert_eq!(
            (vm.minimum.as_str(), vm.maximum.as_str(), vm.stops.as_str()),
            ("1.25 L", "4.50 L", "2")
        );
        for (laps, stops) in [(0, "0"), (5, "0"), (42, "1"), (43, "2")] {
            data.state.session.laps_remaining = Quality::Reliable(laps);
            assert_eq!(project(&data, Preferences::default()).stops, stops);
        }
        for capacity in [
            Quality::Unavailable,
            Quality::Stale(75.0),
            Quality::Reliable(0.0),
            Quality::Reliable(5.0),
        ] {
            data.state.player.as_mut().expect("jugador").fuel.capacity_l = capacity;
            assert_eq!(project(&data, Preferences::default()).stops, "—");
        }
        data.state.player.as_mut().expect("jugador").fuel.capacity_l = Quality::Reliable(75.0);
        data.state.session.laps_remaining = Quality::Unavailable;
        assert_eq!(project(&data, Preferences::default()).stops, "—");
        data.state.source_state = SourceState::Stale;
        let vm = project(&data, Preferences::default());
        assert_eq!(
            (vm.minimum.as_str(), vm.maximum.as_str(), vm.stops.as_str()),
            ("—", "—", "—")
        );
    }

    #[test]
    fn session_projection_is_independent_of_tank_range() {
        let mut data = snapshot(&Fuel {
            per_lap_l: Quality::Reliable(2.14),
            ..Fuel::default()
        });
        data.state.session.laps_remaining = Quality::Reliable(79);
        let vm = project(&data, Preferences::default());
        assert_eq!(vm.laps, "79.0");
        assert_eq!(vm.laps_basis, Some(LapsBasis::Session));
        assert_eq!(vm.required, "169.1 L");
        if let Some(player) = &mut data.state.player {
            player.fuel.laps_left = Quality::Estimated(19.6);
        }
        let vm = project(&data, Preferences::default());
        assert_eq!(vm.laps, "19.6");
        assert_eq!(vm.laps_basis, Some(LapsBasis::Fuel));
        assert_eq!(vm.required, "169.1 L");
    }

    #[test]
    fn required_quality_and_history_are_not_reconstructed_from_the_tank() {
        assert_eq!(
            required_fuel(Quality::Reliable(2.0), Quality::Reliable(4)),
            Quality::Reliable(8.0)
        );
        assert_eq!(
            required_fuel(Quality::Estimated(2.0), Quality::Reliable(4)),
            Quality::Estimated(8.0)
        );
        assert_eq!(
            required_fuel(Quality::Reliable(2.0), Quality::Stale(4)),
            Quality::Stale(8.0)
        );
        assert_eq!(
            required_fuel(Quality::Stale(2.0), Quality::Estimated(4)),
            Quality::Stale(8.0)
        );
        for per_lap in [
            Quality::Unavailable,
            Quality::Reliable(0.0),
            Quality::Reliable(-1.0),
            Quality::Reliable(f64::NAN),
            Quality::Reliable(f64::MAX),
        ] {
            assert_eq!(
                required_fuel(per_lap, Quality::Reliable(4)),
                Quality::Unavailable
            );
        }
        assert_eq!(
            required_fuel(Quality::Reliable(2.0), Quality::Unavailable),
            Quality::Unavailable
        );
        assert_eq!(
            required_fuel(Quality::Reliable(2.0), Quality::Reliable(0)),
            Quality::Reliable(0.0)
        );
        let mut fuel = Fuel::default();
        for (index, entry) in fuel.history.iter_mut().enumerate() {
            *entry = Some((u32::try_from(index).expect("diez filas"), 2.0));
        }
        let vm = project(&snapshot(&fuel), Preferences::default());
        assert_eq!(
            vm.history
                .iter()
                .map(|row| row.lap.as_str())
                .collect::<Vec<_>>(),
            ["VUELTA 9", "VUELTA 8", "VUELTA 7", "VUELTA 6"]
        );
        assert_eq!(LapsBasis::Fuel.label(Language::Es), "combustible");
        assert_eq!(LapsBasis::Session.label(Language::Es), "sesión");
    }

    fn snapshot(fuel: &Fuel) -> Snapshot {
        Snapshot {
            state: State {
                source_state: crate::SourceState::Live,
                capabilities: Capabilities {
                    fuel: Capability::Fresh,
                    ..Capabilities::default()
                },
                player: Some(Player {
                    fuel: *fuel,
                    ..Player::default()
                }),
                ..State::default()
            },
            ..Snapshot::default()
        }
    }

    #[test]
    fn canonical_values_and_zero_are_not_recomputed() {
        for (level, average, laps, expected) in [
            (42.0, 2.14, 19.625, ["42.0 L", "2.14 L", "19.6"]),
            (0.0, 0.0, 0.0, ["0.0 L", "0.00 L", "0.0"]),
            (2.25, 0.125, 2.25, ["2.3 L", "0.13 L", "2.3"]),
        ] {
            let mut data = snapshot(&Fuel {
                history: Default::default(),
                level_l: Quality::Reliable(level),
                capacity_l: Quality::Reliable(100.0),
                per_lap_l: Quality::Estimated(average),
                laps_left: Quality::Estimated(laps),
                ..Fuel::default()
            });
            data.state.session.laps_remaining = Quality::Reliable(79);
            let vm = project(&data, Preferences::default());
            assert_eq!(
                [vm.fuel.as_str(), vm.average.as_str(), vm.laps.as_str()],
                expected
            );
            assert_eq!(
                vm.required,
                if average > 0.0 {
                    liters(Some(average * 79.0), 1)
                } else {
                    format::PLACEHOLDER.into()
                }
            );
            assert_eq!(vm.status, None);
        }
    }

    #[test]
    fn missing_stale_and_invalid_values_never_become_zero() {
        for value in [
            Quality::Unavailable,
            Quality::Stale(42.0),
            Quality::Reliable(-1.0),
            Quality::Reliable(f64::NAN),
            Quality::Estimated(f64::INFINITY),
        ] {
            let data = snapshot(&Fuel {
                level_l: value,
                per_lap_l: value,
                laps_left: value,
                ..Fuel::default()
            });
            let vm = project(&data, Preferences::default());
            assert_eq!(
                [vm.fuel.as_str(), vm.average.as_str(), vm.laps.as_str()],
                [format::PLACEHOLDER; 3]
            );
        }
    }

    #[test]
    fn empty_and_capability_states_have_translated_status() {
        for (capability, expected) in [
            (Capability::Unsupported, Some("SIN DATOS")),
            (Capability::Supported, Some("SIN DATOS")),
            (Capability::WithData, Some("DATOS ANTIGUOS")),
            (Capability::Fresh, None),
        ] {
            let mut data = snapshot(&Fuel::default());
            data.state.capabilities.fuel = capability;
            assert_eq!(project(&data, Preferences::default()).status, expected);
        }
        let prefs = Preferences {
            language: Language::En,
            ..Preferences::default()
        };
        assert_eq!(project(&Snapshot::default(), prefs).status, Some("NO DATA"));
    }

    #[test]
    fn widget_contract_keeps_liters_in_imperial_preferences() {
        let data = snapshot(&Fuel {
            level_l: Quality::Reliable(42.0),
            ..Fuel::default()
        });
        let prefs = Preferences {
            language: Language::En,
            units: format::Units::Imperial,
        };
        let vm = project(&data, prefs);
        assert_eq!(vm.fuel, "42.0 L");
        assert_eq!(vm.labels, ["FUEL", "AVG", "LAPS", "REQ", "EST. FINISH:"]);
    }
}

#[cfg(test)]
mod rich_tests {
    fn project(s: &Snapshot) -> Board {
        super::project(s, Preferences::default())
    }
    use super::*;
    use crate::{Class, ClassId, Flag, Fuel, PitService, Session, State};

    /// Lotterer-ish: Hypercar en la vuelta 14 de 38, 42.6 L a 3.71 L/v.
    fn snapshot() -> Snapshot {
        let car = Car {
            id: crate::CarId(50),
            class: Some(Class {
                id: ClassId(1),
                name: "Hypercar".into(),
            }),
            laps: Quality::Reliable(13),
            pit_stops: Quality::Reliable(1),
            in_pits: Quality::Reliable(false),
            ..Car::default()
        };
        let mut fuel = Fuel {
            level_l: Quality::Reliable(42.6),
            capacity_l: Quality::Reliable(90.0),
            per_lap_l: Quality::Estimated(3.71),
            ..Fuel::default()
        };
        fuel.history[0] = Some((12, 3.78));
        fuel.history[1] = Some((13, 3.74));
        Snapshot {
            state: State {
                source_state: SourceState::Live,
                session: Session {
                    laps_remaining: Quality::Estimated(25),
                    laps_total: Quality::Reliable(38),
                    ..Session::default()
                },
                cars: vec![car],
                player: Some(Player {
                    car: crate::CarId(50),
                    fuel,
                    ..Player::default()
                }),
                ..State::default()
            },
            ..Snapshot::default()
        }
    }

    fn player(s: &mut Snapshot) -> &mut Player {
        s.state.player.as_mut().expect("jugador")
    }

    #[test]
    fn fuel_only_plans_the_stop_window_and_what_is_left_to_finish() {
        let board = project(&snapshot());
        assert!(board.player_present);
        assert_eq!(board.limit, Resource::Fuel);
        assert!(board.energy.is_none());
        assert_eq!(board.lap, Some(14));
        let left = board.laps_left.expect("autonomía");
        assert!((left - 42.6 / 3.71).abs() < 1e-9);
        assert_eq!(board.plan, Plan::Stop(13 + 11));
        let finish = board.finish.expect("faltan litros");
        assert_eq!(finish.stops, 1);
        assert!((finish.add_l - (3.71 * 25.0 - 42.6)).abs() < 1e-9);
        // Un depósito lleno da 24 vueltas: desde la 14 ya se llega.
        assert_eq!(
            board.window,
            Some(Window {
                open: 14,
                close: 24,
                total: 38
            })
        );
        assert_eq!(board.stint.number, Some(2));
        assert_eq!(
            board.positive_history().collect::<Vec<_>>(),
            vec![3.78, 3.74]
        );
    }

    #[test]
    fn virtual_energy_limits_when_it_runs_out_first() {
        let mut s = snapshot();
        player(&mut s).fuel.energy = Quality::Reliable(0.614);
        player(&mut s).fuel.energy_per_lap = Quality::Estimated(0.0482);
        let board = project(&s);
        let energy = board.energy.expect("energía");
        assert!((energy.laps.expect("vueltas") - 0.614 / 0.0482).abs() < 1e-9);
        assert_eq!(
            board.limit,
            Resource::Fuel,
            "12.7 v de energía > 11.5 v de litros"
        );
        player(&mut s).fuel.energy = Quality::Reliable(0.40);
        let board = project(&s);
        assert_eq!(board.limit, Resource::Energy);
        assert_eq!(board.plan, Plan::Stop(13 + 8));
    }

    #[test]
    fn low_fuel_last_lap_and_spectator_states() {
        let mut s = snapshot();
        player(&mut s).fuel.level_l = Quality::Reliable(4.4);
        assert_eq!(project(&s).plan, Plan::Now);
        s.state.session.laps_remaining = Quality::Reliable(1);
        player(&mut s).fuel.level_l = Quality::Reliable(5.8);
        let Plan::Finish(spare) = project(&s).plan else {
            panic!("llega a meta");
        };
        assert!((spare - (5.8 - 3.71)).abs() < 1e-9);
        assert!(project(&s).finish.is_none());
        let mut spectator = snapshot();
        spectator.state.player = None;
        let board = project(&spectator);
        assert!(!board.player_present);
        assert_eq!(board.plan, Plan::Unknown);
        let mut waiting = snapshot();
        waiting.state.source_state = SourceState::Waiting;
        assert!(!project(&waiting).player_present);
    }

    #[test]
    fn fcy_projection_saves_fuel_and_moves_the_stop() {
        let mut s = snapshot();
        s.state.flags = Quality::Reliable(vec![Flag {
            kind: FlagKind::Yellow,
            scope: FlagScope::Session,
        }]);
        player(&mut s).fuel.lap_projection_l = Quality::Estimated(1.41);
        let board = project(&s);
        assert_eq!(board.banner, Some(Banner::FullCourseYellow));
        let fcy = board.fcy.expect("ahorro");
        assert!((fcy.saving - (1.0 - 1.41 / 3.71)).abs() < 1e-9);
        assert!((fcy.laps - 42.6 / 1.41).abs() < 1e-9);
        // 11.48 v + 0.62 v ahorradas en esta vuelta: la parada se retrasa una.
        assert_eq!(fcy.shift, 1);
    }

    #[test]
    fn refuelling_shows_progress_and_what_you_leave_with() {
        let mut s = snapshot();
        s.state.cars[0].in_pits = Quality::Reliable(true);
        s.state.cars[0].tyre_compound = Quality::Reliable(TyreCompound::Medium);
        player(&mut s).pit_service = PitService {
            refuel_target_l: Quality::Reliable(58.0),
            refuel_added_l: Quality::Reliable(34.1),
            remaining_s: Quality::Estimated(9.8),
            tyres: Quality::Reliable(4),
        };
        let board = project(&s);
        assert_eq!(board.banner, Some(Banner::InPits));
        let service = board.service.expect("repostaje");
        assert_eq!(service.tyres, Some(4));
        assert_eq!(service.compound, Some(TyreCompound::Medium));
        assert!((service.exit_l.expect("salida") - (42.6 + 58.0 - 34.1)).abs() < 1e-9);
        // Sin objetivo: solo los litros cargados, sin salida calculada.
        player(&mut s).pit_service.refuel_target_l = Quality::Unavailable;
        let service = project(&s).service.expect("cargando");
        assert_eq!((service.target_l, service.exit_l), (None, None));
        // Sin nada de la parada no se inventa el servicio.
        player(&mut s).pit_service = PitService::default();
        assert!(project(&s).service.is_none());
    }
}
