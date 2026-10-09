//! Standings: una proyección de hechos compartida por todos los Looks (#1531).
//!
//! Clasificación multiclase agrupada por clase: posiciones ganadas, compuesto,
//! paradas, sectores de la vuelta en curso, última y mejor vuelta y gap al
//! líder de clase. Solo se muestran valores fiables o estimados; lo que la
//! fuente no publica es `—` o se omite, nunca un valor inventado.

use crate::format::{self, Language, PLACEHOLDER, Preferences};
use crate::{
    Capability, Car, CarId, FlagKind, FlagScope, Gap, Quality, SessionKind, Snapshot, SourceState,
    TyreCompound,
};

/// Diferencia por debajo de la cual dos tiempos se consideran iguales.
const TOLERANCE_S: f64 = 0.0005;

pub type ViewModel = Board;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Content {
    pub player_class: bool,
    pub class_gaps: bool,
    pub footer_ids: Vec<String>,
    pub footer_slots: bool,
}

#[derive(Clone, Debug, PartialEq)]
#[allow(clippy::struct_excessive_bools)] // Hechos independientes: presencia, boxes, vuelta final y modo de gaps.
pub struct Board {
    key: ProjectionKey,
    row_index: std::collections::HashMap<CarId, (usize, usize)>,
    input_order: Vec<(usize, usize)>,
    pub content: Content,
    pub player_class: Option<crate::ClassId>,
    pub capability: Capability,
    pub session_label: String,
    pub clock: String,
    pub class_chip: String,
    pub flag: Option<FlagKind>,
    pub gap_to_best_lap: bool,
    pub track: String,
    pub laps_remaining: String,
    pub footer_cells: Vec<InfoCell>,
    pub source_state: SourceState,
    /// «Carrera», «Práctica»…; `—` sin sesión.
    pub session: String,
    /// Vuelta en curso del líder, `14/38` o `14`; vacío fuera de carrera.
    pub lap: String,
    pub final_lap: bool,
    /// Tiempo restante `h:mm:ss`; `—` si no se publica.
    pub remaining: String,
    pub banner: Option<Banner>,
    pub groups: Vec<Group>,
    /// Hay coche del jugador en la sesión.
    pub player_present: bool,
    pub player_in_pits: bool,
    /// Vuelta rápida de la sesión: tiempo y apellido del piloto.
    pub fastest: Option<(String, String)>,
    /// Temperatura de pista (`31 °C`) y estado de la superficie.
    pub track_temperature: String,
    pub surface: String,
}

