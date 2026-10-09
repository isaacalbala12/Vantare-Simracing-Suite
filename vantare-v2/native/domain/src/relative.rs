//! Relative común: vecinos en pista por gap firmado al jugador, nunca
//! por clasificación. Los huecos vacíos pertenecen solo a la presentación.

use crate::{
    Car, CarId, DriverRating, FlagKind, FlagScope, Quality, SessionKind, Snapshot, SourceState,
    format::{self, Language, PLACEHOLDER, Preferences},
};
use std::borrow::Cow;

pub const RANGE: usize = 3;
pub const STRIP_S: f64 = 10.0;
pub const TRAFFIC_S: f64 = 6.0;
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Banner {
    FullCourseYellow,
    LocalYellow(u8),
    InPits,
}

/// Tendencia del gap por vuelta: valor sin signo, si se acerca y si te
/// conviene (cazas al de delante o te escapas del de detrás).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Trend {
    pub value: String,
    pub closing: bool,
    pub good: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Dot {
    pub id: CarId,
    /// Segundos con el signo de la tabla (delante negativo).
    pub offset_s: f64,
    pub class: String,
    pub is_player: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Traffic {
    pub count: usize,
    pub class: String,
}

/// Coches entre los que se saldría tras una parada y la pérdida estimada.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PitExit {
    pub ahead: Option<String>,
    pub behind: Option<String>,
    pub loss: String,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Side {
    Ahead,
    #[default]
    Player,
    Behind,
}

#[allow(clippy::struct_excessive_bools)] // Calidad independiente por celda, no estados excluyentes.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Row {
    facts: RowFacts,
    pub id: CarId,
    pub side: Side,
    pub position: Cow<'static, str>,
    pub number: String,
    pub driver: String,
    pub class: String,
    pub gap: Cow<'static, str>,
    pub best_lap: Cow<'static, str>,
    pub last_lap: Cow<'static, str>,
    pub last_lap_stale: bool,
    pub position_stale: bool,
    pub best_lap_stale: bool,
    pub gap_stale: bool,
    /// Diferencia canónica de vueltas; no se deduce de vueltas completadas.
    pub lap_delta: Option<i32>,
    pub class_position: Cow<'static, str>,
    pub vehicle: String,
    pub rich_gap: Cow<'static, str>,
    pub rating: Option<DriverRating>,
    pub safety: Cow<'static, str>,
    pub trend: Option<Trend>,
    pub is_player: bool,
    pub in_pits: bool,
    pub fast_traffic: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Board {
    key: ProjectionKey,
    pub track: String,
    pub player_badge: String,
    pub session: String,
    pub remaining: String,
    pub air: String,
    pub track_temperature: String,
    pub wind: String,
    /// Huecos de presentación: delante lejos → cerca, jugador, detrás cerca → lejos.
    pub slots: Vec<Option<std::sync::Arc<Row>>>,
    pub status: Option<String>,
    pub source_state: SourceState,
    pub player_present: bool,
    pub player_in_pits: bool,
    pub pit_limiter: bool,
    pub banner: Option<Banner>,
    pub strip: Vec<Dot>,
    pub slower_class: Option<String>,
    pub traffic: Option<Traffic>,
    pub pit_exit: Option<PitExit>,
    pub names: Vec<Name>,
    pub footer_cells: Vec<crate::standings::InfoCell>,
}
pub type ViewModel = Board;

/// Nombres de la sesión y hechos de entrada: no son una segunda colección de filas.
#[derive(Clone, Debug, PartialEq)]
pub struct Name {
    pub driver: String,
    pub vehicle: String,
    pub number: String,
    pub visible: bool,
}
#[derive(Clone, Debug, PartialEq)]
struct Input {
    facts: CarFacts,
    name: Option<usize>,
    class_label: Option<String>,
}
#[derive(Clone, Copy, Debug, PartialEq)]
struct CarFacts {
    id: CarId,
    class_id: Option<crate::ClassId>,
    best: Quality<f64>,
    relative: Quality<f64>,
}
impl CarFacts {
    fn new(c: &Car) -> Self {
        Self {
            id: c.id,
            class_id: c.class.as_ref().map(|c| c.id),
            best: c.best_lap_s,
            relative: c.relative_s,
        }
    }
}
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct RowFacts {
    position: Quality<u32>,
    class_position: Quality<u32>,
    last: Quality<f64>,
    laps: Quality<i32>,
    pits: Quality<bool>,
    rating: Quality<DriverRating>,
    safety: Quality<f64>,
    trend: Quality<f64>,
}
impl RowFacts {
    fn new(c: &Car) -> Self {
        Self {
            position: c.position,
            class_position: c.class_position,
            last: c.last_lap_s,
            laps: c.relative_laps,
            pits: c.in_pits,
            rating: c.driver_rating,
            safety: c.safety_rating,
            trend: c.relative_trend_s_per_lap,
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq)]
struct PlayerFacts {
    id: CarId,
    limiter: Quality<bool>,
    loss: Quality<f64>,
    position: Quality<u32>,
    pits: Quality<bool>,
}
impl PlayerFacts {
    fn from_state(state: &crate::State, car: Option<&Car>) -> Option<Self> {
        state.player.as_ref().map(|p| Self {
            id: p.car,
            limiter: p.pit_limiter_active,
            loss: p.pit_loss_s,
            position: car.map_or(Quality::Unavailable, |c| c.position),
            pits: car.map_or(Quality::Unavailable, |c| c.in_pits),
        })
    }
}
#[derive(Clone, Debug, PartialEq)]
struct ProjectionKey {
    prefs: Preferences,
    content: Content,
    footer_ids: Vec<String>,
    source: SourceState,
    kind: Quality<SessionKind>,
    track: Quality<String>,
    remaining: Quality<f64>,
    weather: crate::Weather,
    flags: Quality<Vec<crate::Flag>>,
    player: Option<PlayerFacts>,
    cars: Vec<Input>,
}
impl ProjectionKey {
    fn new(
        snapshot: &Snapshot,
        prefs: Preferences,
        content: Content,
        ids: &[String],
        car: Option<&Car>,
    ) -> Self {
        let state = &snapshot.state;
        Self {
            prefs,
            content,
            footer_ids: ids.to_vec(),
            source: state.source_state,
            kind: state.session.kind.clone(),
            track: state.session.track_name.clone(),
            remaining: state.session.remaining_s,
            weather: state.session.weather,
            flags: state.flags.clone(),
            player: PlayerFacts::from_state(state, car),
            cars: Vec::new(),
        }
    }
    fn matches(&self, s: &Snapshot, prefs: Preferences, content: Content, ids: &[String]) -> bool {
        let state = &s.state;
        self.prefs == prefs
            && self.content == content
            && self.footer_ids == ids
            && self.source == state.source_state
            && self.kind == state.session.kind
            && self.track == state.session.track_name
            && self.remaining == state.session.remaining_s
            && self.weather == state.session.weather
            && self.flags == state.flags
            && self.player == PlayerFacts::from_state(state, state.player_car())
    }
}
impl Board {
    fn matches(&self, s: &Snapshot, prefs: Preferences, content: Content, ids: &[String]) -> bool {
        self.key.matches(s, prefs, content, ids)
            && self.key.cars.len() == s.state.cars.len()
            && self.key.cars.iter().zip(&s.state.cars).all(|(input, car)| {
                input.facts == CarFacts::new(car)
                    && input.name.is_none_or(|index| {
                        let name = &self.names[index];
                        name.driver == car.driver.name
                            && name.vehicle == car.vehicle
                            && name.number == car.number
                    })
                    && input
                        .class_label
                        .as_ref()
                        .is_none_or(|label| car.class.as_ref().is_some_and(|c| c.name == *label))
            })
            && self.slots.iter().flatten().all(|row| {
                s.state
                    .cars
                    .iter()
                    .find(|c| c.id == row.id)
                    .is_some_and(|c| row.facts == RowFacts::new(c))
            })
    }
}
/// Una consulta por ingest. La clave exacta reutiliza los nombres del Board,
/// ignora secuencia y controles de conducción y no contiene ningún Look.
pub fn project_cached(
    s: &Snapshot,
    prefs: Preferences,
    content: Content,
    ids: &[String],
    previous: Option<&std::sync::Arc<Board>>,
) -> std::sync::Arc<Board> {
    if let Some(board) = previous.filter(|b| b.matches(s, prefs, content, ids)) {
        return board.clone();
    }
    std::sync::Arc::new(project_configured(s, prefs, content, ids))
}

/// Ventana pura: delante lejos→cerca, jugador, detrás cerca→lejos. Un gap
/// ausente, no finito o cero no demuestra de qué lado está un rival.
#[cfg(test)]
fn track_window_configured(
    cars: &[Car],
    player: CarId,
    ahead_count: usize,
    behind_count: usize,
    same_class: bool,
) -> Vec<Option<&Car>> {
    track_window(
        cars,
        cars.iter().find(|car| car.id == player),
        ahead_count,
        behind_count,
        same_class,
    )
}
fn track_window<'a>(
    cars: &'a [Car],
    anchor: Option<&'a Car>,
    ahead_count: usize,
    behind_count: usize,
    same_class: bool,
) -> Vec<Option<&'a Car>> {
    let ahead_count = ahead_count.min(8);
    let behind_count = behind_count.min(8);
    let mut slots = vec![None; ahead_count + behind_count + 1];
    let Some(anchor) = anchor else {
        return slots;
    };
    let player = anchor.id;
    slots[ahead_count] = Some(anchor);
    for ahead in [true, false] {
        let mut neighbors: Vec<_> = cars
            .iter()
            .filter_map(|car| {
                if same_class
                    && car.class.as_ref().map(|c| c.id) != anchor.class.as_ref().map(|c| c.id)
                {
                    return None;
                }
                let gap = relative_seconds(car)?;
                (car.id != player && gap != 0.0 && (gap > 0.0) == ahead).then_some((car, gap.abs()))
            })
            .collect();
        neighbors.sort_by(|(a, da), (b, db)| da.total_cmp(db).then(a.id.0.cmp(&b.id.0)));
        for (index, (car, _)) in neighbors
            .into_iter()
            .take(if ahead { ahead_count } else { behind_count })
            .enumerate()
        {
            slots[if ahead {
                ahead_count - 1 - index
            } else {
                ahead_count + 1 + index
            }] = Some(car);
        }
    }
    slots
}

