//! Source-clock freshness with the same asymmetric recovery as the Go LMU driver.

pub const STALL_LIMIT_NS: u64 = 500_000_000;
pub const RECOVERY_WINDOW_NS: u64 = 2_000_000_000;

#[derive(Default)]
pub struct FreshnessGate {
    previous_source_ns: i64,
    unchanged_since_ns: Option<u64>,
    stale: bool,
    recovering_since_ns: Option<u64>,
}

impl FreshnessGate {
    /// Elapsed time is monotonic within one source run. A reset reanchors the
    /// gate instead of inferring a stall from a negative elapsed duration.
    pub fn observe(&mut self, elapsed_ns: u64, source_ns: i64) -> bool {
        let advanced = source_ns != self.previous_source_ns;
        self.previous_source_ns = source_ns;
        let rewound = self
            .unchanged_since_ns
            .is_some_and(|previous| elapsed_ns < previous);
        if advanced || self.unchanged_since_ns.is_none() || rewound {
            self.unchanged_since_ns = Some(elapsed_ns);
        }
        if rewound {
            self.recovering_since_ns = None;
        }
        let stalled = elapsed_ns.saturating_sub(self.unchanged_since_ns.unwrap_or(elapsed_ns))
            >= STALL_LIMIT_NS;
        if !self.stale {
            self.stale = stalled;
            return self.stale;
        }
        if stalled {
            self.recovering_since_ns = None;
            return true;
        }
        if self.recovering_since_ns.is_none() {
            if !advanced {
                return true;
            }
            self.recovering_since_ns = Some(elapsed_ns);
        }
        if elapsed_ns.saturating_sub(self.recovering_since_ns.unwrap_or(elapsed_ns))
            >= RECOVERY_WINDOW_NS
        {
            self.stale = false;
            self.recovering_since_ns = None;
        }
        self.stale
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MS: u64 = 1_000_000;
    const SECOND: i64 = 1_000_000_000;

    #[test]
    fn asymmetric_stall_and_recovery_match_go_boundaries() {
        for steps in [
            &[
                (0, SECOND, false),
                (100 * MS, SECOND, false),
                (499 * MS, SECOND, false),
                (500 * MS, SECOND, true),
            ][..],
            &[
                (0, SECOND, false),
                (500 * MS, SECOND, true),
                (600 * MS, 1_200_000_000, true),
                (1_000 * MS, 1_600_000_000, true),
                (2_599 * MS, 3 * SECOND, true),
                (2_600 * MS, 3_200_000_000, false),
            ],
            &[
                (0, SECOND, false),
                (500 * MS, SECOND, true),
                (600 * MS, 1_200_000_000, true),
                (1_100 * MS, 1_200_000_000, true),
                (1_200 * MS, 1_400_000_000, true),
                (2_600 * MS, 2_800_000_000, true),
                (3_200 * MS, 3_400_000_000, false),
            ],
            &[
                (0, 4 * SECOND, false),
                (500 * MS, 4 * SECOND, true),
                (30_000 * MS, 4 * SECOND, true),
                (300_000 * MS, 4 * SECOND, true),
            ],
        ] {
            let mut gate = FreshnessGate::default();
            for (elapsed_ns, source_ns, expected) in steps {
                assert_eq!(gate.observe(*elapsed_ns, *source_ns), *expected);
            }
        }
    }

    #[test]
    fn monotonic_rewind_reanchors_stall_and_recovery() {
        let mut gate = FreshnessGate::default();
        assert!(!gate.observe(1_000 * MS, SECOND));
        assert!(gate.observe(1_500 * MS, SECOND));
        assert!(gate.observe(1_600 * MS, 1_200_000_000));
        assert!(gate.observe(100 * MS, 1_200_000_000));
        assert!(gate.observe(600 * MS, 1_200_000_000));
    }

    #[test]
    fn observed_irregular_54_car_cadence_does_not_flap() {
        let pattern = [300, 650, 420, 700, 380, 540, 310, 690];
        let mut intervals: Vec<u64> = (0..60)
            .map(|index| pattern[index % pattern.len()] * MS)
            .collect();
        intervals.extend(std::iter::repeat_n(200 * MS, 40));
        let mut gate = FreshnessGate::default();
        let mut elapsed = 0;
        let mut source = 0_i64;
        let mut index = 0;
        let mut next_update = intervals[0];
        let mut stale = gate.observe(0, source);
        let mut to_stale = 0;
        let mut to_fresh = 0;
        let total: u64 = intervals.iter().sum();
        while elapsed < total {
            elapsed += 50 * MS;
            while index < intervals.len() && elapsed >= next_update {
                source += intervals[index] as i64;
                index += 1;
                if index < intervals.len() {
                    next_update += intervals[index];
                }
            }
            let current = gate.observe(elapsed, source);
            if current && !stale {
                to_stale += 1;
            } else if !current && stale {
                to_fresh += 1;
            }
            stale = current;
        }
        assert_eq!((to_stale, to_fresh, stale), (1, 1, false));
    }
}
