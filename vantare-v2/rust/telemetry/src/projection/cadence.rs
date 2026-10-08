//! Deterministic Overlay V2 section cadence; the caller supplies monotonic time.

use serde::{Deserialize, Serialize};

pub const SECTION_COUNT: usize = 11;
pub const ALL_SECTIONS_MASK: u16 = (1 << SECTION_COUNT) - 1;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum Section {
    Player,
    Controls,
    Delta,
    Relative,
    Spotter,
    Session,
    Standings,
    Fuel,
    Damage,
    Weather,
    Capabilities,
}

impl Section {
    pub const ALL: [Self; SECTION_COUNT] = [
        Self::Player,
        Self::Controls,
        Self::Delta,
        Self::Relative,
        Self::Spotter,
        Self::Session,
        Self::Standings,
        Self::Fuel,
        Self::Damage,
        Self::Weather,
        Self::Capabilities,
    ];

    fn index(self) -> usize {
        self as usize
    }
    fn fast(self) -> bool {
        matches!(self, Self::Player | Self::Controls | Self::Delta)
    }
    fn mid(self) -> bool {
        self == Self::Spotter
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Cadence {
    pub fast_ns: i64,
    pub mid_ns: i64,
    pub slow_ns: i64,
    pub spotter_ns: i64,
    pub session_ns: i64,
    pub relative_ns: i64,
    pub standings_ns: i64,
    pub fuel_ns: i64,
    pub dirty_ceiling_ns: i64,
}

impl Cadence {
    pub fn regulated_default() -> Self {
        Self {
            fast_ns: 50_000_000,
            mid_ns: 100_000_000,
            slow_ns: 250_000_000,
            spotter_ns: 100_000_000,
            session_ns: 250_000_000,
            dirty_ceiling_ns: 1_000_000_000,
            ..Self::default()
        }
    }

    fn interval(self, section: Section) -> i64 {
        let override_ns = match section {
            Section::Spotter => self.spotter_ns,
            Section::Session => self.session_ns,
            Section::Relative => self.relative_ns,
            Section::Standings => self.standings_ns,
            Section::Fuel => self.fuel_ns,
            _ => 0,
        };
        if override_ns != 0 {
            return override_ns.max(0);
        }
        if section.fast() {
            self.fast_ns.max(0)
        } else if section.mid() {
            self.mid_ns.max(0)
        } else {
            self.slow_ns.max(0)
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct Dirty(pub u16);

impl Dirty {
    pub const ALL: Self = Self((1 << (SECTION_COUNT + 2)) - 1);
    pub fn mark(mut self, section: Section) -> Self {
        self.0 |= 1 << section.index();
        self
    }
    pub fn safety(mut self, section: Section) -> Self {
        self = self.mark(section);
        match section {
            Section::Session => self.0 |= 1 << SECTION_COUNT,
            Section::Spotter => self.0 |= 1 << (SECTION_COUNT + 1),
            _ => {}
        }
        self
    }
    fn has(self, section: Section) -> bool {
        self.0 & (1 << section.index()) != 0
    }
    fn safety_for(self, section: Section) -> bool {
        let bit = match section {
            Section::Session => SECTION_COUNT,
            Section::Spotter => SECTION_COUNT + 1,
            _ => return false,
        };
        self.0 & (1 << bit) != 0
    }
}

#[derive(Clone, Debug)]
pub struct Scheduler {
    cadence: Cadence,
    pending: Option<Cadence>,
    built: [bool; SECTION_COUNT],
    last_ns: [i64; SECTION_COUNT],
}

impl Scheduler {
    pub fn new(cadence: Cadence) -> Self {
        Self {
            cadence,
            pending: None,
            built: [false; SECTION_COUNT],
            last_ns: [0; SECTION_COUNT],
        }
    }

    pub fn cadence(&self) -> Cadence {
        self.cadence
    }
    pub fn set_cadence(&mut self, cadence: Cadence) {
        self.pending = Some(cadence);
    }

    pub fn plan(&mut self, now_ns: i64, dirty: Dirty) -> u16 {
        if let Some(pending) = self.pending.take() {
            self.cadence = pending;
        }
        let mut plan = 0;
        for section in Section::ALL {
            if self.decide(section, now_ns, dirty) {
                plan |= 1 << section.index();
                self.built[section.index()] = true;
                self.last_ns[section.index()] = now_ns;
            }
        }
        plan
    }

    fn decide(&self, section: Section, now_ns: i64, dirty: Dirty) -> bool {
        let index = section.index();
        if !self.built[index] {
            return true;
        }
        let interval = self.cadence.interval(section);
        if interval <= 0 {
            return true;
        }
        let elapsed = now_ns.saturating_sub(self.last_ns[index]);
        if now_ns < self.last_ns[index] {
            return true;
        }
        if section == Section::Capabilities && dirty.has(section) {
            return true;
        }
        if dirty.safety_for(section) {
            return true;
        }
        if section.fast() || section.mid() {
            return elapsed >= interval;
        }
        let ceiling = self.cadence.dirty_ceiling_ns;
        if ceiling > 0 && elapsed >= ceiling {
            return true;
        }
        if elapsed < interval {
            return false;
        }
        ceiling <= 0 || dirty.has(section)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_tick_full_dirty_ceiling_safety_and_clock_regression() {
        let mut scheduler = Scheduler::new(Cadence::regulated_default());
        assert_eq!(
            scheduler.plan(1_000_000_000, Dirty::default()),
            ALL_SECTIONS_MASK
        );
        assert_eq!(
            scheduler.plan(1_100_000_000, Dirty::default()) & (1 << Section::Standings.index()),
            0
        );
        assert_ne!(
            scheduler.plan(1_150_000_000, Dirty::default().safety(Section::Session))
                & (1 << Section::Session.index()),
            0
        );
        assert_ne!(
            scheduler.plan(2_100_000_000, Dirty::default()) & (1 << Section::Standings.index()),
            0
        );
        assert_eq!(scheduler.plan(0, Dirty::default()), ALL_SECTIONS_MASK);
    }

    #[test]
    fn new_cadence_takes_effect_on_next_plan() {
        let mut scheduler = Scheduler::new(Cadence::regulated_default());
        let next = Cadence {
            fast_ns: 150_000_000,
            ..Cadence::regulated_default()
        };
        scheduler.set_cadence(next);
        assert_ne!(scheduler.cadence(), next);
        scheduler.plan(0, Dirty::default());
        assert_eq!(scheduler.cadence(), next);
    }

    #[test]
    fn deterministic_240_tick_schedule_matches_go_oracle() {
        let golden: Vec<u16> =
            serde_json::from_slice(include_bytes!("../../testdata/overlay-cadence-go-v1.json"))
                .unwrap();
        let mut scheduler = Scheduler::new(Cadence::regulated_default());
        let mut plans = Vec::new();
        for tick in 0..240_i64 {
            if tick == 80 {
                scheduler.set_cadence(Cadence {
                    fast_ns: 150_000_000,
                    mid_ns: 300_000_000,
                    slow_ns: 750_000_000,
                    relative_ns: 500_000_000,
                    dirty_ceiling_ns: 1_000_000_000,
                    ..Cadence::default()
                });
            }
            let mut dirty = Dirty::default();
            if tick % 37 == 0 {
                dirty = dirty.mark(Section::Standings);
            }
            if tick == 150 || tick == 160 {
                dirty = Dirty::ALL;
            }
            let now_ns = if tick == 200 {
                -1_000_000_000
            } else {
                tick * (1_000_000_000 / 60)
            };
            plans.push(scheduler.plan(now_ns, dirty));
        }
        assert_eq!(plans, golden);
    }
}
