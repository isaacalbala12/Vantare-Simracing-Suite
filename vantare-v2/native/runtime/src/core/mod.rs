//! Núcleo neutral (ADR 0099 §2, flujo de foto): consume `Observation` de
//! cualquier adaptador y publica `Snapshot` inmutables.
//!
//! Un único escritor (`&mut Core`, sin cerrojos ni I/O) funde, deriva y numera;
//! los consumidores leen con [`Reader`] sin bloquearlo.
//!
//! El journal hermano compara aquí la foto previa con la nueva, con la misma
//! `epoch`/`sequence`. Observar no escribe en disco; el propietario persiste
//! explícitamente fuera del hilo de adquisición si activa recording.
//! Series consume la misma foto publicada, también su degradación a obsoleto.

mod delta;
mod derive;
mod fuel;
mod merge;
mod publish;

use std::sync::Arc;
use std::time::Duration;
use std::{io, path::Path};

use vantare_domain::{Adapter, AdapterError, Observation, Snapshot, SourceState, degrade};

pub use merge::Reject;
pub use publish::Reader;

use crate::flows::{Cursor, Journal, Series};
use merge::{Trackers, merge_requested, stale};
use publish::Publisher;

/// Sin avance del reloj de la fuente durante este tiempo, el snapshot se
/// publica como obsoleto (mismo límite que el `FreshnessGate` de ISA-1403).
pub const STALL_LIMIT: Duration = Duration::from_millis(500);

fn same_scope(a: &Snapshot, b: &Snapshot) -> bool {
    a.origin.source == b.origin.source
        && a.state.session.id == b.state.session.id
        && a.state.session.track_name == b.state.session.track_name
        && a.state.session.kind == b.state.session.kind
        && a.state.player.as_ref().map(|p| p.car) == b.state.player.as_ref().map(|p| p.car)
}

#[derive(Debug)]
pub enum Error {
    Adapter(AdapterError),
    Reject(Reject),
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Adapter(error) => error.fmt(f),
            Self::Reject(error) => error.fmt(f),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Adapter(error) => Some(error),
            Self::Reject(error) => Some(error),
        }
    }
}

#[allow(clippy::struct_excessive_bools)] // Interruptores de diagnóstico, apagados por defecto.
pub struct Core {
    epoch: u64,
    demand: vantare_ipc::Demand,
    demand_pending: bool,
    current: Arc<Snapshot>,
    /// Última foto viva, para no reconstruir ni reordenar datos durante pausa.
    last_live: Option<Arc<Snapshot>>,
    publisher: Publisher,
    /// `received_at` de la última observación en que el reloj de la fuente
    /// avanzó (o la fuente no expone reloj).
    last_advance: Duration,
    last_source_time: Option<Duration>,
    stale: bool,
    freshness_reason: &'static str,
    /// Memoria entre fotos de las derivaciones (combustible y delta); fuera de
    /// `domain`, porque no es una señal publicada.
    trackers: Trackers,
    events: Journal,
    series: Series,
    measurement_skip_flows: bool,
    measurement_skip_validation: bool,
}

impl Core {
    /// `epoch` debe ser mayor que la de cualquier núcleo anterior (la fija quien
    /// arranca el proceso). Antes de la primera observación se publica un
    /// snapshot vacío con `sequence` 0.
    pub fn new(epoch: u64) -> Self {
        let current = Arc::new(Snapshot {
            epoch,
            ..Snapshot::default()
        });
        Self {
            epoch,
            demand: vantare_ipc::Demand::all(),
            demand_pending: false,
            publisher: Publisher::new(Arc::clone(&current)),
            current,
            last_live: None,
            last_advance: Duration::ZERO,
            last_source_time: None,
            stale: false,
            freshness_reason: "sin sesión admitida",
            trackers: Trackers::default(),
            events: Journal::volatile(epoch),
            series: Series::default(),
            measurement_skip_flows: false,
            measurement_skip_validation: false,
        }
    }

    /// Configuración de la prueba de frontera. Recording desactivado con `None`.
    /// Abrir y recuperar el fichero ocurre antes del bucle de adquisición.
    pub fn with_flows(epoch: u64, retention: usize, recording: Option<&Path>) -> io::Result<Self> {
        let events = Journal::open(epoch, retention, recording)?;
        Ok(Self {
            events,
            ..Self::new(epoch)
        })
    }

