//! Bounded, ordered fact history with explicit resync on lost ranges.

use std::collections::VecDeque;

pub const MAX_RETAINED_FACTS: usize = 256;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct FactCursor {
    pub stream: u64,
    pub sequence: u64,
}

#[derive(Debug)]
pub struct Fact<T> {
    pub cursor: FactCursor,
    pub value: T,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FactError {
    InvalidConfiguration,
    BatchTooLarge,
    SequenceExhausted,
    ForeignStream,
    FutureCursor,
    ResyncRequired { first: u64, next: u64 },
}

pub struct FactLog<T> {
    stream: u64,
    capacity: usize,
    next: u64,
    acknowledged: u64,
    retained: VecDeque<Fact<T>>,
}

impl<T> FactLog<T> {
    pub fn new(stream: u64, capacity: usize) -> Result<Self, FactError> {
        if stream == 0 || capacity == 0 || capacity > MAX_RETAINED_FACTS {
            return Err(FactError::InvalidConfiguration);
        }
        Ok(Self {
            stream,
            capacity,
            next: 1,
            acknowledged: 0,
            retained: VecDeque::with_capacity(capacity),
        })
    }

    pub fn append_batch(&mut self, values: Vec<T>) -> Result<Option<FactCursor>, FactError> {
        self.can_append(values.len())?;
        let count = u64::try_from(values.len()).map_err(|_| FactError::SequenceExhausted)?;
        let end = self
            .next
            .checked_add(count)
            .ok_or(FactError::SequenceExhausted)?;
        if count == 0 {
            return Ok(None);
        }
        let first = self.next;
        for (offset, value) in values.into_iter().enumerate() {
            self.retained.push_back(Fact {
                cursor: FactCursor {
                    stream: self.stream,
                    sequence: first + offset as u64,
                },
                value,
            });
        }
        self.next = end;
        while self.retained.len() > self.capacity {
            self.retained.pop_front();
        }
        Ok(Some(FactCursor {
            stream: self.stream,
            sequence: end - 1,
        }))
    }

    pub fn can_append(&self, count: usize) -> Result<(), FactError> {
        if count > self.capacity {
            return Err(FactError::BatchTooLarge);
        }
        let count = u64::try_from(count).map_err(|_| FactError::SequenceExhausted)?;
        self.next
            .checked_add(count)
            .ok_or(FactError::SequenceExhausted)?;
        Ok(())
    }

    /// A zero sequence starts a fresh subscription; older gaps require resync.
    pub fn after(&self, cursor: FactCursor) -> Result<Vec<&Fact<T>>, FactError> {
        if cursor.stream != self.stream {
            return Err(FactError::ForeignStream);
        }
        if cursor.sequence >= self.next {
            return Err(FactError::FutureCursor);
        }
        let first = self
            .retained
            .front()
            .map_or(self.next, |fact| fact.cursor.sequence);
        if cursor.sequence < first.saturating_sub(1) {
            return Err(FactError::ResyncRequired {
                first,
                next: self.next,
            });
        }
        Ok(self
            .retained
            .iter()
            .filter(|fact| fact.cursor.sequence > cursor.sequence)
            .collect())
    }

    pub fn high_water(&self) -> FactCursor {
        FactCursor {
            stream: self.stream,
            sequence: self.next - 1,
        }
    }

    /// The receiver acknowledges only after retaining the fact. A
    /// duplicate or older ACK is harmless; a foreign or future one is not.
    pub fn acknowledge(&mut self, cursor: FactCursor) -> Result<FactCursor, FactError> {
        if cursor.stream != self.stream {
            return Err(FactError::ForeignStream);
        }
        if cursor.sequence >= self.next {
            return Err(FactError::FutureCursor);
        }
        if cursor.sequence > self.acknowledged {
            self.acknowledged = cursor.sequence;
            while self
                .retained
                .front()
                .is_some_and(|fact| fact.cursor.sequence <= cursor.sequence)
            {
                self.retained.pop_front();
            }
        }
        Ok(FactCursor {
            stream: self.stream,
            sequence: self.acknowledged,
        })
    }

    pub fn acknowledged(&self) -> FactCursor {
        FactCursor {
            stream: self.stream,
            sequence: self.acknowledged,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ordered_replay_and_explicit_gap() {
        let mut log = FactLog::new(7, 2).unwrap();
        let zero = FactCursor {
            stream: 7,
            sequence: 0,
        };
        assert_eq!(
            log.append_batch(vec!["a", "b"]).unwrap(),
            Some(FactCursor {
                stream: 7,
                sequence: 2
            })
        );
        assert_eq!(
            log.after(zero)
                .unwrap()
                .iter()
                .map(|fact| fact.value)
                .collect::<Vec<_>>(),
            vec!["a", "b"]
        );
        log.append_batch(vec!["c"]).unwrap();
        assert_eq!(
            log.after(zero).unwrap_err(),
            FactError::ResyncRequired { first: 2, next: 4 }
        );
        let replay = log
            .after(FactCursor {
                stream: 7,
                sequence: 1,
            })
            .unwrap();
        assert_eq!(
            replay.iter().map(|fact| fact.value).collect::<Vec<_>>(),
            vec!["b", "c"]
        );
        assert_eq!(log.high_water().sequence, 3);
    }

    #[test]
    fn rejection_never_advances_sequence() {
        assert!(matches!(
            FactLog::<i32>::new(7, MAX_RETAINED_FACTS + 1),
            Err(FactError::InvalidConfiguration)
        ));
        let mut log = FactLog::new(7, 2).unwrap();
        assert_eq!(
            log.append_batch(vec![1, 2, 3]),
            Err(FactError::BatchTooLarge)
        );
        assert_eq!(log.high_water().sequence, 0);
        assert_eq!(log.append_batch(Vec::<i32>::new()), Ok(None));
        assert_eq!(log.high_water().sequence, 0);
        assert_eq!(
            log.after(FactCursor {
                stream: 8,
                sequence: 0
            })
            .unwrap_err(),
            FactError::ForeignStream
        );
        assert_eq!(
            log.after(FactCursor {
                stream: 7,
                sequence: 1
            })
            .unwrap_err(),
            FactError::FutureCursor
        );
    }

    #[test]
    fn ack_prunes_only_confirmed_facts_and_rejects_wrong_cursors() {
        let mut log = FactLog::new(9, 3).unwrap();
        log.append_batch(vec!["a", "b", "c"]).unwrap();
        assert_eq!(
            log.acknowledge(FactCursor {
                stream: 10,
                sequence: 2
            }),
            Err(FactError::ForeignStream)
        );
        assert_eq!(
            log.acknowledge(FactCursor {
                stream: 9,
                sequence: 4
            }),
            Err(FactError::FutureCursor)
        );
        assert_eq!(log.acknowledged().sequence, 0);
        let ack = log
            .acknowledge(FactCursor {
                stream: 9,
                sequence: 2,
            })
            .unwrap();
        assert_eq!(ack.sequence, 2);
        assert_eq!(
            log.after(ack)
                .unwrap()
                .iter()
                .map(|fact| fact.value)
                .collect::<Vec<_>>(),
            vec!["c"]
        );
        assert_eq!(
            log.acknowledge(FactCursor {
                stream: 9,
                sequence: 1
            })
            .unwrap(),
            ack
        );
        assert_eq!(
            log.after(FactCursor {
                stream: 9,
                sequence: 0
            })
            .unwrap_err(),
            FactError::ResyncRequired { first: 3, next: 4 }
        );
    }
}
