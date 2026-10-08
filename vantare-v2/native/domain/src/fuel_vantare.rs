//! ViewModel de Fuel y stint en el sistema de diseño Vantare (#1497).
//!
//! Combustible y, si la fuente la publica (Hypercar en LMU), energía virtual:
//! el recurso que se acaba antes decide las vueltas que quedan y la vuelta de
//! parada. Añade la ventana de parada, lo que falta para terminar, el ahorro
//! en FCY, el repostaje en curso y la confirmación de llegada. Solo valores
//! actuales; lo que la fuente no publica queda en `None` y se pinta `—`.

use crate::{Car, FlagKind, FlagScope, Player, Quality, Snapshot, SourceState, TyreCompound};

/// Con menos autonomía que esta, hay que entrar esta vuelta.
pub const LOW_LAPS: f64 = 1.5;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Resource {
    Fuel,
    Energy,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Board {
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
    /// Litros de las últimas vueltas medidas, de antigua a reciente.
    pub history: Vec<f64>,
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

pub fn project(snapshot: &Snapshot) -> Board {
    let state = &snapshot.state;
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
        history: player.map_or_else(Vec::new, |p| {
            p.fuel
                .history
                .iter()
                .flatten()
                .map(|(_, litres)| *litres)
                .filter(|l| l.is_finite() && *l > 0.0)
                .collect()
        }),
    }
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

#[cfg(test)]
mod tests {
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
        assert_eq!(board.history, vec![3.78, 3.74]);
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