/// Avisos de sesión que ocupan la franja superior.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Banner {
    /// Amarilla en todo el circuito (FCY).
    FullCourseYellow,
    /// Amarilla local en un sector (desde 1).
    LocalYellow(u8),
    FinalLap,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Group {
    best: Option<f64>,
    best_sectors: Vec<Option<f64>>,
    pub class: std::sync::Arc<str>,
    /// Abreviatura de cabecera: `HY`, `LMP2`, `LMGT3`.
    pub short: String,
    pub cars: usize,
    pub best_lap: String,
    pub rows: Vec<std::sync::Arc<Row>>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Row {
    facts: RowFacts,
    pub class: std::sync::Arc<str>,
    pub class_id: Option<crate::ClassId>,
    pub class_position: Option<u32>,
    pub laps: String,
    pub in_pits: bool,
    pub last_lap_s: Option<f64>,
    pub best_lap_s: Option<f64>,
    pub classification_gap: String,
    pub classification_interval: String,
    pub id: CarId,
    pub position: String,
    /// Posiciones ganadas (+) o perdidas (−) desde la salida.
    pub gained: Option<i64>,
    pub number: String,
    pub driver: String,
    pub vehicle: String,
    pub compound: Option<TyreCompound>,
    pub pit: Pit,
    pub sectors: Vec<Mark>,
    pub last_lap: String,
    pub best_lap: String,
    pub best_mark: Mark,
    pub gap: String,
    pub interval: String,
    pub is_player: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pit {
    InPits,
    Stops(u32),
    Unknown,
}

/// Color de un tiempo: morado mejor de la clase, verde mejor personal,
/// amarillo más lento; `Pending` es un sector aún sin completar o sin dato.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mark {
    Pending,
    Fastest,
    Personal,
    Slower,
}

pub fn project(snapshot: &Snapshot, prefs: Preferences) -> Board {
    project_content(snapshot, prefs, &Content::default())
}

pub fn project_player_class(snapshot: &Snapshot, prefs: Preferences) -> Board {
    project_classification(snapshot, prefs, true, true)
}

pub fn project_classification(
    snapshot: &Snapshot,
    prefs: Preferences,
    player_class: bool,
    class_gaps: bool,
) -> Board {
    project_content(
        snapshot,
        prefs,
        &Content {
            player_class,
            class_gaps,
            ..Content::default()
        },
    )
}

impl Board {
    /// Una colección; la vista global solo presta las filas, sin clonarlas.
    pub fn rows(&self) -> Vec<&Row> {
        let mut rows: Vec<_> = self
            .groups
            .iter()
            .flat_map(|g| &g.rows)
            .map(std::sync::Arc::as_ref)
            .filter(|row| {
                !self.content.player_class
                    || row.class_id.is_none_or(|id| Some(id) == self.player_class)
            })
            .collect();
        rows.sort_by_key(|row| row.position.parse::<u32>().unwrap_or(u32::MAX));
        rows
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct Scalars {
    position: Quality<u32>,
    class_position: Quality<u32>,
    laps: Quality<u32>,
    grid: Quality<u32>,
    stops: Quality<u32>,
    last: Quality<f64>,
    best: Quality<f64>,
    estimated: Quality<f64>,
    pits: Quality<bool>,
    compound: Quality<TyreCompound>,
    gap: Quality<Gap>,
    interval: Quality<Gap>,
    class_gap: Quality<Gap>,
    class_interval: Quality<Gap>,
}
impl Scalars {
    fn new(c: &Car) -> Self {
        Self {
            position: c.position,
            class_position: c.class_position,
            laps: c.laps,
            grid: c.grid_position,
            stops: c.pit_stops,
            last: c.last_lap_s,
            best: c.best_lap_s,
            estimated: c.estimated_lap_s,
            pits: c.in_pits,
            compound: c.tyre_compound,
            gap: c.gap_leader,
            interval: c.gap_ahead,
            class_gap: c.gap_class_leader,
            class_interval: c.gap_class_ahead,
        }
    }
}
#[derive(Clone, Debug, PartialEq)]
struct RowFacts {
    scalars: Scalars,
    current: Vec<Quality<f64>>,
    best: Vec<Quality<f64>>,
}
impl RowFacts {
    fn new(c: &Car) -> Self {
        Self {
            scalars: Scalars::new(c),
            current: c.current_sectors_s.clone(),
            best: c.best_sectors_s.clone(),
        }
    }
}
impl Row {
    fn matches(&self, c: &Car) -> bool {
        self.id == c.id
            && self.number == c.number
            && self.driver == c.driver.name
            && self.vehicle == c.vehicle
            && self.class_id == c.class.as_ref().map(|v| v.id)
            && self.class.as_ref() == c.class.as_ref().map_or("", |v| v.name.as_str())
            && self.facts.scalars == Scalars::new(c)
            && self.facts.current == c.current_sectors_s
            && self.facts.best == c.best_sectors_s
    }
}
#[derive(Clone, Debug, PartialEq)]
struct ProjectionKey {
    prefs: Preferences,
    source: SourceState,
    player: Option<CarId>,
    anchor: Option<CarId>,
    positions: Capability,
    kind: Quality<SessionKind>,
    remaining: Quality<f64>,
    track: Quality<String>,
    laps_remaining: Quality<u32>,
    total: Quality<u32>,
    weather: crate::Weather,
    flags: Quality<Vec<crate::Flag>>,
}
impl ProjectionKey {
    fn new(s: &Snapshot, prefs: Preferences) -> Self {
        let v = &s.state;
        let t = &v.session;
        Self {
            prefs,
            source: v.source_state,
            player: v.player.as_ref().map(|p| p.car),
            anchor: v.player_car().or_else(|| v.cars.first()).map(|c| c.id),
            positions: v.capabilities.positions,
            kind: t.kind.clone(),
            remaining: t.remaining_s,
            track: t.track_name.clone(),
            laps_remaining: t.laps_remaining,
            total: t.laps_total,
            weather: t.weather,
            flags: v.flags.clone(),
        }
    }
    fn matches(&self, s: &Snapshot, prefs: Preferences) -> bool {
        let v = &s.state;
        let t = &v.session;
        self.prefs == prefs
            && self.source == v.source_state
            && self.player == v.player.as_ref().map(|p| p.car)
            && self.anchor == v.player_car().or_else(|| v.cars.first()).map(|c| c.id)
            && self.positions == v.capabilities.positions
            && self.kind == t.kind
            && self.remaining == t.remaining_s
            && self.track == t.track_name
            && self.laps_remaining == t.laps_remaining
            && self.total == t.laps_total
            && self.weather == t.weather
            && self.flags == v.flags
    }
}
impl Board {
    fn matches(&self, s: &Snapshot, prefs: Preferences, content: &Content) -> bool {
        if self.content != *content || !self.key.matches(s, prefs) {
            return false;
        }
        if matches!(
            s.state.source_state,
            SourceState::Waiting | SourceState::Lost
        ) {
            return s.state.cars.is_empty();
        }
        self.input_order.len() == s.state.cars.len()
            && s.state
                .cars
                .iter()
                .zip(&self.input_order)
                .all(|(car, &(g, r))| self.groups[g].rows[r].matches(car))
    }
}

/// Caché incremental de hechos: no recibe Look, secuencia ni otra proyección.
/// La clave vive en el propio Board; no guarda un Snapshot ni otro historial.
pub fn project_cached(
    snapshot: &Snapshot,
    prefs: Preferences,
    content: &Content,
    previous: Option<&std::sync::Arc<Board>>,
) -> std::sync::Arc<Board> {
    if let Some(old) = previous.filter(|b| b.matches(snapshot, prefs, content)) {
        return old.clone();
    }
    std::sync::Arc::new(project_with_previous(
        snapshot,
        prefs,
        content,
        previous.map(std::sync::Arc::as_ref),
    ))
}

pub fn project_content(snapshot: &Snapshot, prefs: Preferences, content: &Content) -> Board {
    project_with_previous(snapshot, prefs, content, None)
}

fn project_with_previous(
    snapshot: &Snapshot,
    prefs: Preferences,
    content: &Content,
    previous: Option<&Board>,
) -> Board {
    let state = &snapshot.state;
    let available = !matches!(state.source_state, SourceState::Waiting | SourceState::Lost);
    let session = &state.session;
    let kind = session.kind.current().filter(|_| available);
    let race = kind == Some(&SessionKind::Race);

    let class = state
        .player_car()
        .or_else(|| state.cars.first())
        .and_then(|c| c.class.as_ref())
        .map(|c| c.id);
    let groups = project_groups(snapshot, prefs, content, kind, class, previous);

    let leader_laps = state
        .cars
        .iter()
        .filter(|car| car.position.current() == Some(&1))
        .find_map(|car| car.laps.current().copied());
    let current_lap = leader_laps.map(|laps| laps + 1);
    let total = session.laps_total.current().copied();
    let lap = match (race, current_lap, total) {
        (true, Some(lap), Some(total)) => format!("{}/{total}", lap.min(total)),
        (true, Some(lap), None) => lap.to_string(),
        (true, None, _) => PLACEHOLDER.into(),
        (false, ..) => String::new(),
    };
    let final_lap = race && matches!((current_lap, total), (Some(l), Some(t)) if l >= t);

    let player_car = state.player_car().filter(|_| available);
    let fastest = state
        .cars
        .iter()
        .filter(|_| available)
        .filter_map(|car| rich_positive(&car.best_lap_s).map(|lap| (lap, car)))
        .min_by(|a, b| a.0.total_cmp(&b.0))
        .map(|(lap, car)| (format::lap_time(Some(lap)), surname(&car.driver.name)));

    let player_gap = groups
        .iter()
        .flat_map(|g| &g.rows)
        .find(|r| r.is_player)
        .map(|r| r.classification_gap.as_str());
    let footer_cells = information(
        snapshot,
        prefs,
        &content.footer_ids,
        content.footer_slots,
        player_gap,
    );
    let row_index = row_index(&groups);
    let input_order = state
        .cars
        .iter()
        .filter_map(|car| row_index.get(&car.id).copied())
        .collect();
    Board {
        key: ProjectionKey::new(snapshot, prefs),
        row_index,
        input_order,
        content: content.clone(),
        player_class: class,
        capability: state.capabilities.positions,
        session_label: kind.map_or_else(|| PLACEHOLDER.into(), |k| format::session_kind(k, prefs)),
        clock: format::clock(session.remaining_s.current().copied()),
        class_chip: class_chip(snapshot),
        flag: (state.source_state == SourceState::Live)
            .then(|| session_flag(snapshot))
            .flatten(),
        gap_to_best_lap: matches!(kind, Some(SessionKind::Practice | SessionKind::Qualifying)),
        track: session
            .track_name
            .current()
            .filter(|name| !name.is_empty())
            .cloned()
            .unwrap_or_else(|| PLACEHOLDER.into()),
        laps_remaining: laps_remaining(snapshot),
        footer_cells,
        source_state: state.source_state,
        session: kind.map_or_else(|| PLACEHOLDER.into(), |k| session_name(k, prefs)),
        lap,
        final_lap,
        remaining: remaining(session.remaining_s.current().copied()),
        banner: if state.source_state == SourceState::Live {
            banner(snapshot, final_lap)
        } else {
            None
        },
        groups,
        player_present: player_car.is_some(),
        player_in_pits: player_car.is_some_and(|car| car.in_pits.current() == Some(&true)),
        fastest,
        track_temperature: format::temperature(
            session.weather.track_temperature_k.current().copied(),
            prefs,
        ),
        surface: surface(session.weather.track_wetness.current().copied(), prefs),
    }
}

fn row_index(groups: &[Group]) -> std::collections::HashMap<CarId, (usize, usize)> {
    groups
        .iter()
        .enumerate()
        .flat_map(|(g, group)| {
            group
                .rows
                .iter()
                .enumerate()
                .map(move |(r, row)| (row.id, (g, r)))
        })
        .collect()
}

fn project_groups(
    snapshot: &Snapshot,
    prefs: Preferences,
    content: &Content,
    kind: Option<&SessionKind>,
    class: Option<crate::ClassId>,
    previous: Option<&Board>,
) -> Vec<Group> {
    let state = &snapshot.state;
    let available = !matches!(state.source_state, SourceState::Waiting | SourceState::Lost);
    let player = state.player.as_ref().map(|p| p.car);
    let mut cars: Vec<&Car> = if available {
        state.cars.iter().collect()
    } else {
        Vec::new()
    };
    let session_best = cars
        .iter()
        .filter(|car| {
            !content.player_class || car.class.as_ref().is_none_or(|c| Some(c.id) == class)
        })
        .filter_map(|car| rich_positive(&car.best_lap_s))
        .min_by(f64::total_cmp);
    // La referencia global y el filtro pueden cambiar por otro coche/clase.
    let previous = previous.filter(|old| {
        old.player_class == class && {
            let old_best = old
                .groups
                .iter()
                .flat_map(|g| &g.rows)
                .filter(|r| !content.player_class || r.class_id.is_none_or(|id| Some(id) == class))
                .filter_map(|r| rich_positive(&r.facts.scalars.best))
                .min_by(f64::total_cmp);
            old_best == session_best
        }
    });
    cars.sort_by_key(|car| car.position.current().copied().unwrap_or(u32::MAX));

    // Grupos en orden de su mejor posición; los coches sin clase van juntos.
    let mut groups: Vec<(Option<u32>, Vec<&Car>)> = Vec::new();
    for car in cars {
        let key = car.class.as_ref().map(|c| c.id.0);
        match groups.iter_mut().find(|(k, _)| *k == key) {
            Some((_, list)) => list.push(car),
            None => groups.push((key, vec![car])),
        }
    }

    groups
        .into_iter()
        .map(|(_, list)| {
            group(
                &list,
                &RowContext {
                    player,
                    prefs,
                    content,
                    kind,
                    session_best,
                    selected_class: class,
                    class: std::sync::Arc::from(""),
                    previous,
                },
            )
        })
        .collect()
}

fn group(cars: &[&Car], context: &RowContext<'_>) -> Group {
    let class = cars
        .first()
        .and_then(|car| car.class.as_ref())
        .map_or_else(String::new, |c| c.name.clone());
    let best = cars
        .iter()
        .filter_map(|car| rich_positive(&car.best_lap_s))
        .min_by(f64::total_cmp);
    let sectors = cars
        .iter()
        .map(|car| car.best_sectors_s.len())
        .max()
        .unwrap_or(0);
    let best_sectors: Vec<Option<f64>> = (0..sectors)
        .map(|i| {
            cars.iter()
                .filter_map(|car| car.best_sectors_s.get(i).and_then(positive))
                .min_by(f64::total_cmp)
        })
        .collect();
    let class: std::sync::Arc<str> = class.into();
    Group {
        best,
        best_sectors: best_sectors.clone(),
        short: short(&class),
        class: class.clone(),
        cars: cars.len(),
        best_lap: format::lap_time(best),
        rows: cars
            .iter()
            .map(|car| {
                let name = car.class.as_ref().map_or("", |c| c.name.as_str());
                let row_class = if name == class.as_ref() {
                    class.clone()
                } else {
                    std::sync::Arc::from(name)
                };
                let next = RowContext {
                    class: row_class,
                    ..*context
                };
                if let Some(old) = context
                    .previous
                    .filter(|b| {
                        b.content == *context.content
                            && b.key.prefs == context.prefs
                            && b.key.kind.current() == context.kind
                            && b.key.player == context.player
                    })
                    .and_then(|b| {
                        b.row_index
                            .get(&car.id)
                            .map(|&(g, r)| (&b.groups[g], &b.groups[g].rows[r]))
                    })
                    .filter(|(group, old)| {
                        group.best == best && group.best_sectors == best_sectors && old.matches(car)
                    })
                {
                    old.1.clone()
                } else {
                    std::sync::Arc::new(row(car, best, &best_sectors, &next))
                }
            })
            .collect(),
    }
}

struct RowContext<'a> {
    player: Option<CarId>,
    prefs: Preferences,
    content: &'a Content,
    kind: Option<&'a SessionKind>,
    session_best: Option<f64>,
    selected_class: Option<crate::ClassId>,
    class: std::sync::Arc<str>,
    previous: Option<&'a Board>,
}
fn row(
    car: &Car,
    class_best: Option<f64>,
    class_sectors: &[Option<f64>],
    context: &RowContext<'_>,
) -> Row {
    let RowContext {
        player,
        prefs,
        content,
        kind,
        session_best,
        ..
    } = *context;
    let classified = !content.player_class
        || car
            .class
            .as_ref()
            .is_none_or(|c| Some(c.id) == context.selected_class);
    let leader = car.class_position.current() == Some(&1);
    let best = rich_positive(&car.best_lap_s);
    let gained = match (car.grid_position.current(), car.position.current()) {
        (Some(&grid), Some(&now)) => Some(i64::from(grid) - i64::from(now)),
        _ => None,
    };
    let (classification_gap, classification_leader) = if content.class_gaps {
        (car.gap_class_leader, car.class.is_some() && leader)
    } else {
        (car.gap_leader, car.position.current() == Some(&1))
    };
    Row {
        facts: RowFacts::new(car),
        class: context.class.clone(),
        class_id: car.class.as_ref().map(|c| c.id),
        class_position: car.class_position.current().copied(),
        laps: if classified {
            number_or_dash(car.laps)
        } else {
            String::new()
        },
        in_pits: car.in_pits.current() == Some(&true),
        last_lap_s: car.last_lap_s.current().copied(),
        best_lap_s: car.best_lap_s.current().copied(),
        classification_gap: if !classified {
            String::new()
        } else if matches!(kind, Some(SessionKind::Practice | SessionKind::Qualifying)) {
            best_lap_gap(
                car,
                if content.class_gaps {
                    class_best
                } else {
                    session_best
                },
                prefs,
            )
        } else {
            format::gap(
                classification_gap.current().copied(),
                classification_leader,
                prefs,
            )
        },
        classification_interval: if classified {
            format::gap(
                (if content.class_gaps {
                    car.gap_class_ahead
                } else {
                    car.gap_ahead
                })
                .current()
                .copied(),
                false,
                prefs,
            )
        } else {
            String::new()
        },
        id: car.id,
        position: car
            .position
            .current()
            .map_or_else(|| PLACEHOLDER.into(), u32::to_string),
        gained,
        number: car.number.clone(),
        driver: car.driver.name.clone(),
        vehicle: car.vehicle.clone(),
        compound: car.tyre_compound.current().copied(),
        pit: if car.in_pits.current() == Some(&true) {
            Pit::InPits
        } else {
            car.pit_stops
                .current()
                .map_or(Pit::Unknown, |n| Pit::Stops(*n))
        },
        sectors: sector_marks(car, class_sectors),
        last_lap: format::lap_time(car.last_lap_s.current().copied()),
        best_lap: format::lap_time(best),
        best_mark: lap_mark(best, class_best, rich_positive(&car.last_lap_s)),
        gap: gap(car.gap_class_leader, leader, prefs),
        interval: gap(car.gap_class_ahead, leader, prefs),
        is_player: player == Some(car.id),
    }
}

fn lap_mark(best: Option<f64>, class_best: Option<f64>, last: Option<f64>) -> Mark {
    match (best, class_best) {
        (Some(lap), Some(top)) if lap <= top + TOLERANCE_S => Mark::Fastest,
        (Some(lap), _) if last.is_some_and(|l| l <= lap + TOLERANCE_S) => Mark::Personal,
        _ => Mark::Pending,
    }
}

fn sector_marks(car: &Car, class_sectors: &[Option<f64>]) -> Vec<Mark> {
    let count = class_sectors.len().max(car.current_sectors_s.len());
    (0..count)
        .map(|i| {
            let Some(time) = car.current_sectors_s.get(i).and_then(positive) else {
                return Mark::Pending;
            };
            let own = car.best_sectors_s.get(i).and_then(positive);
            match class_sectors.get(i).copied().flatten() {
                Some(top) if time <= top + TOLERANCE_S => Mark::Fastest,
                _ if own.is_some_and(|own| time <= own + TOLERANCE_S) => Mark::Personal,
                _ => Mark::Slower,
            }
        })
        .collect()
}

fn rich_positive(time: &Quality<f64>) -> Option<f64> {
    time.current()
        .copied()
        .filter(|s| s.is_finite() && *s > 0.0)
}

/// `Líder`, `+1.284` o `+1 V`, como el catálogo r10b.
fn gap(gap: Quality<Gap>, leader: bool, prefs: Preferences) -> String {
    if leader {
        return match prefs.language {
            Language::Es => "Líder",
            Language::En => "Leader",
        }
        .into();
    }
    match gap.current() {
        Some(Gap::Time { seconds }) if seconds.is_finite() && *seconds >= 0.0 => {
            format!("+{}", format::to_fixed(*seconds, 3))
        }
        Some(Gap::Laps { count }) if *count > 0 => {
            let unit = match prefs.language {
                Language::Es => "V",
                Language::En => "L",
            };
            format!("+{count} {unit}")
        }
        _ => PLACEHOLDER.into(),
    }
}

/// `5:42:18` o `42:18`.
fn remaining(seconds: Option<f64>) -> String {
    let Some(seconds) = seconds.filter(|s| s.is_finite() && *s >= 0.0) else {
        return PLACEHOLDER.into();
    };
    let total = format::whole(seconds);
    let (h, m, s) = (total / 3600, total % 3600 / 60, total % 60);
    if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m}:{s:02}")
    }
}

