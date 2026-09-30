use std::mem;
use std::time::Duration;

use crate::{Capabilities, Capability, Flag, Quality};

/// Identidad de coche estable durante la sesión; la asigna el adaptador.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct CarId(pub u32);

/// Identidad de piloto estable durante la sesión (un coche puede cambiar de piloto).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct DriverId(pub u32);

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct ClassId(pub u32);

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct SessionId(pub u64);

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Driver {
    pub id: DriverId,
    pub name: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Class {
    pub id: ClassId,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SessionKind {
    Practice,
    Qualifying,
    Race,
    /// Tipo que el modelo no conoce; conserva el valor original.
    Other(String),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SessionState {
    /// Antes de la salida (parrilla, formación).
    Preparing,
    Running,
    /// Detenida (bandera roja, neutralización).
    Interrupted,
    Finished,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Session {
    /// Cambia cuando el simulador empieza una sesión nueva.
    pub id: SessionId,
    pub kind: Quality<SessionKind>,
    pub state: Quality<SessionState>,
    pub elapsed_s: Quality<f64>,
    pub remaining_s: Quality<f64>,
    pub track_name: Quality<String>,
    /// Vueltas que quedan para el final. Normalmente `Estimated`.
    pub laps_remaining: Quality<u32>,
    /// Duración de la sesión en vueltas; `Unavailable` si es por tiempo.
    pub laps_total: Quality<u32>,
    pub track_length_m: Quality<f64>,
    pub weather: Weather,
}

/// Clima de la sesión, en unidades SI. Cada señal puede faltar por separado.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Weather {
    pub air_temperature_k: Quality<f64>,
    pub track_temperature_k: Quality<f64>,
    pub wind_speed_mps: Quality<f64>,
    /// Dirección de procedencia: 0 = norte, π/2 = este, sentido horario.
    /// El adaptador normaliza a [0, 2π); no es el yaw del coche.
    pub wind_direction_rad: Quality<f64>,
    /// Intensidad de lluvia, fracción 0–1.
    pub rain: Quality<f64>,
    /// Humedad de la pista: 0 = seca, 1 = completamente mojada.
    pub track_wetness: Quality<f64>,
    /// Presión atmosférica en pascales.
    pub pressure_pa: Quality<f64>,
}

/// Distancia a otro coche: por tiempo, o por vueltas completas si es mayor.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Gap {
    Time { seconds: f64 },
    Laps { count: u32 },
}

/// Posición y orientación en el plano del suelo. Ejes derechos, en metros;
/// `yaw_rad` crece en sentido antihorario desde +x. El adaptador traduce el
/// sistema de coordenadas de su simulador a este.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Pose {
    pub x_m: f64,
    pub y_m: f64,
    pub yaw_rad: f64,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Car {
    pub id: CarId,
    /// Número de carrera tal como se muestra ("7", "07", "A3").
    pub number: String,
    pub driver: Driver,
    /// `None` si el simulador no informa de clases.
    pub class: Option<Class>,
    /// Posición global, desde 1.
    pub position: Quality<u32>,
    /// Posición dentro de su clase, desde 1.
    pub class_position: Quality<u32>,
    /// Vueltas completadas.
    pub laps: Quality<u32>,
    pub last_lap_s: Quality<f64>,
    pub best_lap_s: Quality<f64>,
    /// Sectores de la última vuelta; tantos como tenga el circuito.
    pub last_sectors_s: Vec<Quality<f64>>,
    /// Distancia al líder de la clasificación general.
    pub gap_leader: Quality<Gap>,
    /// Distancia al coche de delante en la clasificación general.
    pub gap_ahead: Quality<Gap>,
    /// Distancia al líder de su clase.
    pub gap_class_leader: Quality<Gap>,
    /// Distancia al coche de delante en su clase.
    pub gap_class_ahead: Quality<Gap>,
    /// Gap temporal al jugador: positivo = rival delante en pista.
    pub relative_s: Quality<f64>,
    /// Vueltas de progreso respecto al jugador, truncadas hacia cero.
    pub relative_laps: Quality<i32>,
    /// Metros recorridos en la vuelta en curso.
    pub lap_distance_m: Quality<f64>,
    /// Tiempo transcurrido en la vuelta en curso.
    pub lap_elapsed_s: Quality<f64>,
    /// Sector en curso, desde 0.
    pub current_sector: Quality<u8>,
    pub in_pits: Quality<bool>,
    pub pose: Quality<Pose>,
}

/// Telemetría del coche del jugador.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Telemetry {
    /// Fracción 0–1; 1 = pedal a fondo.
    pub throttle: Quality<f64>,
    pub brake: Quality<f64>,
    pub clutch: Quality<f64>,
    /// Volante normalizado -1..1: negativo = izquierda, positivo = derecha.
    pub steering: Quality<f64>,
    /// -1 marcha atrás, 0 punto muerto, 1.. marchas.
    pub gear: Quality<i8>,
    pub speed_mps: Quality<f64>,
    pub engine_speed_rad_s: Quality<f64>,
}

/// Combustible del coche del jugador, en litros.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Fuel {
    pub level_l: Quality<f64>,
    pub capacity_l: Quality<f64>,
    /// Consumo medio por vuelta. Lo deriva el núcleo.
    pub per_lap_l: Quality<f64>,
    /// Vueltas que da el combustible actual al consumo medio. Lo deriva el núcleo.
    pub laps_left: Quality<f64>,
    /// Últimas diez vueltas medidas (vuelta completada, litros), de antigua a
    /// reciente; plazas vacías al final. Tamaño fijo para conservar Player: Copy
    /// y no cambiar las proyecciones. El DTO publica solo las plazas ocupadas.
    /// Son medidas históricas: el silencio no cambia sus litros.
    pub history: [Option<(u32, f64)>; 10],
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Damage {
    /// Integridad 0–1: 1 = intacto, 0 = totalmente dañado. Para mostrar daño,
    /// la proyección usa `1 - integridad`, nunca invierte el dato del modelo.
    pub aero: Quality<f64>,
    /// Misma convención de integridad que `aero`.
    pub body: Quality<f64>,
    /// Misma convención de integridad que `aero`.
    pub suspension: Quality<f64>,
    /// Goma restante 0–1: 1 = nuevo, 0 = totalmente gastado. Orden fijo:
    /// delantero izquierdo, delantero derecho, trasero izquierdo, trasero derecho.
    /// La proyección muestra desgaste como `1 - goma restante`.
    pub tyre_wear: [Quality<f64>; 4],
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Player {
    pub car: CarId,
    pub telemetry: Telemetry,
    pub fuel: Fuel,
    pub damage: Damage,
    /// Diferencia con la mejor vuelta propia en este punto de la vuelta;
    /// negativo = más rápido. Nativo si el simulador lo da; si no, derivado.
    pub delta_best_s: Quality<f64>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum SourceKind {
    #[default]
    Live,
    Replay,
}

/// Qué simulador produce los datos. Solo identifica (diagnóstico, cabecera de
/// grabación): nada del núcleo, las proyecciones ni los widgets ramifica por él.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Source {
    /// Nombre corto y estable, uno de [`SIMULATORS`] al cruzar un cable.
    pub simulator: &'static str,
    pub kind: SourceKind,
}

/// Simuladores conocidos. Añadir uno es añadir su nombre aquí y su adaptador.
pub const SIMULATORS: &[&str] = &["lmu", "acc", UNKNOWN_SIMULATOR];

/// Nombre de cualquier simulador que no esté en [`SIMULATORS`].
pub const UNKNOWN_SIMULATOR: &str = "unknown";

impl Default for Source {
    fn default() -> Self {
        Self {
            simulator: UNKNOWN_SIMULATOR,
            kind: SourceKind::default(),
        }
    }
}

impl Source {
    /// El nombre de [`SIMULATORS`] que corresponde a `name`, o `"unknown"`. Es
    /// lo que hace un decodificador con un nombre recibido de fuera: la memoria
    /// no depende de lo que diga el par.
    pub fn known_simulator(name: &str) -> &'static str {
        SIMULATORS
            .iter()
            .find(|known| **known == name)
            .copied()
            .unwrap_or(UNKNOWN_SIMULATOR)
    }
}

/// De dónde y cuándo viene un instante.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Origin {
    pub source: Source,
    /// Instante de la muestra en el reloj del simulador, si lo expone. Solo
    /// sirve para restar entre muestras: no es comparable con `received_at`.
    pub source_time: Option<Duration>,
    /// Instante de recepción en el reloj monotónico del núcleo.
    pub received_at: Duration,
}

