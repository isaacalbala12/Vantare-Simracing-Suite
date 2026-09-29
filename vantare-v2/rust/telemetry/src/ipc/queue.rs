//! Bounded handoff from acquisition to the pipe writer. The caller must fail
//! closed on `Full`; a Fact or configuration barrier is never dropped.

use std::collections::VecDeque;

use super::Kind;

pub const MAX_EVENT_BATCHES: usize = 8;
pub const MAX_EVENT_FACTS: usize = 64;
pub const MAX_PENDING_BYTES: usize = 16 << 20;
const MAX_BATCH_SNAPSHOTS: usize = 3;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum QueueError {
    InvalidFrame,
    Full,
}

struct Batch {
    frames: Vec<Vec<u8>>,
    bytes: usize,
    facts: usize,
}

#[derive(Default)]
pub struct WriterQueue {
    events: VecDeque<Batch>,
    state: Option<Batch>,
    event_facts: usize,
    pending_bytes: usize,
    replaced_states: u64,
}

impl WriterQueue {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn replaced_states(&self) -> u64 {
        self.replaced_states
    }

    pub fn pending_bytes(&self) -> usize {
        self.pending_bytes
    }

    /// One Assembler output is enqueued atomically. The writer consumes
    /// event batches before the latest state-only batch, preserving ACK and
    /// Fact ordering while coalescing state under a slow peer.
    pub fn push_batch(&mut self, frames: Vec<Vec<u8>>) -> Result<(), QueueError> {
        if frames.is_empty() {
            return Ok(());
        }
        let mut snapshots = 0;
        let mut facts = 0;
        let mut event = false;
        let mut barrier = false;
        let mut bytes = 0_usize;
        for frame in &frames {
            let decoded = super::decode(frame).map_err(|_| QueueError::InvalidFrame)?;
            match decoded.kind {
                Kind::Snapshot => snapshots += 1,
                Kind::ConfigurationAck | Kind::ResyncRequired | Kind::Stop => {
                    event = true;
                    barrier = true;
                }
                Kind::Status => event = true,
                Kind::Fact => {
                    facts += 1;
                    event = true;
                    barrier = true;
                }
                _ => return Err(QueueError::InvalidFrame),
            }
            bytes = bytes.checked_add(frame.len()).ok_or(QueueError::Full)?;
        }
        if snapshots > MAX_BATCH_SNAPSHOTS || facts > MAX_EVENT_FACTS || bytes > MAX_PENDING_BYTES {
            return Err(QueueError::Full);
        }
        let removed = if barrier || !event {
            self.state.as_ref().map_or(0, |state| state.bytes)
        } else {
            0
        };
        let next_bytes = self.pending_bytes - removed + bytes;
        if next_bytes > MAX_PENDING_BYTES
            || event
                && (self.events.len() == MAX_EVENT_BATCHES
                    || self.event_facts + facts > MAX_EVENT_FACTS)
        {
            return Err(QueueError::Full);
        }
        let batch = Batch {
            frames,
            bytes,
            facts,
        };
        self.pending_bytes = next_bytes;
        if event {
            if barrier && self.state.take().is_some() {
                self.replaced_states += 1;
            }
            self.event_facts += facts;
            self.events.push_back(batch);
        } else {
            if self.state.is_some() {
                self.replaced_states += 1;
            }
            self.state = Some(batch);
        }
        Ok(())
    }

