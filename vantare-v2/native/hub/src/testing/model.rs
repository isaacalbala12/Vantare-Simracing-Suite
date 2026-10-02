use crate::services::protocol::report_document::{Fields, Preview};

/// La escena de paridad declara Nightly; fuera de ella manda la build.
pub(super) fn channel_label(channel: Option<&str>, capture: bool) -> String {
    if capture {
        "NIGHTLY".into()
    } else {
        channel
            .filter(|value| !value.trim().is_empty())
            .map_or_else(
                || "CANAL NO DISPONIBLE".into(),
                |value| value.trim().to_uppercase(),
            )
    }
}

// Lista cerrada del servicio nativo y nombres del producto Wails.
pub(super) const MODULES: [(&str, &str); 15] = [
    ("unknown", "Sin determinar"),
    ("hub", "Hub"),
    ("launcher", "Launcher"),
    ("settings", "Settings"),
    ("overlay_studio", "Overlay Studio"),
    ("overlay_runtime", "Overlay Runtime"),
    ("telemetry", "Telemetry"),
    ("telemetry_analysis", "Telemetry Analysis"),
    ("engineer", "Engineer"),
    ("strategy", "Strategy"),
    ("calendar", "Calendar"),
    ("billing", "Billing"),
    ("account", "Account"),
    ("updater", "Updater"),
    ("testing_center", "Testing Center"),
];

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
