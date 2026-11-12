//! Headless export of the frozen inspector recipes and its independent writer oracle.
use serde_json::{Value, json};
use std::{collections::BTreeMap, error::Error};
use vantare_domain::widget_settings::TABLE_SIZES;
use vantare_ui::standings::SessionSettings as _;
use vantare_ui::{Kind, Settings, layout::Layout, session::Session};

fn encoded(mut value: Value) -> Result<Vec<u8>, Box<dyn Error>> {
    value.sort_all_objects();
    let mut bytes = serde_json::to_vec_pretty(&value)?;
    bytes.push(b'\n');
    Ok(bytes)
}
fn recipe(kind: Kind, name: &str) -> Value {
    let columns = match kind {
        Kind::Standings => vantare_ui::standings::vantare_template(name),
        Kind::Relative => vantare_ui::relative::vantare_template(name),
        _ => unreachable!("only table kinds are exported"),
    };
    serde_json::to_value(columns).expect("native columns serialize")
}
pub(crate) fn recipes_bytes() -> Result<Vec<u8>, Box<dyn Error>> {
    let mut recipes = BTreeMap::new();
    for kind in [Kind::Standings, Kind::Relative] {
        let sizes: BTreeMap<_, _> = TABLE_SIZES
            .iter()
            .map(|name| (*name, recipe(kind, name)))
            .collect();
        recipes.insert(kind.name(), sizes);
    }
    encoded(json!({"version":1,"recipes":recipes}))
}
fn input(kind: Kind, scenario: &str) -> Result<Value, Box<dyn Error>> {
    let mut settings = Settings::default_for(kind);
    if let Settings::Standings(value) = &mut settings {
        value.apply_session_presets();
    }
    let mut value = serde_json::to_value(settings)?;
    if scenario == "legacy" {
        value["contentVersion"] = json!(0);
        let fields = value.as_object_mut().ok_or("settings must be an object")?;
        fields.remove("classScope");
        fields.remove("practiceColumns");
        fields.remove("qualifyingColumns");
        if kind == Kind::Standings {
            value["classificationMode"] = json!("multiclass");
            value["columns"] = Value::Null;
        } else {
            let mut columns = recipe(kind, "expanded");
            columns.as_array_mut().ok_or("columns")?.truncate(9);
            value["columns"] = columns;
        }
    } else if scenario == "custom" {
        value["columns"] = recipe(kind, "expanded");
        value["futureSetting"] = json!({"keep":11});
        let fields = value.as_object_mut().ok_or("settings")?;
        fields.remove("practiceColumns");
        fields.remove("qualifyingColumns");
        let columns = value["columns"].as_array_mut().ok_or("columns")?;
        for column in &mut *columns {
            if column["metricId"] == "driverName" {
                column["id"] = json!("gap");
                column["enabled"] = json!(false);
                column["widthPreset"] = json!("xs");
                column["format"] = json!({"mode":"surname","maxChars":17,"display":"custom","decimals":2,"futureFormat":{"keep":29}});
                column["style"] = json!({"align":"right","futureStyle":{"keep":31}});
                column["futureColumn"] = json!({"keep":23});
            } else if column["metricId"] == "gap" {
                column["id"] = json!("driverName");
            }
        }
        let removed = columns
            .iter_mut()
            .find(|column| {
                column["metricId"]
                    == if kind == Kind::Standings {
                        "interval"
                    } else {
                        "trackStrip"
                    }
            })
            .ok_or("custom column")?;
        *removed = json!({"id":"custom-extra","metricId":"custom-metric","enabled":true,"widthPreset":"auto","futureRemoved":{"keep":37}});
    }
    Ok(value)
}
fn saved(input: &Value, size: &str) -> Result<Value, Box<dyn Error>> {
    // Same loading and final normalization as hub/document.rs. No App/Window/device.
    let bytes = serde_json::to_vec(
        &json!({"version":1,"instances":[{"id":"widget-1","x":0,"y":0,"settings":input}]}),
    )?;
    let mut document = Layout::from_json(&bytes)?;
    let item = document.instances.first_mut().ok_or("oracle instance")?;
    // Verbatim operation performed by inspector_panel.rs:769-780 for Race (initial tab).
    match &mut item.settings {
        Settings::Standings(value) => {
            *value.session_columns_mut(Session::Race) =
                vantare_ui::standings::vantare_template(size)
        }
        Settings::Relative(value) => {
            value.columns = Some(vantare_ui::relative::vantare_template(size))
        }
        _ => return Err("unsupported oracle widget".into()),
    }
    let next = document.normalized()?;
    let item = next.instances.into_iter().next().ok_or("oracle instance")?;
    Ok(serde_json::to_value(item.settings)?)
}
pub(crate) fn oracle_bytes() -> Result<Vec<u8>, Box<dyn Error>> {
    let mut cases = Vec::new();
    for kind in [Kind::Standings, Kind::Relative] {
        for scenario in ["current", "legacy", "custom"] {
            let original = input(kind, scenario)?;
            for size in TABLE_SIZES {
                cases.push(json!({"name":format!("{}-{scenario}-{size}",kind.name()),"kind":kind.name(),"size":size,"input":original,"expected":saved(&original,size)?}));
            }
        }
    }
    encoded(json!({"version":1,"cases":cases}))
}
#[cfg_attr(test, allow(dead_code))]
fn main() -> Result<(), Box<dyn Error>> {
    let mut arguments = std::env::args_os().skip(1);
    let recipes_file = arguments
        .next()
        .ok_or("table-presets <recipes.json> <oracle.json>")?;
    let golden_file = arguments.next().ok_or("missing oracle output")?;
    std::fs::write(recipes_file, recipes_bytes()?)?;
    std::fs::write(golden_file, oracle_bytes()?)?;
    Ok(())
}