/// Estado del enlace. El núcleo publica Waiting/Live/Stale; Lost solo lo marca
/// el consumidor cuando el pipe deja de entregar fotos (sin renumerarlas).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum SourceState {
    #[default]
    Waiting,
    Live,
    Stale,
    Lost,
}

/// Contenido neutral de un instante. Lo produce el adaptador (en una
/// `Observation`) y lo publica el núcleo tras fusionarlo y derivar (en un
/// `Snapshot`); añadir una señal es añadir un campo aquí y en ningún otro sitio.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct State {
    pub source_state: SourceState,
    pub capabilities: Capabilities,
    pub session: Session,
    /// Banderas activas en cualquier ámbito.
    pub flags: Quality<Vec<Flag>>,
    pub cars: Vec<Car>,
    pub player: Option<Player>,
}

impl State {
    pub fn player_car(&self) -> Option<&Car> {
        let player = self.player.as_ref()?;
        self.cars.iter().find(|car| car.id == player.car)
    }
}

/// Estado publicado por el núcleo. Inmutable por convención: se comparte como
/// `Arc<Snapshot>` y nadie lo modifica; el siguiente es otro valor. `sequence`
/// crece dentro de una `epoch`; una época nueva significa que el productor se
/// reinició y los consumidores deben reconstruir su estado.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Snapshot {
    pub epoch: u64,
    pub sequence: u64,
    pub origin: Origin,
    pub state: State,
}