    /// Base recuperada por el dueño I/O antes de adquisición. Sin abrir disco.
    pub fn with_event_base(base: Cursor) -> io::Result<Self> {
        if base.index == u64::MAX {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "base agotada"));
        }
        Ok(Self {
            events: Journal::at(base),
            ..Self::new(base.epoch)
        })
    }

    pub fn events(&self) -> &Journal {
        &self.events
    }

    /// Ablación de diagnóstico: solo se configura al arrancar el banco, nunca
    /// por IPC. La ruta normal conserva validación y los tres flujos.
    #[cfg(any(windows, test))]
    pub(crate) fn set_measurement_mode(&mut self, mode: &str) -> io::Result<()> {
        let (flows, validation) = match mode {
            "normal" => (false, false),
            "no-flows" => (true, false),
            "no-validation" => (false, true),
            "no-both" => (true, true),
            _ => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "modo de medición desconocido",
                ));
            }
        };
        self.measurement_skip_flows = flows;
        self.measurement_skip_validation = validation;
        Ok(())
    }

    pub fn series(&self) -> &Series {
        &self.series
    }

    /// Configurar entrega acotada antes de adquirir, o publicar un parcial.
    /// No escribe disco ni espera a almacenamiento/análisis.
    pub fn series_mut(&mut self) -> &mut Series {
        &mut self.series
    }

    /// `persist` puede hacer I/O: llamarlo fuera de adquisición.
    pub fn events_mut(&mut self) -> &mut Journal {
        &mut self.events
    }

    /// Último snapshot publicado (el del propio escritor; los consumidores usan un [`Reader`]).
    pub fn snapshot(&self) -> Arc<Snapshot> {
        Arc::clone(&self.current)
    }

    pub fn freshness_reason(&self) -> &'static str {
        self.freshness_reason
    }

    pub fn subscribe(&mut self) -> Reader {
        self.publisher.subscribe()
    }

    /// La demanda aceptada se deriva en el siguiente tick. Los datos nativos
    /// siguen disponibles para journal/series, aunque no salgan por el IPC visual.
    pub fn set_demand(&mut self, demand: vantare_ipc::Demand) {
        if self.demand != demand {
            self.trackers.demand_changed(&demand);
            self.demand = demand;
            self.demand_pending = true;
        }
    }

    /// Evita reservar un mapa de demanda en cada vuelta del bucle de adquisición.
    pub fn set_demand_mask(&mut self, mask: u64) {
        if self.demand.mask() != mask {
            self.set_demand(vantare_ipc::Demand::from_mask(mask));
        }
        // También una reconexión con la misma unión necesita una primera foto.
        self.demand_pending = true;
    }

    fn refresh_demand(&mut self) {
        if !self.demand_pending || self.current.sequence == 0 {
            return;
        }
        self.demand_pending = false;
        let mut snapshot = (*self.current).clone();
        derive::derive_requested(&mut snapshot.state, &self.demand);
        if snapshot.state.source_state != SourceState::Paused {
            self.trackers.derive(&mut snapshot.state, &self.demand);
        }
        snapshot.sequence += 1;
        // Reproyectar no es una adquisición: no añade muestras a series ni hechos.
        self.current = Arc::new(snapshot);
        self.publisher.publish(Arc::clone(&self.current));
    }

    /// Un ciclo del bucle del propietario: lee el adaptador, publica y vigila el
    /// silencio de la fuente. `Disconnected` degrada lo publicado a obsoleto al
    /// instante; un error o un rechazo dejan lo publicado como está (caducará
    /// por silencio) y se devuelven para que el llamador los registre.
    ///
    /// # Errors
    /// El error del adaptador o el rechazo de su observación.
    pub fn step(&mut self, adapter: &mut dyn Adapter, now: Duration) -> Result<(), Error> {
        let polled = {
            #[cfg(feature = "paint-stats")]
            let _span = crate::profiling::begin(crate::profiling::Stage::Poll);
            adapter.poll(now)
        };
        let result = match polled {
            Ok(Some(observation)) => self.observe(observation).map_err(Error::Reject),
            Ok(None) => Ok(()),
            Err(error) => {
                if error == AdapterError::Disconnected {
                    self.publish_stale("adaptador desconectado; degradación inmediata");
                }
                Err(Error::Adapter(error))
            }
        };
        self.tick(now);
        self.refresh_demand();
        result
    }

    /// Funde y publica una observación.
    ///
    /// # Errors
    /// [`Reject`] si no se admite; entonces no se publica nada ni cambia la revisión.
    pub fn observe(&mut self, observation: Observation) -> Result<(), Reject> {
        #[cfg(feature = "paint-stats")]
        let _span = crate::profiling::begin(crate::profiling::Stage::Observe);
        let origin = observation.origin;
        let paused = observation.state.source_state == SourceState::Paused;
        let advanced = origin.source_time.is_none() || origin.source_time != self.last_source_time;
        let mut snapshot = merge_requested(
            Some(&self.current),
            observation,
            self.epoch,
            &mut self.trackers,
            &self.demand,
            !self.measurement_skip_validation,
        )?;
        self.demand_pending = false;
        if paused || advanced {
            self.last_advance = origin.received_at;
        }
        self.last_source_time = origin.source_time;
        if paused
            && let Some(live) = &self.last_live
            && same_scope(live, &snapshot)
        {
            snapshot.state = live.state.clone();
            snapshot.state.source_state = SourceState::Paused;
        }
        // Paused exige confirmaciones periódicas del adaptador. Su silencio
        // vuelve a caducar a los mismos 500 ms; no cambia el límite del núcleo.
        self.stale = self.is_stale_at(origin.received_at);
        self.freshness_reason = match snapshot.state.source_state {
            SourceState::Paused => {
                "SHM mCurrentET sin avance >=500ms; proceso vivo y REST de sesión <500ms"
            }
            SourceState::Stale if advanced && origin.source_time.is_some() => {
                "adaptador: reloj SHM avanzando en recuperación de 2000ms tras caducar a 500ms"
            }
            SourceState::Stale => "adaptador: reloj SHM mCurrentET >=500ms sin pausa confirmada",
            SourceState::Live => "reloj de fuente avanzando",
            SourceState::Waiting | SourceState::Lost => "sin sesión admitida",
        };
        if self.stale {
            degrade(&mut snapshot.state);
            snapshot.state.source_state = SourceState::Stale;
            self.freshness_reason = "núcleo: origin.source_time sin avance >=500ms";
        }
        self.publish(snapshot);
        Ok(())
    }

    /// Publica un snapshot obsoleto si la fuente lleva callada [`STALL_LIMIT`].
    pub fn tick(&mut self, now: Duration) {
        if self.is_stale_at(now) {
            let reason = if self.current.state.source_state == SourceState::Paused {
                "núcleo: confirmación de pausa ausente >=500ms"
            } else {
                "núcleo: origin.source_time sin avance >=500ms"
            };
            self.publish_stale(reason);
        }
    }

    fn is_stale_at(&self, now: Duration) -> bool {
        now.saturating_sub(self.last_advance) >= STALL_LIMIT
    }

    fn publish_stale(&mut self, reason: &'static str) {
        if self.stale || self.current.sequence == 0 {
            return; // ya obsoleto, o nada que degradar
        }
        self.stale = true;
        self.freshness_reason = reason;
        let snapshot = stale(&self.current);
        self.publish(snapshot);
    }

    fn publish(&mut self, snapshot: Snapshot) {
        if !self.measurement_skip_flows {
            {
                #[cfg(feature = "paint-stats")]
                let _span = crate::profiling::begin(crate::profiling::Stage::Journal);
                self.events.observe(&self.current, &snapshot);
            }
            if snapshot.state.source_state != SourceState::Paused {
                #[cfg(feature = "paint-stats")]
                let _span = crate::profiling::begin(crate::profiling::Stage::Series);
                self.series.observe(&snapshot);
            }
        }
        self.current = Arc::new(snapshot);
        if self.current.state.source_state == SourceState::Live {
            let mut live = Arc::clone(&self.current);
            // Los relojes de scoring y jugador no caducan en la misma vuelta.
            // Guardar el scoring más reciente y el último jugador válido, sin
            // publicar como frescas sus señales realmente caducadas en Live.
            if self.current.state.capabilities.driver_inputs == vantare_domain::Capability::WithData
                && let Some(previous) = &self.last_live
                && same_scope(previous, &self.current)
            {
                let mut retained = (*self.current).clone();
                retained.state.player.clone_from(&previous.state.player);
                let from = &previous.state.capabilities;
                let to = &mut retained.state.capabilities;
                to.driver_inputs = from.driver_inputs;
                to.powertrain = from.powertrain;
                to.fuel = from.fuel;
                to.delta = from.delta;
                to.damage = from.damage;
                live = Arc::new(retained);
            }
            self.last_live = Some(live);
        }
        self.publisher.publish(Arc::clone(&self.current));
    }
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;

    use vantare_domain::format::Preferences;
    use vantare_domain::{
        Capabilities, Capability, Car, CarId, Gap, Player, Pose, Quality, SessionKind, State,
        Telemetry, pedals, radar, standings,
    };

    use super::*;

    #[test]
    fn wrapped_errors_preserve_their_source_and_display() {
        use std::error::Error as _;
        let adapter = Error::Adapter(AdapterError::Disconnected);
        assert_eq!(adapter.to_string(), AdapterError::Disconnected.to_string());
        assert_eq!(
            adapter
                .source()
                .expect("causa")
                .downcast_ref::<AdapterError>(),
            Some(&AdapterError::Disconnected)
        );
        let reject = Reject::DuplicateCar(CarId(7));
        let error = Error::Reject(reject);
        assert_eq!(error.to_string(), reject.to_string());
        assert_eq!(
            error.source().expect("causa").downcast_ref::<Reject>(),
            Some(&reject)
        );
    }

    /// Adaptador de prueba: entrega lo que se le encoló, sin ningún simulador.
    #[derive(Default)]
    struct Script(VecDeque<Result<Option<Observation>, AdapterError>>);

    impl Adapter for Script {
        fn poll(&mut self, _now: Duration) -> Result<Option<Observation>, AdapterError> {
            self.0.pop_front().unwrap_or(Ok(None))
        }
    }

    fn ms(millis: u64) -> Duration {
        Duration::from_millis(millis)
    }

    fn car(id: u32, position: u32, x_m: f64) -> Car {
        Car {
            id: CarId(id),
            number: id.to_string(),
            position: Quality::Reliable(position),
            in_pits: Quality::Reliable(false),
            pose: Quality::Reliable(Pose {
                x_m,
                y_m: 0.0,
                yaw_rad: 0.0,
            }),
            ..Car::default()
        }
    }

    /// Tres coches en pista; el jugador es el 2, con el 1 delante y el 3 detrás.
    fn observation(at: Duration, source: Duration, throttle: f64) -> Observation {
        let mut cars = vec![car(1, 1, 10.0), car(2, 2, 0.0), car(3, 3, -10.0)];
        cars[1].gap_leader = Quality::Reliable(Gap::Time { seconds: 2.0 });
        cars[2].gap_leader = Quality::Reliable(Gap::Time { seconds: 5.0 });
        let mut obs = Observation {
            state: State {
                source_state: SourceState::Live,
                capabilities: Capabilities {
                    positions: Capability::Fresh,
                    gaps: Capability::Fresh,
                    spatial: Capability::Fresh,
                    driver_inputs: Capability::Fresh,
                    ..Capabilities::default()
                },
                cars,
                player: Some(Player {
                    car: CarId(2),
                    telemetry: Telemetry {
                        throttle: Quality::Reliable(throttle),
                        ..Telemetry::default()
                    },
                    ..Player::default()
                }),
                ..State::default()
            },
            ..Observation::default()
        };
        obs.state.session.kind = Quality::Reliable(SessionKind::Race);
        obs.origin.source_time = Some(source);
        obs.origin.received_at = at;
        obs
    }

    #[test]
    fn measurement_modes_preserve_standings_for_valid_observations() {
        let obs = observation(ms(0), ms(0), 0.25);
        let mut baseline = Core::new(3);
        baseline.observe(obs.clone()).unwrap();
        let expected = standings::project(&baseline.snapshot(), Preferences::default());
        for mode in ["normal", "no-flows", "no-validation", "no-both"] {
            let mut core = Core::new(3);
            core.set_measurement_mode(mode).unwrap();
            core.observe(obs.clone()).unwrap();
            assert_eq!(
                standings::project(&core.snapshot(), Preferences::default()),
                expected,
                "{mode}"
            );
        }
    }

    #[test]
    fn measurement_modes_isolate_flows_and_validation_but_keep_photos_and_staleness() {
        for (mode, flows, validation) in [
            ("normal", true, true),
            ("no-flows", false, true),
            ("no-validation", true, false),
            ("no-both", false, false),
        ] {
            let mut core = Core::new(3);
            core.set_measurement_mode(mode).unwrap();
            let mut obs = observation(ms(0), ms(0), 0.25);
            obs.state.cars[1].laps = Quality::Reliable(1);
            obs.state.session.remaining_s = Quality::Reliable(f64::INFINITY);
            core.observe(obs.clone()).unwrap();
            assert_eq!(core.series().active().is_some(), flows, "{mode}");
            assert_eq!(
                core.snapshot().state.session.remaining_s == Quality::Unavailable,
                validation,
                "{mode}"
            );
            let tail = core.events().tail();
            obs.origin.source_time = Some(ms(100));
            obs.origin.received_at = ms(100);
            obs.state.cars[1].in_pits = Quality::Reliable(true);
            core.observe(obs.clone()).unwrap();
            assert_eq!(core.events().tail().index > tail.index, flows, "{mode}");
            obs.state.cars[2].id = obs.state.cars[0].id;
            assert_eq!(core.observe(obs).is_err(), validation, "{mode}");
            core.tick(ms(700));
            assert_eq!(
                core.snapshot().state.source_state,
                SourceState::Stale,
                "{mode}"
            );
            assert!(core.snapshot().sequence >= 3);
        }
        let mut core = Core::new(3);
        assert!(core.set_measurement_mode("typo").is_err());
        assert!(!core.measurement_skip_flows);
        assert!(!core.measurement_skip_validation);
    }

    #[test]
    fn photo_flow_from_adapter_to_the_three_view_models() {
        let mut core = Core::new(3);
        let reader = core.subscribe();
        assert_eq!(reader.latest().sequence, 0, "vacío antes de observar");
        assert_eq!(reader.latest().state.source_state, SourceState::Waiting);

        let mut adapter = Script::default();
        adapter
            .0
            .push_back(Ok(Some(observation(ms(0), ms(0), 0.25))));
        adapter
            .0
            .push_back(Ok(Some(observation(ms(100), ms(100), 0.75))));
        core.step(&mut adapter, ms(0)).unwrap();
        core.step(&mut adapter, ms(100)).unwrap();

        let snapshot = reader.wait(Duration::ZERO).unwrap();
        assert_eq!(snapshot.state.source_state, SourceState::Live);
        assert_eq!((snapshot.epoch, snapshot.sequence), (3, 2));

        let table = standings::project(&snapshot, Preferences::default());
        let intervals: Vec<_> = table.rows.iter().map(|row| row.interval.as_str()).collect();
        // Intervalos derivados: el 2º a 2 s del 1º, el 3º a 3 s del 2º.
        assert_eq!(intervals, ["—", "+2.00s", "+3.00s"]);

        let around = radar::project(&snapshot);
        assert_eq!(around.cars.len(), 2);
        assert!(
            around
                .cars
                .iter()
                .any(|car| car.id == CarId(1) && (car.ahead_m - 10.0).abs() < 1e-9)
        );

        let pedals = pedals::project(&snapshot, Preferences::default());
        assert_eq!(pedals.throttle, Some(0.75));
    }

    /// La foto base con la vuelta del jugador: combustible, distancia y tiempo.
    fn lap_photo(
        at: Duration,
        lap: u32,
        level_l: f64,
        distance_m: f64,
        elapsed_s: f64,
    ) -> Observation {
        let mut obs = observation(at, at, 0.5);
        let car = &mut obs.state.cars[1];
        car.laps = Quality::Reliable(lap);
        car.lap_distance_m = Quality::Reliable(distance_m);
        car.lap_elapsed_s = Quality::Reliable(elapsed_s);
        obs.state.player.as_mut().unwrap().fuel.level_l = Quality::Reliable(level_l);
        obs.state.session.track_length_m = Quality::Reliable(100.0);
        obs
    }

    #[test]
    fn fuel_consumption_is_measured_across_photos_in_the_core() {
        let mut core = Core::new(1);
        core.observe(lap_photo(ms(0), 0, 100.0, 50.0, 0.25))
            .unwrap();
        let reader = core.subscribe();
        let mut adapter = Script::default();
        adapter
            .0
            .push_back(Ok(Some(lap_photo(ms(0), 1, 100.0, 0.0, 0.0))));
        adapter
            .0
            .push_back(Ok(Some(lap_photo(ms(100), 2, 96.0, 10.0, 0.1))));
        core.step(&mut adapter, ms(0)).unwrap();
        core.step(&mut adapter, ms(100)).unwrap();
        let snapshot = reader.latest();
        let player = snapshot.state.player.as_ref().unwrap();
        assert_eq!(player.fuel.per_lap_l, Quality::Estimated(4.0));
        assert_eq!(player.fuel.laps_left, Quality::Estimated(24.0));
    }

    #[test]
    fn delta_backup_is_built_across_photos_in_the_core() {
        let mut core = Core::new(1);
        core.observe(lap_photo(ms(0), 0, 100.0, 100.0, 0.5))
            .unwrap();
        let reader = core.subscribe();
        let mut adapter = Script::default();
        // Vuelta 1: 0,5 s en 100 m; la 2 llega a 50 m en 0,15 s.
        for (at, lap, distance_m, elapsed_s) in [
            (0, 1, 0.0, 0.0),
            (100, 1, 100.0, 0.5),
            (200, 2, 0.0, 0.0),
            (300, 2, 50.0, 0.15),
        ] {
            adapter.0.push_back(Ok(Some(lap_photo(
                ms(at),
                lap,
                100.0,
                distance_m,
                elapsed_s,
            ))));
        }
        for at in [0, 100, 200, 300] {
            core.step(&mut adapter, ms(at)).unwrap();
        }
        let snapshot = reader.latest();
        let delta = snapshot
            .state
            .player
            .as_ref()
            .unwrap()
            .delta_best_s
            .current()
            .copied()
            .unwrap();
        assert!((delta + 0.1).abs() < 1e-9, "delta = {delta}");
    }

    #[test]
    fn confirmed_pause_adds_no_lap_samples_and_does_not_create_a_gap() {
        let mut core = Core::new(1);
        core.observe(lap_photo(ms(0), 1, 100.0, 10.0, 0.1)).unwrap();
        let samples = core.series().active().unwrap().samples.clone();
        for at in (250..=6000).step_by(250) {
            let mut paused = lap_photo(ms(at), 1, 100.0, 10.0, 0.1);
            paused.origin.source_time = Some(ms(0));
            paused.state.source_state = SourceState::Paused;
            core.observe(paused).unwrap();
            let block = core.series().active().unwrap();
            assert_eq!(block.samples, samples);
            assert!(!block.gap);
        }
    }

    #[test]
    fn pause_restores_the_last_live_photo_but_never_inherits_another_session() {
        let mut core = Core::new(1);
        core.observe(observation(ms(0), ms(0), 0.5)).unwrap();
        let live = core.snapshot();
        core.tick(ms(500));
        assert_eq!(core.snapshot().state.source_state, SourceState::Stale);
        let mut paused = observation(ms(600), ms(0), 0.9);
        paused.state.source_state = SourceState::Paused;
        core.observe(paused.clone()).unwrap();
        let mut retained = core.snapshot().state.clone();
        retained.source_state = SourceState::Live;
        assert_eq!(retained, live.state);
        paused.origin.received_at = ms(700);
        paused.state.session.id = vantare_domain::SessionId(2);
        core.observe(paused).unwrap();
        let current = core.snapshot();
        assert_eq!(current.state.session.id, vantare_domain::SessionId(2));
        assert_eq!(
            current.state.player.as_ref().unwrap().telemetry.throttle,
            Quality::Reliable(0.9)
        );
        core.tick(ms(1200));
        assert_eq!(core.snapshot().state.source_state, SourceState::Stale);
    }

    #[test]
    fn unchanged_pedals_with_advancing_source_stay_fresh_beyond_pipe_timeout() {
        let mut demand = vantare_ipc::Demand::default();
        demand.request(vantare_ipc::Signal::Pedals, 5000);
        let mut core = Core::new(1);
        core.set_demand(demand);
        for millis in (0..=6000).step_by(100) {
            core.observe(observation(ms(millis), ms(millis), 0.0))
                .expect("fuente viva, pedales constantes");
            core.tick(ms(millis));
            let photo = core.snapshot();
            assert_eq!(photo.state.source_state, SourceState::Live);
            assert_eq!(
                photo
                    .state
                    .player
                    .as_ref()
                    .expect("jugador")
                    .telemetry
                    .throttle,
                Quality::Reliable(0.0)
            );
        }
        core.tick(ms(6499));
        assert_eq!(core.snapshot().state.source_state, SourceState::Live);
        core.tick(ms(6500));
        assert_eq!(core.snapshot().state.source_state, SourceState::Stale);
        assert_eq!(
            core.snapshot()
                .state
                .player
                .as_ref()
                .expect("jugador")
                .telemetry
                .throttle,
            Quality::Stale(0.0)
        );
    }

    #[test]
    fn silence_and_frozen_clock_go_stale_then_recover_with_one_revision_counter() {
        let mut core = Core::new(1);
        let reader = core.subscribe();
        let mut adapter = Script::default();
        adapter
            .0
            .push_back(Ok(Some(observation(ms(0), ms(0), 0.5))));
        core.step(&mut adapter, ms(0)).unwrap();
        assert_eq!(reader.latest().sequence, 1);

        // Sin nada nuevo: fresco hasta el límite, obsoleto en él, una sola vez.
        core.step(&mut adapter, ms(499)).unwrap();
        assert_eq!(reader.latest().sequence, 1);
        core.step(&mut adapter, ms(500)).unwrap();
        core.step(&mut adapter, ms(900)).unwrap();
        let old = reader.latest();
        assert_eq!(old.sequence, 2);
        assert_eq!(old.state.cars[0].position, Quality::Stale(1));
        assert_eq!(old.state.capabilities.gaps, Capability::WithData);
        assert!(standings::project(&old, Preferences::default()).rows[1].interval == "—");

        // Muestra recibida pero con el reloj de la fuente parado: sigue obsoleta.
        adapter
            .0
            .push_back(Ok(Some(observation(ms(1000), ms(0), 0.5))));
        core.step(&mut adapter, ms(1000)).unwrap();
        let frozen = reader.latest();
        assert_eq!(frozen.sequence, 3);
        assert_eq!(frozen.state.cars[0].position, Quality::Stale(1));
        // El reloj vuelve a avanzar: fresca otra vez, misma época, revisión sigue.
        adapter
            .0
            .push_back(Ok(Some(observation(ms(1100), ms(100), 0.5))));
        core.step(&mut adapter, ms(1100)).unwrap();
        let back = reader.latest();
        assert_eq!((back.epoch, back.sequence), (1, 4));
        assert_eq!(back.state.cars[0].position, Quality::Reliable(1));
    }

    #[test]
    fn disconnect_degrades_at_once_and_rejections_publish_nothing() {
        let mut core = Core::new(1);
        let reader = core.subscribe();
        let mut adapter = Script::default();
        core.step(&mut adapter, ms(0)).unwrap();
        // Antes de cualquier dato, perder la fuente no publica nada.
        adapter.0.push_back(Err(AdapterError::Disconnected));
        assert!(matches!(
            core.step(&mut adapter, ms(10)),
            Err(Error::Adapter(AdapterError::Disconnected))
        ));
        assert_eq!(reader.latest().sequence, 0);

        adapter
            .0
            .push_back(Ok(Some(observation(ms(20), ms(20), 0.5))));
        core.step(&mut adapter, ms(20)).unwrap();
        adapter
            .0
            .push_back(Err(AdapterError::Rejected("versión".into())));
        assert!(matches!(
            core.step(&mut adapter, ms(30)),
            Err(Error::Adapter(AdapterError::Rejected(_)))
        ));
        assert_eq!(
            reader.latest().sequence,
            1,
            "rechazo del adaptador: sin cambios"
        );

        let mut duplicated = observation(ms(40), ms(40), 0.5);
        duplicated.state.cars.push(car(1, 4, 0.0));
        adapter.0.push_back(Ok(Some(duplicated)));
        assert!(matches!(
            core.step(&mut adapter, ms(40)),
            Err(Error::Reject(Reject::DuplicateCar(CarId(1))))
        ));
        assert_eq!(
            reader.latest().sequence,
            1,
            "rechazo del núcleo: sin cambios"
        );

        adapter.0.push_back(Err(AdapterError::Disconnected));
        assert!(core.step(&mut adapter, ms(50)).is_err());
        let old = reader.latest();
        assert_eq!(old.sequence, 2);
        assert_eq!(old.state.cars[0].position, Quality::Stale(1));
    }
    #[test]
    fn demand_skips_derivations_and_a_new_widget_is_hydrated_on_the_next_tick() {
        use vantare_ipc::{Demand, Signal};
        let mut core = Core::new(1);
        core.set_demand(Demand::default());
        core.observe(observation(ms(0), ms(0), 0.5))
            .expect("observación");
        assert_eq!(
            core.snapshot().state.cars[1].gap_ahead,
            Quality::Unavailable
        );
        let mut wanted = Demand::default();
        wanted.request(Signal::Gaps, 250);
        core.set_demand(wanted);
        let mut adapter = Script::default();
        core.step(&mut adapter, ms(10))
            .expect("tick sin adquisición nueva");
        assert_eq!(
            core.snapshot().state.cars[1].gap_ahead,
            Quality::Estimated(Gap::Time { seconds: 2.0 })
        );
        assert_eq!(core.snapshot().sequence, 2);
        core.set_demand(Demand::default());
        core.observe(observation(ms(20), ms(20), 0.5))
            .expect("nuevo layout");
        assert_eq!(
            core.snapshot().state.cars[1].gap_ahead,
            Quality::Unavailable
        );
        assert_eq!(
            core.snapshot()
                .state
                .player
                .expect("jugador")
                .telemetry
                .throttle,
            Quality::Reliable(0.5)
        );
    }

    #[test]
    fn turning_fuel_demand_off_does_not_infer_consumption_across_the_gap() {
        use vantare_ipc::{Demand, Signal};
        let mut core = Core::new(1);
        core.observe(lap_photo(ms(0), 0, 100.0, 50.0, 0.25))
            .expect("inicio");
        core.observe(lap_photo(ms(100), 1, 100.0, 0.0, 0.0))
            .expect("meta");
        core.set_demand(Demand::default());
        core.observe(lap_photo(ms(200), 2, 90.0, 0.0, 0.0))
            .expect("sin demanda");
        let mut wanted = Demand::default();
        wanted.request(Signal::FuelEstimate, 500);
        core.set_demand(wanted);
        core.observe(lap_photo(ms(300), 3, 80.0, 0.0, 0.0))
            .expect("reactivar");
        assert_eq!(
            core.snapshot()
                .state
                .player
                .expect("jugador")
                .fuel
                .per_lap_l,
            Quality::Unavailable
        );
    }
    #[test]
    fn reconnecting_the_same_demand_refreshes_photo_without_fabricating_series_samples() {
        let mut core = Core::new(1);
        core.observe(lap_photo(ms(0), 1, 100.0, 0.0, 0.0))
            .expect("foto");
        let samples = core.series().active().expect("vuelta").samples.len();
        core.set_demand_mask(vantare_ipc::Demand::all().mask());
        core.step(&mut Script::default(), ms(10))
            .expect("siguiente tick");
        assert_eq!(core.snapshot().sequence, 2);
        assert_eq!(
            core.series().active().expect("vuelta").samples.len(),
            samples
        );
    }
}