    pub fn pop_batch(&mut self) -> Option<Vec<Vec<u8>>> {
        let batch = self.events.pop_front().or_else(|| self.state.take())?;
        self.pending_bytes -= batch.bytes;
        self.event_facts -= batch.facts;
        Some(batch.frames)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(kind: Kind, byte: u8) -> Vec<u8> {
        super::super::encode(kind, &[byte]).unwrap()
    }

    #[test]
    fn state_is_latest_wins_but_fact_and_ack_order_survive() {
        let mut queue = WriterQueue::new();
        let old = frame(Kind::Snapshot, 1);
        let new = frame(Kind::Snapshot, 2);
        let fact = frame(Kind::Fact, 3);
        let ack = frame(Kind::ConfigurationAck, 4);
        queue.push_batch(vec![old]).unwrap();
        queue.push_batch(vec![ack.clone(), fact.clone()]).unwrap();
        queue.push_batch(vec![new.clone()]).unwrap();
        assert_eq!(queue.replaced_states(), 1);
        assert_eq!(queue.pop_batch(), Some(vec![ack, fact]));
        assert_eq!(queue.pop_batch(), Some(vec![new]));
        assert_eq!(queue.pop_batch(), None);
        assert_eq!(queue.pending_bytes(), 0);
    }

    #[test]
    fn overflow_rejects_entire_batch_without_mutating_queue() {
        let mut queue = WriterQueue::new();
        let fact = frame(Kind::Fact, 1);
        let ack = frame(Kind::ConfigurationAck, 2);
        queue
            .push_batch(vec![fact.clone(); MAX_EVENT_FACTS])
            .unwrap();
        let before = queue.pending_bytes();
        assert_eq!(
            queue.push_batch(vec![ack.clone(), fact]),
            Err(QueueError::Full)
        );
        assert_eq!(queue.pending_bytes(), before);
        assert_eq!(queue.pop_batch().unwrap().len(), MAX_EVENT_FACTS);
        assert_eq!(queue.pop_batch(), None);

        for _ in 0..MAX_EVENT_BATCHES {
            queue.push_batch(vec![ack.clone()]).unwrap();
        }
        assert_eq!(queue.push_batch(vec![ack]), Err(QueueError::Full));
        assert_eq!(queue.pop_batch().unwrap().len(), 1);
    }

    #[test]
    fn malformed_and_excess_snapshots_fail_closed() {
        let mut queue = WriterQueue::new();
        assert_eq!(
            queue.push_batch(vec![vec![1, 2]]),
            Err(QueueError::InvalidFrame)
        );
        let state = frame(Kind::Snapshot, 1);
        assert_eq!(
            queue.push_batch(vec![state; MAX_BATCH_SNAPSHOTS + 1]),
            Err(QueueError::Full)
        );
        assert_eq!(queue.pending_bytes(), 0);
    }

    #[test]
    fn combined_snapshot_bytes_cannot_exceed_queue_budget() {
        let mut queue = WriterQueue::new();
        let large = super::super::encode(Kind::Snapshot, &vec![0; 8 << 20]).unwrap();
        assert_eq!(
            queue.push_batch(vec![large.clone(), large]),
            Err(QueueError::Full)
        );
        assert_eq!(queue.pending_bytes(), 0);
        assert_eq!(queue.pop_batch(), None);
    }

    #[test]
    fn real_forty_four_car_assembly_enters_bounded_writer_queue() {
        const REAL_44: &[u8] = include_bytes!("../../../../testdata/lmu-fixture.bin");
        const CONFIG: &[u8] = include_bytes!("../../testdata/configuration-frame-go-v1.bin");
        let mut assembler = crate::assembly::Assembler::new(30, 15).unwrap();
        assembler.configure(CONFIG).unwrap();
        let frames = assembler
            .apply(REAL_44, "1.3.0.0", 100, 100, 100_000_000_000)
            .unwrap();
        let mut queue = WriterQueue::new();
        queue.push_batch(frames).unwrap();
        let delivered = queue.pop_batch().unwrap();
        assert_eq!(
            super::super::decode(&delivered[0]).unwrap().kind,
            Kind::ConfigurationAck
        );
        assert!(
            delivered
                .iter()
                .any(|frame| super::super::decode(frame).unwrap().kind == Kind::Snapshot)
        );
        assert_eq!(queue.pending_bytes(), 0);
    }
}