fn session_name(kind: &SessionKind, prefs: Preferences) -> String {
    match (kind, prefs.language) {
        (SessionKind::Race, Language::Es) => "Carrera".into(),
        (SessionKind::Race, Language::En) => "Race".into(),
        (SessionKind::Practice, Language::Es) => "Práctica".into(),
        (SessionKind::Practice, Language::En) => "Practice".into(),
        (SessionKind::Qualifying, Language::Es) => "Clasificación".into(),
        (SessionKind::Qualifying, Language::En) => "Qualifying".into(),
        (SessionKind::Other(name), _) => name.clone(),
    }
}

/// Abreviatura de clase: hasta cinco letras se conserva; si no, dos letras.
fn short(class: &str) -> String {
    let compact: String = class.chars().filter(|c| !c.is_whitespace()).collect();
    if compact.chars().count() <= 5 {
        compact.to_uppercase()
    } else {
        compact.chars().take(2).collect::<String>().to_uppercase()
    }
}

fn surname(name: &str) -> String {
    name.rsplit(' ').next().unwrap_or(name).to_owned()
}

fn surface(wetness: Option<f64>, prefs: Preferences) -> String {
    let Some(wet) = wetness.filter(|w| w.is_finite()) else {
        return PLACEHOLDER.into();
    };
    let (dry, damp, soaked) = match prefs.language {
        Language::Es => ("seca", "húmeda", "mojada"),
        Language::En => ("dry", "damp", "wet"),
    };
    if wet < 0.05 {
        dry
    } else if wet < 0.4 {
        damp
    } else {
        soaked
    }
    .into()
}

