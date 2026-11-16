//! Escena pura del aviso de vuelta rápida: textos y opacidad, sin colores ni
//! ventana. El instante entra como dato; nada aquí tiene reloj propio.
use std::sync::Arc;
use vantare_domain::{
    Snapshot,
    fastest_lap::{self, Kind, Records, Timing, Update, ViewModel},
    format::{self, Language, Preferences},
    widget_session::Session,
};

/// Entrada y salida del aviso, como el renderer productivo (220 ms).
const TRANSITION: f64 = 0.220;
/// Vida del aviso: los ajustes se recortan a este intervalo (3–15 s).
const MIN_LIFETIME: f64 = 3.0;
const MAX_LIFETIME: f64 = 15.0;

/// Elementos visibles del aviso. `opacity` solo se aplica a lo que GPUI
/// desvanece: los chips de sector y el texto mono (`caption`, `lap`) no cambian
/// con ella (rareza de GPUI, #2365).
#[derive(Clone, Debug, PartialEq)]
pub struct Scene {
    pub kind: Kind,
    pub opacity: f32,
    pub title: &'static str,
    pub class: Option<Arc<str>>,
    pub time: Arc<str>,
    pub driver: Option<Arc<str>>,
    pub caption: &'static str,
    pub improvement: Arc<str>,
    pub lap: Arc<str>,
    pub sectors: [Option<bool>; 3],
}

#[derive(Clone, Debug, PartialEq)]
struct Detail {
    timing: Timing,
    subtitle: Arc<str>,
    time: Arc<str>,
    lap: Arc<str>,
    sectors: [Option<bool>; 3],
    session: Option<Session>,
}

struct Notice {
    kind: Kind,
    timing: Timing,
    started: f64,
    /// Textos de reserva cuando el detalle del aviso ya no coincide.
    time: Arc<str>,
    driver: Arc<str>,
    lap: Arc<str>,
}

/// Estado del aviso y de la mejora observada, muestreado en un instante dado.
/// La proyección entra como `Arc`: si es el mismo objeto y los ajustes no
/// cambian, no se formatea nada.
pub struct Motion {
    records: Records,
    vm: Arc<ViewModel>,
    prefs: Preferences,
    details: Vec<Detail>,
    class_improvement: Option<f64>,
    personal_improvement: Option<f64>,
    class_label: Arc<str>,
    personal_label: Arc<str>,
    /// Chip de clase preparado para el muestreo; se renueva al cambiar de clase.
    class_chip: Option<Arc<str>>,
    notice: Option<Notice>,
    lifetime: f64,
    reduced: bool,
}

impl Motion {
    pub fn new(lifetime: f64, reduced: bool) -> Self {
        Self {
            records: Records::default(),
            vm: Arc::new(fastest_lap::project(
                &Snapshot::default(),
                Preferences::default(),
            )),
            prefs: Preferences::default(),
            details: Vec::new(),
            class_improvement: None,
            personal_improvement: None,
            class_label: Arc::from("—"),
            personal_label: Arc::from("—"),
            class_chip: None,
            notice: None,
            lifetime: lifetime.clamp(MIN_LIFETIME, MAX_LIFETIME),
            reduced,
        }
    }

