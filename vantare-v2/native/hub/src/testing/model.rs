use crate::services::protocol::report_document::{Fields, Preview};

/// La escena de paridad declara Nightly; fuera de ella manda la build.
pub(super) fn channel_label(channel: Option<&str>, capture: bool) -> String {
    if capture {
        "Nightly".into()
    } else {
        channel
            .filter(|value| !value.trim().is_empty())
            .map_or_else(
                || "Canal no disponible".into(),
                |value| match value.trim() {
                    "stable" | "master" => "Estable".into(),
                    "nightly" => "Nightly".into(),
                    "testers" => "Testers".into(),
                    "beta" => "Beta".into(),
                    _ => "Canal no disponible".into(),
                },
            )
    }
}

// Lista cerrada del servicio nativo y nombres del producto Wails.
pub(super) const MODULES: [(&str, &str); 15] = [
    ("unknown", "Sin determinar"),
    ("hub", "Hub"),
    ("launcher", "Launcher"),
    ("settings", "Ajustes"),
    ("overlay_studio", "Overlay Studio"),
    ("overlay_runtime", "Overlays en pista"),
    ("telemetry", "Telemetría"),
    ("telemetry_analysis", "Análisis de telemetría"),
    ("engineer", "Ingeniero"),
    ("strategy", "Estrategia"),
    ("calendar", "Calendario"),
    ("billing", "Facturación"),
    ("account", "Cuenta"),
    ("updater", "Actualizaciones"),
    ("testing_center", "Testing Center"),
];

/// Lee el contenido aprobado, también al reintentar; nunca el formulario actual.
pub(super) fn preview_summary(preview: &Preview) -> Result<String, &'static str> {
    let value: serde_json::Value = serde_json::from_str(&preview.payload)
        .map_err(|_| "No se pudo leer el contenido del envío.")?;
    let report = value.get("reporte").unwrap_or(&value);
    let mut lines = Vec::new();
    let module = report
        .get("p_module")
        .and_then(serde_json::Value::as_str)
        .ok_or("No se pudo leer el contenido del envío.")?;
    lines.push(format!(
        "Módulo: {}",
        MODULES
            .iter()
            .find(|(id, _)| *id == module)
            .map_or("Sin determinar", |(_, label)| *label)
    ));
    for (key, label) in [
        ("p_action_text", "Título"),
        ("p_expected_text", "Qué esperabas"),
        ("p_observed_text", "Qué ocurrió"),
        ("p_context_text", "Contexto"),
        ("p_app_version", "Versión"),
        ("p_os_version", "Sistema"),
    ] {
        let text = report
            .get(key)
            .and_then(serde_json::Value::as_str)
            .ok_or("No se pudo leer el contenido del envío.")?;
        lines.push(format!("{label}: {text}"));
    }
    for (key, label) in [
        ("p_include_diagnostic", "Diagnóstico"),
        ("p_include_logs", "Registro"),
    ] {
        let included = report
            .get(key)
            .and_then(serde_json::Value::as_bool)
            .ok_or("No se pudo leer el contenido del envío.")?;
        lines.push(format!(
            "{label}: {}",
            if included { "Incluido" } else { "No incluido" }
        ));
    }
    if let Some(payload) = report
        .get("p_diagnostic_payload")
        .and_then(serde_json::Value::as_str)
    {
        lines.push(format!("Contenido del diagnóstico: {payload}"));
    }
    lines.push(format!("Capturas: {}", preview.screenshots.len()));
    Ok(lines.join("\n"))
}

/// Mismos límites UTF-8 que Wails. El servicio vuelve a validar la frontera.
pub(super) fn field_errors(fields: &Fields) -> [Option<&'static str>; 4] {
    let values = [
        &fields.action_text,
        &fields.expected_text,
        &fields.observed_text,
        &fields.context_text,
    ];
    std::array::from_fn(|index| {
        let bytes = values[index].trim().len();
        if index < 3 && bytes < 3 {
            Some("Hacen falta al menos tres caracteres.")
        } else if bytes > if index == 3 { 4096 } else { 2048 } {
            Some("El texto es demasiado largo.")
        } else {
            None
        }
    })
}

/// Consentimiento efímero para una vista concreta, nunca para el siguiente envío.
#[derive(Clone, PartialEq, Eq)]
pub(super) struct Consent {
    id: String,
    digest: String,
    account: String,
    channel: String,
    payload: String,
    retry: bool,
}
impl From<&Preview> for Consent {
    fn from(preview: &Preview) -> Self {
        Self {
            id: preview.id.clone(),
            digest: preview.digest.clone(),
            account: preview.account_id.clone(),
            channel: preview.channel.clone(),
            payload: preview.payload.clone(),
            retry: preview.retry,
        }
    }
}
pub(super) fn can_send(preview: Option<&Preview>, consent: Option<&Consent>, dirty: bool) -> bool {
    preview.is_some_and(|preview| {
        (!dirty || preview.retry) && consent == Some(&Consent::from(preview))
    })
}

/// El contrato v1 no tiene un campo tipo: se conserva como texto explícito de contexto.
pub(super) fn with_report_kind(context: &str, suggestion: bool) -> String {
    let text = context
        .strip_prefix("Tipo: Sugerencia\n")
        .or_else(|| context.strip_prefix("Tipo: Algo falla\n"))
        .unwrap_or(context);
    format!(
        "Tipo: {}\n{text}",
        if suggestion {
            "Sugerencia"
        } else {
            "Algo falla"
        }
    )
}
#[cfg(test)]
mod kind_tests {
    use super::with_report_kind;
    #[test]
    fn changing_kind_preserves_context_without_stacking_markers() {
        assert_eq!(with_report_kind("", false), "Tipo: Algo falla\n");
        let initial = "Sesión real\nPasos y datos";
        let suggestion = with_report_kind(initial, true);
        assert_eq!(suggestion, "Tipo: Sugerencia\nSesión real\nPasos y datos");
        assert_eq!(with_report_kind(&suggestion, true), suggestion);
        assert_eq!(
            with_report_kind(&suggestion, false),
            "Tipo: Algo falla\nSesión real\nPasos y datos"
        );
    }
}
