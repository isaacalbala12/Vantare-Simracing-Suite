//! Legacy score-only answers reuse notes observed for the same account session.
use crate::testing::TestingView;

#[derive(Default)]
pub(crate) struct Notes {
    pending_generation: Option<String>,
    observed: Option<(String, TestingView)>,
}

impl Notes {
    pub(crate) fn begin(&mut self, generation: Option<&str>) {
        self.pending_generation = generation.map(str::to_owned);
    }
    pub(crate) fn observe(&mut self, generation: Option<&str>, view: &TestingView) {
        self.observed = generation
            .filter(|generation| self.pending_generation.as_deref() == Some(*generation))
            .map(|generation| (generation.to_owned(), view.clone()));
    }
    pub(crate) fn previous(&self, generation: Option<&str>, id: &str) -> Option<&str> {
        let (observed_generation, view) = self.observed.as_ref()?;
        if generation != Some(observed_generation.as_str()) {
            return None;
        }
        view.questionnaires
            .iter()
            .find(|q| q.id == id)?
            .note
            .as_deref()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TestingQuestionnaire;
    #[test]
    fn legacy_answers_preserve_only_notes_from_the_same_observed_account() {
        let view = TestingView {
            questionnaires: vec![TestingQuestionnaire {
                id: "qa".into(),
                version: "QA".into(),
                title: "QA".into(),
                question: "QA".into(),
                score: Some(4),
                note: Some("Anterior".into()),
            }],
            ..Default::default()
        };
        let mut notes = Notes::default();
        assert_eq!(notes.previous(Some("a"), "qa"), None);
        notes.begin(Some("a"));
        notes.observe(Some("a"), &view);
        assert_eq!(notes.previous(Some("a"), "qa"), Some("Anterior"));
        assert_eq!(notes.previous(Some("b"), "qa"), None);
        assert_eq!(notes.previous(None, "qa"), None);
        assert_eq!(notes.previous(Some("a"), "missing"), None);
        notes.begin(Some("a"));
        notes.observe(Some("b"), &view);
        assert_eq!(notes.previous(Some("b"), "qa"), None);
    }
}