/// Lo actual pasa a obsoleto: los valores siguen ahí, ya no son "actuales".
///
/// Desestructura cada tipo sin `..`: una señal nueva en `domain` no compila
/// hasta que se decide aquí cómo se vuelve obsoleta.
pub fn degrade(state: &mut State) {
    let State {
        source_state: _,
        capabilities,
        session,
        flags,
        cars,
        player,
    } = state;
    let Capabilities {
        session_clock,
        positions,
        lap_times,
        gaps,
        pit_status,
        flags: flags_capability,
        spatial,
        driver_inputs,
        powertrain,
        fuel,
        delta,
        sectors,
        lap_progress,
        weather,
        damage,
    } = capabilities;
    for capability in [
        session_clock,
        positions,
        lap_times,
        gaps,
        pit_status,
        flags_capability,
        spatial,
        driver_inputs,
        powertrain,
        fuel,
        delta,
        sectors,
        lap_progress,
        weather,
        damage,
    ] {
        if *capability == Capability::Fresh {
            *capability = Capability::WithData;
        }
    }
    let Session {
        id: _,
        kind,
        state,
        elapsed_s,
        remaining_s,
        track_name,
        laps_remaining,
        laps_total,
        track_length_m,
        weather,
    } = session;
    make_stale(kind);
    make_stale(state);
    make_stale(elapsed_s);
    make_stale(remaining_s);
    make_stale(track_name);
    make_stale(laps_remaining);
    make_stale(laps_total);
    make_stale(track_length_m);
    degrade_weather(weather);
    make_stale(flags);
    cars.iter_mut().for_each(degrade_car);
    if let Some(player) = player {
        degrade_player(player);
    }
}

fn degrade_car(car: &mut Car) {
    let Car {
        id: _,
        number: _,
        driver: _,
        class: _,
        position,
        class_position,
        laps,
        last_lap_s,
        best_lap_s,
        last_sectors_s,
        gap_leader,
        gap_ahead,
        gap_class_leader,
        gap_class_ahead,
        relative_s,
        relative_laps,
        lap_distance_m,
        lap_elapsed_s,
        current_sector,
        in_pits,
        pose,
    } = car;
    make_stale(position);
    make_stale(class_position);
    make_stale(laps);
    make_stale(last_lap_s);
    make_stale(best_lap_s);
    last_sectors_s.iter_mut().for_each(make_stale);
    make_stale(gap_leader);
    make_stale(gap_ahead);
    make_stale(gap_class_leader);
    make_stale(gap_class_ahead);
    make_stale(relative_s);
    make_stale(relative_laps);
    make_stale(lap_distance_m);
    make_stale(lap_elapsed_s);
    make_stale(current_sector);
    make_stale(in_pits);
    make_stale(pose);
}

fn degrade_player(player: &mut Player) {
    let Player {
        car: _,
        telemetry,
        fuel,
        damage,
        delta_best_s,
    } = player;
    let Telemetry {
        throttle,
        brake,
        clutch,
        steering,
        gear,
        speed_mps,
        engine_speed_rad_s,
    } = telemetry;
    make_stale(throttle);
    make_stale(brake);
    make_stale(clutch);
    make_stale(steering);
    make_stale(gear);
    make_stale(speed_mps);
    make_stale(engine_speed_rad_s);
    let Fuel {
        level_l,
        capacity_l,
        per_lap_l,
        laps_left,
        history: _,
    } = fuel;
    make_stale(level_l);
    make_stale(capacity_l);
    make_stale(per_lap_l);
    make_stale(laps_left);
    make_stale(delta_best_s);
    let Damage {
        aero,
        body,
        suspension,
        tyre_wear,
    } = damage;
    make_stale(aero);
    make_stale(body);
    make_stale(suspension);
    tyre_wear.iter_mut().for_each(make_stale);
}

fn degrade_weather(weather: &mut Weather) {
    let Weather {
        air_temperature_k,
        track_temperature_k,
        wind_speed_mps,
        wind_direction_rad,
        rain,
        track_wetness,
        pressure_pa,
    } = weather;
    make_stale(air_temperature_k);
    make_stale(track_temperature_k);
    make_stale(wind_speed_mps);
    make_stale(wind_direction_rad);
    make_stale(rain);
    make_stale(track_wetness);
    make_stale(pressure_pa);
}

fn make_stale<T>(quality: &mut Quality<T>) {
    *quality = match mem::take(quality) {
        Quality::Reliable(value) | Quality::Estimated(value) => Quality::Stale(value),
        other => other,
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_simulator_name_from_outside_maps_into_the_fixed_table() {
        assert_eq!(Source::known_simulator("lmu"), "lmu");
        assert_eq!(Source::known_simulator("ac"), UNKNOWN_SIMULATOR);
        assert_eq!(Source::known_simulator(""), UNKNOWN_SIMULATOR);
        assert!(SIMULATORS.contains(&UNKNOWN_SIMULATOR));
    }
}
