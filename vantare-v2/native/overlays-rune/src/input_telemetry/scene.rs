//! Escena pura de Telemetría de entrada: muestras observadas y barras en vivo.
use crate::motion::Tween;
use std::sync::Arc;
use vantare_domain::input_telemetry::{Sample, ViewModel};

pub const WIDTH: f32 = 600.0;
pub const HEIGHT: f32 = 84.0;
/// Caja de la traza: x, y, ancho y alto. Todo se recorta y se dibuja aquí dentro.
pub const PLOT: (f32, f32, f32, f32) = (12.0, 10.0, 440.0, 64.0);
const TRANSITION: f64 = 0.080;
const LINE_TOP: f32 = 63.0;
const SPAN: f32 = 62.0;

/// Un tramo continuo de una señal, en coordenadas del recuadro de la traza.
#[derive(Clone, Debug, PartialEq)]
pub struct Segment {
    /// 0 embrague, 1 freno, 2 acelerador.
    pub signal: usize,
    pub points: Vec<[f32; 2]>,
}

impl Segment {
    /// Relleno del tramo: la línea y el cierre por el borde inferior, como GPUI.
    pub fn fill(&self) -> Vec<[f32; 2]> {
        let mut points = self.points.clone();
        points.push([self.points[self.points.len() - 1][0], PLOT.3]);
        points.push([self.points[0][0], PLOT.3]);
        points
    }
}

/// Recorre la historia observada y devuelve los tramos dibujables de cada señal.
pub fn segments(samples: &[Sample], seconds: u8, show_clutch: bool) -> Vec<Segment> {
    let Some(end) = samples.last().map(|sample| sample.at) else {
        return Vec::new();
    };
    let mut segments = Vec::new();
    for signal in 0..3 {
        if signal == 0 && !show_clutch {
            continue;
        }
        let mut points = Vec::new();
        let flush = |points: &mut Vec<[f32; 2]>, segments: &mut Vec<Segment>| {
            if points.len() >= 2 {
                segments.push(Segment {
                    signal,
                    points: std::mem::take(points),
                });
            } else {
                points.clear();
            }
        };
        for sample in samples {
            if sample.break_before || sample.break_pedals[2 - signal] {
                flush(&mut points, &mut segments);
            }
            let value = match signal {
                0 => sample.clutch,
                1 => sample.brake,
                _ => sample.throttle,
            };
            if let Some(value) = value {
                let age = end.saturating_sub(sample.at).as_secs_f32();
                let x = PLOT.2 * (1.0 - age / f32::from(seconds)).clamp(0.0, 1.0);
                let y = LINE_TOP - SPAN * value as f32 / 100.0;
                points.push([x, y]);
            } else {
                flush(&mut points, &mut segments);
            }
        }
        flush(&mut points, &mut segments);
    }
    segments
}

/// Interpolación lineal de 80 ms de las tres barras, con «reducir movimiento» fijo.
pub struct Motion {
    bars: [Tween; 3],
    shown: [bool; 3],
    reduced: bool,
}

