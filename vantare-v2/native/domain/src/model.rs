use crate::{Capabilities, Flag, Quality};

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
    /// -1 marcha atrás, 0 punto muerto, 1.. marchas.
    pub gear: Quality<i8>,
    pub speed_mps: Quality<f64>,
    pub engine_speed_rad_s: Quality<f64>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Player {
    pub car: CarId,
    pub telemetry: Telemetry,
}

/// Contenido neutral de un instante. Lo produce el adaptador (en una
/// `Observation`) y lo publica el núcleo tras fusionarlo y derivar (en un
/// `Snapshot`); añadir una señal es añadir un campo aquí y en ningún otro sitio.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct State {
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
    pub state: State,
}
