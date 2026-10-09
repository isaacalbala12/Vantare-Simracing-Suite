//! Eficiencia: presentación y movimiento sobre el Board común; sin Snapshot ni I/O.
use super::model::{Config, Metric, Plan, Status, Vm};
use super::motion::{Motion, Wake};
use super::{Settings, model, style, view};
use crate::app::Paint;
use std::{sync::Arc, time::Instant};
use vantare_domain::{format::Preferences, standings};
pub(crate) struct Visual {
    pub(super) config: Arc<Config>,
    pub(super) settings: Settings,
    pub(super) vm: Arc<Vm>,
    pub(super) plan: Arc<Plan>,
}

impl Visual {
    pub(crate) fn new(settings: &Settings, _prefs: Preferences) -> Self {
        let mut config = settings.normalized().config();
        // Signature reserva la capacidad completa aunque haya menos coches.
        config.fit(config.row_count);
        let vm = Vm::unavailable(Status::Disconnected);
        let plan = model::plan(&config, &vm);
        Self {
            config: Arc::new(config),
            settings: settings.normalized(),
            vm: Arc::new(vm),
            plan: Arc::new(plan),
        }
    }

    pub(crate) fn ingest(
        &mut self,
        domain: &standings::Board,
        prefs: Preferences,
        epoch: u64,
        session: u64,
        sequence: u64,
        motion: &mut Motion,
    ) -> bool {
        let config = Arc::make_mut(&mut self.config);
        let identity = format!("{session}:{epoch}");
        let mut next = Vm::from_domain(domain, prefs, 104, identity, sequence);
        if self.settings.player_window {
            let count = next.rows.len();
            let around = self.settings.window_around;
            let index = next.rows.iter().position(|row| row.is_player).unwrap_or(0);
            let fixed = count.min(3);
            let mut start = fixed.max(index.saturating_sub(around / 2));
            let end = (start + around + 1).min(count);
            start = fixed.max(end.saturating_sub(around + 1));
            next.rows = next
                .rows
                .into_iter()
                .enumerate()
                .filter_map(|(i, row)| {
                    (if index < fixed {
                        i < fixed + around
                    } else {
                        i < fixed || (start..end).contains(&i)
                    })
                    .then_some(row)
                })
                .collect();
        } else {
            next.rows.truncate(config.row_count);
        }
        if config.show_session_footer {
            next.footer_cells.clone_from(&domain.footer_cells);
        }
        if config.multiclass {
            let mut classes = Vec::<String>::new();
            for row in &next.rows {
                if !row.vehicle_class.is_empty() && !classes.contains(&row.vehicle_class) {
                    classes.push(row.vehicle_class.clone());
                }
            }
            next.rows.sort_by_key(|row| {
                classes
                    .iter()
                    .position(|class| class == &row.vehicle_class)
                    .unwrap_or(usize::MAX)
            });
            for row in &mut next.rows {
                if let Some(car) = domain
                    .groups
                    .iter()
                    .flat_map(|g| &g.rows)
                    .find(|c| c.id.0.to_string() == row.id)
                {
                    row.position = car.class_position.map_or(row.position, i64::from);
                }
            }
        }
        if let Some(columns) = &self.settings.columns {
            for row in &mut next.rows {
                let Some(car) = domain
                    .groups
                    .iter()
                    .flat_map(|g| &g.rows)
                    .find(|c| c.id.0.to_string() == row.id)
                else {
                    continue;
                };
                for column in columns.iter().filter(|c| c.enabled) {
                    let text = match column.metric_id.as_str() {
                        "lastLap" => &mut row.last_lap_text,
                        "bestLap" => &mut row.best_lap_text,
                        _ => continue,
                    };
                    let seconds = if column.metric_id == "lastLap" {
                        car.last_lap_s
                    } else {
                        car.best_lap_s
                    };
                    *text = standings::lap_time_column(
                        seconds,
                        column.format.display.as_deref() == Some("compact"),
                        column.format.decimals.unwrap_or(3),
                    );
                }
            }
        }
        // Wails reserva la capacidad aunque su filtro de clase muestre menos coches.
        config.footer_rows = 1;
        if config.footer_slots.len() > 5 {
            let inner = (config.width - 24.0).max(80.0);
            let total = next
                .footer_cells
                .iter()
                .map(|cell| {
                    cell.label.chars().count() as f32 * 5.5
                        + cell.value.chars().count() as f32 * 7.5
                        + 12.0
                        + 14.0
                })
                .sum::<f32>();
            config.footer_rows = (total / inner).ceil() as usize;
        }
        config.fit(config.row_count);
        if config.multiclass {
            let mut classes = std::collections::HashSet::new();
            let bands = next
                .rows
                .iter()
                .filter(|row| !row.vehicle_class.is_empty() && classes.insert(&row.vehicle_class))
                .count();
            config.height += bands as f32 * config.style.geometry.class_band_height;
        }
        // Una columna oculta no debe cambiar la firma del contenido visible.
        if !config
            .columns
            .iter()
            .any(|column| column.metric == Metric::CurrentLap)
        {
            for row in &mut next.rows {
                row.current_lap_text = vantare_domain::format::PLACEHOLDER.into();
            }
        }
        if !config
            .columns
            .iter()
            .any(|column| column.metric == Metric::Interval)
        {
            for row in &mut next.rows {
                row.interval_text = vantare_domain::format::PLACEHOLDER.into();
            }
        }
        // paint_footer usa footer_cells con slots o metricas no legacy.
        // En esos casos el nombre visible, si se pide, ya esta en esas celdas.
        let legacy_track_visible = config.show_session_footer
            && config.footer_slots.is_empty()
            && config
                .footer_ids
                .iter()
                .all(|id| ["none", "track", "estimatedLaps"].contains(&id.as_str()))
            && [config.footer_first, config.footer_second].contains(&model::InfoMetric::Track);
        if !legacy_track_visible {
            next.track = vantare_domain::format::PLACEHOLDER.into();
        }
        // El número de secuencia cambia siempre y no se ve: no cuenta.
        let sequence = std::mem::replace(&mut next.sequence, self.vm.sequence);
        let changed = {
            #[cfg(feature = "paint-stats")]
            let _span = crate::profiling::begin(crate::profiling::Stage::VmDiff);
            next != *self.vm
        };

        next.sequence = sequence;
        if changed {
            // El layout depende de la VM y de los ajustes fijos del widget.
            let plan = {
                #[cfg(feature = "paint-stats")]
                let _span = crate::profiling::begin(crate::profiling::Stage::Layout);
                model::plan(config, &next)
            };
            let lap_visible = plan.columns.iter().any(|c| c.metric == Metric::BestLap);
            motion.update(&next, plan.visible_rows, lap_visible, Instant::now());
            self.vm = Arc::new(next);
            self.plan = Arc::new(plan);
        }
        changed
    }
}