impl Motion {
    pub fn new(reduced: bool) -> Self {
        Self {
            bars: [Tween::linear(0.0); 3],
            shown: [false; 3],
            reduced,
        }
    }
    pub fn sync(&mut self, pedals: [Option<f64>; 3], snap: bool, now: f64) {
        for (index, value) in pedals.into_iter().enumerate() {
            let Some(value) = value else {
                self.shown[index] = false;
                continue;
            };
            let target = value as f32;
            if !self.shown[index] {
                self.bars[index] = Tween::linear(0.0);
            }
            if snap || self.reduced {
                self.bars[index] = Tween::linear(target);
            } else {
                self.bars[index].retarget(target, now, TRANSITION);
            }
            self.shown[index] = true;
        }
    }
    pub fn policy(&mut self, reduced: bool) -> bool {
        let changed = self.reduced != reduced;
        if changed && reduced {
            for bar in &mut self.bars {
                bar.settle();
            }
        }
        self.reduced = reduced;
        changed
    }
    pub fn sample(&self, now: f64) -> [Option<f32>; 3] {
        std::array::from_fn(|index| self.shown[index].then(|| self.bars[index].value(now)))
    }
    pub fn next_wake(&self, now: f64) -> Option<f64> {
        if self.reduced {
            return None;
        }
        self.bars.iter().any(|bar| bar.active(now)).then_some(now)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Scene {
    pub view: Arc<ViewModel>,
    pub samples: Arc<Vec<Sample>>,
    pub segments: Arc<Vec<Segment>>,
    pub seconds: u8,
    pub show_clutch: bool,
    pub pedals: [Option<f32>; 3],
    /// Último acelerador observado, como el punto de GPUI.
    pub throttle_dot: Option<f32>,
}

/// Muestreo puro: las trazas llegan ya construidas y solo se copian.
pub fn sample(
    view: Arc<ViewModel>,
    samples: Arc<Vec<Sample>>,
    segments: Arc<Vec<Segment>>,
    motion: &Motion,
    seconds: u8,
    show_clutch: bool,
    now: f64,
) -> Scene {
    let throttle_dot = samples
        .last()
        .and_then(|sample| sample.throttle)
        .map(|value| value as f32);
    Scene {
        view,
        samples,
        segments,
        seconds,
        show_clutch,
        pedals: motion.sample(now),
        throttle_dot,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use vantare_domain::input_telemetry::Sample;

    fn sample_at(ms: u64, throttle: Option<f64>) -> Sample {
        Sample {
            at: Duration::from_millis(ms),
            throttle,
            brake: Some(50.0),
            clutch: Some(25.0),
            break_before: false,
            break_pedals: [false, false, false],
        }
    }

    #[test]
    fn every_trace_point_stays_inside_the_440_by_64_box() {
        for (seconds, values) in [
            (1, vec![0.0, 100.0, 0.0, 100.0]),
            (8, vec![1.0, 99.0, 50.0, 0.0]),
            (6, vec![0.0, 0.0, 100.0, 100.0]),
        ] {
            let samples: Vec<_> = values
                .iter()
                .enumerate()
                .map(|(index, value)| Sample {
                    at: Duration::from_millis(index as u64 * 1000),
                    ..sample_at(index as u64 * 1000, Some(*value))
                })
                .collect();
            for segment in segments(&samples, seconds, true) {
                for [x, y] in segment.fill() {
                    assert!(
                        (0.0..=PLOT.2).contains(&x) && (0.0..=PLOT.3).contains(&y),
                        "punto fuera del recuadro: {x}, {y}"
                    );
                }
            }
        }
    }

    #[test]
    fn breaks_cut_the_trace_and_single_points_are_not_drawn() {
        let mut samples = vec![sample_at(0, Some(10.0)), sample_at(100, Some(20.0))];
        samples.push(Sample {
            break_before: true,
            ..sample_at(200, Some(30.0))
        });
        samples.push(sample_at(300, Some(40.0)));
        samples.push(sample_at(400, None));
        samples.push(sample_at(500, Some(50.0)));
        let drawn = segments(&samples, 6, false);
        assert_eq!(drawn.iter().filter(|s| s.signal == 2).count(), 2);
        assert!(drawn.iter().all(|segment| segment.points.len() >= 2));
        assert!(
            drawn.iter().all(|segment| segment.signal != 0),
            "sin embrague"
        );
    }

    #[test]
    fn bars_move_linearly_for_80_ms_and_reduced_motion_snaps() {
        let mut motion = Motion::new(false);
        motion.sync([None, None, Some(100.0)], true, 0.0);
        assert_eq!(motion.sample(0.0), [None, None, Some(100.0)]);
        assert_eq!(motion.next_wake(0.0), None, "ya está en el destino");
        motion.sync([None, None, Some(0.0)], false, 1.0);
        assert_eq!(motion.next_wake(1.0), Some(1.0));
        assert_eq!(motion.sample(1.04)[2], Some(50.0));
        assert_eq!(motion.sample(1.08)[2], Some(0.0));
        assert_eq!(motion.next_wake(1.08), None);
        motion.sync([None, None, Some(80.0)], false, 2.0);
        assert!(motion.policy(true));
        assert_eq!(motion.sample(2.0)[2], Some(80.0), "estado final fijo");
        assert_eq!(motion.next_wake(2.0), None);
    }
}
