use super::*;
use crate::testing::diagnostic::{ErrorCode, Module, SectionError};

#[test]
fn panel_reserves_header_and_footer_and_tracks_resized_viewport() {
    assert!((panel_height(900.0) - 654.0).abs() < f32::EPSILON);
    assert!((panel_height(720.0) - 474.0).abs() < f32::EPSILON);
    assert!((panel_height(200.0) - 0.0).abs() < f32::EPSILON);
}

#[test]
fn news_reads_valid_versioned_release_notes_in_wails_order() {
    let news = releases::news().expect("manifiestos de releases");
    assert_eq!(news.len(), 17);
    assert_eq!(news[0].tag, "v0.1.0.7-testers.2");
    assert_eq!(news[2].tag, "v0.1.0.7-nightly.15");
    assert!(news.iter().all(|release| !release.summary.is_empty()));
}

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