/// Los tres widgets consumen la misma señal; no restan gaps al líder.
pub(crate) fn relative_seconds(car: &Car) -> Option<f64> {
    displayed(&car.relative_s)
        .copied()
        .filter(|s| s.is_finite())
}

pub(crate) fn source_status(state: SourceState, prefs: Preferences) -> Option<String> {
    match (state, prefs.language) {
        (SourceState::Live, _) => None,
        (SourceState::Paused, Language::Es) => Some("EN PAUSA"),
        (SourceState::Paused, Language::En) => Some("PAUSED"),
        (SourceState::Waiting, Language::Es) => Some("SIN DATOS"),
        (SourceState::Waiting, Language::En) => Some("NO DATA"),
        (SourceState::Stale, Language::Es) => Some("DATOS ANTIGUOS"),
        (SourceState::Stale, Language::En) => Some("DATA OUT OF DATE"),
        (SourceState::Lost, Language::Es) => Some("DESCONECTADO"),
        (SourceState::Lost, Language::En) => Some("DISCONNECTED"),
    }
    .map(str::to_owned)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Content {
    pub range_ahead: usize,
    pub range_behind: usize,
    pub same_class: bool,
    pub include_player: bool,
}
impl Default for Content {
    fn default() -> Self {
        Self {
            range_ahead: RANGE,
            range_behind: RANGE,
            same_class: false,
            include_player: true,
        }
    }
}

pub fn project(snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    project_content(snapshot, prefs, Content::default())
}

pub fn project_content(snapshot: &Snapshot, prefs: Preferences, content: Content) -> Board {
    project_configured(snapshot, prefs, content, &[])
}

/// Una ventana y sus hechos complementarios; no recibe Look.
pub fn project_configured(
    snapshot: &Snapshot,
    prefs: Preferences,
    content: Content,
    footer_ids: &[String],
) -> Board {
    let same_class = content.same_class;
    let state = &snapshot.state;
    let live = state.source_state == SourceState::Live;
    let header_player = state.player_car();
    let player = header_player.filter(|_| live);
    let race = state.session.kind.current() == Some(&SessionKind::Race);

    // Ritmo de clase: la mejor vuelta de cada clase decide cuál es más rápida.
    let class_pace = class_paces(&state.cars);
    let pace = |class: Option<u32>| class_pace.get(&class).copied();
    let player_class = player.and_then(|car| car.class.as_ref().map(|c| c.id.0));
    let player_pace = pace(player_class);
    let faster = |car: &Car| {
        player_pace.is_some_and(|mine| {
            let class = car.class.as_ref().map(|c| c.id.0);
            class != player_class && pace(class).is_some_and(|theirs| theirs < mine)
        })
    };
    let traffic_car = |car: &Car| {
        relative_seconds(car).is_some_and(|gap| gap < 0.0 && -gap <= TRAFFIC_S) && faster(car)
    };

    let slots = window_rows(&state.cars, player, content, race, &traffic_car);
    let strip = player.map_or_else(Vec::new, |me| strip(&state.cars, me, same_class));

    let traffic_cars: Vec<&Car> = if player_pace.is_some() {
        state.cars.iter().filter(|c| traffic_car(c)).collect()
    } else {
        Vec::new()
    };
    let traffic = traffic_cars.first().map(|car| Traffic {
        count: traffic_cars.len(),
        class: class_name(car),
    });
    let slower_class = player
        .filter(|me| {
            player_pace.is_some() && state.cars.iter().any(|car| car.id != me.id && faster(car))
        })
        .map(class_name);

    let player_in_pits = player.is_some_and(|car| car.in_pits.current() == Some(&true));
    let pit_limiter = state
        .player
        .as_ref()
        .is_some_and(|p| p.pit_limiter_active.current() == Some(&true));
    let pit_exit = player
        .filter(|_| player_in_pits)
        .and_then(|me| pit_exit(&state.cars, me.id, state.player.as_ref()?.pit_loss_s));

    let Header {
        track,
        player_badge,
        session,
        remaining,
        air,
        track_temperature,
        wind,
    } = header(snapshot, prefs, header_player);
    let mut key = ProjectionKey::new(snapshot, prefs, content, footer_ids, header_player);
    let names = names(
        &state.cars,
        &mut key,
        live,
        same_class,
        player_class,
        pit_exit.is_some(),
        &traffic_car,
    );
    let mut board = Board {
        key,
        track,
        player_badge,
        session,
        remaining,
        air,
        track_temperature,
        wind,
        status: source_status(
            if header_player.is_none() && live {
                SourceState::Waiting
            } else {
                state.source_state
            },
            prefs,
        ),
        footer_cells: Vec::new(),

        source_state: state.source_state,
        player_present: player.is_some(),
        player_in_pits,
        pit_limiter,
        banner: if live {
            banner(snapshot, player_in_pits)
        } else {
            None
        },
        slots,
        strip,
        slower_class,
        traffic,
        pit_exit,
        // Solo los coches que pueden aparecer con el filtro de clase.
        names,
    };
    board.footer_cells = footer_slots(snapshot, prefs, &board, footer_ids);
    board
}

fn names(
    cars: &[Car],
    key: &mut ProjectionKey,
    live: bool,
    same_class: bool,
    player_class: Option<u32>,
    pit_exit: bool,
    traffic_car: &impl Fn(&Car) -> bool,
) -> Vec<Name> {
    let mut names = Vec::new();
    key.cars = cars
        .iter()
        .map(|car| {
            let visible =
                live && (!same_class || car.class.as_ref().map(|c| c.id.0) == player_class);
            let name = (visible || pit_exit).then(|| {
                let index = names.len();
                names.push(Name {
                    driver: car.driver.name.clone(),
                    vehicle: car.vehicle.clone(),
                    number: car.number.clone(),
                    visible,
                });
                index
            });
            Input {
                facts: CarFacts::new(car),
                name,
                class_label: car
                    .class
                    .as_ref()
                    .filter(|_| {
                        visible || traffic_car(car) || key.player.is_some_and(|p| p.id == car.id)
                    })
                    .map(|class| class.name.clone()),
            }
        })
        .collect();
    names
}

fn window_rows(
    cars: &[Car],
    player: Option<&Car>,
    content: Content,
    race: bool,
    traffic_car: &impl Fn(&Car) -> bool,
) -> Vec<Option<std::sync::Arc<Row>>> {
    let ahead = content.range_ahead.min(8);
    let behind = content.range_behind.min(8);
    let same_class = content.same_class;
    let mut slots = player.map_or_else(
        || vec![None; ahead + behind + 1],
        |me| {
            track_window(cars, Some(me), ahead, behind, same_class)
                .into_iter()
                .enumerate()
                .map(|(index, car)| {
                    let side = match index.cmp(&ahead) {
                        std::cmp::Ordering::Less => Side::Ahead,
                        std::cmp::Ordering::Equal => Side::Player,
                        std::cmp::Ordering::Greater => Side::Behind,
                    };
                    car.map(|car| std::sync::Arc::new(row(car, side, race, traffic_car(car))))
                })
                .collect()
        },
    );

    if !content.include_player {
        slots.remove(ahead);
    }
    slots
}

fn class_paces(cars: &[Car]) -> std::collections::BTreeMap<Option<u32>, f64> {
    let mut class_pace = std::collections::BTreeMap::<Option<u32>, f64>::new();
    for car in cars {
        if let Some(lap) = car
            .best_lap_s
            .current()
            .copied()
            .filter(|v| v.is_finite() && *v > 0.0)
        {
            let best = class_pace
                .entry(car.class.as_ref().map(|c| c.id.0))
                .or_insert(lap);
            *best = best.min(lap);
        }
    }
    class_pace
}
struct Header {
    track: String,
    player_badge: String,
    session: String,
    remaining: String,
    air: String,
    track_temperature: String,
    wind: String,
}
fn header(snapshot: &Snapshot, prefs: Preferences, header_player: Option<&Car>) -> Header {
    let state = &snapshot.state;
    let session = &state.session;
    let player_badge = header_player.map_or_else(String::new, |car| {
        let Some(position) = displayed(&car.position).filter(|p| **p > 0) else {
            return String::new();
        };
        let Some(class) = car.class.as_ref().filter(|c| !c.name.is_empty()) else {
            return format!("P{position}");
        };
        let mut badge = format!("P{position} · {}", class.name);
        if class.name.is_ascii() {
            badge.make_ascii_uppercase();
            badge
        } else {
            badge.to_uppercase()
        }
    });
    Header {
        track: displayed(&session.track_name).map_or_else(String::new, |v| v.to_uppercase()),
        player_badge,
        session: displayed(&session.kind)
            .map_or_else(String::new, |v| format::session_kind(v, prefs)),
        remaining: displayed(&session.remaining_s)
            .copied()
            .map_or_else(String::new, |v| optional(format::clock(Some(v)))),
        air: temperature(
            displayed(&session.weather.air_temperature_k).copied(),
            prefs,
        ),
        track_temperature: temperature(
            displayed(&session.weather.track_temperature_k).copied(),
            prefs,
        ),
        wind: displayed(&session.weather.wind_speed_mps)
            .copied()
            .map_or_else(String::new, |v| optional(format::speed(Some(v), prefs))),
    }
}

/// Footer slots reutilizan el vocabulario común; Relative no publica lapText.
pub fn footer_slots(
    snapshot: &Snapshot,
    prefs: Preferences,
    vm: &ViewModel,
    ids: &[String],
) -> Vec<crate::standings::InfoCell> {
    if ids.is_empty() {
        return Vec::new();
    }
    let mut cells = crate::standings::information(snapshot, prefs, ids, true, None);
    let player = vm
        .slots
        .iter()
        .flatten()
        .find(|row| row.side == Side::Player);
    for cell in &mut cells {
        if player.is_none() && ["position", "bestLap", "lastLap"].contains(&cell.id.as_str()) {
            cell.value = PLACEHOLDER.into();
            cell.stale = false;
            continue;
        }
        match cell.id.as_str() {
            "lap" => cell.value = PLACEHOLDER.into(),
            "position" => {
                if let Some(row) = player {
                    cell.value = row.position.to_string();
                    cell.stale = row.position_stale;
                }
            }
            "gap" => {
                if let Some(row) = player {
                    cell.value = row.gap.to_string();
                }
            }
            "bestLap" => {
                if let Some(row) = player {
                    cell.value = row.best_lap.to_string();
                    cell.stale = row.best_lap_stale;
                }
            }
            "lastLap" => {
                if let Some(row) = player {
                    cell.value = row.last_lap.to_string();
                    cell.stale = row.last_lap_stale;
                }
            }
            "time" => {
                cell.value = if vm.remaining.is_empty() {
                    PLACEHOLDER.into()
                } else {
                    vm.remaining.clone()
                }
            }
            "track" => {
                cell.value = if vm.track_temperature.is_empty() {
                    PLACEHOLDER.into()
                } else {
                    vm.track_temperature.clone()
                }
            }
            "ambient" => {
                cell.value = if vm.air.is_empty() {
                    PLACEHOLDER.into()
                } else {
                    vm.air.clone()
                }
            }
            "wind" => {
                cell.value = if vm.wind.is_empty() {
                    PLACEHOLDER.into()
                } else {
                    vm.wind.clone()
                }
            }
            _ => {}
        }
    }
    cells
}

fn legacy_row(car: &Car, side: Side, race: bool) -> Row {
    Row {
        facts: RowFacts::new(car),
        id: car.id,
        side,
        position: displayed(&car.position)
            .filter(|p| **p > 0)
            .map_or(Cow::Borrowed(PLACEHOLDER), |p| Cow::Owned(p.to_string())),
        number: car.number.clone(),
        driver: car.driver.name.clone(),
        class: car
            .class
            .as_ref()
            .map_or_else(String::new, |c| c.name.clone()),
        gap: if side == Side::Player {
            Cow::Borrowed(PLACEHOLDER)
        } else {
            relative_seconds(car).map_or(Cow::Borrowed(PLACEHOLDER), |s| {
                Cow::Owned(crate::multiclass_relative::gap_text(Some(s)))
            })
        },
        best_lap: lap_text(displayed(&car.best_lap_s).copied()),
        last_lap: lap_text(displayed(&car.last_lap_s).copied()),
        last_lap_stale: matches!(car.last_lap_s, Quality::Stale(_)),
        position_stale: matches!(car.position, Quality::Stale(_)),
        best_lap_stale: matches!(car.best_lap_s, Quality::Stale(_)),
        gap_stale: matches!(car.relative_s, Quality::Stale(_)),
        lap_delta: if race && side != Side::Player {
            car.relative_laps.current().copied()
        } else {
            None
        },
        ..Row::default()
    }
}

// Relative productivo conserva los valores stale y atenúa sus celdas al 60 %.
pub(crate) fn displayed<T>(quality: &Quality<T>) -> Option<&T> {
    match quality {
        Quality::Reliable(value) | Quality::Estimated(value) | Quality::Stale(value) => Some(value),
        Quality::Unavailable => None,
    }
}

fn optional(value: String) -> String {
    if value == PLACEHOLDER {
        String::new()
    } else {
        value
    }
}
fn lap_text(value: Option<f64>) -> Cow<'static, str> {
    value
        .filter(|v| v.is_finite() && *v > 0.0)
        .map_or(Cow::Borrowed(PLACEHOLDER), |v| {
            Cow::Owned(format::lap_time(Some(v)))
        })
}

