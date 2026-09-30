use super::*;
use crate::testing::diagnostic::{ErrorCode, Module, SectionError};

#[test]
fn search_finds_visible_pages_by_control_and_never_creates_owner_sections() {
    for (query, page) in [
        ("  IDIOMA ", Page::Application),
        ("opacidad", Page::Appearance),
        ("cadencia", Page::Performance),
        ("nightly", Page::Updates),
        ("delta", Page::Hotkeys),
        ("consentimiento", Page::Privacy),
        ("cpu", Page::Diagnostics),
    ] {
        assert!(page.matches(query));
    }
    assert!(Page::ALL.iter().all(|page| page.matches("")));
    assert!(!Page::ALL.iter().any(|page| page.matches("Agenda Owner")));
    assert_eq!(Page::default(), Page::Application);
    assert!(Page::Application.matches("aplicacion"));
    assert!(Page::Updates.matches("VERSION"));
    assert!(Page::Diagnostics.matches("diagnostico"));
    assert!(Page::Diagnostics.matches(" DIAGNO\u{301}STICO "));
}

#[test]
fn choices_map_to_explicit_native_preferences_and_reject_invalid_indices() {
    assert_eq!(language(0), Some(Language::Es));
    assert_eq!(language(1), Some(Language::En));
    assert_eq!(units(0), Some(Units::Metric));
    assert_eq!(units(1), Some(Units::Imperial));
    assert_eq!(language(2), None);
    assert_eq!(units(usize::MAX), None);
}

#[test]
fn diagnostic_filters_use_only_observed_errors_and_sanitized_codes() {
    let error = SectionError {
        module: Module::Launcher,
        code: ErrorCode::LocalError,
        observed_at_utc: 42,
    };
    assert!(event_matches(&error, 0, "launcher"));
    assert!(event_matches(&error, 3, " LOCALERROR "));
    assert!(!event_matches(&error, 1, ""));
    assert!(!event_matches(&error, 2, ""));
    assert!(!event_matches(&error, 3, "engineer"));
    assert!(!event_matches(&error, 99, ""));
}
