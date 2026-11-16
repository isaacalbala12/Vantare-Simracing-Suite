//! Eficiencia delta scene: labels of the shared board, the interpolated fill and
//! the notices. Pixels, colours and the two templates live in `paint.rs`.
use super::motion;
use vantare_domain::{
    delta::{Board, Event, Tone},
    format::{Language, Preferences},
};

#[derive(Clone, Debug, PartialEq)]
pub(super) struct Scene {
    pub capsule: bool,
    pub tone: Tone,
    pub delta_text: String,
    pub best_lap_text: String,
    pub last_lap_text: String,
    pub best_label: &'static str,
    pub last_label: &'static str,
    pub status: Option<&'static str>,
    pub reference_notice: Option<&'static str>,
    pub fill: [f32; 2],
    pub event: Option<Event>,
    pub notice_alpha: f32,
    pub cross: Option<Tone>,
    pub cross_alpha: f32,
}

/// Etiquetas del Board común al cambiar datos/presentación.
#[must_use]
pub fn sample(board: &Board, prefs: Preferences, capsule: bool) -> Scene {
    let es = prefs.language == Language::Es;
    Scene {
        capsule,
        tone: board.tone,
        delta_text: board.delta_text(),
        best_lap_text: board.best_text(),
        last_lap_text: board.last_text(),
        best_label: if es { "MEJOR PERSONAL" } else { "PERSONAL BEST" },
        last_label: if es { "ÚLT. VUELTA" } else { "LAST LAP" },
        status: board.status_text(prefs.language),
        reference_notice: board.reference_notice(prefs.language),
        fill: motion::fill_geometry(board.progress),
        event: None,
        notice_alpha: 0.0,
        cross: None,
        cross_alpha: 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn board() -> Board {
        let mut board = crate::delta::project(
            &vantare_domain::widget_settings::delta::Settings::eficiencia(),
            &crate::testdata::snapshot(),
            Preferences::default(),
        );
        board.tone = Tone::Gaining;
        board.progress = Some(-0.4);
        board
    }

    #[test]
    fn labels_and_fill_come_from_the_shared_board() {
        let scene = sample(&board(), Preferences::default(), false);
        assert_eq!(scene.best_label, "MEJOR PERSONAL");
        assert_eq!(scene.last_label, "ÚLT. VUELTA");
        assert_eq!(scene.fill[1], 0.2, "mitad del progreso");
        assert_eq!(scene.fill[0], 0.3);
        assert!(!scene.capsule);
    }

    #[test]
    fn english_and_capsule_only_change_words_and_template() {
        let prefs = Preferences {
            language: Language::En,
            ..Preferences::default()
        };
        let scene = sample(&board(), prefs, true);
        assert_eq!(scene.best_label, "PERSONAL BEST");
        assert_eq!(scene.last_label, "LAST LAP");
        assert!(scene.capsule);
    }
}
