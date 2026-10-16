//! Frescura por el reloj del simulador, no por la frecuencia de lectura: el
//! bloque caduca si su reloj no avanza durante 500 ms. Tras caducar exige dos
//! avances separados por menos de 500 ms: un tick aislado no prueba reanudación.
//! No vuelve a exigir 2 s continuos, que bloqueaban la recuperación en Imola.

use std::time::Duration;

pub(super) const STALL_LIMIT: Duration = Duration::from_millis(500);

#[derive(Default)]
pub(super) struct Gate {
    previous_source: Option<Duration>,
    unchanged_since: Option<Duration>,
    stale: bool,
    recovery_advance: bool,
}

impl Gate {
    /// Caducado en `now` aunque nadie haya observado desde entonces.
    #[cfg(any(windows, test))]
    pub(super) fn is_stale_at(&self, now: Duration) -> bool {
        self.stale || self.is_stalled_at(now)
    }

    /// Tiempo sin avance del productor, independientemente del ritmo de lectura.
    pub(super) fn is_stalled_at(&self, now: Duration) -> bool {
        self.unchanged_since
            .is_some_and(|since| now.saturating_sub(since) >= STALL_LIMIT)
    }

    /// `now` es monotónico dentro de una ejecución; si retrocede (otro origen
    /// de reloj) se reancla en lugar de deducir un cuelgue de una duración
    /// negativa. `source` ausente cuenta como reloj sin avance.
    pub(super) fn observe(&mut self, now: Duration, source: Option<Duration>) -> bool {
        let advanced = source.is_some() && source != self.previous_source;
        if source.is_some() {
            self.previous_source = source;
        } else {
            self.recovery_advance = false;
        }
        self.observe_change(now, advanced)
    }

