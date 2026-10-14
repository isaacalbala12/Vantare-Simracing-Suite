//! Vueltas rápidas: clasificación de la clase del jugador y mejoras observadas.
//! La primera foto establece una referencia silenciosa, nunca anuncia un récord antiguo.

use crate::{
    Car, CarId, ClassId, Quality, SessionId, Snapshot,
    format::{self, Language, Preferences},
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Timing {
    pub car: CarId,
    pub driver: String,
    pub best_ms: Option<u64>,
    pub last_ms: Option<u64>,
    pub laps: Option<u32>,
}

impl Timing {
    pub fn text(&self) -> String {
        // Los milisegundos ya están redondeados como en el ViewModel productivo.
        #[allow(clippy::cast_precision_loss)]
        format::lap_time(self.best_ms.map(|ms| ms as f64 / 1000.0))
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ViewModel {
    pub show_driver: bool,
    pub scope: (u64, SessionId, Option<CarId>, String, Option<ClassId>),
    pub sequence: u64,
    pub ready: bool,
    pub rows: Vec<Timing>,
    pub candidate: Option<Timing>,
    pub personal: Option<Timing>,
    pub active_class: Option<String>,
    pub class_label: String,
    pub personal_label: String,
}

fn milliseconds(value: Quality<f64>) -> Option<u64> {
    // Un récord estimado u obsoleto no es una vuelta medida y fresca.
    let Quality::Reliable(seconds) = value else {
        return None;
    };
    let ms = (seconds * 1000.0).round();
    if !(1.0..=9_007_199_254_740_991.0).contains(&ms) {
        return None;
    }
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    Some(ms as u64)
}

fn timing(car: &Car) -> Timing {
    Timing {
        car: car.id,
        driver: car.driver.name.clone(),
        best_ms: milliseconds(car.best_lap_s),
        last_ms: milliseconds(car.last_lap_s),
        laps: car.laps.current().copied(),
    }
}

fn class_name(car: &Car) -> Option<String> {
    car.class
        .as_ref()
        .map(|class| class.name.trim().to_uppercase())
        .filter(|name| !name.is_empty())
}

pub fn project(snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    let player = snapshot.state.player_car();
    let class_id = player
        .and_then(|car| car.class.as_ref())
        .map(|class| class.id);
    let active_class = player.and_then(class_name);
    let rows: Vec<_> = snapshot
        .state
        .cars
        .iter()
        .filter(|car| class_id.is_some() && car.class.as_ref().map(|class| class.id) == class_id)
        .map(timing)
        .collect();
    let candidate = rows
        .iter()
        .filter(|row| row.best_ms.is_some())
        .min_by_key(|row| row.best_ms)
        .cloned();
    ViewModel {
        show_driver: true,
        scope: (
            snapshot.epoch,
            snapshot.state.session.id,
            player.map(|car| car.id),
            player
                .map(|car| car.driver.name.clone())
                .unwrap_or_default(),
            class_id,
        ),
        sequence: snapshot.sequence,
        // Supported sin tiempos permite observar el contador antes de la primera vuelta.
        ready: snapshot.state.source_state == crate::SourceState::Live
            && player.is_some()
            && matches!(
                snapshot.state.capabilities.lap_times,
                crate::Capability::Supported | crate::Capability::Fresh
            ),
        rows,
        candidate,
        personal: player.map(timing),
        active_class,
        class_label: match prefs.language {
            Language::Es => "VUELTA RÁPIDA",
            Language::En => "FASTEST LAP",
        }
        .into(),
        personal_label: match prefs.language {
            Language::Es => "MEJOR PERSONAL",
            Language::En => "PERSONAL BEST",
        }
        .into(),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Class,
    Personal,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Update {
    Unchanged,
    Clear,
    Notice(Kind, Timing),
}

#[derive(Default)]
pub struct Records {
    previous: Option<ViewModel>,
    class_ms: Option<u64>,
    personal_ms: Option<u64>,
}

fn improves(current: Option<&Timing>, record: Option<u64>) -> bool {
    current
        .and_then(|row| row.best_ms)
        .is_some_and(|ms| record.is_none_or(|prior| ms < prior))
}

fn observed(current: &Timing, prior: Option<&Timing>) -> bool {
    let Some(prior) =
        prior.filter(|prior| prior.car == current.car && prior.driver == current.driver)
    else {
        return false;
    };
    let Some(best) = current.best_ms else {
        return false;
    };
    prior.best_ms.map_or_else(
        || {
            prior
                .laps
                .zip(current.laps)
                .is_some_and(|(before, after)| after > before)
                && current.last_ms == Some(best)
        },
        |before| best < before,
    )
}

impl Records {
    pub fn accept(&mut self, vm: ViewModel) -> Update {
        self.accept_visible(vm, true, true)
    }
    pub fn accept_visible(
        &mut self,
        vm: ViewModel,
        show_class: bool,
        show_personal: bool,
    ) -> Update {
        if !vm.ready {
            *self = Self::default();
            return Update::Clear;
        }
        let Some(previous) = self
            .previous
            .as_ref()
            .filter(|previous| previous.scope == vm.scope)
        else {
            self.class_ms = vm.candidate.as_ref().and_then(|row| row.best_ms);
            self.personal_ms = vm.personal.as_ref().and_then(|row| row.best_ms);
            self.previous = Some(vm);
            return Update::Clear;
        };
        if vm.sequence <= previous.sequence {
            return Update::Unchanged;
        }
        let class_improved = improves(vm.candidate.as_ref(), self.class_ms);
        let personal_improved = improves(vm.personal.as_ref(), self.personal_ms);
        let notice = vm
            .candidate
            .as_ref()
            .filter(|row| {
                show_class
                    && class_improved
                    && observed(row, previous.rows.iter().find(|prior| prior.car == row.car))
            })
            .map(|row| (Kind::Class, row.clone()))
            .or_else(|| {
                vm.personal
                    .as_ref()
                    .filter(|row| {
                        show_personal
                            && personal_improved
                            && observed(row, previous.personal.as_ref())
                    })
                    .map(|row| (Kind::Personal, row.clone()))
            });
        if class_improved {
            self.class_ms = vm.candidate.as_ref().and_then(|row| row.best_ms);
        }
        if personal_improved {
            self.personal_ms = vm.personal.as_ref().and_then(|row| row.best_ms);
        }
        self.previous = Some(vm);
        notice.map_or(Update::Unchanged, |(kind, row)| Update::Notice(kind, row))
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn notification_choices_keep_records_and_allow_personal_after_disabled_class() {
        for (class, personal, kind) in [
            (true, true, Some(Kind::Class)),
            (false, true, Some(Kind::Personal)),
            (true, false, Some(Kind::Class)),
            (false, false, None),
        ] {
            let mut records = Records::default();
            records.accept_visible(vm(1, 90.0), class, personal);
            let mut next = scene(2, 89.0);
            next.state.cars[0].laps = Quality::Reliable(5);
            let update =
                records.accept_visible(project(&next, Preferences::default()), class, personal);
            match kind {
                Some(kind) => {
                    assert!(matches!(update, Update::Notice(actual, _) if actual == kind));
                }
                None => assert_eq!(update, Update::Unchanged),
            }
        }
    }

    use super::*;
    use crate::{Capability, Class, Driver, Player};

    fn scene(sequence: u64, best: f64) -> Snapshot {
        let mut snapshot = Snapshot {
            sequence,
            ..Snapshot::default()
        };
        snapshot.state.source_state = crate::SourceState::Live;
        snapshot.state.capabilities.lap_times = Capability::Fresh;
        snapshot.state.player = Some(Player {
            car: CarId(1),
            ..Player::default()
        });
        snapshot.state.cars = [(1, " GT3 ", best), (2, "gt3", 91.0), (3, "HYPERCAR", 80.0)]
            .into_iter()
            .map(|(id, name, seconds)| Car {
                id: CarId(id),
                driver: Driver {
                    name: format!("Driver {id}"),
                    ..Driver::default()
                },
                class: Some(Class {
                    id: ClassId(if id == 3 { 2 } else { 1 }),
                    name: name.into(),
                }),
                best_lap_s: Quality::Reliable(seconds),
                last_lap_s: Quality::Reliable(seconds),
                laps: Quality::Reliable(4),
                ..Car::default()
            })
            .collect();
        snapshot
    }

    fn vm(sequence: u64, best: f64) -> ViewModel {
        project(&scene(sequence, best), Preferences::default())
    }

    #[test]
    fn timing_quality_and_rounding() {
        for (quality, expected) in [
            (Quality::Reliable(90.904), Some(90904)),
            (Quality::Reliable(89.9999), Some(90000)),
            (Quality::Reliable(0.0), None),
            (Quality::Reliable(-1.0), None),
            (Quality::Reliable(f64::NAN), None),
            (Quality::Reliable(f64::INFINITY), None),
            (Quality::Reliable(1e20), None),
            (Quality::Reliable(0.0001), None),
            (Quality::Stale(90.0), None),
            (Quality::Estimated(90.0), None),
            (Quality::Unavailable, None),
        ] {
            assert_eq!(milliseconds(quality), expected);
        }
        assert_eq!(vm(1, 90.904).personal.expect("player").text(), "1:30.904");
        let mut missing = vm(1, 90.0).personal.expect("player");
        missing.best_ms = None;
        assert_eq!(missing.text(), format::PLACEHOLDER);
    }

    #[test]
    fn scope_is_player_class_never_overall() {
        assert_eq!(vm(1, 90.0).candidate.expect("class record").car, CarId(1));
        let mut snapshot = scene(1, 90.0);
        snapshot.state.cars[0].class = None;
        let projected = project(&snapshot, Preferences::default());
        assert!(projected.ready && projected.candidate.is_none() && projected.personal.is_some());
        snapshot.state.player = None;
        let missing = project(&snapshot, Preferences::default());
        assert!(!missing.ready && missing.candidate.is_none() && missing.personal.is_none());
        assert!(!project(&Snapshot::default(), Preferences::default()).ready);
    }

    #[test]
    fn class_identity_is_not_its_display_name() {
        let mut snapshot = scene(1, 90.0);
        snapshot.state.cars[2].class.as_mut().expect("class").name = "GT3".into();
        let before = project(&snapshot, Preferences::default());
        assert_eq!(before.rows.len(), 2);
        let mut records = Records::default();
        records.accept(before);
        snapshot.sequence = 2;
        snapshot.state.cars[0].class.as_mut().expect("class").id = ClassId(2);
        assert_eq!(
            records.accept(project(&snapshot, Preferences::default())),
            Update::Clear
        );
    }

    #[test]
    fn supported_without_times_can_baseline_the_first_lap() {
        let mut snapshot = scene(1, 90.0);
        snapshot.state.capabilities.lap_times = crate::Capability::Supported;
        for car in &mut snapshot.state.cars {
            car.best_lap_s = Quality::Unavailable;
            car.last_lap_s = Quality::Unavailable;
            car.laps = Quality::Reliable(0);
        }
        let mut records = Records::default();
        assert_eq!(
            records.accept(project(&snapshot, Preferences::default())),
            Update::Clear
        );
        assert!(matches!(
            records.accept(vm(2, 90.0)),
            Update::Notice(Kind::Class, _)
        ));
        for capability in [crate::Capability::Unsupported, crate::Capability::WithData] {
            snapshot.state.capabilities.lap_times = capability;
            assert!(!project(&snapshot, Preferences::default()).ready);
        }
    }

    #[test]
    fn baseline_then_personal_and_class_priority() {
        let mut records = Records::default();
        assert_eq!(records.accept(vm(1, 92.0)), Update::Clear);
        for (sequence, best, kind) in [(2, 91.5, Kind::Personal), (3, 90.5, Kind::Class)] {
            assert!(
                matches!(records.accept(vm(sequence, best)), Update::Notice(k, _) if k == kind)
            );
        }
        for (sequence, best) in [(3, 80.0), (2, 79.0), (4, 90.4999)] {
            assert_eq!(records.accept(vm(sequence, best)), Update::Unchanged);
        }
    }

    #[test]
    fn joins_and_disappearing_record_holder_do_not_fake_records() {
        let mut records = Records::default();
        records.accept(vm(1, 92.0));
        let mut joined = vm(2, 92.0);
        let mut newcomer = joined.rows[0].clone();
        newcomer.car = CarId(99);
        newcomer.best_ms = Some(88000);
        joined.rows.push(newcomer.clone());
        joined.candidate = Some(newcomer);
        assert_eq!(records.accept(joined), Update::Unchanged);
        assert!(matches!(
            records.accept(vm(3, 89.0)),
            Update::Notice(Kind::Personal, _)
        ));
    }

    #[test]
    fn first_lap_requires_both_count_and_last_time() {
        for (laps, last, announces) in [(4, 90000, true), (0, 90000, false), (4, 91000, false)] {
            let mut records = Records::default();
            let mut baseline = vm(1, 90.0);
            for row in &mut baseline.rows {
                row.best_ms = None;
                row.last_ms = None;
                row.laps = Some(0);
            }
            baseline.personal = Some(baseline.rows[0].clone());
            baseline.candidate = None;
            records.accept(baseline);
            let mut next = vm(2, 90.0);
            next.rows[0].laps = Some(laps);
            next.rows[0].last_ms = Some(last);
            next.personal = Some(next.rows[0].clone());
            next.candidate = next.personal.clone();
            assert_eq!(
                matches!(records.accept(next), Update::Notice(_, _)),
                announces
            );
        }
    }

    #[test]
    fn scope_changes_and_unavailable_clear_silently() {
        for change in 0..5 {
            let mut records = Records::default();
            records.accept(vm(1, 90.0));
            let mut next = vm(2, 88.0);
            match change {
                0 => next.scope.0 += 1,
                1 => next.scope.1 = SessionId(5),
                2 => next.scope.3 = "New driver".into(),
                3 => next.scope.4 = None,
                _ => next.ready = false,
            }
            assert_eq!(records.accept(next), Update::Clear);
        }
    }
}
