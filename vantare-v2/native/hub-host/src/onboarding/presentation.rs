//! Compact counter and CAS bytes match frozen UI `Presentation::show`.
use crate::protocol::HostError;
use std::path::Path;
use vantare_ipc::files;
pub(super) fn show(layout: &Path) -> Result<(), HostError> {
    let path = layout.with_extension("show.json");
    let observed = files::read_optional(&path, 1024).map_err(|_| HostError::Io)?;
    let current = observed
        .as_deref()
        .map_or(Ok(0_u64), serde_json::from_slice)
        .map_err(|_| HostError::Protected)?;
    let next = current.checked_add(1).ok_or(HostError::Protected)?;
    files::save(
        &path,
        &serde_json::to_vec(&next).expect("u64 counter"),
        files::Mode::Observed(observed.as_deref()),
        &files::Options {
            limit: 1024,
            sibling_base: Some(path.with_extension("json")),
            ..Default::default()
        },
    )
    .map_err(|error| {
        if error.kind().is_conflict() {
            HostError::OnboardingConflict {}
        } else if error.kind() == files::Kind::Busy {
            HostError::Busy
        } else {
            HostError::Io
        }
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn show_matches_the_native_presentation_fixture() {
        #[derive(serde::Deserialize)]
        struct Case {
            initial: Option<u64>,
            next: String,
        }
        let cases: Vec<Case> =
            serde_json::from_slice(include_bytes!("../../data/onboarding-presentation.json"))
                .unwrap();
        let root = crate::test_support::Root::new();
        for (index, case) in cases.into_iter().enumerate() {
            let layout = root.path.join(format!("layout-{index}.json"));
            let path = layout.with_extension("show.json");
            if let Some(initial) = case.initial {
                std::fs::write(&path, serde_json::to_vec(&initial).unwrap()).unwrap();
            }
            show(&layout).unwrap();
            assert_eq!(std::fs::read(path).unwrap(), case.next.as_bytes());
        }
    }
    #[test]
    fn counter_uses_compact_json_and_overflow_preserves_bytes() {
        let root = crate::test_support::Root::new();
        let layout = root.path.join("layout.json");
        let path = layout.with_extension("show.json");
        show(&layout).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"1");
        show(&layout).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"2");
        let bytes = u64::MAX.to_string();
        std::fs::write(&path, &bytes).unwrap();
        assert!(matches!(show(&layout), Err(HostError::Protected)));
        assert_eq!(std::fs::read(&path).unwrap(), bytes.as_bytes());
    }
}
