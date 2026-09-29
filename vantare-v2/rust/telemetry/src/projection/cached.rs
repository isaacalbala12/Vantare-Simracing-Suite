//! Committed Overlay V2 section state. A rejected candidate never advances it.

use serde_json::{Value, json};

use super::{cadence, relative};
use crate::core;
use crate::derive::gaps::GapSet;
use crate::lmu::{SessionType, pipeline::LmuVehicleState};

#[derive(Clone, Debug)]
pub struct CachedOverlay {
    scheduler: cadence::Scheduler,
    previous_sections: Option<Value>,
    memo: Option<Value>,
    settler: relative::Settler,
}

impl CachedOverlay {
    pub fn new(cadence: cadence::Cadence) -> Self {
        Self {
            scheduler: cadence::Scheduler::new(cadence),
            previous_sections: None,
            memo: None,
            settler: relative::Settler::default(),
        }
    }

    pub fn set_cadence(&mut self, cadence: cadence::Cadence) {
        self.scheduler.set_cadence(cadence);
    }

    pub fn project(
        &mut self,
        mut update: Value,
        sections: Value,
        batch: &core::Batch<SessionType, LmuVehicleState>,
        gaps: &GapSet,
        now_ns: i64,
    ) -> Value {
        let dirty = self.dirty(&sections);
        let mask = self.scheduler.plan(now_ns, dirty);
        let frame = update.get_mut("frame").expect("complete overlay frame");
        frame["sectionMask"] = json!(mask);
        if let Some(memo) = &self.memo {
            for (section, names) in SECTION_FIELDS.iter().enumerate() {
                if mask & (1 << section) == 0 {
                    for name in *names {
                        frame[*name] = memo[*name].clone();
                    }
                }
            }
        }
        if mask & (1 << 3) != 0 {
            let current = frame["relative"]
                .as_array()
                .expect("relative array")
                .clone();
            frame["relativeSettled"] = json!(self.settler.project(batch, gaps, current, now_ns));
        } else if let Some(memo) = &self.memo {
            frame["relativeSettled"] = memo["relativeSettled"].clone();
        }
        self.previous_sections = Some(sections);
        self.memo = Some(frame.clone());
        update
    }

    fn dirty(&self, sections: &Value) -> cadence::Dirty {
        let Some(previous) = &self.previous_sections else {
            return cadence::Dirty::ALL;
        };
        let mut dirty = cadence::Dirty::default();
        for (index, names) in SECTION_FIELDS.iter().enumerate() {
            if names.iter().any(|name| sections[*name] != previous[*name]) {
                dirty = dirty.mark(cadence::Section::ALL[index]);
            }
        }
        if sections["session"]["flag"] != previous["session"]["flag"] {
            dirty = dirty.safety(cadence::Section::Session);
        }
        if sections["session"]["remaining"] != previous["session"]["remaining"] {
            dirty = dirty.mark(cadence::Section::Fuel);
        }
        if sections["spotter"] != previous["spotter"] {
            dirty = dirty.safety(cadence::Section::Spotter);
        }
        dirty
    }
}

const SECTION_FIELDS: [&[&str]; cadence::SECTION_COUNT] = [
    &["player"],
    &["controls"],
    &["delta"],
    &["relative", "relativeSameClass"],
    &["spotter", "radar"],
    &["session"],
    &["standings"],
    &["fuel"],
    &["damage"],
    &["weather"],
    &["capabilities"],
];
