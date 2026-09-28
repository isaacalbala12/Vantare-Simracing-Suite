//! Bounded player fuel-per-lap tracker with candidate ownership.

use crate::core::{Batch, VehicleState};
use crate::quality::{Field, Freshness, Provenance};

pub const MAX_FUEL_USAGE_WINDOW: usize = 10;
pub const DEFAULT_FUEL_USAGE_WINDOW: usize = 3;
pub const MAX_FUEL_HISTORY: usize = 64;
const REFUEL_EPSILON_LITERS: f64 = 0.05;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FuelFreshness {
    Fresh,
    Stale,
    Missing,
    Invalid,
}

#[derive(Clone, Debug, PartialEq)]
pub struct FuelLapSample {
    pub lap: i32,
    pub consumed_liters: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct FuelUsage {
    pub freshness: FuelFreshness,
    pub per_lap_liters: Field<f64>,
    pub last_lap_liters: Field<f64>,
    pub window_laps: Field<i32>,
    pub history_freshness: FuelFreshness,
    pub history: Vec<FuelLapSample>,
}

pub trait FuelValue {
    fn amount_liters(&self) -> f64;
    fn capacity_liters(&self) -> f64;
}

impl FuelValue for crate::lmu::Fuel {
    fn amount_liters(&self) -> f64 {
        self.amount_liters
    }
    fn capacity_liters(&self) -> f64 {
        self.capacity_liters
    }
}

pub trait FuelSignals {
    type Fuel: FuelValue;
    fn player(&self) -> &Field<bool>;
    fn lap_number(&self) -> &Field<i32>;
    fn fuel(&self) -> &Field<Self::Fuel>;
    fn in_pit(&self) -> &Field<bool>;
}

impl<S, F: FuelValue, D> FuelSignals for VehicleState<S, F, D> {
    type Fuel = F;
    fn player(&self) -> &Field<bool> {
        &self.player
    }
    fn lap_number(&self) -> &Field<i32> {
        &self.lap_number
    }
    fn fuel(&self) -> &Field<F> {
        &self.fuel
    }
    fn in_pit(&self) -> &Field<bool> {
        &self.in_pit
    }
}

#[derive(Clone, Debug)]
pub struct FuelTracker {
    window: usize,
    identity: Option<(u64, String, String)>,
    open_lap: Option<i32>,
    open_fuel: f64,
    open_invalid: bool,
    last_fuel: f64,
    samples: Vec<f64>,
    history: Vec<FuelLapSample>,
}

impl FuelTracker {
    pub fn new(window: usize) -> Self {
        Self {
            window: if (1..=MAX_FUEL_USAGE_WINDOW).contains(&window) {
                window
            } else {
                DEFAULT_FUEL_USAGE_WINDOW
            },
            identity: None,
            open_lap: None,
            open_fuel: 0.0,
            open_invalid: false,
            last_fuel: 0.0,
            samples: Vec::new(),
            history: Vec::new(),
        }
    }

