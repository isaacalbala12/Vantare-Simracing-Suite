//! Private, bounded participation DTOs. Account identity is never supplied by Hub.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Participation {
    pub questionnaires: Vec<Questionnaire>,
    pub contributions: Vec<Contribution>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Questionnaire {
    pub id: String,
    pub version: String,
    pub title: String,
    pub question: String,
    pub score: Option<u8>,
    pub note: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Contribution {
    pub id: String,
    pub title: String,
    pub body: String,
    pub state: String,
}
