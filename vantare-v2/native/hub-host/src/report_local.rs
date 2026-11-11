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
    pub prepared_hash: String,
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
        prepared_hash: vantare_services::content_hash(report.as_bytes()),
        report,
    })
}

#[derive(Default)]
#[cfg(any(windows, test))]
pub(crate) struct State {
    #[cfg(any(windows, test))]
    root: Option<std::path::PathBuf>,
    #[cfg(any(windows, test))]
    binaries: std::collections::BTreeMap<&'static str, CachedBinary>,
}
#[cfg(any(windows, test))]
struct CachedBinary {
    size: u64,
    modified: std::time::SystemTime,
    view: BinaryView,
}
#[cfg(any(windows, test))]
impl State {
    #[cfg(windows)]
    pub(crate) fn collect_binaries(&mut self) -> Vec<BinaryView> {
        let image = std::env::current_exe().ok();
        self.collect_at(image.as_deref().and_then(std::path::Path::parent), |path| {
            vantare_installer::engine::hash_file(path).map_err(|_| ())
        })
    }
    #[cfg(not(windows))]
    pub(crate) fn collect_binaries(&mut self) -> Vec<BinaryView> {
        BINARIES
            .into_iter()
            .map(|name| BinaryView {
                name: name.into(),
                state: BinaryState::Unavailable,
                sha256: None,
            })
            .collect()
    }
    #[cfg(any(windows, test))]
    fn collect_at(
        &mut self,
        root: Option<&std::path::Path>,
        mut hash: impl FnMut(&std::path::Path) -> Result<String, ()>,
    ) -> Vec<BinaryView> {
        if self.root.as_deref() != root {
            self.binaries.clear();
            self.root = root.map(std::path::Path::to_path_buf);
        }
        BINARIES
            .into_iter()
            .map(|name| {
                let mut view = BinaryView {
                    name: name.into(),
                    state: BinaryState::Unavailable,
                    sha256: None,
                };
                let Some(root) = root else {
                    return view;
                };
                let path = root.join(name);
                let info = match std::fs::symlink_metadata(&path) {
                    Ok(info) => info,
                    Err(error) => {
                        self.binaries.remove(name);
                        view.state = if error.kind() == std::io::ErrorKind::NotFound {
                            BinaryState::Missing
                        } else {
                            BinaryState::Unreadable
                        };
                        return view;
                    }
                };
                view.state = BinaryState::Unreadable;
                if !info.is_file()
                    || info.file_type().is_symlink()
                    || info.len() > 128 * 1024 * 1024
                {
                    self.binaries.remove(name);
                    return view;
                }
                let Ok(modified) = info.modified() else {
                    self.binaries.remove(name);
                    return view;
                };
                if let Some(cached) = self.binaries.get(name)
                    && cached.size == info.len()
                    && cached.modified == modified
                {
                    return cached.view.clone();
                }
                self.binaries.remove(name);
                if let Ok(digest) = hash(&path) {
                    view.state = BinaryState::Present;
                    view.sha256 = Some(digest);
                    self.binaries.insert(
                        name,
                        CachedBinary {
                            size: info.len(),
                            modified,
                            view: view.clone(),
                        },
                    );
                }
                view
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Root(std::path::PathBuf);
    impl Root {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "vantare-report-local-{}",
                vantare_services::random_id().expect("QA id")
            ));
            std::fs::create_dir(&root).expect("exclusive QA directory");
            Self(root)
        }
    }
    impl Drop for Root {
        fn drop(&mut self) {
            std::fs::remove_dir_all(&self.0).expect("remove owned QA directory");
        }
    }
    fn hash(path: &std::path::Path) -> Result<String, ()> {
        #[cfg(windows)]
        {
            vantare_installer::engine::hash_file(path).map_err(|_| ())
        }
        #[cfg(not(windows))]
        {
            std::fs::read(path)
                .map(|bytes| vantare_services::content_hash(&bytes))
                .map_err(|_| ())
        }
    }
    #[test]
    fn exactly_nine_fixed_names_and_no_reads_for_missing_links_or_oversized_files() {
        let root = Root::new();
        let mut state = State::default();
        let unavailable = state.collect_at(None, |_| panic!("no directory to read"));
        assert_eq!(
            unavailable
                .iter()
                .map(|entry| entry.name.as_str())
                .collect::<Vec<_>>(),
            BINARIES
        );
        assert!(
            unavailable
                .iter()
                .all(|entry| entry.state == BinaryState::Unavailable)
        );
        let missing = state.collect_at(Some(&root.0), |_| panic!("missing files must not be read"));
        assert!(
            missing
                .iter()
                .all(|entry| entry.state == BinaryState::Missing)
        );
        std::fs::create_dir(root.0.join(BINARIES[0])).unwrap();
        std::fs::File::create(root.0.join(BINARIES[1]))
            .unwrap()
            .set_len(128 * 1024 * 1024 + 1)
            .unwrap();
        std::fs::write(root.0.join("private.bin"), b"private QA fixture").unwrap();
        #[cfg(windows)]
        let linked = std::os::windows::fs::symlink_file(
            root.0.join("private.bin"),
            root.0.join(BINARIES[2]),
        );
        #[cfg(not(windows))]
        let linked =
            std::os::unix::fs::symlink(root.0.join("private.bin"), root.0.join(BINARIES[2]));
        if linked.is_err() {
            eprintln!("QA symlink case omitted: privilege unavailable");
        }
        let entries = state.collect_at(Some(&root.0), |_| {
            panic!("non-files, links and oversized files must not be read")
        });
        assert_eq!(entries.len(), 9);
        assert_eq!(entries[0].state, BinaryState::Unreadable);
        assert_eq!(entries[1].state, BinaryState::Unreadable);
        if linked.is_ok() {
            assert_eq!(entries[2].state, BinaryState::Unreadable);
        }
    }
    #[test]
    fn binary_hashes_are_cached_by_name_size_and_modified_time() {
        let root = Root::new();
        let path = root.0.join(BINARIES[0]);
        std::fs::write(&path, b"a").unwrap();
        let mut state = State::default();
        let mut calls = 0;
        let mut collect = |state: &mut State| {
            state.collect_at(Some(&root.0), |path| {
                calls += 1;
                hash(path)
            })
        };
        let first = collect(&mut state);
        assert_eq!(first[0].state, BinaryState::Present);
        assert_eq!(
            first[0].sha256.as_deref(),
            Some(vantare_services::content_hash(b"a").as_str())
        );
        assert_eq!(collect(&mut state), first);
        std::fs::write(&path, b"bb").unwrap();
        assert_ne!(collect(&mut state)[0].sha256, first[0].sha256);
        std::fs::write(&path, b"cc").unwrap();
        std::fs::File::options()
            .write(true)
            .open(&path)
            .unwrap()
            .set_times(std::fs::FileTimes::new().set_modified(
                std::time::SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(100),
            ))
            .unwrap();
        assert_eq!(
            collect(&mut state)[0].sha256.as_deref(),
            Some(vantare_services::content_hash(b"cc").as_str())
        );
        assert_eq!(calls, 3);
    }
    #[cfg(windows)]
    #[test]
    fn locked_binary_is_unreadable_and_is_retried_after_unlock() {
        use std::os::windows::fs::OpenOptionsExt;
        let root = Root::new();
        let path = root.0.join(BINARIES[0]);
        std::fs::write(&path, b"QA").unwrap();
        let lock = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&path)
            .unwrap();
        let mut state = State::default();
        assert_eq!(
            state.collect_at(Some(&root.0), hash)[0].state,
            BinaryState::Unreadable
        );
        drop(lock);
        assert_eq!(
            state.collect_at(Some(&root.0), hash)[0].state,
            BinaryState::Present
        );
    }
    #[test]
    fn export_accepts_exactly_64_kib_and_rejects_the_next_byte() {
        let fields = ReportFields {
            module: "hub".into(),
            ..Default::default()
        };
        let mut observed = crate::diagnostics::Observed::default()
            .view(&crate::protocol::CoreStatus::default(), false);
        observed.version.clear();
        let base = prepare(&fields, &observed, vec![]).unwrap().report.len();
        observed.version = "x".repeat(EXPORT_LIMIT - base);
        let exact = prepare(&fields, &observed, vec![]).unwrap();
        assert_eq!(exact.report.len(), EXPORT_LIMIT);
        assert_eq!(
            exact.prepared_hash,
            vantare_services::content_hash(exact.report.as_bytes())
        );
        observed.version.push('x');
        assert!(matches!(
            prepare(&fields, &observed, vec![]),
            Err(HostError::Rejected)
        ));
    }
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