    pub fn prepare<S, V: FuelSignals>(&self, batch: &Batch<S, V>) -> (Self, FuelUsage) {
        let mut next = self.clone();
        let player = batch
            .player_id
            .as_deref()
            .and_then(|id| batch.state.vehicles.iter().find(|vehicle| vehicle.id == id));
        let identity = (
            batch.cursor.epoch,
            batch.session_id.clone(),
            player
                .and_then(|vehicle| vehicle.stint_id.as_ref())
                .cloned()
                .or_else(|| {
                    batch
                        .player_id
                        .is_none()
                        .then(|| self.identity.as_ref().map(|previous| previous.2.clone()))
                        .flatten()
                })
                .unwrap_or_default(),
        );
        if next.identity.as_ref().is_some_and(|last| last != &identity) {
            next.reset();
        }
        next.identity = Some(identity);
        let Some(player) = player else {
            next.invalidate_open();
            let usage = next.output(FuelFreshness::Missing);
            return (next, usage);
        };
        let Some(true) = observed_bool(&batch.state.player_present) else {
            next.invalidate_open();
            let usage = next.output(FuelFreshness::Missing);
            return (next, usage);
        };
        let Some(true) = observed_bool(player.value.player()) else {
            next.invalidate_open();
            let usage = next.output(FuelFreshness::Missing);
            return (next, usage);
        };
        let quality = input_quality(
            player.value.lap_number(),
            player.value.fuel(),
            player.value.in_pit(),
        );
        if quality != FuelFreshness::Fresh {
            next.invalidate_open();
            let usage = next.output(quality);
            return (next, usage);
        }
        let lap = *player.value.lap_number().value().expect("fresh lap");
        let fuel = player.value.fuel().value().expect("fresh fuel");
        let amount = fuel.amount_liters();
        let capacity = fuel.capacity_liters();
        let in_pit = *player.value.in_pit().value().expect("fresh pit");
        if lap < 0
            || !amount.is_finite()
            || !capacity.is_finite()
            || capacity <= 0.0
            || amount < 0.0
            || amount > capacity
        {
            next.invalidate_open();
            let usage = next.output(FuelFreshness::Invalid);
            return (next, usage);
        }
        match next.open_lap {
            None => next.start_lap(lap, amount, in_pit),
            Some(open) => {
                if amount > next.last_fuel + REFUEL_EPSILON_LITERS || in_pit {
                    next.open_invalid = true;
                }
                match i64::from(lap) - i64::from(open) {
                    0 => next.last_fuel = amount,
                    1 => {
                        next.close_lap(amount);
                        next.start_lap(lap, amount, in_pit);
                    }
                    _ => next.start_lap(lap, amount, in_pit),
                }
            }
        }
        let usage = next.output(FuelFreshness::Fresh);
        (next, usage)
    }

