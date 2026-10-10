//! Importación explícita V4 → layout nativo. Nunca escribe en el perfil fuente.
use std::collections::{BTreeMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use vantare_ui::{
    Kind, Settings,
    layout::{Instance, Layout},
};

pub const MAX_PROFILE_BYTES: u64 = 5 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Serialize)]
pub struct Monitor {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, PartialEq, Serialize)]
pub struct Notice {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub schema: u32,
    pub conversion: &'static str,
    pub source_monitor_index: i32,
    pub monitor: Monitor,
    pub imported: usize,
    pub notices: Vec<Notice>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Profile {
    schema_version: u32,
    monitor_index: i32,
    #[serde(default)]
    layout_viewport: Viewport,
    layouts: BTreeMap<String, Session>,
    performance: Option<Value>,
}

#[derive(Deserialize)]
struct Viewport {
    width: f32,
    height: f32,
}
impl Default for Viewport {
    fn default() -> Self {
        Self {
            width: 1920.0,
            height: 1080.0,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Session {
    widgets: Vec<Widget>,
    #[serde(default)]
    preserved_widgets: Vec<Value>,
}

#[derive(Deserialize)]
struct Widget {
    id: String,
    #[serde(rename = "type")]
    kind: String,
    layout: Position,
    behavior: Behavior,
    content: Map<String, Value>,
    visual: Visual,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Position {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    z_index: i32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Behavior {
    enabled: bool,
    visible_when: Option<Map<String, Value>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Visual {
    system_id: String,
    system_version: u32,
    config_version: u32,
    base_settings: Map<String, Value>,
    appearance_overrides: Map<String, Value>,
}

/// `visibleWhen.sessionTypes` de la app anterior. Lista vacía = todas; un valor
/// desconocido deja la regla sin traducir (se importa oculto, como antes).
fn show_in(value: &Value) -> Option<vantare_ui::session::ShowIn> {
    let types = value.as_array()?;
    if types.is_empty() {
        return Some(vantare_ui::session::ShowIn::default());
    }
    let mut show_in = vantare_ui::session::ShowIn {
        practice: false,
        qualifying: false,
        race: false,
    };
    for kind in types {
        let flag = match kind.as_str()?.to_ascii_lowercase().as_str() {
            "practice" | "warmup" => &mut show_in.practice,
            "qualifying" | "qual" => &mut show_in.qualifying,
            "race" | "endurance" => &mut show_in.race,
            _ => return None,
        };
        *flag = true;
    }
    Some(show_in)
}

fn notice(notices: &mut Vec<Notice>, path: impl Into<String>, reason: &str) {
    notices.push(Notice {
        path: path.into(),
        reason: reason.into(),
    });
}

// Misma fusión recursiva de widget-visual-settings.ts: arrays se reemplazan.
fn merge(target: &mut Map<String, Value>, source: Map<String, Value>) {
    for (key, value) in source {
        match (target.get_mut(&key), value) {
            (Some(Value::Object(existing)), Value::Object(overrides)) => merge(existing, overrides),
            (_, value) => {
                target.insert(key, value);
            }
        }
    }
}

fn convert_widget(
    widget: Widget,
    origin: (f32, f32),
    scale: f32,
    notices: &mut Vec<Notice>,
) -> Result<Option<Instance>, String> {
    let path = format!("layouts.general.widgets[{}]", widget.id);
    let Ok(kind) = widget.kind.parse::<Kind>() else {
        notice(notices, &path, &format!("tipo no portado: {}", widget.kind));
        return Ok(None);
    };
    if widget.visual.system_id != "vantare-functional" {
        notice(
            notices,
            &path,
            &format!(
                "diseño no Eficiencia ({}): widget omitido",
                widget.visual.system_id
            ),
        );
        return Ok(None);
    }
    if widget.visual.system_version > 1 || widget.visual.config_version > 1 {
        notice(
            notices,
            &path,
            "versión visual no soportada: widget omitido",
        );
        return Ok(None);
    }
    let mut rule = widget.behavior.visible_when.unwrap_or_default();
    let show_in = rule.get("sessionTypes").and_then(show_in);
    if show_in.is_some() {
        rule.remove("sessionTypes");
    }
    let show_in = show_in.unwrap_or_default();
    let conditional = !rule.is_empty();
    if conditional {
        notice(
            notices,
            format!("{path}.behavior.visibleWhen"),
            "visibilidad condicional no soportada: se importa oculto",
        );
    }
    notice(
        notices,
        format!("{path}.layout"),
        "escala/tamaño/aspectLocked no importados; tamaño intrínseco nativo, orden zIndex conservado",
    );
    let mut effective = widget.content;
    let mut visual = widget.visual.base_settings;
    merge(&mut visual, widget.visual.appearance_overrides);
    merge(&mut effective, visual);
    let opacity = effective.remove("opacity").map_or(Ok(1.0_f32), |value| {
        serde_json::from_value::<f32>(value).map_err(|e| format!("{path}.opacity: {e}"))
    })?;
    if !(0.0..=1.0).contains(&opacity) {
        return Err(format!("{path}.opacity fuera de 0..1"));
    }
    effective.insert("kind".into(), Value::String(kind.name().into()));
    let settings: Settings = serde_json::from_value(Value::Object(effective.clone()))
        .map_err(|e| format!("{path}.settings: {e}"))?;
    let normalized = settings.normalized();
    let supported = serde_json::to_value(&normalized).map_err(|e| e.to_string())?;
    for (key, value) in effective {
        match supported.get(&key) {
            None => notice(
                notices,
                format!("{path}.settings.{key}"),
                "opción sin Settings nativo: no importada",
            ),
            Some(actual) if actual != &value => notice(
                notices,
                format!("{path}.settings.{key}"),
                "valor normalizado por Settings nativo",
            ),
            _ => {}
        }
    }
    Ok(Some(Instance {
        geometry: vantare_ui::geometry::Geometry::default(),
        id: widget.id,
        x: origin.0 + widget.layout.x * scale,
        y: origin.1 + widget.layout.y * scale,
        visible: widget.behavior.enabled && !conditional,
        show_in,
        opacity,
        settings: normalized,
    }))
}

pub fn convert(bytes: &[u8], monitor: Monitor) -> Result<(Layout, Report), String> {
    if bytes.len() as u64 > MAX_PROFILE_BYTES {
        return Err("perfil supera 5 MiB".into());
    }
    if [monitor.x, monitor.y, monitor.width, monitor.height]
        .iter()
        .any(|v| !v.is_finite())
        || !(32.0..=16_384.0).contains(&monitor.width)
        || !(32.0..=16_384.0).contains(&monitor.height)
        || monitor.x.abs() + monitor.width > 100_000.0
        || monitor.y.abs() + monitor.height > 100_000.0
    {
        return Err("bounds de monitor inválidos".into());
    }
    let mut profile: Profile =
        serde_json::from_slice(bytes).map_err(|e| format!("perfil V4: {e}"))?;
    if profile.schema_version != 4 {
        return Err("solo se convierte Studio V4; migrar legado con Wails primero".into());
    }
    let viewport = &profile.layout_viewport;
    if !(32.0..=16_384.0).contains(&viewport.width) || !(32.0..=16_384.0).contains(&viewport.height)
    {
        return Err("layoutViewport inválido".into());
    }
    let mut general = profile
        .layouts
        .remove("general")
        .ok_or("falta layouts.general")?;
    // Valida antes de omitir: un ID duplicado/tamaño corrupto no puede quedar oculto en el informe.
    for session in std::iter::once(&general).chain(profile.layouts.values()) {
        let mut ids = HashSet::new();
        if session.widgets.len() > 128 {
            return Err("más de 128 widgets por layout".into());
        }
        for widget in &session.widgets {
            let p = &widget.layout;
            if widget.id.trim().is_empty()
                || widget.id.len() > 128
                || !ids.insert(&widget.id)
                || [p.x, p.y, p.w, p.h].iter().any(|v| !v.is_finite())
                || p.w <= 0.0
                || p.h <= 0.0
            {
                return Err("ID de widget o geometría inválidos".into());
            }
        }
    }
    let mut notices = Vec::new();
    for name in profile.layouts.keys() {
        notice(
            &mut notices,
            format!("layouts.{name}"),
            "layout por sesión no importado; solo general",
        );
    }
    if !general.preserved_widgets.is_empty() {
        notice(
            &mut notices,
            "layouts.general.preservedWidgets",
            "widgets preservados no portados",
        );
    }
    if profile.performance.is_some() {
        notice(
            &mut notices,
            "performance",
            "política de rendimiento Wails no importada",
        );
    }
    // Wails usa contain + letterbox; no estira cada eje por separado.
    let scale = (monitor.width / viewport.width).min(monitor.height / viewport.height);
    let origin_x = monitor.x + (monitor.width - viewport.width * scale) / 2.0;
    let origin_y = monitor.y + (monitor.height - viewport.height * scale) / 2.0;
    general.widgets.sort_by_key(|widget| widget.layout.z_index);
    let mut layout = Layout::default();
    for widget in general.widgets {
        if let Some(instance) = convert_widget(widget, (origin_x, origin_y), scale, &mut notices)? {
            layout.instances.push(instance);
        }
    }
    if layout.instances.iter().any(|instance| {
        !instance.x.is_finite()
            || !instance.y.is_finite()
            || instance.x.abs() > 100_000.0
            || instance.y.abs() > 100_000.0
    }) {
        return Err("posición convertida fuera de los límites del layout nativo".into());
    }
    let bytes = serde_json::to_vec(&layout).map_err(|e| e.to_string())?;
    let layout = Layout::from_json(&bytes).map_err(|e| e.to_string())?;
    let report = Report {
        schema: 1,
        conversion: "studio-v4-to-native-layout-v1",
        source_monitor_index: profile.monitor_index,
        monitor,
        imported: layout.instances.len(),
        notices,
    };
    Ok((layout, report))
}

#[cfg(test)]
mod tests {
    use super::*;
    const PROFILE: &[u8] = include_bytes!("../../packaging/fixtures/studio-v4.json");
    fn monitor() -> Monitor {
        Monitor {
            x: -2560.0,
            y: 100.0,
            width: 2560.0,
            height: 1440.0,
        }
    }

    #[test]
    fn sanitized_v4_matches_golden_layout_and_report() {
        let (layout, report) = convert(PROFILE, monitor()).expect("convertir");
        let golden = Layout::from_json(include_bytes!(
            "../../packaging/fixtures/layout.golden.json"
        ))
        .expect("golden");
        assert_eq!(layout, golden);
        let expected: Value = serde_json::from_slice(include_bytes!(
            "../../packaging/fixtures/report.golden.json"
        ))
        .expect("informe golden");
        assert_eq!(serde_json::to_value(report).expect("informe"), expected);
    }

    #[test]
    fn rejects_invalid_version_geometry_ids_options_and_limits() {
        let original: Value = serde_json::from_slice(PROFILE).expect("fixture");
        for (pointer, value) in [
            ("/schemaVersion", Value::from(3)),
            ("/layoutViewport/width", Value::from(0)),
            ("/layouts/general/widgets/0/layout/w", Value::from(-1)),
            ("/layouts/general/widgets/0/id", Value::from("")),
            (
                "/layouts/general/widgets/0/content/showSessionHeader",
                Value::from(1),
            ),
            (
                "/layouts/general/widgets/0/visual/appearanceOverrides/opacity",
                Value::from(2),
            ),
        ] {
            let mut invalid = original.clone();
            *invalid.pointer_mut(pointer).expect("campo") = value;
            assert!(
                convert(&serde_json::to_vec(&invalid).expect("JSON"), monitor()).is_err(),
                "{pointer}"
            );
        }
        let mut duplicate = original;
        duplicate["layouts"]["general"]["widgets"][1]["id"] =
            duplicate["layouts"]["general"]["widgets"][0]["id"].clone();
        assert!(convert(&serde_json::to_vec(&duplicate).expect("JSON"), monitor()).is_err());
        assert!(convert(b"{", monitor()).is_err());
        assert!(
            convert(
                &vec![b' '; usize::try_from(MAX_PROFILE_BYTES).expect("límite usize") + 1],
                monitor()
            )
            .is_err()
        );
        let mut invalid_monitor = monitor();
        invalid_monitor.width = f32::NAN;
        assert!(convert(PROFILE, invalid_monitor).is_err());
    }

    #[test]
    fn default_viewport_and_letterbox_use_global_monitor_coordinates() {
        let mut profile: Value = serde_json::from_slice(PROFILE).expect("fixture");
        profile
            .as_object_mut()
            .expect("objeto")
            .remove("layoutViewport");
        profile["layouts"]["general"]["widgets"][0]["behavior"]["visibleWhen"] =
            serde_json::json!({});
        let (layout, _) = convert(
            &serde_json::to_vec(&profile).expect("JSON"),
            Monitor {
                x: 100.0,
                y: -1080.0,
                width: 1920.0,
                height: 1200.0,
            },
        )
        .expect("convertir");
        let first = &layout.instances[0];
        assert!(first.visible, "visibleWhen vacío no impone una condición");
        assert!((first.x - 244.0).abs() < 0.01);
        assert!((first.y + 948.0).abs() < 0.01);
    }

    #[test]
    fn session_types_become_show_in_and_other_conditions_still_hide() {
        let mut profile: Value = serde_json::from_slice(PROFILE).expect("fixture");
        let rule = &mut profile["layouts"]["general"]["widgets"][0]["behavior"]["visibleWhen"];
        *rule = serde_json::json!({ "sessionTypes": ["qualifying"] });
        let (layout, report) =
            convert(&serde_json::to_vec(&profile).expect("JSON"), monitor()).expect("convertir");
        let first = &layout.instances[0];
        assert!(first.visible, "ya no se importa oculto");
        assert_eq!(
            first.show_in,
            vantare_ui::session::ShowIn {
                practice: false,
                qualifying: true,
                race: false,
            }
        );
        assert!(
            !report
                .notices
                .iter()
                .any(|n| n.path == "layouts.general.widgets[standings].behavior.visibleWhen")
        );
        profile["layouts"]["general"]["widgets"][0]["behavior"]["visibleWhen"] =
            serde_json::json!({ "sessionTypes": ["race"], "inPit": true });
        let (layout, _) =
            convert(&serde_json::to_vec(&profile).expect("JSON"), monitor()).expect("convertir");
        assert!(!layout.instances[0].visible, "inPit sigue sin soporte");
    }

    #[test]
    fn every_current_widget_settings_roundtrips_with_camel_case_keys() {
        let original: Value = serde_json::from_slice(PROFILE).expect("fixture");
        for kind in Kind::ALL {
            let mut profile = original.clone();
            let mut widget = profile["layouts"]["general"]["widgets"][0].clone();
            widget["type"] = Value::from(kind.name());
            let mut settings =
                serde_json::to_value(Settings::default_for(*kind)).expect("defaults");
            settings.as_object_mut().expect("Settings").remove("kind");
            widget["content"] = settings;
            widget["visual"]["baseSettings"] = serde_json::json!({});
            widget["visual"]["appearanceOverrides"] = serde_json::json!({});
            profile["layouts"]["general"]["widgets"] = serde_json::json!([widget]);
            let (layout, report) = convert(&serde_json::to_vec(&profile).expect("JSON"), monitor())
                .expect("convertir");
            assert_eq!(layout.instances[0].settings, Settings::default_for(*kind));
            assert!(
                !report.notices.iter().any(|n| n.path.contains(".settings.")),
                "{}",
                kind.name()
            );
        }
    }
}