fn banner(snapshot: &Snapshot, final_lap: bool) -> Option<Banner> {
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
    if let Some(sector) = yellow(|s| match s {
        FlagScope::Sector(n) => Some(*n),
        _ => None,
    }) {
        return Some(Banner::LocalYellow(sector + 1));
    }
    final_lap.then_some(Banner::FinalLap)
}

#[cfg(test)]
mod look_data_tests {
    use super::*;
    use crate::{Class, ClassId, Driver, Flag, Player, Session, State};

    fn car(id: u32, class: (u32, &str), position: u32, class_position: u32) -> Car {
        Car {
            id: CarId(id),
            number: id.to_string(),
            driver: Driver {
                name: format!("A. Piloto{id}"),
                ..Driver::default()
            },
            class: Some(Class {
                id: ClassId(class.0),
                name: class.1.into(),
            }),
            position: Quality::Reliable(position),
            class_position: Quality::Reliable(class_position),
            ..Car::default()
        }
    }

    fn snapshot(cars: Vec<Car>) -> Snapshot {
        Snapshot {
            state: State {
                source_state: SourceState::Live,
                session: Session {
                    kind: Quality::Reliable(SessionKind::Race),
                    ..Session::default()
                },
                cars,
                player: Some(Player {
                    car: CarId(2),
                    ..Player::default()
                }),
                ..State::default()
            },
            ..Snapshot::default()
        }
    }

    #[test]
    fn cache_reuses_irrelevant_inputs_and_invalidates_changed_facts() {
        use std::sync::Arc;
        let mut s = snapshot(vec![car(2, (0, "GT3"), 1, 1)]);
        let prefs = Preferences::default();
        let content = Content::default();
        let first = project_cached(&s, prefs, &content, None);
        s.sequence += 1;
        let same = project_cached(&s, prefs, &content, Some(&first));
        assert!(
            Arc::ptr_eq(&first, &same),
            "la secuencia no cambia los hechos"
        );
        s.state.cars[0].driver.name = "Otro piloto".into();
        let name = project_cached(&s, prefs, &content, Some(&same));
        assert!(!Arc::ptr_eq(&same, &name));
        assert_eq!(name.groups[0].rows[0].driver, "Otro piloto");
        s.state.cars[0]
            .current_sectors_s
            .push(Quality::Reliable(30.0));
        let sectors = project_cached(&s, prefs, &content, Some(&name));
        assert!(!Arc::ptr_eq(&name, &sectors));
        assert_eq!(sectors.groups[0].rows[0].sectors.len(), 1);
        s.state.session.weather.track_temperature_k = Quality::Reliable(300.15);
        let weather = project_cached(&s, prefs, &content, Some(&sectors));
        assert!(!Arc::ptr_eq(&sectors, &weather));
        assert_eq!(
            *weather,
            project_content(&s, prefs, &content),
            "igual que en frío"
        );
        let filtered = Content {
            player_class: true,
            ..content
        };
        let changed = project_cached(&s, prefs, &filtered, Some(&weather));
        assert!(!Arc::ptr_eq(&weather, &changed));
    }

