//! Diferencias de poses originales con reloj de vuelta de la misma fuente.
use std::time::Duration;

use vantare_domain::Quality;

pub(super) const TTL: Duration = Duration::from_millis(300);
const NOISE_M: f64 = 0.05;
const MAX_SPEED_MPS: f64 = 110.0;
const MAX_ACCEL_MPS2: f64 = 40.0;
const FILTER_S: f64 = 0.1;

#[derive(Clone, Copy)]
pub(super) struct Sample {
    pub(super) position: [f64; 2],
    pub(super) clock: f64,
    // Vuelta y piloto (UDP) o vuelta y carID (graphics). Cambiar corta la serie.
    pub(super) identity: (u32, u32),
    pub(super) at: Duration,
}

#[derive(Clone, Copy, Default)]
pub(super) struct Velocity {
    previous: Option<Sample>,
    raw: Option<[f64; 2]>,
    filtered: Option<([f64; 2], Duration)>,
}

impl Velocity {
    pub(super) fn update(&mut self, sample: Option<Sample>) {
        let sample = sample.filter(|s| {
            s.clock.is_finite() && s.clock >= 0.0 && s.position.iter().all(|v| v.is_finite())
        });
        let previous = self.previous;
        if let (Some(s), Some(p)) = (sample, previous)
            && s.identity == p.identity
            && s.at >= p.at
            && s.at.saturating_sub(p.at) < TTL
        {
            let dt = s.clock - p.clock;
            if (dt == 0.0 && s.position.map(f64::to_bits) == p.position.map(f64::to_bits))
                || (dt > 0.0
                    && dt < 0.05
                    && (s.position[0] - p.position[0]).hypot(s.position[1] - p.position[1])
                        <= MAX_SPEED_MPS * dt + NOISE_M)
            {
                // Duplicados no refrescan. Graphics rápida acumula 50 ms de
                // fuente para no amplificar ruido con diferencias diminutas.
                return;
            }
        }
        self.previous = sample;
        let Some(raw) = sample.zip(previous).and_then(|(s, p)| {
            let dt = s.clock - p.clock;
            if s.identity != p.identity
                || !(0.05..=0.3).contains(&dt)
                || s.at < p.at
                || s.at.saturating_sub(p.at) >= TTL
            {
                return None;
            }
            let dx = s.position[0] - p.position[0];
            let dy = s.position[1] - p.position[1];
            let raw = if dx.hypot(dy) <= NOISE_M {
                [0.0; 2]
            } else {
                [dx / dt, dy / dt]
            };
            if raw[0].hypot(raw[1]) > MAX_SPEED_MPS
                || self.raw.is_some_and(|old| {
                    (raw[0] - old[0]).hypot(raw[1] - old[1])
                        > MAX_ACCEL_MPS2 * dt + 4.0 * NOISE_M / dt
                })
            {
                return None; // Teletransporte o salto incompatible con conducción.
            }
            Some((raw, dt, s.at))
        }) else {
            self.raw = None;
            self.filtered = None;
            return;
        };
        let (raw, dt, at) = raw;
        // Tres poses y dos velocidades compatibles antes de habilitar Spotter.
        if let Some(previous) = self.raw {
            let old = self.filtered.map_or(previous, |(v, _)| v);
            let alpha = dt / (FILTER_S + dt);
            self.filtered = Some((
                [
                    old[0] + alpha * (raw[0] - old[0]),
                    old[1] + alpha * (raw[1] - old[1]),
                ],
                at,
            ));
        }
        self.raw = Some(raw);
    }

    pub(super) fn quality(&self, now: Duration) -> Quality<[f64; 2]> {
        match self.filtered {
            Some((v, at)) if now >= at && now.saturating_sub(at) < TTL => Quality::Estimated(v),
            Some((v, _)) => Quality::Stale(v),
            None => Quality::Unavailable,
        }
    }
}
