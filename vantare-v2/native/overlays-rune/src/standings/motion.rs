//! Movimiento de Standings: FLIP al reordenar y fundido de entrada y salida,
//! con las curvas y duraciones de GPUI. Sin reloj propio: el Runtime presta el
//! instante y solo hay despertares mientras dura una transición.
use super::scene::Row;
use crate::motion::{self, Tween};
use std::collections::{BTreeMap, BTreeSet};

/// Umbral en píxeles por debajo del cual una fila no se mueve.
const MIN_FLIP_PX: f32 = 0.5;

#[derive(Clone)]
struct Channels {
    dy: Tween,
    alpha: Tween,
}
#[derive(Clone)]
struct Exit {
    row: Row,
    top: f32,
    fade: Tween,
}

/// Fila del instante: desplazamiento FLIP y opacidad.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct RowVis {
    pub dy: f32,
    pub alpha: f32,
}

impl Default for RowVis {
    fn default() -> Self {
        Self {
            dy: 0.0,
            alpha: 1.0,
        }
    }
}

/// Fila que ya no está en la tabla pero sigue fundiéndose en su última `y`.
#[derive(Clone, Debug, PartialEq)]
pub(super) struct Ghost {
    pub row: Row,
    pub top: f32,
    pub alpha: f32,
}

/// Lo que el pintor necesita del movimiento, ya muestreado en el instante.
#[derive(Clone, Debug, Default, PartialEq)]
pub(super) struct Visual {
    pub rows: BTreeMap<u32, RowVis>,
    pub ghosts: Vec<Ghost>,
}

#[derive(Clone, Default)]
pub(super) struct Motion {
    /// Última `y` de layout por coche, la referencia del FLIP.
    tops: BTreeMap<u32, f32>,
    /// Último contenido pintado, para el fantasma de una salida.
    last: BTreeMap<u32, Row>,
    rows: BTreeMap<u32, Channels>,
    exits: Vec<Exit>,
    seeded: bool,
    reduced: bool,
}

impl Motion {
    pub fn new() -> Self {
        Self::default()
    }

    /// `true` si la política cambió; con movimiento reducido se salta al destino.
    pub fn policy(&mut self, reduced: bool) -> bool {
        if self.reduced == reduced {
            return false;
        }
        self.reduced = reduced;
        if reduced {
            self.snap();
        }
        true
    }

    /// Filas visibles en orden y su `y` de layout. Sin datos nuevos no avanza.
    pub fn update(&mut self, rows: &[(&Row, f32)], clock: f64) {
        if self.reduced {
            self.tops = rows.iter().map(|(row, y)| (row.id, *y)).collect();
            self.rows = rows
                .iter()
                .map(|(row, _)| {
                    (
                        row.id,
                        Channels {
                            dy: Tween::fixed(0.0),
                            alpha: Tween::fixed(1.0),
                        },
                    )
                })
                .collect();
            self.last = rows
                .iter()
                .map(|(row, _)| (row.id, (*row).clone()))
                .collect();
            self.exits.clear();
            self.seeded = true;
            return;
        }
        let first = !self.seeded;
        self.seeded = true;
        let current: BTreeSet<u32> = rows.iter().map(|(row, _)| row.id).collect();
        // Salidas: se conserva la última fila y su y viva para fundirla.
        let gone: Vec<u32> = self
            .tops
            .keys()
            .copied()
            .filter(|id| !current.contains(id))
            .collect();
        for id in gone {
            let Some(top) = self.tops.remove(&id) else {
                continue;
            };
            let Some(channels) = self.rows.remove(&id) else {
                continue;
            };
            if let Some(row) = self.last.get(&id).cloned() {
                let top = top + channels.dy.value(clock);
                let from = channels.alpha.value(clock);
                self.exits.push(Exit {
                    row,
                    top,
                    fade: fade(from, 0.0, clock),
                });
            }
        }
        self.exits.retain(|exit| exit.fade.value(clock) > 0.0);
        for (row, y) in rows {
            let previous = self.tops.insert(row.id, *y);
            let mut resumed = None;
            if let Some(index) = self.exits.iter().position(|exit| exit.row.id == row.id) {
                resumed = Some(self.exits.remove(index).fade.value(clock));
            }
            let channels = self.rows.entry(row.id).or_insert(Channels {
                dy: Tween::fixed(0.0),
                alpha: Tween::fixed(1.0),
            });
            if first {
                channels.dy = Tween::fixed(0.0);
                channels.alpha = Tween::fixed(1.0);
            } else if previous.is_none() {
                channels.alpha = fade(resumed.unwrap_or(0.0), 1.0, clock);
            } else {
                let from = previous.unwrap_or(*y) - *y + channels.dy.value(clock);
                channels.dy = if from.abs() >= MIN_FLIP_PX {
                    let duration = motion::flip_ms(from) / 1000.0;
                    tween(from, 0.0, clock, duration, motion::FLIP)
                } else {
                    Tween::fixed(0.0)
                };
            }
            self.last.insert(row.id, (*row).clone());
        }
    }