    #[test]
    fn incremental_rows_invalidate_when_another_class_changes_the_reference() {
        let mut s = snapshot(vec![car(1, (0, "LMP2"), 1, 1), car(2, (1, "GT3"), 2, 1)]);
        s.state.session.kind = Quality::Reliable(SessionKind::Practice);
        s.state.cars[0].best_lap_s = Quality::Reliable(100.0);
        s.state.cars[1].best_lap_s = Quality::Reliable(110.0);
        let prefs = Preferences::default();
        let content = Content::default();
        let first = project_cached(&s, prefs, &content, None);
        s.state.cars[0].best_lap_s = Quality::Reliable(99.0);
        let next = project_cached(&s, prefs, &content, Some(&first));
        assert_eq!(*next, project_content(&s, prefs, &content));
        assert_ne!(
            first.groups[1].rows[0].classification_gap,
            next.groups[1].rows[0].classification_gap
        );
    }

    #[test]
    fn groups_by_class_in_position_order_with_class_gaps() {
        let mut a = car(1, (0, "Hypercar"), 1, 1);
        a.laps = Quality::Reliable(13);
        let mut b = car(2, (0, "Hypercar"), 2, 2);
        b.gap_class_leader = Quality::Reliable(Gap::Time { seconds: 1.2844 });
        b.gap_class_ahead = Quality::Estimated(Gap::Laps { count: 1 });
        let c = car(3, (1, "LMGT3"), 3, 1);
        let mut s = snapshot(vec![c, b, a]);
        s.state.session.laps_total = Quality::Reliable(38);
        s.state.session.remaining_s = Quality::Reliable(20_538.4);
        let board = project(&s, Preferences::default());
        assert_eq!(board.lap, "14/38");
        assert_eq!(board.remaining, "5:42:18");
        assert_eq!(board.session, "Carrera");
        let names: Vec<_> = board
            .groups
            .iter()
            .map(|g| (g.short.as_str(), g.cars))
            .collect();
        assert_eq!(names, [("HY", 2), ("LMGT3", 1)]);
        let hy = &board.groups[0].rows;
        assert_eq!(
            (hy[0].gap.as_str(), hy[1].gap.as_str()),
            ("Líder", "+1.284")
        );
        assert_eq!(hy[1].interval, "+1 V");
        assert!(hy[1].is_player && board.player_present);
        assert_eq!(board.banner, None);
    }

    #[test]
    fn absent_signals_stay_absent() {
        let s = snapshot(vec![car(2, (0, "Hypercar"), 1, 1)]);
        let board = project(&s, Preferences::default());
        let row = &board.groups[0].rows[0];
        assert_eq!(row.gained, None);
        assert_eq!(row.compound, None);
        assert_eq!(row.pit, Pit::Unknown);
        assert!(row.sectors.is_empty());
        assert!(row.vehicle.is_empty());
        assert_eq!((row.last_lap.as_str(), row.best_lap.as_str()), ("—", "—"));
        assert_eq!(row.best_mark, Mark::Pending);
        assert_eq!(board.fastest, None);
        assert_eq!(
            (board.track_temperature.as_str(), board.surface.as_str()),
            ("—", "—")
        );
        assert_eq!(board.remaining, "—");
        assert_eq!(board.lap, "—");
    }

    #[test]
    fn marks_class_best_personal_best_and_sector_progress() {
        let mut fast = car(1, (0, "Hypercar"), 1, 1);
        fast.best_lap_s = Quality::Reliable(207.046);
        fast.last_lap_s = Quality::Reliable(208.412);
        fast.best_sectors_s = vec![
            Quality::Reliable(70.0),
            Quality::Reliable(68.0),
            Quality::Reliable(69.0),
        ];
        let mut me = car(2, (0, "Hypercar"), 2, 2);
        me.best_lap_s = Quality::Reliable(207.904);
        me.last_lap_s = Quality::Reliable(207.904);
        me.best_sectors_s = vec![
            Quality::Reliable(69.5),
            Quality::Reliable(68.5),
            Quality::Reliable(70.0),
        ];
        me.current_sectors_s = vec![Quality::Reliable(69.5), Quality::Reliable(68.6)];
        me.grid_position = Quality::Reliable(4);
        me.pit_stops = Quality::Reliable(1);
        me.tyre_compound = Quality::Estimated(TyreCompound::Medium);
        let mut boxed = car(3, (0, "Hypercar"), 3, 3);
        boxed.in_pits = Quality::Reliable(true);
        boxed.pit_stops = Quality::Reliable(1);
        boxed.grid_position = Quality::Stale(1);
        let board = project(&snapshot(vec![fast, me, boxed]), Preferences::default());
        let rows = &board.groups[0].rows;
        assert_eq!(rows[0].best_mark, Mark::Fastest);
        assert_eq!(rows[1].best_mark, Mark::Personal);
        assert_eq!(
            rows[1].sectors,
            [Mark::Fastest, Mark::Slower, Mark::Pending]
        );
        assert_eq!(rows[1].gained, Some(2));
        assert_eq!(rows[1].pit, Pit::Stops(1));
        assert_eq!(rows[1].compound, Some(TyreCompound::Medium));
        assert_eq!(rows[2].pit, Pit::InPits);
        assert_eq!(rows[2].gained, None, "una parrilla obsoleta no se muestra");
        assert_eq!(board.fastest, Some(("3:27.046".into(), "Piloto1".into())));
    }

    #[test]
    fn banners_and_unavailable_sources() {
        let mut s = snapshot(vec![car(2, (0, "Hypercar"), 1, 1)]);
        s.state.flags = Quality::Reliable(vec![Flag {
            kind: FlagKind::Yellow,
            scope: FlagScope::Sector(1),
        }]);
        assert_eq!(
            project(&s, Preferences::default()).banner,
            Some(Banner::LocalYellow(2))
        );
        s.state.flags = Quality::Reliable(vec![Flag {
            kind: FlagKind::Yellow,
            scope: FlagScope::Session,
        }]);
        assert_eq!(
            project(&s, Preferences::default()).banner,
            Some(Banner::FullCourseYellow)
        );
        s.state.flags = Quality::Unavailable;
        s.state.cars[0].laps = Quality::Reliable(37);
        s.state.session.laps_total = Quality::Reliable(38);
        let board = project(&s, Preferences::default());
        assert!(board.final_lap);
        assert_eq!(board.banner, Some(Banner::FinalLap));
        s.state.source_state = SourceState::Waiting;
        let board = project(&s, Preferences::default());
        assert!(board.groups.is_empty() && !board.player_present);
        assert_eq!(board.session, "—");
        s.state.source_state = SourceState::Live;
        s.state.player = None;
        assert!(!project(&s, Preferences::default()).player_present);
    }

    #[test]
    fn surface_and_temperature_follow_preferences() {
        let mut s = snapshot(vec![car(2, (0, "Hypercar"), 1, 1)]);
        s.state.session.weather.track_temperature_k = Quality::Reliable(304.15);
        s.state.session.weather.track_wetness = Quality::Reliable(0.0);
        let board = project(&s, Preferences::default());
        assert_eq!(
            (board.track_temperature.as_str(), board.surface.as_str()),
            ("31 °C", "seca")
        );
        s.state.session.weather.track_wetness = Quality::Reliable(0.6);
        let en = Preferences {
            language: Language::En,
            ..Preferences::default()
        };
        assert_eq!(project(&s, en).surface, "wet");
    }
}