    fn reset(&mut self) {
        self.open_lap = None;
        self.open_invalid = false;
        self.samples.clear();
        self.history.clear();
    }
    fn invalidate_open(&mut self) {
        self.open_lap = None;
        self.open_invalid = false;
    }
    fn start_lap(&mut self, lap: i32, fuel: f64, in_pit: bool) {
        self.open_lap = Some(lap);
        self.open_fuel = fuel;
        self.last_fuel = fuel;
        self.open_invalid = in_pit;
    }
    fn close_lap(&mut self, fuel: f64) {
        if self.open_invalid {
            return;
        }
        let consumed = self.open_fuel - fuel;
        if !consumed.is_finite() || consumed <= 0.0 {
            return;
        }
        self.samples.push(consumed);
        if self.samples.len() > self.window {
            self.samples.remove(0);
        }
        self.history.push(FuelLapSample {
            lap: self.open_lap.expect("open lap"),
            consumed_liters: consumed,
        });
        if self.history.len() > MAX_FUEL_HISTORY {
            self.history.remove(0);
        }
    }
    fn output(&self, mut freshness: FuelFreshness) -> FuelUsage {
        if self.samples.is_empty() {
            return FuelUsage {
                freshness,
                per_lap_liters: Field::Missing,
                last_lap_liters: Field::Missing,
                window_laps: Field::Missing,
                history_freshness: freshness,
                history: Vec::new(),
            };
        }
        if matches!(freshness, FuelFreshness::Missing | FuelFreshness::Invalid) {
            freshness = FuelFreshness::Stale;
        }
        let average = self.samples.iter().sum::<f64>() / self.samples.len() as f64;
        if !average.is_finite() {
            return FuelUsage {
                freshness: FuelFreshness::Invalid,
                per_lap_liters: Field::Missing,
                last_lap_liters: Field::Missing,
                window_laps: Field::Missing,
                history_freshness: FuelFreshness::Invalid,
                history: Vec::new(),
            };
        }
        let quality = match freshness {
            FuelFreshness::Fresh => Freshness::Fresh,
            FuelFreshness::Stale => Freshness::Stale,
            _ => unreachable!("measured window has usable quality"),
        };
        FuelUsage {
            freshness,
            per_lap_liters: derived(average, quality),
            last_lap_liters: derived(*self.samples.last().expect("nonempty"), quality),
            window_laps: derived(self.samples.len() as i32, quality),
            history_freshness: freshness,
            history: self.history.clone(),
        }
    }
}

impl Default for FuelTracker {
    fn default() -> Self {
        Self::new(0)
    }
}

fn observed_bool(field: &Field<bool>) -> Option<bool> {
    match field {
        Field::Present {
            value,
            provenance: Provenance::Observed,
            freshness: Freshness::Fresh | Freshness::Stale,
        } => Some(*value),
        _ => None,
    }
}
fn input_quality<A, B, C>(lap: &Field<A>, fuel: &Field<B>, pit: &Field<C>) -> FuelFreshness {
    let fields = [quality(lap), quality(fuel), quality(pit)];
    if fields.contains(&FuelFreshness::Invalid) {
        FuelFreshness::Invalid
    } else if fields.contains(&FuelFreshness::Missing) {
        FuelFreshness::Missing
    } else if fields.contains(&FuelFreshness::Stale) {
        FuelFreshness::Stale
    } else {
        FuelFreshness::Fresh
    }
}
fn quality<T>(field: &Field<T>) -> FuelFreshness {
    match field {
        Field::Missing => FuelFreshness::Missing,
        Field::Present {
            provenance: Provenance::Derived | Provenance::Estimated,
            ..
        } => FuelFreshness::Invalid,
        Field::Present {
            freshness: Freshness::Fresh,
            ..
        } => FuelFreshness::Fresh,
        Field::Present {
            freshness: Freshness::Stale,
            ..
        } => FuelFreshness::Stale,
        Field::Present {
            freshness: Freshness::Invalid,
            ..
        } => FuelFreshness::Invalid,
    }
}
fn derived<T>(value: T, freshness: Freshness) -> Field<T> {
    Field::Present {
        value,
        provenance: Provenance::Derived,
        freshness,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::{Cursor, ObservedState, Vehicle};

    #[derive(Clone, Debug, Eq, PartialEq)]
    struct Tank {
        amount: i32,
        capacity: i32,
    }
    impl FuelValue for Tank {
        fn amount_liters(&self) -> f64 {
            f64::from(self.amount)
        }
        fn capacity_liters(&self) -> f64 {
            f64::from(self.capacity)
        }
    }
    struct Signals {
        player: Field<bool>,
        lap: Field<i32>,
        fuel: Field<Tank>,
        pit: Field<bool>,
    }
    impl FuelSignals for Signals {
        type Fuel = Tank;
        fn player(&self) -> &Field<bool> {
            &self.player
        }
        fn lap_number(&self) -> &Field<i32> {
            &self.lap
        }
        fn fuel(&self) -> &Field<Tank> {
            &self.fuel
        }
        fn in_pit(&self) -> &Field<bool> {
            &self.pit
        }
    }
    fn batch(
        epoch: u64,
        sequence: u64,
        stint: &str,
        lap: i32,
        fuel: i32,
        pit: bool,
    ) -> Batch<(), Signals> {
        Batch {
            event_id: "event".to_owned(),
            session_id: "session".to_owned(),
            player_id: Some("player".to_owned()),
            cursor: Cursor { epoch, sequence },
            state: ObservedState {
                source_time_ns: Field::Missing,
                end_time_seconds: Field::Missing,
                maximum_laps: Field::Missing,
                track_name: Field::Missing,
                session_type: Field::Missing,
                vehicle_count: Field::observed(1),
                player_present: Field::observed(true),
                ambient_temp_c: Field::Missing,
                track_temp_c: Field::Missing,
                rain_fraction: Field::Missing,
                wetness_fraction: Field::Missing,
                session_flag: Field::Missing,
                vehicles: vec![Vehicle {
                    id: "player".to_owned(),
                    driver_id: String::new(),
                    team_id: String::new(),
                    stint_id: Some(stint.to_owned()),
                    value: Signals {
                        player: Field::observed(true),
                        lap: Field::observed(lap),
                        fuel: Field::observed(Tank {
                            amount: fuel,
                            capacity: 120,
                        }),
                        pit: Field::observed(pit),
                    },
                }],
                track_length: Field::Missing,
            },
        }
    }

    #[test]
    fn valid_laps_use_last_three_and_keep_longer_history() {
        let mut tracker = FuelTracker::default();
        for (sequence, lap, amount) in [(1, 1, 100), (2, 2, 96), (3, 3, 93), (4, 4, 91), (5, 5, 90)]
        {
            let (next, usage) = tracker.prepare(&batch(1, sequence, "s1", lap, amount, false));
            tracker = next;
            if sequence == 5 {
                assert_eq!(usage.per_lap_liters.value(), Some(&2.0));
                assert_eq!(usage.last_lap_liters.value(), Some(&1.0));
                assert_eq!(usage.window_laps.value(), Some(&3));
                assert_eq!(usage.history.len(), 4);
                assert_eq!(usage.history[0].lap, 1);
            }
        }
    }

    #[test]
    fn candidate_is_owned_and_pit_refuel_jump_do_not_invent_measurements() {
        let mut tracker = FuelTracker::default();
        let (first, _) = tracker.prepare(&batch(1, 1, "s1", 1, 100, false));
        tracker = first;
        let (prepared, usage) = tracker.prepare(&batch(1, 2, "s1", 2, 96, false));
        assert_eq!(usage.per_lap_liters.value(), Some(&4.0));
        assert!(tracker.samples.is_empty());
        tracker = prepared;
        for (sequence, lap, amount, pit) in [
            (3, 2, 95, true),
            (4, 3, 94, false),
            (5, 4, 90, false),
            (6, 4, 100, false),
            (7, 5, 95, false),
            (8, 8, 80, false),
            (9, 9, 77, false),
        ] {
            let (next, _) = tracker.prepare(&batch(1, sequence, "s1", lap, amount, pit));
            tracker = next;
        }
        assert_eq!(
            tracker
                .history
                .iter()
                .map(|sample| sample.consumed_liters)
                .collect::<Vec<_>>(),
            vec![4.0, 4.0, 3.0]
        );
    }

    #[test]
    fn missing_input_keeps_measured_window_stale_and_new_stint_resets() {
        let tracker = FuelTracker::default();
        let (tracker, _) = tracker.prepare(&batch(1, 1, "s1", 1, 100, false));
        let (tracker, _) = tracker.prepare(&batch(1, 2, "s1", 2, 96, false));
        let mut absent = batch(1, 3, "s1", 2, 95, false);
        absent.state.player_present = Field::observed(false);
        absent.player_id = None;
        absent.state.vehicles.clear();
        let (tracker, stale) = tracker.prepare(&absent);
        assert_eq!(stale.freshness, FuelFreshness::Stale);
        assert_eq!(stale.per_lap_liters.value(), Some(&4.0));
        let (_, reset) = tracker.prepare(&batch(1, 4, "s2", 3, 90, false));
        assert_eq!(reset.per_lap_liters, Field::Missing);
        assert!(reset.history.is_empty());
    }

    #[test]
    fn measured_history_is_capped_separately_from_average_window() {
        let mut tracker = FuelTracker::default();
        for sequence in 1..=70 {
            let (next, usage) = tracker.prepare(&batch(
                1,
                sequence,
                "s1",
                sequence as i32,
                120 - sequence as i32,
                false,
            ));
            tracker = next;
            if sequence == 70 {
                assert_eq!(usage.window_laps.value(), Some(&3));
                assert_eq!(usage.history.len(), MAX_FUEL_HISTORY);
                assert_eq!(usage.history.first().unwrap().lap, 6);
                assert_eq!(usage.history.last().unwrap().lap, 69);
            }
        }
    }
}
