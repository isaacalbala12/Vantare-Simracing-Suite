//! Bounded retention of exact Fact wire frames for lossless replay.

use std::collections::VecDeque;

use crate::core::facts::{FactCursor, FactError};

pub const MAX_DELIVERY_FACTS: usize = 64;

struct Stored {
    sequence: u64,
    frame: Vec<u8>,
}

pub struct FactDeliveryLog {
    stream: u64,
    next: u64,
    acknowledged: u64,
    retained: VecDeque<Stored>,
}

impl FactDeliveryLog {
    pub fn new(stream: u64) -> Result<Self, FactError> {
        if stream == 0 {
            return Err(FactError::InvalidConfiguration);
        }
        Ok(Self {
            stream,
            next: 1,
            acknowledged: 0,
            retained: VecDeque::with_capacity(MAX_DELIVERY_FACTS),
        })
    }

    pub fn validate_batch(&self, facts: &[(u64, Vec<u8>)]) -> Result<(), FactError> {
        if facts.len() > MAX_DELIVERY_FACTS {
            return Err(FactError::BatchTooLarge);
        }
        let count = u64::try_from(facts.len()).map_err(|_| FactError::SequenceExhausted)?;
        self.next
            .checked_add(count)
            .ok_or(FactError::SequenceExhausted)?;
        if facts
            .iter()
            .enumerate()
            .any(|(index, (sequence, _))| *sequence != self.next + index as u64)
        {
            return Err(FactError::FutureCursor);
        }
        Ok(())
    }

    pub fn commit(&mut self, facts: Vec<(u64, Vec<u8>)>) {
        // The caller validates before its canonical commit. This operation
        // allocates only within the fixed delivery window and cannot reject.
        for (sequence, frame) in facts {
            self.retained.push_back(Stored { sequence, frame });
            self.next = sequence + 1;
            if self.retained.len() > MAX_DELIVERY_FACTS {
                self.retained.pop_front();
            }
        }
    }

    /// No Engineer subscriber exists. Retire this interval and require a
    /// fresh snapshot if a former subscriber later reconnects.
    pub fn advance_suppressed(&mut self, high_water: u64) {
        self.retained.clear();
        self.acknowledged = high_water;
        self.next = high_water + 1;
    }

    pub fn acknowledge(&mut self, cursor: FactCursor) -> Result<(), FactError> {
        self.check_cursor(cursor)?;
        if cursor.sequence > self.acknowledged {
            self.acknowledged = cursor.sequence;
            while self
                .retained
                .front()
                .is_some_and(|stored| stored.sequence <= cursor.sequence)
            {
                self.retained.pop_front();
            }
        }
        Ok(())
    }

    pub fn replay_after(&self, cursor: FactCursor) -> Result<Vec<&[u8]>, FactError> {
        self.check_cursor(cursor)?;
        let first = self
            .retained
            .front()
            .map_or(self.next, |stored| stored.sequence);
        if cursor.sequence < first.saturating_sub(1) {
            return Err(FactError::ResyncRequired {
                first,
                next: self.next,
            });
        }
        Ok(self
            .retained
            .iter()
            .filter(|stored| stored.sequence > cursor.sequence)
            .map(|stored| stored.frame.as_slice())
            .collect())
    }

    fn check_cursor(&self, cursor: FactCursor) -> Result<(), FactError> {
        if cursor.stream != self.stream {
            return Err(FactError::ForeignStream);
        }
        if cursor.sequence >= self.next {
            return Err(FactError::FutureCursor);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replays_exact_frames_then_requires_resync_after_window_loss() {
        let mut log = FactDeliveryLog::new(15).unwrap();
        let first = (1, vec![1, 2, 3]);
        log.validate_batch(std::slice::from_ref(&first)).unwrap();
        log.commit(vec![first]);
        let zero = FactCursor {
            stream: 15,
            sequence: 0,
        };
        assert_eq!(log.replay_after(zero).unwrap(), vec![&[1, 2, 3][..]]);
        assert_eq!(
            log.acknowledge(FactCursor {
                stream: 16,
                sequence: 1
            }),
            Err(FactError::ForeignStream)
        );
        assert_eq!(
            log.acknowledge(FactCursor {
                stream: 15,
                sequence: 2
            }),
            Err(FactError::FutureCursor)
        );
        assert_eq!(log.replay_after(zero).unwrap().len(), 1);
        let later: Vec<_> = (2..=66)
            .map(|sequence| (sequence, vec![sequence as u8]))
            .collect();
        assert_eq!(log.validate_batch(&later), Err(FactError::BatchTooLarge));
        for entry in later {
            log.validate_batch(std::slice::from_ref(&entry)).unwrap();
            log.commit(vec![entry]);
        }
        assert_eq!(
            log.replay_after(zero),
            Err(FactError::ResyncRequired { first: 3, next: 67 })
        );
        let cursor = FactCursor {
            stream: 15,
            sequence: 65,
        };
        assert_eq!(log.replay_after(cursor).unwrap(), vec![&[66][..]]);
        log.acknowledge(cursor).unwrap();
        assert_eq!(log.replay_after(cursor).unwrap(), vec![&[66][..]]);
    }

    #[test]
    fn suppressed_interval_does_not_replay_facts_when_demand_returns() {
        let mut log = FactDeliveryLog::new(15).unwrap();
        log.advance_suppressed(2);
        let entry = (3, vec![3]);
        log.validate_batch(std::slice::from_ref(&entry)).unwrap();
        log.commit(vec![entry]);
        assert_eq!(
            log.replay_after(FactCursor {
                stream: 15,
                sequence: 0
            }),
            Err(FactError::ResyncRequired { first: 3, next: 4 })
        );
        assert_eq!(
            log.replay_after(FactCursor {
                stream: 15,
                sequence: 2
            })
            .unwrap(),
            vec![&[3][..]]
        );
    }
}
