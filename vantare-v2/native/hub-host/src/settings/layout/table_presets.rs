//! Trusted recipes exported from UI; the host never links the renderer crate.
use super::{HostError, WidgetKind};
use serde::Deserialize;
use serde_json::Value;
use std::{collections::BTreeMap, sync::OnceLock};
use vantare_domain::widget_settings::columns::ColumnSetting;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Recipes {
    version: u32,
    recipes: BTreeMap<String, BTreeMap<String, Vec<ColumnSetting>>>,
}
fn columns(kind: WidgetKind, size: &str) -> Result<Value, HostError> {
    static DATA: OnceLock<Result<Recipes, ()>> = OnceLock::new();
    let data = DATA
        .get_or_init(|| serde_json::from_str(include_str!("../../../data/table-presets.json")).map_err(|_| ()))
        .as_ref()
        .map_err(|()| HostError::Protected)?;
    if data.version != 1 {
        return Err(HostError::Protected);
    }
    let name = match kind {
        WidgetKind::Standings => "standings",
        WidgetKind::Relative => "relative",
        _ => return Err(HostError::Denied),
    };
    let recipe = data.recipes.get(name).and_then(|sizes| sizes.get(size))
        .ok_or(HostError::Protected)?;
    serde_json::to_value(recipe).map_err(|_| HostError::Io)
}
pub(super) fn apply(
    kind: WidgetKind,
    original: &Value,
    candidate: &mut Value,
    size: &str,
) -> Result<(), HostError> {
    // GPUI only offers table formats in the Vantare inspector. Standings edits
    // its initially selected Race session, detaching inherited other sessions.
    if original["designSystem"] != "vantare" {
        return Err(HostError::Denied);
    }
    if kind == WidgetKind::Standings {
        let inherited = if original["columns"].is_array() {
            original["columns"].clone()
        } else {
            columns(kind, vantare_domain::widget_settings::TABLE_SIZE_STANDARD)?
        };
        for key in ["practiceColumns", "qualifyingColumns"] {
            if original[key].is_null() {
                candidate[key] = inherited.clone();
            }
        }
    }
    candidate["columns"] = columns(kind, size)?;
    Ok(())
}