    /// Muestreo puro del instante; retira los fantasmas que ya se apagaron.
    pub fn sample(&mut self, clock: f64) -> Visual {
        self.exits.retain(|exit| exit.fade.value(clock) > 0.0);
        Visual {
            rows: self
                .rows
                .iter()
                .filter(|(id, _)| self.tops.contains_key(id))
                .map(|(id, channels)| {
                    (
                        *id,
                        RowVis {
                            dy: channels.dy.value(clock),
                            alpha: channels.alpha.value(clock),
                        },
                    )
                })
                .collect(),
            ghosts: self
                .exits
                .iter()
                .map(|exit| Ghost {
                    row: exit.row.clone(),
                    top: exit.top,
                    alpha: exit.fade.value(clock),
                })
                .collect(),
        }
    }

    /// Instante del próximo frame; `None` en reposo, sin reloj que mantener.
    pub fn next_wake(&self, clock: f64) -> Option<f64> {
        if self.reduced {
            return None;
        }
        let moving = self
            .rows
            .values()
            .any(|channels| channels.dy.active(clock) || channels.alpha.active(clock))
            || self.exits.iter().any(|exit| exit.fade.active(clock));
        moving.then_some(clock)
    }

    /// Con movimiento reducido las filas saltan: ni desplazamiento ni fundido.
    fn snap(&mut self) {
        for channels in self.rows.values_mut() {
            channels.dy = Tween::fixed(0.0);
            channels.alpha = Tween::fixed(1.0);
        }
        self.exits.clear();
    }
}

fn tween(from: f32, to: f32, clock: f64, duration: f64, curve: [f32; 4]) -> Tween {
    let mut tween = Tween::fixed(from).with_curve(curve);
    tween.retarget(to, clock, duration);
    tween
}

