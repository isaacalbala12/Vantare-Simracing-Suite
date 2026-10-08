use super::*;
use crate::testing::diagnostic::{ErrorCode, Module, SectionError};

#[test]
fn diagnostic_query_without_results_can_be_cleared_and_distinguishes_an_empty_session() {
    let errors = [SectionError {
        module: Module::Launcher,
        code: ErrorCode::LocalError,
        observed_at_utc: 1_700_000_000,
    }];
    assert_eq!(event_results(&errors, 0, "").len(), 1);
    assert!(event_results(&errors, 0, "texto imposible").is_empty());
    assert!(event_empty_message(errors.len()).contains("filtros"));
    // La acción Limpiar restaura Todos y la consulta vacía sin borrar lo observado.
    assert_eq!(event_results(&errors, 0, "")[0].module, Module::Launcher);
    assert!(event_results(&[], 0, "").is_empty());
    assert_ne!(event_empty_message(0), event_empty_message(errors.len()));
}

#[test]
fn panel_reserves_header_and_footer_and_tracks_resized_viewport() {
    assert!((panel_height(900.0) - 740.0).abs() < f32::EPSILON);
    assert!((panel_height(720.0) - 560.0).abs() < f32::EPSILON);
    assert!((panel_height(120.0) - 0.0).abs() < f32::EPSILON);
}

#[test]
fn news_reads_customer_summaries_in_release_order() {
    let news = releases::news().expect("manifiestos de releases");
    assert_eq!(news.len(), 17);
    assert_eq!(news[0].tag, "v0.1.0.7-testers.2");
    assert_eq!(news[2].tag, "v0.1.0.7-nightly.15");
    assert!(news.iter().all(|release| !release.summary.is_empty()));
    for release in &news {
        assert!(matches!(
            release.kind.as_str(),
            "Nuevo" | "Mejora" | "Arreglo"
        ));
        let text = format!("{} {}", release.title, release.summary).to_lowercase();
        for internal in [
            "go-first",
            "overlayframe",
            "backend",
            "fixture",
            "command orbit",
            "flag",
            "build",
        ] {
            assert!(
                !text.contains(internal),
                "{} contiene {internal}",
                release.tag
            );
        }
    }
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
    assert!(event_matches(&error, 3, "completar la acción"));
    assert!(!event_matches(&error, 1, ""));
    assert!(!event_matches(&error, 2, ""));
    assert!(!event_matches(&error, 3, "engineer"));
    assert!(!event_matches(&error, 99, ""));
}