fn positive(lap: &Quality<f64>) -> Option<f64> {
    lap.current().copied().filter(|s| s.is_finite() && *s > 0.0)
}

fn number_or_dash(value: Quality<u32>) -> String {
    value
        .current()
        .map_or_else(|| PLACEHOLDER.into(), u32::to_string)
}

fn best_lap_gap(car: &Car, session_best: Option<f64>, prefs: Preferences) -> String {
    match (positive(&car.best_lap_s), session_best) {
        (Some(lap), Some(best)) => {
            let seconds = lap - best;
            let fastest = seconds <= TOLERANCE_S;
            format::gap(Some(Gap::Time { seconds }), fastest, prefs)
        }
        _ => PLACEHOLDER.into(),
    }
}

/// Clase del jugador (o, sin jugador, del primer coche), en tres letras.
fn class_chip(snapshot: &Snapshot) -> String {
    let car = snapshot
        .state
        .player_car()
        .or_else(|| snapshot.state.cars.first());
    match car.and_then(|car| car.class.as_ref()) {
        Some(class) if !class.name.is_empty() => class
            .name
            .chars()
            .take(3)
            .collect::<String>()
            .to_uppercase(),
        _ => PLACEHOLDER.into(),
    }
}

/// Primera bandera de ámbito sesión; el adaptador ordena por relevancia.
fn session_flag(snapshot: &Snapshot) -> Option<FlagKind> {
    snapshot
        .state
        .flags
        .current()?
        .iter()
        .find(|flag| flag.scope == FlagScope::Session)
        .map(|flag| flag.kind.clone())
}

fn laps_remaining(snapshot: &Snapshot) -> String {
    let session = &snapshot.state.session;
    if session.kind.current() != Some(&SessionKind::Race) {
        return PLACEHOLDER.into();
    }
    match session.laps_remaining {
        Quality::Reliable(n) => n.to_string(),
        Quality::Estimated(n) => format!("≈{n}"),
        Quality::Stale(_) | Quality::Unavailable => PLACEHOLDER.into(),
    }
}

/// Celdas de información puras: ausencia y calidad se conservan por señal.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InfoCell {
    pub id: String,
    pub label: String,
    pub value: String,
    pub stale: bool,
}

/// Vocabulario SessionInfo/footer-slots del productivo. `slots` distingue
/// "track" (temperatura) del circuito en `SessionInfo`. Gap lo recibe del VM
/// seleccionado, por lo que no sustituye un gap de clase por el global.
#[allow(clippy::too_many_lines)] // Tabla cerrada de métricas y calidad; separar cada brazo oculta el contrato.
pub fn information(
    snapshot: &Snapshot,
    prefs: Preferences,
    ids: &[String],
    slots: bool,
    player_gap: Option<&str>,
) -> Vec<InfoCell> {
    let session = &snapshot.state.session;
    let available = !matches!(
        snapshot.state.source_state,
        SourceState::Waiting | SourceState::Lost
    );
    let player = snapshot.state.player_car().filter(|_| available);
    let temperature = |value: Quality<f64>| {
        let Some(kelvin) = crate::relative::displayed(&value)
            .copied()
            .filter(|k| available && k.is_finite() && *k >= 0.0)
        else {
            return PLACEHOLDER.into();
        };
        let fahrenheit = prefs.units == format::Units::Imperial;
        let degrees = if fahrenheit {
            (kelvin - 273.15) * 1.8 + 32.0
        } else {
            kelvin - 273.15
        };
        if slots {
            return format!("{degrees:.0}°");
        }
        let text = format!("{degrees:.1}");
        let number = text.strip_suffix(".0").unwrap_or(&text);
        format!("{number}°{}", if fahrenheit { "F" } else { "C" })
    };
    let number = |value: Quality<u32>| {
        crate::relative::displayed(&value)
            .filter(|_| available)
            .map_or_else(|| PLACEHOLDER.into(), u32::to_string)
    };
    ids.iter()
        .filter(|id| id.as_str() != "none")
        .map(|id| {
            let metric = if slots
                && ![
                    "time", "lap", "position", "gap", "bestLap", "lastLap", "track", "ambient",
                    "wind",
                ]
                .contains(&id.as_str())
            {
                ""
            } else {
                id.as_str()
            };
            let (value, stale) = match metric {
                "trackTemperature" | "track" if slots || id == "trackTemperature" => (
                    temperature(session.weather.track_temperature_k),
                    matches!(session.weather.track_temperature_k, Quality::Stale(_)),
                ),
                "airTemperature" | "ambient" => (
                    temperature(session.weather.air_temperature_k),
                    matches!(session.weather.air_temperature_k, Quality::Stale(_)),
                ),
                "track" => (
                    crate::relative::displayed(&session.track_name)
                        .filter(|_| available)
                        .cloned()
                        .unwrap_or_else(|| PLACEHOLDER.into()),
                    matches!(session.track_name, Quality::Stale(_)),
                ),
                "estimatedLaps" => (
                    if available {
                        laps_remaining(snapshot)
                    } else {
                        PLACEHOLDER.into()
                    },
                    matches!(session.laps_remaining, Quality::Stale(_)),
                ),
                "totalLaps" => (
                    number(session.laps_total),
                    matches!(session.laps_total, Quality::Stale(_)),
                ),
                "remaining" | "time" => (
                    format::clock(
                        crate::relative::displayed(&session.remaining_s)
                            .copied()
                            .filter(|_| available),
                    ),
                    matches!(session.remaining_s, Quality::Stale(_)),
                ),
                "rain" => (
                    format::percent(
                        crate::relative::displayed(&session.weather.rain)
                            .copied()
                            .filter(|v| available && (0.0..=1.0).contains(v)),
                    ),
                    matches!(session.weather.rain, Quality::Stale(_)),
                ),
                "wetness" => (
                    format::percent(
                        crate::relative::displayed(&session.weather.track_wetness)
                            .copied()
                            .filter(|v| available && (0.0..=1.0).contains(v)),
                    ),
                    matches!(session.weather.track_wetness, Quality::Stale(_)),
                ),
                "wind" => (
                    format::speed(
                        crate::relative::displayed(&session.weather.wind_speed_mps)
                            .copied()
                            .filter(|_| available),
                        prefs,
                    ),
                    matches!(session.weather.wind_speed_mps, Quality::Stale(_)),
                ),
                "lap" => (
                    player.map_or_else(|| PLACEHOLDER.into(), |car| number(car.laps)),
                    false,
                ),
                "position" => (
                    player.map_or_else(|| PLACEHOLDER.into(), |car| number(car.position)),
                    player.is_some_and(|car| matches!(car.position, Quality::Stale(_))),
                ),
                "gap" => (player_gap.unwrap_or(PLACEHOLDER).into(), false),
                "bestLap" => (
                    format::lap_time(player.and_then(|car| car.best_lap_s.current().copied())),
                    player.is_some_and(|car| matches!(car.best_lap_s, Quality::Stale(_))),
                ),
                "lastLap" => (
                    format::lap_time(player.and_then(|car| car.last_lap_s.current().copied())),
                    player.is_some_and(|car| matches!(car.last_lap_s, Quality::Stale(_))),
                ),
                _ => (PLACEHOLDER.into(), false),
            };
            let label = information_label(id, prefs.language, session.kind.current());
            InfoCell {
                id: id.clone(),
                label: label.to_uppercase(),
                value,
                stale: stale || snapshot.state.source_state == SourceState::Stale,
            }
        })
        .collect()
}