fn temperature(value: Option<f64>, prefs: Preferences) -> String {
    if value.is_none_or(|v| !v.is_finite() || v < 0.0) {
        return String::new();
    }
    let unit = match prefs.units {
        format::Units::Metric => " °C",
        format::Units::Imperial => " °F",
    };
    optional(format::temperature(value, prefs)).replace(unit, "°")
}

/// Coches a menos de `STRIP_S` del jugador, con el signo de la tabla y el
/// mismo filtro de clase que la tabla.
fn strip(cars: &[Car], me: &Car, same_class: bool) -> Vec<Dot> {
    let my_class = me.class.as_ref().map(|c| c.id);
    let me = me.id;
    cars.iter()
        .filter(|car| !same_class || car.class.as_ref().map(|c| c.id) == my_class)
        .filter_map(|car| {
            let offset = if car.id == me {
                0.0
            } else {
                -relative_seconds(car)?
            };
            (offset.abs() <= STRIP_S).then(|| Dot {
                id: car.id,
                offset_s: offset,
                class: class_name(car),
                is_player: car.id == me,
            })
        })
        .collect()
}

fn row(car: &Car, side: Side, race: bool, fast_traffic: bool) -> Row {
    let gap = relative_seconds(car);
    Row {
        class_position: car
            .class_position
            .current()
            .map_or(Cow::Borrowed(PLACEHOLDER), |p| Cow::Owned(format!("P{p}"))),
        vehicle: car.vehicle.clone(),
        lap_delta: car
            .relative_laps
            .current()
            .copied()
            .filter(|_| race && side != Side::Player),
        rich_gap: match (side, gap) {
            (Side::Player, _) => Cow::Borrowed("0.0"),
            (_, Some(seconds)) => Cow::Owned(format!("{:+.1}", -seconds)),
            (_, None) => Cow::Borrowed(PLACEHOLDER),
        },
        rating: car.driver_rating.current().copied(),
        safety: car
            .safety_rating
            .current()
            .map_or(Cow::Borrowed(PLACEHOLDER), |sr| {
                Cow::Owned(format!("SR {sr:.0}"))
            }),
        trend: (side != Side::Player)
            .then(|| car.relative_trend_s_per_lap.current().copied())
            .flatten()
            .filter(|t| t.is_finite() && t.abs() >= 0.05)
            .map(|t| {
                let closing = t < 0.0;
                Trend {
                    value: format!("{:.1}", t.abs()),
                    closing,
                    good: if side == Side::Ahead {
                        closing
                    } else {
                        !closing
                    },
                }
            }),
        is_player: side == Side::Player,
        in_pits: car.in_pits.current() == Some(&true),
        fast_traffic,
        ..legacy_row(car, side, race)
    }
}

