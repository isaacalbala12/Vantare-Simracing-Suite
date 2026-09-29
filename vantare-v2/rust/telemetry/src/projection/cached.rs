//! Committed Overlay V2 section state. A rejected candidate never advances it.

use std::io::{self, Write};
use std::sync::Arc;

use serde_json::{Value, json};

use super::{cadence, frame, relative};
use crate::core;
use crate::derive::gaps::GapSet;
use crate::lmu::{SessionType, pipeline::LmuVehicleState};

#[derive(Clone, Debug)]
pub struct CachedOverlay {
    scheduler: cadence::Scheduler,
    previous: Option<[u64; cadence::SECTION_COUNT]>,
    previous_flag: u64,
    previous_remaining: u64,
    previous_spotter: u64,
    memo: Option<Arc<Value>>,
    settler: relative::Settler,
}

impl CachedOverlay {
    pub fn new(cadence: cadence::Cadence) -> Self {
        Self {
            scheduler: cadence::Scheduler::new(cadence),
            previous: None,
            previous_flag: 0,
            previous_remaining: 0,
            previous_spotter: 0,
            memo: None,
            settler: relative::Settler::default(),
        }
    }

    pub fn set_cadence(&mut self, cadence: cadence::Cadence) {
        self.scheduler.set_cadence(cadence);
    }

    pub fn project(
        &mut self,
        sections: Value,
        metadata: frame::Metadata<'_>,
        batch: &core::Batch<SessionType, LmuVehicleState>,
        gaps: &GapSet,
        now_ns: i64,
    ) -> Result<Value, frame::FrameError> {
        let fingerprints =
            std::array::from_fn(|index| fingerprint_fields(&sections, SECTION_FIELDS[index]));
        let flag = fingerprint(&sections["session"]["flag"]);
        let remaining = fingerprint(&sections["session"]["remaining"]);
        let spotter = fingerprint(&sections["spotter"]);
        let dirty = self.dirty(&fingerprints, flag, remaining, spotter);
        let mask = self.scheduler.plan(now_ns, dirty);
        let mut update = frame::wrap_for_cache(sections, metadata)?;
        let published = &mut update["frame"];
        published["sectionMask"] = json!(mask);
        if let Some(memo) = &self.memo {
            for (section, names) in SECTION_FIELDS.iter().enumerate() {
                if mask & (1 << section) == 0 {
                    for name in *names {
                        published[*name] = memo[*name].clone();
                    }
                }
            }
        }
        if mask & (1 << 3) != 0 {
            let current = published["relative"]
                .as_array()
                .expect("relative array")
                .clone();
            published["relativeSettled"] =
                json!(self.settler.project(batch, gaps, current, now_ns));
        } else if let Some(memo) = &self.memo {
            published["relativeSettled"] = memo["relativeSettled"].clone();
        }
        self.previous = Some(fingerprints);
        self.previous_flag = flag;
        self.previous_remaining = remaining;
        self.previous_spotter = spotter;
        Ok(update)
    }

    /// Moves the already encoded candidate frame into the candidate cache.
    pub fn remember(&mut self, update: &mut Value) {
        self.memo = Some(Arc::new(update["frame"].take()));
    }

    fn dirty(
        &self,
        current: &[u64; cadence::SECTION_COUNT],
        flag: u64,
        remaining: u64,
        spotter: u64,
    ) -> cadence::Dirty {
        let Some(previous) = &self.previous else {
            return cadence::Dirty::ALL;
        };
        let mut dirty = cadence::Dirty::default();
        for (index, value) in current.iter().enumerate() {
            if value != &previous[index] {
                dirty = dirty.mark(cadence::Section::ALL[index]);
            }
        }
        if flag != self.previous_flag {
            dirty = dirty.safety(cadence::Section::Session);
        }
        if remaining != self.previous_remaining {
            dirty = dirty.mark(cadence::Section::Fuel);
        }
        if spotter != self.previous_spotter {
            dirty = dirty.safety(cadence::Section::Spotter);
        }
        dirty
    }
}

#[derive(Clone, Copy, Debug)]
struct Fnv64(u64);

impl Write for Fnv64 {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        for byte in bytes {
            self.0 = (self.0 ^ u64::from(*byte)).wrapping_mul(0x100000001b3);
        }
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

fn fingerprint(value: &Value) -> u64 {
    let mut hash = Fnv64(0xcbf29ce484222325);
    serde_json::to_writer(&mut hash, value)
        .expect("JSON value serializes into an infallible hasher");
    hash.0
}

fn fingerprint_fields(sections: &Value, names: &[&str]) -> u64 {
    let mut hash = Fnv64(0xcbf29ce484222325);
    for name in names {
        serde_json::to_writer(&mut hash, &sections[*name])
            .expect("JSON value serializes into an infallible hasher");
        hash.write_all(&[0]).expect("infallible hasher");
    }
    hash.0
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