fn information_label<'a>(
    id: &'a str,
    language: format::Language,
    kind: Option<&SessionKind>,
) -> &'a str {
    let pair = match id {
        "track" | "trackTemperature" => ("PISTA", "TRACK"),
        "ambient" | "airTemperature" => ("AIRE", "AIR"),
        "estimatedLaps" => ("V. REST. EST.", "EST. LAPS LEFT"),
        "totalLaps" => ("V. TOTALES", "TOTAL LAPS"),
        "time" | "remaining" => ("RESTANTE", "REMAINING"),
        "rain" => ("LLUVIA", "RAIN"),
        "wetness" => ("HÚMEDO", "WET"),
        "wind" => ("VIENTO", "WIND"),
        "lap" => ("VUELTA", "LAP"),
        "position" => ("POS", "POS"),
        "bestLap" => ("MEJOR V.", "BEST LAP"),
        "lastLap" => ("ÚLT. VUELTA", "LAST LAP"),
        "gap" if matches!(kind, Some(SessionKind::Practice | SessionKind::Qualifying)) => {
            ("AL MEJOR", "TO BEST")
        }
        "gap" => ("AL LÍDER", "TO LEADER"),
        _ => (id, id),
    };
    if language == format::Language::En {
        pair.1
    } else {
        pair.0
    }
}

/// Formato productivo de las columnas de vuelta: 0..3 decimales y compact/full.
#[allow(clippy::float_cmp)] // El empate binario exacto de toFixed debe distinguirse de valores próximos.
pub fn lap_time_column(seconds: Option<f64>, compact: bool, decimals: u8) -> String {
    let Some(seconds) = seconds.filter(|s| s.is_finite() && *s > 0.0) else {
        return PLACEHOLDER.into();
    };
    let decimals = usize::from(decimals.min(3));
    let mut minutes = (seconds / 60.0).floor();
    let remaining = seconds - minutes * 60.0;
    let binary_unit = 2.0_f64.powi(i32::try_from(decimals).unwrap_or(3));
    let tie = remaining.rem_euclid(1.0 / binary_unit) == 0.5 / binary_unit;
    let value = if tie {
        remaining + f64::EPSILON * remaining.abs().max(1.0)
    } else {
        remaining
    };
    let mut text = format!("{value:.decimals$}");
    if text.parse::<f64>().is_ok_and(|value| value >= 60.0) {
        minutes += 1.0;
        text = format!("{:.decimals$}", 0.0);
    }
    if compact {
        text
    } else {
        let width = if decimals == 0 { 2 } else { 3 + decimals };
        format!("{minutes:.0}:{text:0>width$}")
    }
}

/// Formato del nombre de columna; solo transforma presentación, sin identidad.
pub fn driver_name(value: &str, mode: &str, max_chars: usize) -> String {
    if matches!(mode, "initial" | "surname") {
        let mut cleaned = value.to_owned();
        while let Some(start) = cleaned.find('(') {
            let Some(end) = cleaned[start..].find(')') else {
                break;
            };
            cleaned.replace_range(start..=start + end, " ");
        }
        let words: Vec<_> = cleaned.split_whitespace().collect();
        if let [first, rest @ ..] = words.as_slice()
            && !rest.is_empty()
        {
            return if mode == "initial" {
                format!(
                    "{}. {}",
                    first.chars().next().unwrap_or('—'),
                    rest.join(" ")
                )
            } else {
                rest.join(" ")
            };
        }
    } else if mode == "truncate" && value.chars().count() > max_chars {
        return format!(
            "{}…",
            value
                .chars()
                .take(max_chars.saturating_sub(1))
                .collect::<String>()
        );
    }
    value.into()
}

#[cfg(test)]
mod classification_tests {
    use super::*;
    use crate::{Capabilities, Class, ClassId, Driver, Flag, Player, Session, State};
    use Quality::{Reliable, Stale, Unavailable};

    fn car(id: u32, position: u32, name: &str) -> Car {
        Car {
            id: CarId(id),
            number: id.to_string(),
            driver: Driver {
                name: name.into(),
                ..Driver::default()
            },
            class: Some(Class {
                id: ClassId(1),
                name: "LMP2".into(),
            }),
            position: Reliable(position),
            ..Car::default()
        }
    }

    fn snapshot(kind: SessionKind, cars: Vec<Car>) -> Snapshot {
        Snapshot {
            state: State {
                source_state: crate::SourceState::Live,
                capabilities: Capabilities {
                    positions: Capability::Fresh,
                    ..Capabilities::default()
                },
                session: Session {
                    kind: Reliable(kind),
                    remaining_s: Reliable(3492.4),
                    track_name: Reliable("Barcelona".into()),
                    laps_remaining: Quality::Estimated(12),
                    ..Session::default()
                },
                flags: Reliable(vec![
                    Flag {
                        kind: FlagKind::Blue,
                        scope: FlagScope::Car(CarId(1)),
                    },
                    Flag {
                        kind: FlagKind::Yellow,
                        scope: FlagScope::Session,
                    },
                ]),
                cars,
                player: Some(Player {
                    car: CarId(2),
                    ..Player::default()
                }),
            },
            ..Snapshot::default()
        }
    }

    #[test]
    fn lap_column_formats_compact_precision_rounding_and_missing_quality() {
        assert_eq!(lap_time_column(Some(109.667), false, 3), "1:49.667");
        assert_eq!(lap_time_column(Some(109.667), false, 1), "1:49.7");
        assert_eq!(lap_time_column(Some(109.667), true, 2), "49.67");
        assert_eq!(lap_time_column(Some(119.9999), false, 0), "2:00");
        assert_eq!(lap_time_column(Some(60.625), true, 2), "0.63");
        assert_eq!(lap_time_column(None, false, 3), PLACEHOLDER);
    }

    #[test]
    fn information_projects_each_metric_and_never_substitutes_missing_signals() {
        let mut scene = snapshot(SessionKind::Race, vec![car(2, 5, "André Lotterer")]);
        scene.state.session.weather.air_temperature_k = Reliable(294.15);
        scene.state.session.weather.track_temperature_k = Reliable(301.15);
        scene.state.session.weather.rain = Reliable(0.25);
        scene.state.session.weather.track_wetness = Reliable(0.5);
        scene.state.session.laps_total = Reliable(40);
        let ids = [
            "trackTemperature",
            "airTemperature",
            "estimatedLaps",
            "totalLaps",
            "track",
            "remaining",
            "rain",
            "wetness",
        ]
        .map(str::to_owned);
        let cells = information(&scene, Preferences::default(), &ids, false, None);
        assert_eq!(
            cells.iter().map(|c| c.value.as_str()).collect::<Vec<_>>(),
            [
                "28°C",
                "21°C",
                "≈12",
                "40",
                "Barcelona",
                "58:12",
                "25%",
                "50%"
            ]
        );
        scene.state.session.weather.rain = Stale(0.25);
        let cells = information(
            &scene,
            Preferences::default(),
            &["rain".into(), "unknown".into()],
            false,
            None,
        );
        assert_eq!(cells[0].value, "25%");
        assert!(cells[0].stale);
        assert_eq!(cells[1].value, PLACEHOLDER);
        assert_eq!(driver_name("André Lotterer", "initial", 16), "A. Lotterer");
        assert_eq!(driver_name("André Lotterer", "surname", 16), "Lotterer");
        assert_eq!(driver_name("André Lotterer", "truncate", 6), "André…");
    }