fn class_name(car: &Car) -> String {
    car.class
        .as_ref()
        .map_or_else(String::new, |class| class.name.clone())
}

fn surname(name: &str) -> String {
    name.rsplit(' ').next().unwrap_or(name).to_owned()
}

/// Tras perder `loss` segundos, cada rival queda `relative_s + loss` por
/// delante: se sale entre el delante más cercano y el detrás más cercano.
fn pit_exit(cars: &[Car], me: CarId, loss: Quality<f64>) -> Option<PitExit> {
    let loss = loss
        .current()
        .copied()
        .filter(|l| l.is_finite() && *l > 0.0)?;
    let label = |car: &Car| {
        if car.number.is_empty() {
            surname(&car.driver.name)
        } else {
            format!("{} (#{})", surname(&car.driver.name), car.number)
        }
    };
    let after: Vec<(f64, &Car)> = cars
        .iter()
        .filter(|car| car.id != me)
        .filter_map(|car| Some((relative_seconds(car)? + loss, car)))
        .collect();
    let ahead = after
        .iter()
        .filter(|(gap, _)| *gap > 0.0)
        .min_by(|a, b| a.0.total_cmp(&b.0))
        .map(|(_, car)| label(car));
    let behind = after
        .iter()
        .filter(|(gap, _)| *gap < 0.0)
        .max_by(|a, b| a.0.total_cmp(&b.0))
        .map(|(_, car)| label(car));
    Some(PitExit {
        ahead,
        behind,
        loss: format!("{loss:.1} s"),
    })
}