fn fade(from: f32, to: f32, clock: f64) -> Tween {
    tween(
        from,
        to,
        clock,
        motion::FADE_MS as f64 / 1000.0,
        motion::EASE_OUT,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::Easing;

    fn row(id: u32) -> Row {
        Row {
            id,
            player: false,
            class: "hypercar".into(),
            cells: Vec::new(),
        }
    }

    fn rows(order: &[(u32, f32)]) -> Vec<(Row, f32)> {
        order.iter().map(|(id, y)| (row(*id), *y)).collect()
    }

    fn update(motion: &mut Motion, order: &[(u32, f32)], clock: f64) {
        let list = rows(order);
        let borrowed: Vec<(&Row, f32)> = list.iter().map(|(row, y)| (row, *y)).collect();
        motion.update(&borrowed, clock);
    }

    #[test]
    fn a_reorder_flips_from_the_previous_row_and_rests_at_zero() {
        let mut motion = Motion::new();
        update(&mut motion, &[(1, 0.0), (2, 30.0)], 0.0);
        assert_eq!(motion.next_wake(0.0), None, "la primera foto no anima");
        // El coche 2 sube al primer puesto: parte de su y anterior (30 px).
        update(&mut motion, &[(2, 0.0), (1, 30.0)], 1.0);
        let start = motion.sample(1.0);
        assert_eq!(start.rows[&2].dy, 30.0);
        assert_eq!(start.rows[&1].dy, -30.0);
        assert!(motion.next_wake(1.0).is_some(), "mientras dura, hay reloj");
        let duration = motion::flip_ms(30.0) / 1000.0;
        // A mitad de tiempo ya recorrió más de la mitad, como en GPUI.
        let half = motion.sample(1.0 + duration / 2.0);
        assert!(half.rows[&2].dy > 0.0 && half.rows[&2].dy < 15.0);
        let expected = 30.0
            * (1.0
                - Easing::cubic(
                    motion::FLIP[0],
                    motion::FLIP[1],
                    motion::FLIP[2],
                    motion::FLIP[3],
                )
                .eval(0.5));
        assert!((half.rows[&2].dy - expected).abs() < 1e-3);
        let end = motion.sample(1.0 + duration + 0.01);
        assert!(end.rows[&2].dy.abs() < 1e-3);
        assert!(end.rows[&1].dy.abs() < 1e-3);
        assert_eq!(
            motion.next_wake(1.0 + duration + 0.01),
            None,
            "cero despertares al acabar"
        );
    }

    #[test]
    fn an_exit_keeps_its_last_row_and_fades_out_while_an_entry_fades_in() {
        let mut motion = Motion::new();
        update(&mut motion, &[(1, 0.0), (2, 30.0)], 0.0);
        // El coche 2 sale de la ventana y el 3 entra.
        update(&mut motion, &[(1, 0.0), (3, 30.0)], 1.0);
        let start = motion.sample(1.0);
        assert_eq!(start.ghosts.len(), 1);
        assert_eq!(start.ghosts[0].row.id, 2);
        assert_eq!(start.ghosts[0].top, 30.0);
        assert_eq!(start.ghosts[0].alpha, 1.0);
        assert_eq!(start.rows[&3].alpha, 0.0, "la fila nueva empieza invisible");
        let quarter = motion.sample(1.0 + motion::FADE_MS as f64 / 4000.0);
        let eased = Easing::cubic(
            motion::EASE_OUT[0],
            motion::EASE_OUT[1],
            motion::EASE_OUT[2],
            motion::EASE_OUT[3],
        )
        .eval(0.25);
        assert!((quarter.ghosts[0].alpha - (1.0 - eased)).abs() < 1e-4);
        assert!(quarter.rows[&3].alpha > 0.0 && quarter.rows[&3].alpha < 1.0);
        let end_time = 1.0 + motion::FADE_MS as f64 / 1000.0 + 0.01;
        let end = motion.sample(end_time);
        assert!(end.ghosts.is_empty(), "el fantasma se retira al apagarse");
        assert!((end.rows[&3].alpha - 1.0).abs() < 1e-6);
        assert_eq!(motion.next_wake(end_time), None);
    }

    #[test]
    fn reduced_motion_jumps_without_any_clock() {
        let mut motion = Motion::new();
        update(&mut motion, &[(1, 0.0), (2, 30.0)], 0.0);
        assert!(motion.policy(true));
        update(&mut motion, &[(2, 0.0), (1, 30.0)], 0.1);
        let visual = motion.sample(0.1);
        assert_eq!(visual.rows[&2].dy, 0.0, "salta al destino");
        assert_eq!(visual.rows[&2].alpha, 1.0);
        assert_eq!(
            motion.next_wake(0.1),
            None,
            "sin reloj con movimiento reducido"
        );
        // Una entrada tampoco funde.
        update(&mut motion, &[(2, 0.0), (1, 30.0), (3, 60.0)], 0.2);
        assert_eq!(motion.sample(0.2).rows[&3].alpha, 1.0);
        assert_eq!(motion.next_wake(0.2), None);
        assert!(
            motion.policy(false),
            "volver a movimiento completo no anima solo"
        );
        assert!(!motion.policy(false));
    }
}
