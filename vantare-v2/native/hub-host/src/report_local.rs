//! Local report export: private prose and filesystem paths never enter its payload.
use crate::{
    diagnostics::DiagnosticView,
    protocol::{HostError, LinkState},
    testing::ReportFields,
};
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;

pub const EXPORT_LIMIT: usize = 64 * 1024;
pub const EXPORT_NAME: &str = "vantare-report.json";
pub const BINARIES: [&str; 9] = [
    "vantare-hub.exe",
    "vantare.exe",
    "vantare-core.exe",
    "vantare-overlays.exe",
    "vantare-engineer.exe",
    "vantare-storage.exe",
    "vantare-workshop.exe",
    "vantare-grabar-lmu.exe",
    "vantare-grabar-acc.exe",
];
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BinaryState {
    Present,
    Missing,
    Unreadable,
    Unavailable,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BinaryView {
    pub name: String,
    pub state: BinaryState,
    pub sha256: Option<String>,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocalReportView {
    pub core: LinkState,
    pub binaries: Vec<BinaryView>,
    pub report: String,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ExportStatus {
    Saved,
    Cancelled,
    Conflict,
}

pub fn prepare(
    fields: &ReportFields,
    observed: &DiagnosticView,
    binaries: Vec<BinaryView>,
) -> Result<LocalReportView, HostError> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Diagnostic<'a> {
        schema_version: u32,
        channel: &'static str,
        version: &'a str,
        os: &'a str,
        arch: &'a str,
        core: &'a LinkState,
        section_errors: &'a [crate::diagnostics::DiagnosticEntry],
        binaries: &'a [BinaryView],
        uninstrumented_sections: [&'static str; 2],
    }
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Report<'a> {
        schema_version: u32,
        module: &'a str,
        private_fields_present: [bool; 4],
        private_text: &'static str,
        diagnostic: Diagnostic<'a>,
    }
    if !fields.valid() {
        return Err(HostError::Rejected);
    }
    // Explicit projection: do not serialize the Settings report or account capabilities.
    let report = serde_json::to_string_pretty(&Report {
        schema_version: 1,
        module: &fields.module,
        private_fields_present: [
            &fields.action_text,
            &fields.expected_text,
            &fields.observed_text,
            &fields.context_text,
        ]
        .map(|text| !text.is_empty()),
        private_text: "omitted_for_privacy",
        diagnostic: Diagnostic {
            schema_version: 1,
            channel: vantare_ipc::product::CHANNEL,
            version: &observed.version,
            os: &observed.os,
            arch: &observed.arch,
            core: &observed.core.photos,
            section_errors: &observed.events,
            binaries: &binaries,
            uninstrumented_sections: ["studio", "analysis"],
        },
    })
    .map_err(|_| HostError::Io)?;
    if report.len() > EXPORT_LIMIT {
        return Err(HostError::Rejected);
    }
    Ok(LocalReportView {
        core: observed.core.photos,
        binaries,
        report,
    })
}

#[cfg(windows)]
pub fn collect_binaries() -> Vec<BinaryView> {
    let image = std::env::current_exe().ok();
    let root = image.as_deref().and_then(std::path::Path::parent);
    BINARIES
        .into_iter()
        .map(|name| {
            let (state, sha256) = root.map_or((BinaryState::Unavailable, None), |root| {
                let path = root.join(name);
                match std::fs::symlink_metadata(&path) {
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                        (BinaryState::Missing, None)
                    }
                    Ok(info)
                        if info.is_file()
                            && !info.file_type().is_symlink()
                            && info.len() <= 128 * 1024 * 1024 =>
                    {
                        match vantare_installer::engine::hash_file(&path) {
                            Ok(hash) => (BinaryState::Present, Some(hash)),
                            Err(_) => (BinaryState::Unreadable, None),
                        }
                    }
                    _ => (BinaryState::Unreadable, None),
                }
            });
            BinaryView {
                name: name.into(),
                state,
                sha256,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn export_rejects_invalid_fields_instead_of_silently_changing_them() {
        for fields in [
            ReportFields {
                module: "private/path".into(),
                ..Default::default()
            },
            ReportFields {
                module: "hub".into(),
                action_text: "x".repeat(crate::testing::FIELD_LIMITS[0] + 1),
                ..Default::default()
            },
        ] {
            assert!(matches!(
                prepare(
                    &fields,
                    &crate::diagnostics::Observed::default()
                        .view(&crate::protocol::CoreStatus::default(), false),
                    vec![]
                ),
                Err(HostError::Rejected)
            ));
        }
    }
    #[test]
    fn export_omits_all_private_prose_and_previous_report_text() {
        let fields = ReportFields {
            module: "hub".into(),
            action_text: "private pilot prose".into(),
            context_text: "private token-like prose".into(),
            ..Default::default()
        };
        let mut observed = crate::diagnostics::Observed::default()
            .view(&crate::protocol::CoreStatus::default(), false);
        observed.report = Some("previous private message".into());
        let result = prepare(&fields, &observed, vec![]).unwrap();
        for private in [
            &fields.action_text,
            &fields.context_text,
            "previous private message",
        ] {
            assert!(!result.report.contains(private));
        }
        let value: serde_json::Value = serde_json::from_str(&result.report).unwrap();
        assert_eq!(
            value["privateFieldsPresent"],
            serde_json::json!([true, false, false, true])
        );
        assert_eq!(value["privateText"], "omitted_for_privacy");
        assert_eq!(value.as_object().unwrap().len(), 5);
        let diagnostic = value["diagnostic"].as_object().unwrap();
        assert_eq!(diagnostic.len(), 9);
        assert!(!diagnostic.contains_key("observed"));
        assert!(!result.report.contains("tester"));
    }
}