    #[test]
    fn multiclass_practice_uses_each_class_best_without_global_fallback() {
        let mut first = car(1, 1, "Ana");
        first.best_lap_s = Reliable(100.0);
        let mut second = car(2, 2, "Ben");
        second.class.as_mut().expect("clase").id = ClassId(2);
        second.best_lap_s = Reliable(110.0);
        let mut third = car(3, 3, "Cy");
        third.class.as_mut().expect("clase").id = ClassId(2);
        third.best_lap_s = Reliable(110.5);
        let snapshot = snapshot(SessionKind::Practice, vec![first, second, third]);
        let vm = project_classification(&snapshot, Preferences::default(), false, true);
        assert_eq!(
            vm.rows()
                .iter()
                .map(|r| r.classification_gap.as_str())
                .collect::<Vec<_>>(),
            ["LÍDER", "LÍDER", "+0.50s"]
        );
        let slots = information(
            &snapshot,
            Preferences::default(),
            &["trackTemperature".into()],
            true,
            None,
        );
        assert_eq!(slots[0].value, PLACEHOLDER, "vocabulario de slots cerrado");
    }

    #[test]
    fn player_class_keeps_global_positions_and_never_substitutes_global_gaps() {
        let mut leader = car(1, 2, "Ana");
        leader.class_position = Reliable(1);
        let mut second = car(2, 5, "Ben");
        second.class_position = Reliable(2);
        second.gap_leader = Reliable(Gap::Time { seconds: 20.0 });
        second.gap_class_leader = Stale(Gap::Time { seconds: 2.0 });
        let mut other = car(3, 1, "Cy");
        other.class.as_mut().expect("clase").id = ClassId(2);
        let mut snapshot = snapshot(SessionKind::Race, vec![second, other, leader]);
        let prefs = Preferences::default();
        let vm = project_player_class(&snapshot, prefs);
        assert_eq!(
            vm.rows().len(),
            2,
            "se filtra por ID, no por el nombre de clase"
        );
        assert_eq!(vm.rows()[0].position, "2");
        assert_eq!(vm.rows()[0].classification_gap, "LÍDER");
        assert_eq!(vm.rows()[1].classification_gap, PLACEHOLDER);
        snapshot.state.cars[0].gap_class_leader = Reliable(Gap::Laps { count: 1 });
        snapshot.state.cars[0].gap_class_ahead = Reliable(Gap::Time { seconds: 0.8 });
        let vm = project_player_class(&snapshot, prefs);
        assert_eq!(vm.rows()[1].classification_gap, "+1 V");
        assert_eq!(vm.rows()[1].classification_interval, "+0.80s");
        assert_eq!(project(&snapshot, prefs).rows().len(), 3);
    }

    #[test]
    fn player_class_practice_compares_only_fresh_scoped_best_laps() {
        let mut player = car(2, 2, "Ben");
        player.best_lap_s = Reliable(110.0);
        let mut other = car(1, 1, "Ana");
        other.class.as_mut().expect("clase").id = ClassId(2);
        other.best_lap_s = Reliable(100.0);
        let mut same_class = car(3, 3, "Cy");
        same_class.best_lap_s = Stale(109.0);
        let vm = project_player_class(
            &snapshot(SessionKind::Practice, vec![other, player, same_class]),
            Preferences::default(),
        );
        assert_eq!(vm.rows().len(), 2);
        assert_eq!(vm.rows()[0].classification_gap, "LÍDER");
        assert_eq!(vm.rows()[1].classification_gap, PLACEHOLDER);
    }

    #[test]
    fn race_rows_are_sorted_and_show_gaps_to_the_leader() {
        let mut second = car(2, 2, "Ben");
        second.gap_leader = Reliable(Gap::Time { seconds: 1.234 });
        second.gap_ahead = Reliable(Gap::Time { seconds: 1.234 });
        second.best_lap_s = Stale(101.0);
        second.in_pits = Reliable(true);
        let mut third = car(3, 3, "Cy");
        third.gap_leader = Reliable(Gap::Laps { count: 2 });
        let lost = Car {
            position: Unavailable,
            ..car(4, 0, "Di")
        };
        let first = car(1, 1, "Ana");

        let vm = project(
            &snapshot(SessionKind::Race, vec![lost, third, second, first]),
            Preferences::default(),
        );

        let order: Vec<&str> = vm.rows().iter().map(|r| r.driver.as_str()).collect();
        assert_eq!(order, ["Ana", "Ben", "Cy", "Di"]);
        assert_eq!(vm.rows()[0].classification_gap, "LÍDER");
        assert_eq!(vm.rows()[1].classification_gap, "+1.23s");
        assert_eq!(vm.rows()[1].classification_interval, "+1.23s");
        assert_eq!(
            vm.rows()[1].best_lap,
            PLACEHOLDER,
            "un dato obsoleto no se muestra"
        );
        assert!(vm.rows()[1].in_pits && vm.rows()[1].is_player && !vm.rows()[0].is_player);
        assert_eq!(vm.rows()[2].classification_gap, "+2 V");
        assert_eq!(vm.rows()[3].position, PLACEHOLDER);
        assert_eq!(vm.rows()[3].classification_gap, PLACEHOLDER);
        assert_eq!(
            (
                vm.session_label.as_str(),
                vm.clock.as_str(),
                vm.class_chip.as_str(),
                vm.track.as_str()
            ),
            ("CARRERA", "58:12", "LMP", "Barcelona")
        );
        assert_eq!(vm.laps_remaining, "≈12");
        assert_eq!(
            vm.flag,
            Some(FlagKind::Yellow),
            "la bandera de coche no es de sesión"
        );
        assert!(!vm.gap_to_best_lap);
    }

    #[test]
    fn practice_compares_best_laps() {
        let mut fast = car(1, 1, "Ana");
        fast.best_lap_s = Reliable(100.0);
        let mut slow = car(2, 2, "Ben");
        slow.best_lap_s = Reliable(100.8);
        let none = car(3, 3, "Cy");

        let vm = project(
            &snapshot(SessionKind::Practice, vec![fast, slow, none]),
            Preferences::default(),
        );

        assert!(vm.gap_to_best_lap);
        assert_eq!(vm.rows()[0].classification_gap, "LÍDER");
        assert_eq!(vm.rows()[1].classification_gap, "+0.80s");
        assert_eq!(vm.rows()[2].classification_gap, PLACEHOLDER);
        assert_eq!(vm.laps_remaining, PLACEHOLDER, "solo se muestra en carrera");
    }
}