impl Visual {
    pub(crate) fn set_study(&mut self, study: &str) {
        Arc::make_mut(&mut self.config).study = study.into();
    }

    pub(crate) fn set_style(&mut self, style: std::sync::Arc<style::Style>) {
        let config = Arc::make_mut(&mut self.config);
        config.style = style;
        config.fit(config.row_count);
        if config.multiclass {
            let classes: std::collections::HashSet<_> = self
                .vm
                .rows
                .iter()
                .filter(|row| !row.vehicle_class.is_empty())
                .map(|row| &row.vehicle_class)
                .collect();
            config.height += classes.len() as f32 * config.style.geometry.class_band_height;
        }
        self.plan = Arc::new(model::plan(config, &self.vm));
    }

    pub(crate) fn size(&self) -> (f32, f32) {
        (
            self.config.width
                + if self.plan.pit_enabled {
                    self.config.style.geometry.pit_rail_width
                } else {
                    0.0
                },
            self.config.height,
        )
    }

    pub(crate) fn frame_with_motion(
        &mut self,
        prefs: Preferences,
        reduced: bool,
        motion: &mut Motion,
    ) -> (Paint, Wake) {
        let now = Instant::now();
        let frame = if reduced {
            Arc::new(Motion::new().frame(&self.vm, self.plan.visible_rows, now))
        } else {
            motion.frame_shared(&self.vm, self.plan.visible_rows, now)
        };
        let wake = if reduced {
            Wake::Idle
        } else {
            motion.wake(now)
        };
        let scene = view::Scene {
            config: self.config.clone(),
            vm: self.vm.clone(),
            plan: self.plan.clone(),
            frame,
            language: prefs.language,
            height: self.config.height,
        };
        (
            Box::new(move |window, cx| view::paint(&scene, window, cx)),
            wake,
        )
    }
}
