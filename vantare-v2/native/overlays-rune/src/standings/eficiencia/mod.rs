//! Port literal de la configuración y geometría de standings/eficiencia.rs.
mod model;
mod options;
mod style;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod paint_tests;
use model::{Config, ContentPlan, Plan, Status};
use std::sync::Arc;
use vantare_domain::widget_settings::standings::Settings;

pub(super) struct Visual {
    config: Arc<Config>,
    content_plan: Arc<ContentPlan>,
    plan: Arc<Plan>,
}
impl Visual {
    pub fn new(settings: &Settings) -> Self {
        let mut config = Config::from_settings(&settings.normalized());
        config.fit(config.row_count);
        let content_plan = ContentPlan::unavailable(Status::Disconnected);
        let plan = model::plan(&config, &content_plan);
        Self {
            config: Arc::new(config),
            content_plan: Arc::new(content_plan),
            plan: Arc::new(plan),
        }
    }
    pub fn ingest(&mut self, next: Arc<ContentPlan>) -> bool {
        let config = Arc::make_mut(&mut self.config);
        config.footer_rows = 1;
        if config.footer_slots.len() > 5 {
            let inner = (config.width - 24.0).max(80.0);
            config.footer_rows = crate::eficiencia::footer_rows(&next.board.footer_cells, inner);
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
        let changed = !self.content_plan.same_visible(&next);
        if changed {
            self.plan = Arc::new(model::plan(config, &next));
            self.content_plan = next;
        }
        changed
    }
    pub fn set_study(&mut self, study: &str) {
        Arc::make_mut(&mut self.config).study = study.into();
    }
    pub fn set_style(&mut self, style: Arc<style::Style>) {
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
    pub fn size(&self) -> (f32, f32) {
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
}
