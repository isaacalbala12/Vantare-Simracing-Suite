//! Counts actual presented images, independently from polls and view builds.
use std::sync::{
    Arc,
    atomic::{AtomicU8, AtomicU64, Ordering::Relaxed},
};
#[derive(Clone, Copy)]
pub enum Cause {
    Data = 1,
    Animation = 2,
    Design = 4,
}
#[derive(Default)]
pub struct Counts {
    frames: AtomicU64,
    data: AtomicU64,
    animation: AtomicU64,
    design: AtomicU64,
    unattributed: AtomicU64,
    dropped_frame_sets: AtomicU64,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Snapshot {
    pub frames: u64,
    pub data: u64,
    pub animation: u64,
    pub design: u64,
    pub unattributed: u64,
    /// Global queue expulsions by its limit; consumed frames and window removal are excluded.
    pub dropped_frame_sets: u64,
}
impl Counts {
    pub(crate) fn dropped_frame_set(&self) {
        self.dropped_frame_sets.fetch_add(1, Relaxed);
    }
    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            frames: self.frames.load(Relaxed),
            data: self.data.load(Relaxed),
            animation: self.animation.load(Relaxed),
            design: self.design.load(Relaxed),
            unattributed: self.unattributed.load(Relaxed),
            dropped_frame_sets: self.dropped_frame_sets.load(Relaxed),
        }
    }
}
#[derive(Clone)]
pub struct Meter {
    pending: Arc<AtomicU8>,
    counts: Arc<Counts>,
    local: Arc<Counts>,
}
impl Meter {
    pub fn new(counts: Arc<Counts>) -> Self {
        Self {
            pending: Arc::new(AtomicU8::new(Cause::Design as u8)),
            counts,
            local: Arc::new(Counts::default()),
        }
    }
    pub fn mark(&self, cause: Cause) {
        self.pending.fetch_or(cause as u8, Relaxed);
    }
    pub fn snapshot(&self) -> Snapshot {
        self.local.snapshot()
    }
    pub fn unchanged(&self) {
        self.pending.store(0, Relaxed);
    }
    /// Rune on_frame_drawn only; images may carry several causes.
    pub fn presented(&self) {
        let pending = self.pending.swap(0, Relaxed);
        for counts in [&self.local, &self.counts] {
            counts.frames.fetch_add(1, Relaxed);
            for (cause, count) in [
                (Cause::Data, &counts.data),
                (Cause::Animation, &counts.animation),
                (Cause::Design, &counts.design),
            ] {
                if pending & cause as u8 != 0 {
                    count.fetch_add(1, Relaxed);
                }
            }
            if pending == 0 {
                counts.unattributed.fetch_add(1, Relaxed);
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn coalesced_causes_count_one_image_and_skipped_work_is_not_a_present() {
        let counts = Arc::new(Counts::default());
        let meter = Meter::new(counts.clone());
        meter.presented();
        meter.mark(Cause::Data);
        meter.mark(Cause::Data);
        meter.mark(Cause::Animation);
        assert_eq!(
            counts.snapshot().frames,
            1,
            "requesting work is not presenting it"
        );
        meter.presented();
        assert_eq!(
            counts.snapshot(),
            Snapshot {
                frames: 2,
                data: 1,
                animation: 1,
                design: 1,
                unattributed: 0,
                dropped_frame_sets: 0
            }
        );
    }
}
