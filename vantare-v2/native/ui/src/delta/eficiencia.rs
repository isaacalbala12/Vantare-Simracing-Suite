//! Pintor Eficiencia: etiquetas del Board común al cambiar datos/presentación.
use vantare_domain::{
    delta::{Board, Tone},
    format::{Language, Preferences},
};
#[derive(PartialEq)]
pub(super) struct Labels {
    pub capsule: bool,
    pub tone: Tone,
    pub delta_text: String,
    pub best_lap_text: String,
    pub last_lap_text: String,
    pub best_label: &'static str,
    pub last_label: &'static str,
    pub status_text: Option<&'static str>,
    pub reference_notice: Option<&'static str>,
}
impl Labels {
    pub(super) fn new(board: &Board, prefs: Preferences, capsule: bool) -> Self {
        #[cfg(feature = "parity-capture")]
        crate::benchmark::mark(crate::benchmark::Work::Labels);
        let es = prefs.language == Language::Es;
        Self {
            capsule,
            tone: board.tone,
            delta_text: board.delta_text(),
            best_lap_text: board.best_text(),
            last_lap_text: board.last_text(),
            best_label: if es {
                "MEJOR PERSONAL"
            } else {
                "PERSONAL BEST"
            },
            last_label: if es { "ÚLT. VUELTA" } else { "LAST LAP" },
            status_text: board.status_text(prefs.language),
            reference_notice: board.reference_notice(prefs.language),
        }
    }
}