fn banner(snapshot: &Snapshot, in_pits: bool) -> Option<Banner> {
    let flags = snapshot.state.flags.current();
    let yellow = |scope: fn(&FlagScope) -> Option<u8>| {
        flags
            .into_iter()
            .flatten()
            .filter(|flag| flag.kind == FlagKind::Yellow)
            .find_map(|flag| scope(&flag.scope))
    };
    if in_pits {
        return Some(Banner::InPits);
    }
    if yellow(|s| matches!(s, FlagScope::Session).then_some(0)).is_some() {
        return Some(Banner::FullCourseYellow);
    }
    yellow(|s| match s {
        FlagScope::Sector(n) => Some(*n),
        _ => None,
    })
    .map(|sector| Banner::LocalYellow(sector + 1))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Driver, Player, Quality, SessionKind};

    fn scene() -> Snapshot {
        let mut snapshot = Snapshot::default();
        snapshot.state.source_state = SourceState::Live;
        snapshot.state.player = Some(Player {
            car: CarId(7),
            ..Player::default()
        });
        snapshot.state.cars.push(Car {
            id: CarId(7),
            position: Quality::Reliable(2),
            driver: Driver {
                name: "Piloto".into(),
                ..Driver::default()
            },
            best_lap_s: Quality::Reliable(91.234),
            ..Car::default()
        });
        snapshot
    }

    #[test]
    fn cache_ignores_sequence_but_invalidates_consumed_facts_and_settings() {
        let mut s = scene();
        let prefs = Preferences::default();
        let content = Content::default();
        let ids = vec!["lastLap".into()];
        let first = project_cached(&s, prefs, content, &ids, None);
        s.sequence += 1;
        s.state.player.as_mut().unwrap().telemetry.throttle = Quality::Reliable(0.9);
        let same = project_cached(&s, prefs, content, &ids, Some(&first));
        assert!(std::sync::Arc::ptr_eq(&first, &same));
        s.state.cars[0].last_lap_s = Quality::Reliable(90.1);
        let changed = project_cached(&s, prefs, content, &ids, Some(&same));
        assert!(!std::sync::Arc::ptr_eq(&same, &changed));
        assert_eq!(*changed, project_configured(&s, prefs, content, &ids));
        s.state.cars[0].driver.name.push_str(" nuevo");
        let renamed = project_cached(&s, prefs, content, &ids, Some(&changed));
        assert!(!std::sync::Arc::ptr_eq(&changed, &renamed));
        s.state.session.weather.wind_speed_mps = Quality::Reliable(10.0);
        let weather = project_cached(&s, prefs, content, &ids, Some(&renamed));
        assert!(!std::sync::Arc::ptr_eq(&renamed, &weather));
        let filtered = Content {
            same_class: true,
            ..content
        };
        let settings = project_cached(&s, prefs, filtered, &[], Some(&weather));
        assert!(!std::sync::Arc::ptr_eq(&weather, &settings));
        assert_eq!(*settings, project_configured(&s, prefs, filtered, &[]));
        let hidden = Content {
            include_player: false,
            ..filtered
        };
        let no_player_row = project_cached(&s, prefs, hidden, &[], None);
        s.state.cars[0].in_pits = Quality::Reliable(true);
        let pits = project_cached(&s, prefs, hidden, &[], Some(&no_player_row));
        assert!(!std::sync::Arc::ptr_eq(&no_player_row, &pits));
        assert!(pits.player_in_pits);
        assert_eq!(*pits, project_configured(&s, prefs, hidden, &[]));
    }

    #[test]
    fn configured_window_projects_asymmetric_ranges_class_and_player() {
        let mut snapshot = scene();
        snapshot.state.cars[0].class = Some(crate::Class {
            id: crate::ClassId(1),
            name: "GT3".into(),
        });
        for (id, gap, class) in [(8, 0.2, 2), (9, 0.5, 1), (10, -0.3, 1), (11, -0.8, 2)] {
            snapshot.state.cars.push(Car {
                id: CarId(id),
                relative_s: Quality::Reliable(gap),
                class: Some(crate::Class {
                    id: crate::ClassId(class),
                    name: class.to_string(),
                }),
                ..Car::default()
            });
        }
        let prefs = Preferences::default();
        for ahead in [0, 1, 8] {
            for behind in [0, 2, 8] {
                for same_class in [true, false] {
                    let content = Content {
                        range_ahead: ahead,
                        range_behind: behind,
                        same_class,
                        include_player: true,
                    };
                    let vm = project_content(&snapshot, prefs, content);
                    assert_eq!(vm.slots.len(), ahead + behind + 1);
                    assert_eq!(vm.slots[ahead].as_ref().expect("jugador").id, CarId(7));
                    if same_class {
                        assert!(
                            vm.slots
                                .iter()
                                .flatten()
                                .all(|row| ![CarId(8), CarId(11)].contains(&row.id))
                        );
                    }
                }
            }
        }
        let vm = project_content(
            &snapshot,
            prefs,
            Content {
                include_player: false,
                ..Content::default()
            },
        );
        assert_eq!(vm.slots.len(), 6);
        assert!(
            vm.slots
                .iter()
                .flatten()
                .all(|row| row.side != Side::Player)
        );
        snapshot.state.cars[0].last_lap_s = Quality::Stale(92.345);
        let vm = project(&snapshot, prefs);
        let cells = footer_slots(
            &snapshot,
            prefs,
            &vm,
            &["lastLap".into(), "lap".into(), "gap".into()],
        );
        assert_eq!(cells[0].value, "1:32.345");
        assert!(cells[0].stale);
        assert_eq!(cells[1].value, PLACEHOLDER);
        assert_eq!(cells[2].value, PLACEHOLDER);
        let without_player = project_content(
            &snapshot,
            prefs,
            Content {
                include_player: false,
                ..Content::default()
            },
        );
        let hidden = footer_slots(
            &snapshot,
            prefs,
            &without_player,
            &["position".into(), "lastLap".into()],
        );
        assert!(hidden.iter().all(|cell| cell.value == PLACEHOLDER));
    }

    #[test]
    fn track_neighbors_use_signed_relative_gaps_not_classification() {
        let mut snapshot = scene();
        snapshot.state.source_state = crate::SourceState::Live;
        snapshot.state.session.kind = Quality::Reliable(SessionKind::Race);
        snapshot
            .state
            .cars
            .extend(
                [(8, 0.4), (9, 4.2), (10, 1.8), (11, -2.6), (12, -0.3)].map(|(id, gap)| Car {
                    id: CarId(id),
                    position: Quality::Reliable(100 - id),
                    relative_s: Quality::Reliable(gap),
                    relative_laps: Quality::Reliable(-1),
                    ..Car::default()
                }),
            );
        let vm = project(&snapshot, Preferences::default());
        assert_eq!(
            vm.slots
                .iter()
                .flatten()
                .map(|r| r.id.0)
                .collect::<Vec<_>>(),
            vec![9, 10, 8, 7, 12, 11]
        );
        let ahead = vm.slots[2].as_ref().expect("vecino en pista");
        assert_eq!(ahead.gap, "+0.4");
        assert_eq!(ahead.lap_delta, Some(-1));
    }

    #[test]
    fn track_window_crops_ties_and_ignores_missing_invalid_and_zero_gaps() {
        let mut snapshot = scene();
        snapshot.state.cars.extend(
            [
                (9, Quality::Reliable(0.4)),
                (8, Quality::Estimated(0.4)),
                (10, Quality::Stale(-0.3)),
                (11, Quality::Reliable(f64::NAN)),
                (12, Quality::Reliable(f64::INFINITY)),
                (13, Quality::Unavailable),
                (14, Quality::Reliable(0.0)),
            ]
            .map(|(id, gap)| Car {
                id: CarId(id),
                relative_s: gap,
                ..Car::default()
            }),
        );
        let window = track_window_configured(&snapshot.state.cars, CarId(7), 1, 1, false);
        assert_eq!(
            window
                .iter()
                .flatten()
                .map(|car| car.id.0)
                .collect::<Vec<_>>(),
            vec![8, 7, 10]
        );
        assert_eq!(
            track_window_configured(&snapshot.state.cars, CarId(7), 0, 0, false).len(),
            1
        );
        assert!(
            track_window_configured(&snapshot.state.cars, CarId(99), 3, 3, false)
                .iter()
                .all(Option::is_none)
        );
    }

    #[test]
    fn source_states_hide_rows_and_lap_badges_require_fresh_race_data() {
        let mut snapshot = scene();
        snapshot.state.cars.push(Car {
            id: CarId(8),
            relative_s: Quality::Reliable(0.4),
            relative_laps: Quality::Reliable(1),
            ..Car::default()
        });
        for (state, status) in [
            (SourceState::Waiting, Some("SIN DATOS")),
            (SourceState::Live, None),
            (SourceState::Stale, Some("DATOS ANTIGUOS")),
            (SourceState::Lost, Some("DESCONECTADO")),
        ] {
            snapshot.state.source_state = state;
            let vm = project(&snapshot, Preferences::default());
            assert_eq!(vm.status.as_deref(), status);
            assert_eq!(
                vm.slots.iter().flatten().count(),
                if state == SourceState::Live { 2 } else { 0 }
            );
        }
        snapshot.state.source_state = SourceState::Live;
        for (kind, laps, expected) in [
            (SessionKind::Race, Quality::Reliable(1), Some(1)),
            (SessionKind::Race, Quality::Estimated(1), Some(1)),
            (SessionKind::Race, Quality::Stale(1), None),
            (SessionKind::Practice, Quality::Reliable(1), None),
        ] {
            snapshot.state.session.kind = Quality::Reliable(kind);
            snapshot.state.cars[1].relative_laps = laps;
            assert_eq!(
                project(&snapshot, Preferences::default()).slots[2]
                    .as_ref()
                    .expect("rival")
                    .lap_delta,
                expected
            );
        }
    }

    #[test]
    fn player_is_centered_and_leaderboard_never_becomes_track_neighbours() {
        let mut snapshot = scene();
        snapshot.state.cars.push(Car {
            id: CarId(8),
            position: Quality::Reliable(1),
            gap_leader: Quality::Reliable(crate::Gap::Time { seconds: 0.4 }),
            ..Car::default()
        });
        let vm = project(&snapshot, Preferences::default());
        assert_eq!(vm.slots.len(), 7);
        assert_eq!(vm.slots.iter().flatten().count(), 1);
        let row = vm.slots[RANGE].as_ref().expect("jugador");
        assert_eq!(row.id, CarId(7));
        assert_eq!(row.gap, PLACEHOLDER);
        assert_eq!(row.best_lap, "1:31.234");
        assert_eq!(row.lap_delta, None);
    }

    #[test]
    fn absent_player_never_creates_a_zero_row() {
        for remove_car in [false, true] {
            let mut snapshot = scene();
            if remove_car {
                snapshot.state.cars.clear();
            } else {
                snapshot.state.player = None;
            }
            let vm = project(&snapshot, Preferences::default());
            assert!(vm.slots.iter().all(Option::is_none));
            assert!(vm.player_badge.is_empty());
            assert_eq!(vm.status.as_deref(), Some("SIN DATOS"));
        }
    }

    #[test]
    fn qualities_and_invalid_numbers_are_not_invented_zeroes() {
        for (quality, expected) in [
            (Quality::Reliable(91.234), "1:31.234"),
            (Quality::Estimated(91.234), "1:31.234"),
            (Quality::Stale(91.234), "1:31.234"),
            (Quality::Unavailable, PLACEHOLDER),
            (Quality::Reliable(0.0), PLACEHOLDER),
            (Quality::Reliable(f64::NAN), PLACEHOLDER),
            (Quality::Reliable(f64::INFINITY), PLACEHOLDER),
        ] {
            let mut snapshot = scene();
            snapshot.state.cars[0].best_lap_s = quality;
            let vm = project(&snapshot, Preferences::default());
            assert_eq!(
                vm.slots[RANGE].as_ref().expect("jugador").best_lap_stale,
                matches!(quality, Quality::Stale(_))
            );
            assert_eq!(
                vm.slots[RANGE].as_ref().expect("jugador").best_lap,
                expected
            );
        }
    }

    #[test]
    fn metadata_uses_shared_formats_and_omits_missing_fields() {
        let mut snapshot = scene();
        snapshot.state.session.track_name = Quality::Reliable("Sebring".into());
        snapshot.state.session.kind = Quality::Reliable(SessionKind::Race);
        snapshot.state.session.remaining_s = Quality::Reliable(7198.0);
        snapshot.state.session.weather.air_temperature_k = Quality::Reliable(294.15);
        snapshot.state.session.weather.wind_speed_mps = Quality::Reliable(14.0 / 3.6);
        let vm = project(&snapshot, Preferences::default());
        assert_eq!(vm.track, "SEBRING");
        assert_eq!(vm.session, "CARRERA");
        assert_eq!(vm.remaining, "01:59:58");
        assert_eq!(vm.air, "21°");
        assert_eq!(vm.wind, "14 km/h");
        assert!(vm.track_temperature.is_empty());
        let mut next = snapshot.clone();
        next.epoch += 1;
        next.sequence += 100;
        assert_eq!(vm, project(&next, Preferences::default()));
    }
}

