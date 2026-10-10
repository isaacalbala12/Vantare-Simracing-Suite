//! Eficiencia: presentación y movimiento sobre el Board común; sin Snapshot ni I/O.
use super::model::{Config, ContentPlan, Metric, Plan, Status};
use super::motion::{Motion, Wake};
use super::{Settings, model, style, view};
use crate::app::Paint;
use std::{sync::Arc, time::Instant};
use vantare_domain::format::Preferences;
pub(crate) struct Visual {
    pub(super) config: Arc<Config>,
    pub(super) content_plan: Arc<ContentPlan>,
    pub(super) plan: Arc<Plan>,
}

impl Visual {
    pub(crate) fn new(settings: &Settings, _prefs: Preferences) -> Self {
        let mut config = settings.normalized().config();
        // Signature reserva la capacidad completa aunque haya menos coches.
        config.fit(config.row_count);
        let content_plan = ContentPlan::unavailable(Status::Disconnected);
        let plan = model::plan(&config, &content_plan);
        Self {
            config: Arc::new(config),
            content_plan: Arc::new(content_plan),
            plan: Arc::new(plan),
        }
    }

    pub(crate) fn ingest(&mut self, next: Arc<ContentPlan>, motion: &mut Motion) -> bool {
        let config = Arc::make_mut(&mut self.config);
        // Capacidad reservada del layout, independiente de la selección común.
        config.footer_rows = 1;
        if config.footer_slots.len() > 5 {
            let inner = (config.width - 24.0).max(80.0);
            let total = next
                .board
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
                .filter(|row| !row.class.is_empty() && classes.insert(&row.class))
                .count();
            config.height += bands as f32 * config.style.geometry.class_band_height;
        }
        let changed = {
            #[cfg(feature = "paint-stats")]
            let _span = crate::profiling::begin(crate::profiling::Stage::VmDiff);
            !self.content_plan.same_visible(&next)
        };
        if changed {
            // El layout depende de la VM y de los ajustes fijos del widget.
            let plan = {
                #[cfg(feature = "paint-stats")]
                let _span = crate::profiling::begin(crate::profiling::Stage::Layout);
                model::plan(config, &next)
            };
            let lap_visible = plan.columns.iter().any(|c| c.metric == Metric::BestLap);
            motion.update(&next, plan.visible_rows, lap_visible, Instant::now());
            self.content_plan = next;
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
                .content_plan
                .rows
                .iter()
                .filter(|row| !row.class.is_empty())
                .map(|row| &row.class)
                .collect();
            config.height += classes.len() as f32 * config.style.geometry.class_band_height;
        }
        self.plan = Arc::new(model::plan(config, &self.content_plan));
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
            Arc::new(Motion::new().frame(&self.content_plan, self.plan.visible_rows, now))
        } else {
            motion.frame_shared(&self.content_plan, self.plan.visible_rows, now)
        };
        let wake = if reduced {
            Wake::Idle
        } else {
            motion.wake(now)
        };
        let scene = view::Scene {
            config: self.config.clone(),
            content_plan: self.content_plan.clone(),
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
