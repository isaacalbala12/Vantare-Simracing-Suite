//! ViewModels sobre la API nativa de series. No porta generadores demo,
//! tercios ficticios, escalas de referencia ni explicaciones causales inventadas.
use super::model::{Charts, Lap, Point, Sample, project_laps};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tone {
    Loss,
    Gain,
    Flat,
}
pub fn tone(delta: f64) -> Tone {
    if delta > 0.04 {
        Tone::Loss
    } else if delta < -0.02 {
        Tone::Gain
    } else {
        Tone::Flat
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Readout {
    pub distance_m: Option<f64>,
    pub elapsed_s: Option<f64>,
    pub speed_kmh: Option<f64>,
    pub throttle_percent: Option<f64>,
    pub brake_percent: Option<f64>,
}
fn finite(value: Option<f64>) -> Option<f64> {
    value.filter(|v| v.is_finite())
}
fn readout(sample: Sample) -> Readout {
    Readout {
        distance_m: finite(sample.distance),
        elapsed_s: finite(sample.elapsed),
        speed_kmh: finite(sample.speed).filter(|v| *v >= 0.0).map(|v| v * 3.6),
        throttle_percent: finite(sample.throttle)
            .filter(|v| (0.0..=1.0).contains(v))
            .map(|v| v * 100.0),
        brake_percent: finite(sample.brake)
            .filter(|v| (0.0..=1.0).contains(v))
            .map(|v| v * 100.0),
    }
}

/// Cursor sobre el dominio observado. Selecciona la muestra previa, como el
/// frontend; no atraviesa huecos ni extrapola velocidad hacia datos ausentes.
pub fn readout_at(samples: &[Option<Sample>], cursor: f64) -> Result<Readout, String> {
    if !cursor.is_finite() {
        return Err("cursor no finito".into());
    }
    let range = samples
        .iter()
        .filter_map(|s| s.and_then(|s| finite(s.distance)))
        .fold(None, |range, d| {
            Some(range.map_or((d, d), |(min, max): (f64, f64)| (min.min(d), max.max(d))))
        });
    let Some((min, max)) = range else {
        return Ok(Readout::default());
    };
    let distance = min + (max - min) * cursor.clamp(0.0, 1.0);
    for (index, sample) in samples.iter().enumerate() {
        let Some(sample) = sample else {
            continue;
        };
        let Some(at) = finite(sample.distance) else {
            continue;
        };
        if at.total_cmp(&distance).is_eq() {
            return Ok(readout(*sample));
        }
        let next = samples
            .get(index + 1)
            .and_then(|s| *s)
            .and_then(|s| finite(s.distance));
        if next.is_some_and(|next| at < distance && distance < next) {
            return Ok(Readout {
                distance_m: Some(distance),
                ..readout(*sample)
            });
        }
    }
    Ok(Readout {
        distance_m: Some(distance),
        ..Readout::default()
    })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct SessionKey {
    pub epoch: u64,
    pub session: u64,
    pub car: u32,
}
impl From<&Lap> for SessionKey {
    fn from(lap: &Lap) -> Self {
        Self {
            epoch: lap.epoch,
            session: lap.session,
            car: lap.car,
        }
    }
}
pub struct SessionReadout {
    pub key: SessionKey,
    pub laps: usize,
    pub sealed_laps: usize,
    pub gap_laps: usize,
    pub samples: u64,
}
pub fn session_readouts(laps: &[Lap]) -> Vec<SessionReadout> {
    let mut sessions = BTreeMap::new();
    for lap in laps {
        let key = SessionKey::from(lap);
        let row = sessions.entry(key).or_insert(SessionReadout {
            key,
            laps: 0,
            sealed_laps: 0,
            gap_laps: 0,
            samples: 0,
        });
        row.laps += 1;
        row.sealed_laps += usize::from(lap.sealed);
        row.gap_laps += usize::from(lap.gap);
        row.samples += u64::from(lap.samples);
    }
    sessions.into_values().collect()
}

pub struct LapReadout {
    pub key: SessionKey,
    pub lap: u32,
    pub sealed: bool,
    pub gap: bool,
    pub samples: u32,
    /// Ventana observada; nunca se rotula como duración total o mejor vuelta.
    pub observed_span_s: Option<f64>,
    pub speed_mean_kmh: Option<f64>,
}
pub fn lap_readout(lap: &Lap) -> LapReadout {
    LapReadout {
        key: SessionKey::from(lap),
        lap: lap.lap,
        sealed: lap.sealed,
        gap: lap.gap,
        samples: lap.samples,
        observed_span_s: finite(lap.observed_span_s).filter(|v| *v >= 0.0),
        speed_mean_kmh: finite(lap.speed.mean)
            .filter(|v| *v >= 0.0)
            .map(|v| v * 3.6),
    }
}

/// Límites reales proporcionados por el circuito/API; no presupone tres sectores.
#[derive(Clone, Debug)]
pub struct Sector {
    pub id: String,
    pub from_m: f64,
    pub to_m: f64,
}
pub struct SectorDelta {
    pub sector: Sector,
    pub delta_s: Option<f64>,
    pub tone: Option<Tone>,
}
pub struct Insight {
    pub sector_id: String,
    pub from_m: f64,
    pub to_m: f64,
    pub delta_s: f64,
    pub tone: Tone,
}

fn delta_at(points: &[Point], distance: f64) -> Option<(f64, usize)> {
    if let Some(point) = points
        .iter()
        .find(|p| p.distance.total_cmp(&distance).is_eq() && p.value.is_finite())
    {
        return Some((point.value, point.segment));
    }
    points.windows(2).find_map(|pair| {
        let [left, right] = pair else {
            return None;
        };
        if !(left.segment == right.segment
            && left.value.is_finite()
            && right.value.is_finite()
            && left.distance < distance
            && distance < right.distance)
        {
            return None;
        }
        Some((
            left.value
                + (right.value - left.value) * (distance - left.distance)
                    / (right.distance - left.distance),
            left.segment,
        ))
    })
}

pub struct Comparison {
    pub selected: LapReadout,
    pub reference: LapReadout,
    pub charts: Charts,
    pub sectors: Vec<SectorDelta>,
    pub insights: Vec<Insight>,
}
pub fn compare(
    a: &Lap,
    b: &Lap,
    samples_a: &[Option<Sample>],
    samples_b: &[Option<Sample>],
    sectors: &[Sector],
) -> Result<Comparison, String> {
    if sectors.iter().any(|s| {
        s.id.trim().is_empty() || !s.from_m.is_finite() || !s.to_m.is_finite() || s.from_m >= s.to_m
    }) || sectors.windows(2).any(|pair| pair[0].to_m > pair[1].from_m)
        || sectors
            .iter()
            .enumerate()
            .any(|(i, s)| sectors[..i].iter().any(|previous| previous.id == s.id))
    {
        return Err("sectores inválidos, duplicados, desordenados o solapados".into());
    }
    let charts = project_laps(a, b, samples_a, samples_b)?;
    // La evaluación usa la proyección sin submuestreo para no perder un hueco
    // interior; no cambia la API ni los gráficos acotados del renderer.
    let delta = super::model::project_delta(samples_a, samples_b, !a.gap && !b.gap);
    let sectors: Vec<_> = sectors
        .iter()
        .map(|sector| {
            let delta_s = delta_at(&delta, sector.from_m)
                .zip(delta_at(&delta, sector.to_m))
                .filter(|(from, to)| from.1 == to.1)
                .map(|(from, to)| to.0 - from.0)
                .filter(|v| v.is_finite());
            SectorDelta {
                sector: sector.clone(),
                delta_s,
                tone: delta_s.map(tone),
            }
        })
        .collect();
    let mut insights: Vec<_> = sectors
        .iter()
        .filter_map(|s| {
            s.delta_s.map(|delta_s| Insight {
                sector_id: s.sector.id.clone(),
                from_m: s.sector.from_m,
                to_m: s.sector.to_m,
                delta_s,
                tone: tone(delta_s),
            })
        })
        .collect();
    insights.sort_by(|a, b| b.delta_s.total_cmp(&a.delta_s));
    Ok(Comparison {
        selected: lap_readout(a),
        reference: lap_readout(b),
        charts,
        sectors,
        insights,
    })
}

#[cfg(test)]
mod tests;