    /// Cuando el corpus borró el reloj de un bloque, solo podemos observar
    /// cambios de contenido. Una señal constante no demuestra avance.
    pub(super) fn observe_change(&mut self, now: Duration, advanced: bool) -> bool {
        let rewound = self.unchanged_since.is_some_and(|since| now < since);
        if self.is_stalled_at(now) {
            self.stale = true;
            self.recovery_advance = false;
        }
        if rewound {
            self.recovery_advance = false;
        }
        if advanced || self.unchanged_since.is_none() || rewound {
            self.unchanged_since = Some(now);
        }
        let stalled = now.saturating_sub(self.unchanged_since.unwrap_or(now)) >= STALL_LIMIT;
        if advanced {
            if self.stale {
                if self.recovery_advance {
                    self.stale = false;
                    self.recovery_advance = false;
                } else {
                    self.recovery_advance = true;
                }
            }
        } else if stalled {
            self.stale = true;
        }
        self.stale
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const fn ms(value: u64) -> Duration {
        Duration::from_millis(value)
    }

    #[test]
    fn stall_boundaries_and_recovery_on_new_producer_data() {
        // (ahora, reloj del simulador, caducado esperado), en ms.
        for steps in [
            &[
                (0, 1000, false),
                (100, 1000, false),
                (499, 1000, false),
                (500, 1000, true),
            ][..],
            &[
                (0, 1000, false),
                (500, 1000, true),
                (600, 1200, true),
                (1000, 1600, false),
                (2599, 3000, true),
                (2600, 3200, false),
            ],
            &[
                (0, 1000, false),
                (500, 1000, true),
                (600, 1200, true),
                (1100, 1200, true),
                (1200, 1400, true),
                (1300, 1500, false),
                (2600, 2800, true),
                (2700, 2900, false),
                (3200, 3400, true),
            ],
            &[
                (0, 4000, false),
                (500, 4000, true),
                (30_000, 4000, true),
                (300_000, 4000, true),
            ],
        ] {
            let mut gate = Gate::default();
            for (now, source, expected) in steps {
                assert_eq!(gate.observe(ms(*now), Some(ms(*source))), *expected);
            }
        }
    }

    #[test]
    fn a_rewinding_clock_reanchors_the_stall() {
        let mut gate = Gate::default();
        assert!(!gate.observe(ms(1000), Some(ms(1000))));
        assert!(gate.observe(ms(1500), Some(ms(1000))));
        assert!(gate.observe(ms(1600), Some(ms(1200))));
        assert!(gate.observe(ms(100), Some(ms(1200))));
        assert!(gate.observe(ms(200), Some(ms(1300))));
        assert!(!gate.observe(ms(300), Some(ms(1400))));
        assert!(gate.observe(ms(800), Some(ms(1400))));
    }

    #[test]
    fn staleness_is_visible_before_the_next_observation() {
        let mut gate = Gate::default();
        assert!(!gate.is_stale_at(ms(0)));
        assert!(!gate.observe(ms(100), Some(ms(1000))));
        assert!(!gate.is_stale_at(ms(599)));
        assert!(gate.is_stale_at(ms(600)));
    }

    #[test]
    fn an_absent_source_clock_counts_as_no_progress() {
        let mut gate = Gate::default();
        assert!(!gate.observe(ms(0), Some(ms(1000))));
        assert!(!gate.observe(ms(400), None));
        assert!(gate.observe(ms(500), None));
    }

    #[test]
    fn isolated_ticks_never_recover_a_frozen_source() {
        let mut gate = Gate::default();
        assert!(!gate.observe(ms(0), Some(ms(1000))));
        assert!(gate.observe(ms(500), Some(ms(1000))));
        for now in [600, 1600, 2600] {
            assert!(gate.observe(ms(now), Some(ms(now + 1000))));
            assert!(gate.observe(ms(now + 499), Some(ms(now + 1000))));
            assert!(gate.observe(ms(now + 500), Some(ms(now + 1000))));
        }
    }

    #[test]
    fn two_producer_advances_recover_despite_duplicate_reads_between_them() {
        for delay in [17, 200, 499, 500] {
            let mut gate = Gate::default();
            assert!(!gate.observe(ms(0), Some(ms(1000))));
            assert!(gate.observe(ms(500), Some(ms(1000))));
            assert!(gate.observe(ms(600), Some(ms(1100))));
            assert!(gate.is_stale_at(ms(600)));
            assert!(gate.observe(ms(601), Some(ms(1100))));
            assert_eq!(gate.observe(ms(600 + delay), Some(ms(1200))), delay == 500);
        }
    }

    #[test]
    fn a_missing_clock_interrupts_recovery_evidence() {
        let mut gate = Gate::default();
        assert!(!gate.observe(ms(0), Some(ms(1000))));
        assert!(gate.observe(ms(500), Some(ms(1000))));
        assert!(gate.observe(ms(600), Some(ms(1100))));
        assert!(gate.observe(ms(700), None));
        assert!(gate.observe(ms(800), Some(ms(1200))));
        assert!(!gate.observe(ms(900), Some(ms(1300))));
    }

    #[test]
    fn intermittent_source_gaps_do_not_latch_stale_after_resuming() {
        let pattern = [300, 650, 420, 700, 380, 540, 310, 690];
        let mut intervals: Vec<u64> = (0..60)
            .map(|index| pattern[index % pattern.len()])
            .collect();
        intervals.extend(std::iter::repeat_n(200, 40));
        let total: u64 = intervals.iter().sum();
        let mut gate = Gate::default();
        let (mut now, mut source, mut index, mut next_update) = (0, 0, 0, intervals[0]);
        let mut stale = gate.observe(ms(0), Some(ms(0)));
        let (mut to_stale, mut to_fresh) = (0, 0);
        while now < total {
            now += 50;
            while index < intervals.len() && now >= next_update {
                source += intervals[index];
                index += 1;
                if index < intervals.len() {
                    next_update += intervals[index];
                }
            }
            let current = gate.observe(ms(now), Some(ms(source)));
            to_stale += u32::from(current && !stale);
            to_fresh += u32::from(!current && stale);
            stale = current;
        }
        // Each actual interruption is visible; it cannot poison later data.
        assert!(to_stale > 1);
        assert_eq!(to_stale, to_fresh);
        assert!(!stale);
    }
}