    /// Proyecta la foto fuera; aquí solo se decide el aviso y lo que se ve.
    /// `vm` debe venir de la misma foto. Devuelve si hay algo que volver a
    /// mirar (el muestreo y la pintura deciden si cambia algún píxel).
    pub fn update(
        &mut self,
        snapshot: &Snapshot,
        vm: &Arc<ViewModel>,
        prefs: Preferences,
        show_class: bool,
        show_personal: bool,
        clock: f64,
    ) -> bool {
        // Misma proyección y mismos ajustes: nada que rehacer.
        if self.prefs == prefs && Arc::ptr_eq(&self.vm, vm) {
            return false;
        }
        self.prefs = prefs;
        let next = Arc::clone(vm);
        let before = (self.class_improvement, self.personal_improvement);
        if self.vm.scope != next.scope {
            self.class_improvement = None;
            self.personal_improvement = None;
        }
        if let Some((old, new)) = self
            .vm
            .candidate
            .as_ref()
            .and_then(|t| t.best_ms)
            .zip(next.candidate.as_ref().and_then(|t| t.best_ms))
            && new < old
        {
            self.class_improvement = Some((new as f64 - old as f64) / 1000.0);
        }
        if let Some((old, new)) = self
            .vm
            .personal
            .as_ref()
            .and_then(|t| t.best_ms)
            .zip(next.personal.as_ref().and_then(|t| t.best_ms))
            && new < old
        {
            self.personal_improvement = Some((new as f64 - old as f64) / 1000.0);
        }
        if before.0 != self.class_improvement {
            self.class_label = label(self.class_improvement);
        }
        if before.1 != self.personal_improvement {
            self.personal_label = label(self.personal_improvement);
        }
        let class_changed = self.vm.active_class != next.active_class;
        if class_changed {
            self.class_chip = next.active_class.as_deref().map(Arc::from);
        }
        let labels_changed = class_changed
            || self.vm.class_label != next.class_label
            || self.vm.personal_label != next.personal_label;
        let update = self
            .records
            .accept_visible(next.as_ref().clone(), show_class, show_personal);
        self.vm = next;
        let changed = match update {
            Update::Unchanged => self.notice.is_some() && labels_changed,
            Update::Clear => self.notice.take().is_some(),
            Update::Notice(kind, timing) => {
                let es = prefs.language == Language::Es;
                let time = Arc::from(timing.text());
                let driver = Arc::from(timing.driver.as_str());
                let lap = Arc::from(lap_text(timing.laps, es));
                self.notice = Some(Notice {
                    kind,
                    timing,
                    started: clock,
                    time,
                    driver,
                    lap,
                });
                true
            }
        };
        // Los textos solo hacen falta mientras hay aviso.
        if self.notice.is_some() {
            self.details = details(snapshot, self.vm.as_ref(), prefs);
        } else {
            self.details.clear();
        }
        changed
    }

    /// Caducidad del aviso; se llama antes de muestrear, como en Relative.
    /// Con movimiento reducido no hay reloj de animación, pero sí un único
    /// despertar para retirar el aviso al final de su vida.
    pub fn advance(&mut self, clock: f64) {
        if self
            .notice
            .as_ref()
            .is_some_and(|notice| clock >= notice.started + self.lifetime)
        {
            self.notice = None;
        }
    }

    /// Cambios de política: movimiento reducido y duración del aviso.
    pub fn policy(&mut self, reduced: bool, lifetime: f64) -> bool {
        let lifetime = lifetime.clamp(MIN_LIFETIME, MAX_LIFETIME);
        let changed = self.reduced != reduced || self.lifetime != lifetime;
        self.reduced = reduced;
        self.lifetime = lifetime;
        changed
    }

    /// Siguiente instante que necesita imagen, o `None` en reposo. Con
    /// movimiento reducido el aviso queda fijo y pide un solo despertar al
    /// final de su vida; con movimiento, pide imágenes en las transiciones.
    pub fn next_wake(&self, clock: f64) -> Option<f64> {
        let notice = self.notice.as_ref()?;
        let end = notice.started + self.lifetime;
        if clock >= end {
            return None;
        }
        if self.reduced {
            return Some(end);
        }
        let exit = end - TRANSITION;
        if clock < notice.started + TRANSITION || clock >= exit {
            Some(clock)
        } else {
            Some(exit)
        }
    }
}

/// Muestreo puro: sin aviso no hay nada que pintar.
pub fn sample(motion: &Motion, prefs: Preferences, clock: f64) -> Option<Scene> {
    let notice = motion.notice.as_ref()?;
    let age = clock - notice.started;
    if age >= motion.lifetime {
        return None;
    }
    let detail = motion
        .details
        .iter()
        .find(|detail| detail.timing == notice.timing);
    let opacity = if motion.reduced {
        1.0
    } else {
        fade(age, motion.lifetime)
    };
    let es = prefs.language == Language::Es;
    let time = detail.map_or_else(
        || Arc::clone(&notice.time),
        |detail| Arc::clone(&detail.time),
    );
    let driver = motion.vm.show_driver.then(|| {
        detail.map_or_else(
            || Arc::clone(&notice.driver),
            |detail| Arc::clone(&detail.subtitle),
        )
    });
    let lap = detail.map_or_else(|| Arc::clone(&notice.lap), |detail| Arc::clone(&detail.lap));
    Some(Scene {
        kind: notice.kind,
        opacity,
        title: title(notice.kind, detail.and_then(|detail| detail.session), es),
        class: motion.class_chip.clone(),
        time,
        driver,
        caption: if es { "vs anterior" } else { "vs previous" },
        improvement: if notice.kind == Kind::Personal {
            Arc::clone(&motion.personal_label)
        } else {
            Arc::clone(&motion.class_label)
        },
        lap,
        sectors: detail.map_or([None; 3], |detail| detail.sectors),
    })
}