#[cfg(test)]
mod supplementary_tests {
    use super::*;
    fn project(snapshot: &Snapshot, ahead: usize, behind: usize, same_class: bool) -> Board {
        project_content(
            snapshot,
            Preferences::default(),
            Content {
                range_ahead: ahead,
                range_behind: behind,
                same_class,
                ..Content::default()
            },
        )
    }
    use crate::{Class, ClassId, Driver, Flag, Player, Session, State};

    fn car(id: u32, class: (u32, &str), relative: f64, best: f64) -> Car {
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
            class_position: Quality::Reliable(id),
            relative_s: Quality::Reliable(relative),
            best_lap_s: Quality::Reliable(best),
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
                    car: CarId(1),
                    ..Player::default()
                }),
                ..State::default()
            },
            ..Snapshot::default()
        }
    }

    const GT: (u32, &str) = (2, "LMGT3");
    const HY: (u32, &str) = (0, "Hypercar");

    #[test]
    fn window_signs_gaps_like_the_catalogue_and_rates_trends() {
        let me = car(1, GT, 0.0, 235.0);
        let mut ahead = car(2, GT, 3.1, 236.0);
        ahead.relative_trend_s_per_lap = Quality::Estimated(-0.2);
        ahead.driver_rating = Quality::Reliable(DriverRating::Gold);
        ahead.safety_rating = Quality::Reliable(93.4);
        let mut behind = car(3, GT, -6.9, 236.5);
        behind.relative_trend_s_per_lap = Quality::Estimated(0.3);
        let board = project(&snapshot(vec![me, ahead, behind]), 3, 3, false);
        let rows: Vec<&std::sync::Arc<Row>> = board.slots.iter().flatten().collect();
        assert_eq!(rows.len(), 3);
        assert_eq!(
            (
                rows[0].rich_gap.as_ref(),
                rows[1].rich_gap.as_ref(),
                rows[2].rich_gap.as_ref()
            ),
            ("-3.1", "0.0", "+6.9")
        );
        assert_eq!(
            rows[0].trend,
            Some(Trend {
                value: "0.2".into(),
                closing: true,
                good: true
            })
        );
        assert_eq!(
            rows[2].trend,
            Some(Trend {
                value: "0.3".into(),
                closing: false,
                good: true
            })
        );
        assert_eq!(rows[0].rating, Some(DriverRating::Gold));
        assert_eq!(
            (rows[0].safety.as_ref(), rows[2].safety.as_ref()),
            ("SR 93", "—")
        );
        assert_eq!(rows[0].class_position, "P2");
        assert!(board.traffic.is_none() && board.slower_class.is_none());
    }

    #[test]
    fn faster_class_behind_within_six_seconds_raises_traffic_and_lap_badges() {
        let me = car(1, GT, 0.0, 235.0);
        let mut hyper = car(5, HY, -1.8, 207.0);
        hyper.relative_laps = Quality::Estimated(2);
        let mut far = car(6, HY, -9.0, 207.5);
        far.relative_laps = Quality::Estimated(2);
        let board = project(&snapshot(vec![me, hyper, far]), 3, 3, false);
        assert_eq!(
            board.traffic,
            Some(Traffic {
                count: 1,
                class: "Hypercar".into()
            })
        );
        assert_eq!(board.slower_class.as_deref(), Some("LMGT3"));
        let row = board
            .slots
            .iter()
            .flatten()
            .find(|r| r.id == CarId(5))
            .expect("hypercar");
        assert!(row.fast_traffic);
        assert_eq!(row.lap_delta, Some(2));
        assert_eq!(board.strip.len(), 3, "los tres dentro de ±10 s");
    }

    #[test]
    fn same_class_filters_the_strip_like_the_table_but_keeps_traffic() {
        let me = car(1, GT, 0.0, 235.0);
        let rival = car(2, GT, 2.0, 236.0);
        let hyper = car(5, HY, -1.8, 207.0);
        let board = project(&snapshot(vec![me, rival, hyper]), 3, 3, true);
        assert_eq!(board.strip.len(), 2, "solo LMGT3 en la tira");
        assert_eq!(board.slots.iter().flatten().count(), 2);
        assert!(
            board.traffic.is_some(),
            "el tráfico más rápido sigue avisando"
        );
        assert_eq!(
            board.names.iter().filter(|n| n.visible).count(),
            2,
            "el ancho del nombre solo mira LMGT3"
        );
    }

    #[test]
    fn pit_exit_lands_between_the_cars_around_the_loss_and_banner_says_pits() {
        let mut me = car(1, HY, 0.0, 207.0);
        me.in_pits = Quality::Reliable(true);
        let mut s = snapshot(vec![
            me,
            car(2, GT, -26.0, 235.0),
            car(3, HY, -28.5, 208.0),
            car(4, HY, 3.0, 207.5),
        ]);
        s.state.player.as_mut().expect("jugador").pit_loss_s = Quality::Estimated(27.4);
        let board = project(&s, 3, 3, false);
        assert_eq!(board.banner, Some(Banner::InPits));
        assert_eq!(
            board.pit_exit,
            Some(PitExit {
                ahead: Some("Piloto2 (#2)".into()),
                behind: Some("Piloto3 (#3)".into()),
                loss: "27.4 s".into(),
            })
        );
    }

    #[test]
    fn without_data_nothing_is_invented() {
        let mut s = snapshot(vec![
            car(1, HY, 0.0, 207.0),
            Car {
                id: CarId(2),
                ..Car::default()
            },
        ]);
        let board = project(&s, 3, 3, false);
        assert_eq!(
            board.slots.iter().flatten().count(),
            1,
            "sin gap no hay vecino"
        );
        assert!(board.pit_exit.is_none());
        s.state.flags = Quality::Reliable(vec![Flag {
            kind: FlagKind::Yellow,
            scope: FlagScope::Session,
        }]);
        assert_eq!(
            project(&s, 3, 3, false).banner,
            Some(Banner::FullCourseYellow)
        );
        s.state.source_state = SourceState::Waiting;
        let board = project(&s, 2, 2, false);
        assert!(!board.player_present && board.slots.iter().all(Option::is_none));
        assert_eq!(board.slots.len(), 5);
    }
}
