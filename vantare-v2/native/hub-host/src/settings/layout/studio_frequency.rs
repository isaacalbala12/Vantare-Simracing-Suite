//! Read the same performance members consumed by Settings and the overlays.
use super::{CatalogAccess, Fields, HostError, Open, WidgetKind, optional, ordered, read};
use crate::settings::track::{PerformanceLevel, valid_overrides};
use crate::studio::frequency::FrequencyView;
use std::collections::BTreeMap;
pub(super) struct Rates {
    level: PerformanceLevel,
    widgets: BTreeMap<String, u16>,
}
impl Rates {
    pub(super) fn read(root: &Fields) -> Result<Self, HostError> {
        let performance: Fields = optional(root, "performance", Fields::default())?;
        let level = optional(&performance, "level", PerformanceLevel::default())?;
        let widgets = ordered::rates(&performance)?;
        if !valid_overrides(&widgets) {
            return Err(HostError::Protected);
        }
        Ok(Self { level, widgets })
    }
    pub(super) fn view(&self, id: &str, kind: WidgetKind) -> FrequencyView {
        FrequencyView::new(kind, self.level, self.widgets.get(id).copied())
    }
}
pub(super) fn apply(
    opened: &mut Open,
    id: &str,
    value: Option<u16>,
    access: Option<CatalogAccess>,
) -> Result<bool, HostError> {
    let settings: Fields = read(opened.find(id)?, "settings")?;
    let kind: WidgetKind = read(&settings, "kind")?;
    if kind == WidgetKind::RacingFlags || !kind.info(access).allowed {
        return Err(HostError::Denied);
    }
    ordered::set_rate(&mut opened.document.fields, id, value)
}

pub(super) fn authorize_history(
    before: &Fields,
    after: &Fields,
    access: Option<CatalogAccess>,
) -> Result<(), HostError> {
    let old = Rates::read(before)?;
    let new = Rates::read(after)?;
    let old_instances: Vec<Fields> = read(before, "instances")?;
    let new_instances: Vec<Fields> = read(after, "instances")?;
    let mut kinds = super::instance_kinds(&old_instances)?;
    kinds.extend(super::instance_kinds(&new_instances)?);
    for id in old.widgets.keys().chain(new.widgets.keys()) {
        if old.widgets.get(id) == new.widgets.get(id) {
            continue;
        }
        let mut found = false;
        for (candidate, kind) in &kinds {
            if candidate != id {
                continue;
            }
            if !kind.info(access).allowed {
                return Err(HostError::Denied);
            }
            found = true;
        }
        if !found {
            return Err(HostError::Denied);
        }
    }
    Ok(())
}