fn label(value: Option<f64>) -> Arc<str> {
    Arc::from(value.map_or_else(|| "—".to_owned(), |value| format!("{value:.3}")))
}

fn lap_text(laps: Option<u32>, es: bool) -> String {
    laps.map_or_else(
        || "—".to_owned(),
        |laps| format!("{} {laps}", if es { "V" } else { "L" }),
    )
}

fn title(kind: Kind, session: Option<Session>, es: bool) -> &'static str {
    if kind == Kind::Personal {
        return if es {
            "TU MEJOR VUELTA"
        } else {
            "PERSONAL BEST"
        };
    }
    match (session, es) {
        (Some(Session::Qualifying), true) => "POLE PROVISIONAL",
        (Some(Session::Qualifying), false) => "PROVISIONAL POLE",
        (Some(Session::Practice), true) => "MEJOR DE LA PRÁCTICA",
        (Some(Session::Practice), false) => "PRACTICE BEST",
        (_, true) => "VUELTA RÁPIDA",
        (_, false) => "FASTEST LAP",
    }
}

/// Textos y sectores del aviso, preparados como en el renderer productivo.
fn details(snapshot: &Snapshot, vm: &ViewModel, prefs: Preferences) -> Vec<Detail> {
    snapshot
        .state
        .cars
        .iter()
        .filter(|car| {
            vm.candidate
                .as_ref()
                .is_some_and(|timing| timing.car == car.id)
                || vm
                    .personal
                    .as_ref()
                    .is_some_and(|timing| timing.car == car.id)
        })
        .map(|car| {
            let timing = vm
                .candidate
                .as_ref()
                .filter(|timing| timing.car == car.id)
                .or_else(|| vm.personal.as_ref().filter(|timing| timing.car == car.id))
                .expect("el filtro anterior exige un aviso de este coche");
            let session = Session::of(&snapshot.state.session.kind);
            let clock = if session == Some(Session::Qualifying) {
                format::clock(snapshot.state.session.remaining_s.current().copied())
            } else {
                String::new()
            };
            let lap = if !clock.is_empty() && clock != "—" {
                clock
            } else {
                lap_text(timing.laps, prefs.language == Language::Es)
            };
            Detail {
                timing: timing.clone(),
                subtitle: Arc::from(format!(
                    "{} · {} #{}",
                    timing.driver,
                    car.vehicle.as_str(),
                    car.number
                )),
                time: Arc::from(timing.text()),
                lap: Arc::from(lap),
                sectors: std::array::from_fn(|i| {
                    let value = car
                        .last_sectors_s
                        .get(i)?
                        .current()
                        .filter(|v| v.is_finite() && **v > 0.0)?;
                    if car.last_lap_s.current() != car.best_lap_s.current() {
                        return None;
                    }
                    snapshot
                        .state
                        .cars
                        .iter()
                        .filter(|c| c.class == car.class)
                        .filter_map(|c| c.best_sectors_s.get(i)?.current())
                        .filter(|v| v.is_finite() && **v > 0.0)
                        .min_by(|a, b| a.total_cmp(b))
                        .map(|best| value <= best)
                }),
                session,
            }
        })
        .collect()
}

fn fade(age: f64, lifetime: f64) -> f32 {
    let exit = lifetime - TRANSITION;
    if age < TRANSITION {
        ease_out((age / TRANSITION) as f32)
    } else if age >= exit {
        ease_out(1.0 - ((age - exit) / TRANSITION) as f32)
    } else {
        1.0
    }
}

