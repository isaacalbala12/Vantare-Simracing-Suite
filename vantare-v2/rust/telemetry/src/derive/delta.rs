//! Player self-delta tracker. All times are nanoseconds and distances meters.

use crate::core::{Batch, Cursor, VehicleState};
use crate::quality::{Field, Freshness, Provenance};

pub const MAX_SELF_DELTA_SAMPLES: usize = 18_000;
pub const MAX_SELF_DELTA_HISTORY: usize = 120;
const SAMPLE_INTERVAL_NS: i64 = 100_000_000;
const WRAP_MINIMUM_DROP_M: f64 = 100.0;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DeltaFreshness {
    Fresh,
    Stale,
    Missing,
    Invalid,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DeltaReference {
    BestCompletedPlayerLap,
}

#[derive(Clone, Debug, PartialEq)]
pub struct DeltaSample {
    pub cursor: Cursor,
    pub captured_utc_ns: i64,
    pub source_time_ns: i64,
    pub lap_distance_m: f64,
    pub seconds: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SelfDelta {
    pub freshness: DeltaFreshness,
    pub seconds: Field<f64>,
    pub reference: Field<DeltaReference>,
    pub history: Vec<DeltaSample>,
    pub personal_best: Field<f64>,
    pub session_best: Field<f64>,
    pub previous_lap: Field<f64>,
}

pub trait DeltaSignals {
    fn player(&self) -> &Field<bool>;
    fn lap_number(&self) -> &Field<i32>;
    fn lap_distance(&self) -> &Field<f64>;
    fn in_pit(&self) -> &Field<bool>;
    fn delta_best(&self) -> &Field<f64>;
}

impl<S, F, D> DeltaSignals for VehicleState<S, F, D> {
    fn player(&self) -> &Field<bool> {
        &self.player
    }
    fn lap_number(&self) -> &Field<i32> {
        &self.lap_number
    }
    fn lap_distance(&self) -> &Field<f64> {
        &self.lap_distance
    }
    fn in_pit(&self) -> &Field<bool> {
        &self.in_pit
    }
    fn delta_best(&self) -> &Field<f64> {
        &self.delta_best
    }
}

#[derive(Clone, Copy, Debug)]
struct DeltaInput {
    lap: i32,
    distance_m: f64,
    source_time_ns: i64,
    in_pit: bool,
}

#[derive(Clone, Copy, Debug)]
struct LapSample {
    distance_m: f64,
    elapsed_ns: i64,
}

#[derive(Clone, Debug)]
struct ReferenceLap {
    duration_ns: i64,
    samples: Vec<LapSample>,
}

#[derive(Clone, Debug)]
pub struct SelfDeltaTracker {
    limit: usize,
    identity: Option<(u64, String)>,
    last: Option<DeltaInput>,
    synchronized: bool,
    candidate_ok: bool,
    candidate_at: i64,
    candidate: Vec<LapSample>,
    last_private: i64,
    pending_wrap: bool,
    pending_reset: bool,
    pending_at: i64,
    reference: Option<ReferenceLap>,
    previous: Option<ReferenceLap>,
    history: Vec<DeltaSample>,
    last_public: i64,
}

impl SelfDeltaTracker {
    pub fn new(limit: usize) -> Self {
        Self {
            limit: if (1..=MAX_SELF_DELTA_SAMPLES).contains(&limit) {
                limit
            } else {
                MAX_SELF_DELTA_SAMPLES
            },
            identity: None,
            last: None,
            synchronized: false,
            candidate_ok: false,
            candidate_at: 0,
            candidate: Vec::new(),
            last_private: 0,
            pending_wrap: false,
            pending_reset: false,
            pending_at: 0,
            reference: None,
            previous: None,
            history: Vec::new(),
            last_public: 0,
        }
    }

    pub fn prepare<S, V: DeltaSignals>(
        &self,
        batch: &Batch<S, V>,
        captured_utc_ns: i64,
    ) -> (Self, SelfDelta) {
        let mut next = self.clone();
        let result = next.apply(batch, captured_utc_ns);
        (next, result)
    }

    fn apply<S, V: DeltaSignals>(
        &mut self,
        batch: &Batch<S, V>,
        captured_utc_ns: i64,
    ) -> SelfDelta {
        let self_result = self.apply_self(batch, captured_utc_ns);
        let Some(player) = batch
            .player_id
            .as_deref()
            .and_then(|id| batch.state.vehicles.iter().find(|vehicle| vehicle.id == id))
        else {
            return self_result;
        };
        let Field::Present {
            value,
            provenance: Provenance::Observed,
            freshness: Freshness::Fresh | Freshness::Stale,
        } = player.value.delta_best()
        else {
            return self_result;
        };
        if !value.is_finite() || value.abs() >= 10_000.0 {
            return self_result;
        }
        let freshness = match player.value.delta_best() {
            Field::Present { freshness, .. } => *freshness,
            _ => unreachable!(),
        };
        if freshness == Freshness::Fresh {
            self.record_selected_delta(batch, captured_utc_ns, player.value.lap_distance(), *value);
        }
        SelfDelta {
            freshness: if freshness == Freshness::Fresh {
                DeltaFreshness::Fresh
            } else {
                DeltaFreshness::Stale
            },
            seconds: player.value.delta_best().clone(),
            reference: Field::Present {
                value: DeltaReference::BestCompletedPlayerLap,
                provenance: Provenance::Observed,
                freshness,
            },
            history: self.history.clone(),
            personal_best: player.value.delta_best().clone(),
            session_best: self_result.session_best,
            previous_lap: self_result.previous_lap,
        }
    }

    fn apply_self<S, V: DeltaSignals>(
        &mut self,
        batch: &Batch<S, V>,
        captured_utc_ns: i64,
    ) -> SelfDelta {
        let identity = (batch.cursor.epoch, batch.session_id.clone());
        if self
            .identity
            .as_ref()
            .is_some_and(|previous| previous != &identity)
        {
            let limit = self.limit;
            *self = Self::new(limit);
        }
        self.identity = Some(identity);
        let Some(player) = batch
            .player_id
            .as_deref()
            .filter(|id| !id.is_empty())
            .and_then(|id| batch.state.vehicles.iter().find(|vehicle| vehicle.id == id))
        else {
            self.invalidate_current_lap();
            return self.output(DeltaFreshness::Missing, Field::Missing);
        };
        let (input, quality) = read_input(
            &batch.state.source_time_ns,
            &batch.state.player_present,
            &player.value,
        );
        if quality != DeltaFreshness::Fresh {
            self.invalidate_current_lap();
            return self.output(
                quality,
                if quality == DeltaFreshness::Invalid {
                    invalid()
                } else {
                    Field::Missing
                },
            );
        }
        let input = input.expect("fresh input");
        if input.in_pit {
            self.invalidate_current_lap();
            return self.output(DeltaFreshness::Missing, Field::Missing);
        }
        let Some(last) = self.last else {
            self.remember(input);
            return self.output(DeltaFreshness::Missing, Field::Missing);
        };
        let lap_step = i64::from(input.lap) - i64::from(last.lap);
        if lap_step < 0 {
            self.clear_reference();
        }
        if input.source_time_ns == last.source_time_ns {
            if input.lap == last.lap && input.distance_m == last.distance_m {
                return if self.pending_wrap {
                    self.output(DeltaFreshness::Missing, Field::Missing)
                } else {
                    self.current_delta(batch.cursor, captured_utc_ns, input)
                };
            }
            self.invalidate_current_lap();
            self.remember(input);
            return self.output(DeltaFreshness::Invalid, invalid());
        }
        if self.pending_reset {
            if input.source_time_ns < last.source_time_ns
                || input.source_time_ns - self.pending_at > 5 * SAMPLE_INTERVAL_NS
            {
                self.invalidate_current_lap();
                self.remember(input);
                return self.output(DeltaFreshness::Invalid, invalid());
            }
            return match lap_step {
                0 if input.distance_m < last.distance_m
                    && last.distance_m - input.distance_m < WRAP_MINIMUM_DROP_M =>
                {
                    self.remember_source_time(input.source_time_ns);
                    self.output(DeltaFreshness::Missing, Field::Missing)
                }
                0 if input.distance_m < last.distance_m => {
                    self.invalidate_current_lap();
                    self.remember(input);
                    self.output(DeltaFreshness::Invalid, invalid())
                }
                0 => {
                    self.remember(input);
                    self.output(DeltaFreshness::Missing, Field::Missing)
                }
                1 => {
                    self.complete_and_start_lap(self.pending_at, input);
                    self.remember(input);
                    self.output(DeltaFreshness::Missing, Field::Missing)
                }
                _ => {
                    self.invalidate_current_lap();
                    self.remember(input);
                    self.output(DeltaFreshness::Invalid, invalid())
                }
            };
        }
        if lap_step < 0 {
            self.invalidate_current_lap();
            self.remember(input);
            return self.output(DeltaFreshness::Invalid, invalid());
        }
        if lap_step == 0 {
            if self.pending_wrap {
                if input.source_time_ns < last.source_time_ns
                    || input.source_time_ns - self.pending_at > 5 * SAMPLE_INTERVAL_NS
                {
                    self.invalidate_current_lap();
                    self.remember(input);
                    return self.output(DeltaFreshness::Invalid, invalid());
                }
                if input.distance_m < last.distance_m
                    && last.distance_m - input.distance_m >= WRAP_MINIMUM_DROP_M
                {
                    self.complete_and_start_lap(self.pending_at, input);
                    self.remember(input);
                    return self.output(DeltaFreshness::Missing, Field::Missing);
                }
                if input.distance_m < last.distance_m {
                    self.remember_source_time(input.source_time_ns);
                } else {
                    self.remember(input);
                }
                return self.output(DeltaFreshness::Missing, Field::Missing);
            }
            if input.source_time_ns < last.source_time_ns {
                self.invalidate_current_lap();
                self.remember(input);
                return self.output(DeltaFreshness::Invalid, invalid());
            }
            if input.distance_m < last.distance_m {
                if last.distance_m - input.distance_m < WRAP_MINIMUM_DROP_M {
                    self.remember_source_time(input.source_time_ns);
                    return self.current_delta(batch.cursor, captured_utc_ns, input);
                }
                self.pending_reset = true;
                self.pending_at = input.source_time_ns;
                self.remember(input);
                return self.output(DeltaFreshness::Missing, Field::Missing);
            }
            if self.synchronized && !self.append_candidate(input) {
                self.invalidate_current_lap();
                self.remember(input);
                return self.output(DeltaFreshness::Invalid, invalid());
            }
            self.remember(input);
            return self.current_delta(batch.cursor, captured_utc_ns, input);
        }
        if lap_step == 1 && input.source_time_ns > last.source_time_ns {
            if input.distance_m >= last.distance_m {
                self.pending_wrap = true;
                self.pending_at = input.source_time_ns;
                self.remember(input);
                return self.output(DeltaFreshness::Missing, Field::Missing);
            }
            self.complete_and_start_lap(input.source_time_ns, input);
            self.remember(input);
            return self.output(DeltaFreshness::Missing, Field::Missing);
        }
        self.invalidate_current_lap();
        self.remember(input);
        self.output(DeltaFreshness::Missing, Field::Missing)
    }

    fn record_selected_delta<S, V: DeltaSignals>(
        &mut self,
        batch: &Batch<S, V>,
        captured_utc_ns: i64,
        lap_distance: &Field<f64>,
        seconds: f64,
    ) {
        let (
            Field::Present {
                value: source,
                freshness: Freshness::Fresh,
                ..
            },
            Field::Present {
                value: distance,
                freshness: Freshness::Fresh,
                ..
            },
        ) = (&batch.state.source_time_ns, lap_distance)
        else {
            return;
        };
        let same_cursor = self
            .history
            .last()
            .is_some_and(|last| last.cursor == batch.cursor);
        if !same_cursor
            && self.last_public != 0
            && source.saturating_sub(self.last_public) < SAMPLE_INTERVAL_NS
        {
            return;
        }
        let sample = DeltaSample {
            cursor: batch.cursor,
            captured_utc_ns,
            source_time_ns: *source,
            lap_distance_m: *distance,
            seconds,
        };
        if same_cursor {
            *self.history.last_mut().expect("same cursor") = sample;
        } else {
            self.history.push(sample);
        }
        self.trim_history();
        self.last_public = *source;
    }

    fn complete_and_start_lap(&mut self, boundary: i64, input: DeltaInput) {
        self.complete_candidate(boundary);
        self.synchronized = true;
        self.candidate_ok = true;
        self.candidate_at = boundary;
        self.last_private = input.source_time_ns;
        self.pending_wrap = false;
        self.pending_reset = false;
        self.pending_at = 0;
        self.candidate = vec![LapSample {
            distance_m: input.distance_m,
            elapsed_ns: input.source_time_ns - boundary,
        }];
    }

    fn append_candidate(&mut self, input: DeltaInput) -> bool {
        if !self.candidate_ok {
            return false;
        }
        if input.source_time_ns.saturating_sub(self.last_private) < SAMPLE_INTERVAL_NS {
            return true;
        }
        let sample = LapSample {
            distance_m: input.distance_m,
            elapsed_ns: input.source_time_ns - self.candidate_at,
        };
        if self
            .candidate
            .last()
            .is_some_and(|last| last.distance_m == sample.distance_m)
        {
            *self.candidate.last_mut().expect("candidate") = sample;
            self.last_private = input.source_time_ns;
            return true;
        }
        if self.candidate.len() >= self.limit {
            return false;
        }
        self.candidate.push(sample);
        self.last_private = input.source_time_ns;
        true
    }

    fn complete_candidate(&mut self, boundary: i64) {
        if !self.synchronized || !self.candidate_ok || self.candidate.len() < 2 {
            return;
        }
        let duration = boundary - self.candidate_at;
        if duration <= 0 {
            return;
        }
        self.previous = Some(ReferenceLap {
            duration_ns: duration,
            samples: self.candidate.clone(),
        });
        if self
            .reference
            .as_ref()
            .is_none_or(|reference| duration < reference.duration_ns)
        {
            self.reference = Some(ReferenceLap {
                duration_ns: duration,
                samples: self.candidate.clone(),
            });
            self.history.clear();
            self.last_public = 0;
        }
    }

    fn current_delta(
        &mut self,
        cursor: Cursor,
        captured_utc_ns: i64,
        input: DeltaInput,
    ) -> SelfDelta {
        let Some(reference) = self
            .reference
            .as_ref()
            .filter(|_| self.synchronized && self.candidate_ok)
        else {
            return self.output(DeltaFreshness::Missing, Field::Missing);
        };
        let Some(reference_elapsed) = interpolate_reference(&reference.samples, input.distance_m)
        else {
            return self.output(DeltaFreshness::Missing, Field::Missing);
        };
        let current_elapsed = input.source_time_ns - self.candidate_at;
        let seconds = (current_elapsed - reference_elapsed) as f64 / 1_000_000_000.0;
        if !seconds.is_finite() {
            return self.output(DeltaFreshness::Invalid, invalid());
        }
        if self.last_public == 0
            || input.source_time_ns.saturating_sub(self.last_public) >= SAMPLE_INTERVAL_NS
        {
            self.history.push(DeltaSample {
                cursor,
                captured_utc_ns,
                source_time_ns: input.source_time_ns,
                lap_distance_m: input.distance_m,
                seconds,
            });
            self.trim_history();
            self.last_public = input.source_time_ns;
        }
        let mut result = self.output(DeltaFreshness::Fresh, derived(seconds, Freshness::Fresh));
        if let Some(previous_elapsed) = self
            .previous
            .as_ref()
            .and_then(|previous| interpolate_reference(&previous.samples, input.distance_m))
        {
            let previous_seconds = (current_elapsed - previous_elapsed) as f64 / 1_000_000_000.0;
            if previous_seconds.is_finite() {
                result.previous_lap = derived(previous_seconds, Freshness::Fresh);
            }
        }
        result
    }

    fn output(&self, freshness: DeltaFreshness, seconds: Field<f64>) -> SelfDelta {
        SelfDelta {
            freshness,
            session_best: seconds.clone(),
            seconds,
            reference: if self.reference.is_some() {
                derived(DeltaReference::BestCompletedPlayerLap, Freshness::Fresh)
            } else {
                Field::Missing
            },
            history: self.history.clone(),
            personal_best: Field::Missing,
            previous_lap: Field::Missing,
        }
    }
    fn trim_history(&mut self) {
        if self.history.len() > MAX_SELF_DELTA_HISTORY {
            let overflow = self.history.len() - MAX_SELF_DELTA_HISTORY;
            self.history.drain(..overflow);
        }
    }
    fn remember(&mut self, input: DeltaInput) {
        self.last = Some(input);
    }
    fn remember_source_time(&mut self, source_time_ns: i64) {
        if let Some(last) = &mut self.last {
            last.source_time_ns = source_time_ns;
        }
    }
    fn invalidate_current_lap(&mut self) {
        self.last = None;
        self.synchronized = false;
        self.candidate_ok = false;
        self.candidate.clear();
        self.last_private = 0;
        self.pending_wrap = false;
        self.pending_reset = false;
        self.pending_at = 0;
    }
    fn clear_reference(&mut self) {
        self.reference = None;
        self.previous = None;
        self.history.clear();
        self.last_public = 0;
    }
}

impl Default for SelfDeltaTracker {
    fn default() -> Self {
        Self::new(0)
    }
}

fn read_input<V: DeltaSignals>(
    source_time_ns: &Field<i64>,
    player_present: &Field<bool>,
    vehicle: &V,
) -> (Option<DeltaInput>, DeltaFreshness) {
    if observed_bool(player_present) != Some(true) || observed_bool(vehicle.player()) != Some(true)
    {
        return (None, DeltaFreshness::Missing);
    }
    let qualities = [
        quality(source_time_ns),
        quality(vehicle.lap_number()),
        quality(vehicle.lap_distance()),
        quality(vehicle.in_pit()),
    ];
    let freshness = if qualities.contains(&DeltaFreshness::Invalid) {
        DeltaFreshness::Invalid
    } else if qualities.contains(&DeltaFreshness::Missing) {
        DeltaFreshness::Missing
    } else if qualities.contains(&DeltaFreshness::Stale) {
        DeltaFreshness::Stale
    } else {
        DeltaFreshness::Fresh
    };
    if freshness != DeltaFreshness::Fresh {
        return (None, freshness);
    }
    let input = DeltaInput {
        source_time_ns: *source_time_ns.value().expect("fresh source"),
        lap: *vehicle.lap_number().value().expect("fresh lap"),
        distance_m: *vehicle.lap_distance().value().expect("fresh distance"),
        in_pit: *vehicle.in_pit().value().expect("fresh pit"),
    };
    if input.source_time_ns < 0
        || input.lap < 0
        || !input.distance_m.is_finite()
        || input.distance_m < 0.0
    {
        return (None, DeltaFreshness::Invalid);
    }
    (Some(input), DeltaFreshness::Fresh)
}

fn interpolate_reference(samples: &[LapSample], distance_m: f64) -> Option<i64> {
    if samples.len() < 2
        || distance_m < samples.first()?.distance_m
        || distance_m > samples.last()?.distance_m
    {
        return None;
    }
    let mut index = 0;
    while index + 1 < samples.len() && samples[index + 1].distance_m < distance_m {
        index += 1;
    }
    if samples[index].distance_m == distance_m {
        return Some(samples[index].elapsed_ns);
    }
    let right = samples.get(index + 1)?;
    let left = &samples[index];
    let span = right.distance_m - left.distance_m;
    if span <= 0.0 {
        return None;
    }
    let ratio = (distance_m - left.distance_m) / span;
    let interpolated = left.elapsed_ns as f64 + ratio * (right.elapsed_ns - left.elapsed_ns) as f64;
    if !interpolated.is_finite() || interpolated < i64::MIN as f64 || interpolated > i64::MAX as f64
    {
        return None;
    }
    Some(interpolated as i64)
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
fn quality<T>(field: &Field<T>) -> DeltaFreshness {
    match field {
        Field::Missing => DeltaFreshness::Missing,
        Field::Present {
            provenance: Provenance::Derived | Provenance::Estimated,
            ..
        } => DeltaFreshness::Invalid,
        Field::Present {
            freshness: Freshness::Fresh,
            ..
        } => DeltaFreshness::Fresh,
        Field::Present {
            freshness: Freshness::Stale,
            ..
        } => DeltaFreshness::Stale,
        Field::Present {
            freshness: Freshness::Invalid,
            ..
        } => DeltaFreshness::Invalid,
    }
}
fn invalid<T: Default>() -> Field<T> {
    Field::Present {
        value: T::default(),
        provenance: Provenance::Derived,
        freshness: Freshness::Invalid,
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
    use crate::core::{ObservedState, Vehicle};

    struct Signals {
        player: Field<bool>,
        lap: Field<i32>,
        distance: Field<f64>,
        pit: Field<bool>,
        best: Field<f64>,
    }
    impl DeltaSignals for Signals {
        fn player(&self) -> &Field<bool> {
            &self.player
        }
        fn lap_number(&self) -> &Field<i32> {
            &self.lap
        }
        fn lap_distance(&self) -> &Field<f64> {
            &self.distance
        }
        fn in_pit(&self) -> &Field<bool> {
            &self.pit
        }
        fn delta_best(&self) -> &Field<f64> {
            &self.best
        }
    }
    fn batch(
        sequence: u64,
        lap: i32,
        distance: f64,
        source_time_ns: i64,
        in_pit: bool,
    ) -> Batch<(), Signals> {
        Batch {
            event_id: "event".to_owned(),
            session_id: "session".to_owned(),
            player_id: Some("player".to_owned()),
            cursor: Cursor { epoch: 1, sequence },
            state: ObservedState {
                source_time_ns: Field::observed(source_time_ns),
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
                track_length: Field::Missing,
                vehicles: vec![Vehicle {
                    id: "player".to_owned(),
                    driver_id: String::new(),
                    team_id: String::new(),
                    stint_id: None,
                    value: Signals {
                        player: Field::observed(true),
                        lap: Field::observed(lap),
                        distance: Field::observed(distance),
                        pit: Field::observed(in_pit),
                        best: Field::Missing,
                    },
                }],
            },
        }
    }
    fn apply(
        tracker: &mut SelfDeltaTracker,
        sequence: u64,
        lap: i32,
        distance: f64,
        seconds: i64,
    ) -> SelfDelta {
        let (next, output) = tracker.prepare(
            &batch(sequence, lap, distance, seconds * 1_000_000_000, false),
            sequence as i64,
        );
        *tracker = next;
        output
    }

    #[test]
    fn completed_lap_reference_and_same_distance_delta_match_go_matrix() {
        let mut tracker = SelfDeltaTracker::default();
        for (sequence, lap, distance, seconds) in [
            (1, 1, 100.0, 10),
            (2, 2, 0.0, 20),
            (3, 2, 100.0, 30),
            (4, 2, 200.0, 40),
            (5, 3, 0.0, 50),
        ] {
            let result = apply(&mut tracker, sequence, lap, distance, seconds);
            if sequence == 5 {
                assert!(result.reference.value().is_some());
            }
        }
        let compared = apply(&mut tracker, 6, 3, 100.0, 59);
        assert_eq!(compared.seconds.value(), Some(&-1.0));
        assert_eq!(compared.previous_lap.value(), Some(&-1.0));
        assert_eq!(
            compared.reference.value(),
            Some(&DeltaReference::BestCompletedPlayerLap)
        );
        assert!(
            compared
                .history
                .iter()
                .all(|sample| sample.seconds.is_finite())
        );
    }

    #[test]
    fn candidate_rejection_does_not_advance_reference_or_history() {
        let mut tracker = SelfDeltaTracker::default();
        for (sequence, lap, distance, seconds) in [
            (1, 1, 100.0, 10),
            (2, 2, 0.0, 20),
            (3, 2, 100.0, 30),
            (4, 2, 200.0, 40),
            (5, 3, 0.0, 50),
        ] {
            apply(&mut tracker, sequence, lap, distance, seconds);
        }
        let (candidate, output) = tracker.prepare(&batch(6, 3, 100.0, 59_000_000_000, false), 600);
        assert_eq!(output.seconds.value(), Some(&-1.0));
        assert!(tracker.history.is_empty());
        assert!(!candidate.history.is_empty());
        let repeated = tracker
            .prepare(&batch(6, 3, 100.0, 59_000_000_000, false), 600)
            .1;
        assert_eq!(repeated.seconds, output.seconds);
    }

    #[test]
    fn fresh_native_delta_replaces_same_cursor_history_and_stale_keeps_derived_history() {
        let mut tracker = SelfDeltaTracker::default();
        for (sequence, lap, distance, seconds) in [
            (1, 1, 100.0, 10),
            (2, 2, 0.0, 20),
            (3, 2, 100.0, 30),
            (4, 2, 200.0, 40),
            (5, 3, 0.0, 50),
        ] {
            apply(&mut tracker, sequence, lap, distance, seconds);
        }
        let mut native = batch(6, 3, 100.0, 59_000_000_000, false);
        native.state.vehicles[0].value.best = Field::observed(-0.245);
        let (next, output) = tracker.prepare(&native, 600);
        tracker = next;
        assert_eq!(output.seconds.value(), Some(&-0.245));
        assert_eq!(
            output.seconds.quality(),
            (Some(Provenance::Observed), Some(Freshness::Fresh))
        );
        assert_eq!(
            output.reference.quality(),
            (Some(Provenance::Observed), Some(Freshness::Fresh))
        );
        assert_eq!(output.history.len(), 1);
        assert_eq!(output.history[0].seconds, -0.245);
        let mut stale = batch(7, 3, 110.0, 60_000_000_000, false);
        stale.state.vehicles[0].value.best = Field::Present {
            value: -0.240,
            provenance: Provenance::Observed,
            freshness: Freshness::Stale,
        };
        let (_, output) = tracker.prepare(&stale, 700);
        assert_eq!(output.freshness, DeltaFreshness::Stale);
        assert_eq!(output.history.len(), 2);
        assert_eq!(output.history[1].seconds, -1.0);
        assert_eq!(output.personal_best.value(), Some(&-0.240));
    }

    #[test]
    fn lap_regression_and_epoch_reset_clear_reference() {
        let mut tracker = SelfDeltaTracker::default();
        for (sequence, lap, distance, seconds) in [
            (1, 1, 100.0, 10),
            (2, 2, 0.0, 20),
            (3, 2, 100.0, 30),
            (4, 2, 200.0, 40),
            (5, 3, 0.0, 50),
            (6, 3, 100.0, 59),
        ] {
            apply(&mut tracker, sequence, lap, distance, seconds);
        }
        assert!(!tracker.history.is_empty());
        let (regressed, output) = tracker.prepare(&batch(7, 2, 150.0, 60_000_000_000, false), 700);
        assert!(output.reference.value().is_none());
        assert!(output.history.is_empty());
        let mut reset = batch(1, 1, 100.0, 1_000_000_000, false);
        reset.cursor.epoch = 2;
        let (_, output) = tracker.prepare(&reset, 800);
        assert_eq!(output.freshness, DeltaFreshness::Missing);
        assert!(output.reference.value().is_none());
        assert!(regressed.reference.is_none());
    }

    #[test]
    fn bounded_lmu_wrap_order_skew_is_not_lost() {
        for path in [
            vec![
                (1, 900.0, 10_000_000_000),
                (2, 950.0, 20_000_000_000),
                (2, 10.0, 20_100_000_000),
                (2, 500.0, 30_000_000_000),
                (3, 980.0, 40_000_000_000),
                (3, 20.0, 40_100_000_000),
                (3, 500.0, 51_000_000_000),
            ],
            vec![
                (1, 900.0, 10_000_000_000),
                (1, 10.0, 20_000_000_000),
                (2, 20.0, 20_200_000_000),
                (2, 500.0, 30_000_000_000),
                (2, 10.0, 40_000_000_000),
                (3, 20.0, 40_200_000_000),
                (3, 500.0, 51_000_000_000),
            ],
        ] {
            let mut tracker = SelfDeltaTracker::default();
            let mut last = None;
            for (index, (lap, distance, source)) in path.into_iter().enumerate() {
                let (next, output) = tracker.prepare(
                    &batch(index as u64 + 1, lap, distance, source, false),
                    index as i64,
                );
                tracker = next;
                last = Some(output);
            }
            let output = last.unwrap();
            assert_eq!(output.freshness, DeltaFreshness::Fresh);
            assert!(output.reference.value().is_some());
        }
    }

    #[test]
    fn real_lmu_trace_keeps_lap_reference_and_measured_negative_delta() {
        const TRACE: &str = include_str!(
            "../../../../internal/telemetry/derive/testdata/lmu-1.4-self-delta-trace-v1.jsonl"
        );
        const ORACLE: &str = include_str!("../../testdata/delta-go-oracle-v1.json");
        let oracle: serde_json::Value = serde_json::from_str(ORACLE).unwrap();
        let expected = oracle.as_array().unwrap();
        assert_eq!(expected.len(), TRACE.lines().count());
        let mut tracker = SelfDeltaTracker::default();
        let mut wraps = Vec::new();
        let mut last_distance = None;
        let mut negative = 0;
        let mut final_output = None;
        for (index, line) in TRACE.lines().enumerate() {
            let row: serde_json::Value = serde_json::from_str(line).unwrap();
            assert_eq!(row["version"].as_i64(), Some(1));
            assert_eq!(row["sample_index"].as_u64(), Some(index as u64));
            assert_eq!(row["quality"].as_str(), Some("fresh"));
            assert_eq!(row["in_pit"].as_bool(), Some(false));
            let lap = row["lap_number"].as_i64().unwrap() as i32;
            let distance = row["lap_distance_m"].as_f64().unwrap();
            let source = row["source_time_ns"].as_i64().unwrap();
            if last_distance.is_some_and(|previous| previous - distance >= WRAP_MINIMUM_DROP_M) {
                wraps.push(index);
            }
            last_distance = Some(distance);
            let (next, output) = tracker.prepare(
                &batch(index as u64 + 1, lap, distance, source, false),
                row["elapsed_offset_ns"].as_i64().unwrap(),
            );
            tracker = next;
            let reference = &expected[index];
            assert_eq!(
                match output.freshness {
                    DeltaFreshness::Missing => 0,
                    DeltaFreshness::Fresh => 1,
                    DeltaFreshness::Stale => 2,
                    DeltaFreshness::Invalid => 3,
                },
                reference["freshness"].as_i64().unwrap(),
                "freshness at sample {index}"
            );
            assert_eq!(
                output.reference.value().is_some(),
                reference["reference"].as_bool().unwrap(),
                "reference at sample {index}"
            );
            assert_eq!(
                output.history.len(),
                reference["history_len"].as_u64().unwrap() as usize,
                "history length at sample {index}"
            );
            for (name, value) in [
                ("seconds", output.seconds.value()),
                ("session_best", output.session_best.value()),
                ("previous_lap", output.previous_lap.value()),
                ("personal_best", output.personal_best.value()),
            ] {
                let wanted = reference[name].as_f64();
                assert_eq!(
                    value.is_some(),
                    wanted.is_some(),
                    "{name} presence at sample {index}"
                );
                if let (Some(actual), Some(wanted)) = (value, wanted) {
                    assert!(
                        (actual - wanted).abs() <= 1e-9,
                        "{name} at sample {index}: Rust={actual}, Go={wanted}"
                    );
                }
            }
            if (977..1835).contains(&index)
                && output.seconds.value().is_some_and(|value| *value < -0.1)
            {
                negative += 1;
            }
            final_output = Some(output);
        }
        assert_eq!(wraps, vec![15, 977, 1835]);
        assert!(negative > 0);
        assert!(final_output.unwrap().reference.value().is_some());
        assert!(tracker.history.len() <= MAX_SELF_DELTA_HISTORY);
    }
}