/// CSS cubic-bezier(0, 0, .58, 1), la misma curva que usa GPUI.
fn ease_out(x: f32) -> f32 {
    if x <= 0.0 {
        return 0.0;
    }
    if x >= 1.0 {
        return 1.0;
    }
    let (mut lo, mut hi) = (0.0, 1.0);
    for _ in 0..30 {
        let t = f32::midpoint(lo, hi);
        let curve_x = 1.74 * (1.0 - t) * t * t + t * t * t;
        if curve_x < x {
            lo = t;
        } else {
            hi = t;
        }
    }
    let t = f32::midpoint(lo, hi);
    t * t * (3.0 - 2.0 * t)
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::{
        Capability, Car, CarId, Class, ClassId, Driver, Player, Quality, SessionKind, SourceState,
    };

    fn car(id: u32, name: &str, class: u32, class_name: &str, best: f64) -> Car {
        Car {
            id: CarId(id),
            number: id.to_string(),
            vehicle: "Car".into(),
            driver: Driver {
                name: name.into(),
                ..Driver::default()
            },
            class: Some(Class {
                id: ClassId(class),
                name: class_name.into(),
            }),
            laps: Quality::Reliable(4),
            last_lap_s: Quality::Reliable(best),
            best_lap_s: Quality::Reliable(best),
            ..Car::default()
        }
    }

    /// Foto con el jugador y un rival en GT3; el tercer coche es de otra clase.
    fn photo(sequence: u64, best: f64) -> Snapshot {
        let mut snapshot = Snapshot {
            sequence,
            ..Snapshot::default()
        };
        snapshot.state.source_state = SourceState::Live;
        snapshot.state.capabilities.lap_times = Capability::Fresh;
        snapshot.state.player = Some(Player {
            car: CarId(1),
            ..Player::default()
        });
        snapshot.state.cars = vec![
            car(1, "Player", 1, "GT3", best),
            car(2, "Rival", 1, "GT3", 91.0),
            car(3, "Other", 2, "HYPERCAR", 80.0),
        ];
        snapshot
    }

    fn projected(snapshot: &Snapshot, prefs: Preferences) -> Arc<ViewModel> {
        Arc::new(fastest_lap::project(snapshot, prefs))
    }

    fn update(motion: &mut Motion, snapshot: &Snapshot, prefs: Preferences, clock: f64) -> bool {
        let vm = projected(snapshot, prefs);
        motion.update(snapshot, &vm, prefs, true, true, clock)
    }

    /// Referencia silenciosa a las 0 s y aviso a la 1 s.
    fn armed(snapshot: &Snapshot, prefs: Preferences) -> Motion {
        let mut base = snapshot.clone();
        base.sequence = snapshot.sequence.saturating_sub(1);
        if let Quality::Reliable(best) = base.state.cars[0].best_lap_s {
            base.state.cars[0].best_lap_s = Quality::Reliable(best + 1.0);
        }
        let mut motion = Motion::new(6.0, false);
        assert!(!update(&mut motion, &base, prefs, 0.0));
        assert!(update(&mut motion, snapshot, prefs, 1.0));
        motion
    }

    #[test]
    fn the_first_photo_is_silent_and_leaves_no_clock() {
        let prefs = Preferences::default();
        let mut motion = Motion::new(6.0, false);
        let photo = photo(1, 90.0);
        assert!(!update(&mut motion, &photo, prefs, 0.0));
        assert!(sample(&motion, prefs, 0.0).is_none());
        assert_eq!(motion.next_wake(0.0), None);
    }

    #[test]
    fn the_notice_fades_in_lives_and_ends_on_the_injected_clock() {
        let prefs = Preferences::default();
        let motion = armed(&photo(2, 89.94), prefs);
        let start = sample(&motion, prefs, 1.0).expect("aviso");
        assert_eq!(start.kind, Kind::Class);
        assert_eq!(start.opacity, 0.0);
        assert_eq!(&*start.time, "1:29.940");
        assert_eq!(start.driver.as_deref(), Some("Player · Car #1"));
        assert_eq!(start.title, "VUELTA RÁPIDA");
        assert_eq!(&*start.lap, "V 4");
        assert_eq!(start.sectors, [None; 3]);
        let entering = sample(&motion, prefs, 1.11).expect("fundido de entrada");
        assert!(entering.opacity > 0.0 && entering.opacity < 1.0);
        assert_eq!(sample(&motion, prefs, 1.3).expect("quieto").opacity, 1.0);
        assert_eq!(sample(&motion, prefs, 6.5).expect("quieto").opacity, 1.0);
        let exiting = sample(&motion, prefs, 6.9).expect("fundido de salida");
        assert!(exiting.opacity > 0.0 && exiting.opacity < 1.0);
        assert_eq!(motion.next_wake(1.0), Some(1.0));
        assert_eq!(motion.next_wake(2.0), Some(6.78));
        assert_eq!(motion.next_wake(6.9), Some(6.9));
        assert_eq!(motion.next_wake(7.0), None);
        assert!(sample(&motion, prefs, 7.0).is_none());
    }

    #[test]
    fn personal_falls_back_when_class_is_hidden_and_nothing_when_both_are_hidden() {
        let prefs = Preferences::default();
        let improved = photo(2, 89.94);
        let base = photo(1, 90.0);
        let mut motion = Motion::new(6.0, false);
        let vm = projected(&base, prefs);
        assert!(!motion.update(&base, &vm, prefs, true, true, 0.0));
        let vm = projected(&improved, prefs);
        assert!(!motion.update(&improved, &vm, prefs, false, false, 1.0));
        assert!(sample(&motion, prefs, 1.3).is_none());
        let mut personal = Motion::new(6.0, false);
        let base_vm = projected(&base, prefs);
        assert!(!personal.update(&base, &base_vm, prefs, true, true, 0.0));
        let improved_vm = projected(&improved, prefs);
        assert!(personal.update(&improved, &improved_vm, prefs, false, true, 1.0));
        let scene = sample(&personal, prefs, 1.3).expect("aviso personal");
        assert_eq!(scene.kind, Kind::Personal);
        assert_eq!(scene.title, "TU MEJOR VUELTA");
    }

    #[test]
    fn the_same_projection_does_no_work() {
        let prefs = Preferences::default();
        let mut motion = armed(&photo(2, 89.94), prefs);
        let photo = photo(2, 89.94);
        let vm = projected(&photo, prefs);
        assert!(
            !motion.update(&photo, &vm, prefs, true, true, 2.0),
            "misma proyección y sin etiquetas nuevas: nada que rehacer"
        );
        assert!(!motion.update(&photo, &vm, prefs, true, true, 2.5));
        assert!(!motion.update(&photo, &vm, prefs, true, true, 3.0));
    }

    #[test]
    fn title_and_lap_follow_the_session_and_the_language() {
        let prefs = Preferences::default();
        let mut qualifying = photo(2, 89.94);
        qualifying.state.session.kind = Quality::Reliable(SessionKind::Qualifying);
        qualifying.state.session.remaining_s = Quality::Reliable(522.0);
        let scene = sample(&armed(&qualifying, prefs), prefs, 1.3).expect("aviso");
        assert_eq!(scene.title, "POLE PROVISIONAL");
        assert_eq!(&*scene.lap, "08:42");
        let english = Preferences {
            language: Language::En,
            ..prefs
        };
        let scene = sample(&armed(&qualifying, english), english, 1.3).expect("aviso");
        assert_eq!(scene.title, "PROVISIONAL POLE");
        assert_eq!(scene.caption, "vs previous");
        let mut practice = photo(2, 89.94);
        practice.state.session.kind = Quality::Reliable(SessionKind::Practice);
        let scene = sample(&armed(&practice, prefs), prefs, 1.3).expect("aviso");
        assert_eq!(scene.title, "MEJOR DE LA PRÁCTICA");
    }

    #[test]
    fn sector_chips_need_the_best_lap_and_a_class_reference() {
        let prefs = Preferences::default();
        let mut improved = photo(2, 89.94);
        improved.state.cars[0].last_sectors_s = vec![
            Quality::Reliable(30.0),
            Quality::Reliable(31.0),
            Quality::Reliable(32.0),
        ];
        improved.state.cars[0].best_sectors_s = vec![
            Quality::Reliable(30.0),
            Quality::Reliable(31.0),
            Quality::Reliable(32.0),
        ];
        improved.state.cars[1].best_sectors_s = vec![
            Quality::Reliable(29.0),
            Quality::Reliable(40.0),
            Quality::Reliable(40.0),
        ];
        let scene = sample(&armed(&improved, prefs), prefs, 1.3).expect("aviso");
        assert_eq!(
            scene.sectors,
            [Some(false), Some(true), Some(true)],
            "morado solo al igualar el mejor de la clase"
        );
        let mut slower = photo(2, 89.94);
        slower.state.cars[0].last_lap_s = Quality::Reliable(90.0);
        slower.state.cars[0].last_sectors_s = improved.state.cars[0].last_sectors_s.clone();
        let scene = sample(&armed(&slower, prefs), prefs, 1.3).expect("aviso");
        assert_eq!(
            scene.sectors, [None; 3],
            "sin vuelta rápida no se afirma nada"
        );
    }

    #[test]
    fn a_retained_notice_drops_its_texts_when_the_lap_changes() {
        let prefs = Preferences::default();
        let mut motion = armed(&photo(2, 89.94), prefs);
        let mut third = photo(3, 89.0);
        third.state.cars[0].last_sectors_s = vec![
            Quality::Reliable(29.0),
            Quality::Reliable(30.0),
            Quality::Reliable(31.0),
        ];
        let vm = projected(&third, prefs);
        assert!(
            !motion.update(&third, &vm, prefs, false, false, 2.0),
            "la señal no pide repintar; el detalle nuevo se ve al muestrear"
        );
        let scene = sample(&motion, prefs, 2.3).expect("aviso retenido");
        assert_eq!(&*scene.time, "1:29.940");
        assert_eq!(scene.driver.as_deref(), Some("Player"));
        assert_eq!(&*scene.lap, "V 4");
        assert_eq!(scene.sectors, [None; 3]);
        assert_eq!(scene.title, "VUELTA RÁPIDA");
    }

    #[test]
    fn reduced_motion_keeps_the_final_state_and_one_expiry_wake() {
        let prefs = Preferences::default();
        let mut motion = armed(&photo(2, 89.94), prefs);
        assert!(motion.policy(true, 6.0));
        for at in [1.11, 3.0, 6.99] {
            let scene = sample(&motion, prefs, at).expect("aviso fijo");
            assert_eq!(scene.opacity, 1.0, "no se desliza ni late");
            assert_eq!(motion.next_wake(at), Some(7.0), "un solo despertar");
        }
        assert!(sample(&motion, prefs, 7.0).is_none());
        assert_eq!(motion.next_wake(7.0), None);
        motion.advance(7.0);
        assert!(sample(&motion, prefs, 7.0).is_none());
        assert_eq!(motion.next_wake(7.0), None);
        assert!(motion.policy(false, 6.0));
    }

    #[test]
    fn the_lifetime_is_kept_between_three_and_fifteen_seconds() {
        let prefs = Preferences::default();
        let mut short = armed(&photo(2, 89.94), prefs);
        assert!(short.policy(false, 1.0));
        assert!(sample(&short, prefs, 3.9).is_some());
        assert!(sample(&short, prefs, 4.0).is_none());
        let mut long = armed(&photo(2, 89.94), prefs);
        assert!(long.policy(false, 99.0));
        assert!(sample(&long, prefs, 15.9).is_some());
        assert!(sample(&long, prefs, 16.0).is_none());
    }

    #[test]
    fn a_paused_source_clears_the_notice_without_animating() {
        let prefs = Preferences::default();
        let mut motion = armed(&photo(2, 89.94), prefs);
        let mut paused = photo(3, 89.0);
        paused.state.source_state = SourceState::Paused;
        let vm = projected(&paused, prefs);
        assert!(motion.update(&paused, &vm, prefs, true, true, 2.0));
        assert!(sample(&motion, prefs, 2.0).is_none());
        assert_eq!(motion.next_wake(2.0), None);
    }

    #[test]
    fn the_driver_line_follows_the_visible_setting() {
        let prefs = Preferences::default();
        let base = photo(1, 90.0);
        let improved = photo(2, 89.94);
        let mut motion = Motion::new(6.0, false);
        let vm = projected(&base, prefs);
        assert!(!motion.update(&base, &vm, prefs, true, true, 0.0));
        let mut vm = fastest_lap::project(&improved, prefs);
        vm.show_driver = false;
        let vm = Arc::new(vm);
        assert!(motion.update(&improved, &vm, prefs, true, true, 1.0));
        assert!(sample(&motion, prefs, 1.3).expect("aviso").driver.is_none());
    }
}
