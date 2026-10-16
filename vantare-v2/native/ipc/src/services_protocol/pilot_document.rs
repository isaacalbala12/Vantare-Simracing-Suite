//! Perfil privado de presentación. No concede identidad, membresía ni derechos.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const MAX_PHOTO_BYTES: usize = 24 * 1024;
pub const MAX_DOCUMENT_BYTES: usize = 48 * 1024;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct PilotProfile {
    pub public_name: String,
    pub description: String,
    pub country: Option<String>,
    pub simulators: Vec<String>,
    pub favorite_car: String,
    pub favorite_team: String,
    pub photo: Option<PilotPhoto>,
    /// Campos futuros conservados por lectores antiguos al editar el perfil.
    #[serde(flatten)]
    pub extensions: BTreeMap<String, serde_json::Value>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PilotPhoto {
    /// JPEG cuadrado de 256 px. El círculo se aplica en presentación.
    pub jpeg: String,
}

pub fn country_valid(value: &str) -> bool {
    // ISO 3166-1, incluyendo los territorios; nunca se infiere del idioma.
    const CODES: &str = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW";
    value.len() == 2 && CODES.split(' ').any(|code| code == value)
}

impl PilotProfile {
    pub fn validate(&self) -> bool {
        fn text(value: &str, limit: usize) -> bool {
            value.chars().count() <= limit && !value.chars().any(char::is_control)
        }
        text(&self.public_name, 64)
            && self.description.chars().count() <= 280
            && !self
                .description
                .chars()
                .any(|c| c.is_control() && c != '\n')
            && text(&self.favorite_car, 120)
            && text(&self.favorite_team, 120)
            && self.country.as_deref().is_none_or(country_valid)
            && self.simulators.len() <= 16
            && self
                .simulators
                .iter()
                .all(|value| !value.trim().is_empty() && text(value, 64))
            && self
                .simulators
                .iter()
                .enumerate()
                .all(|(i, value)| !self.simulators[..i].contains(value))
            && self.photo.as_ref().is_none_or(|photo| {
                !photo.jpeg.is_empty() && photo.jpeg.len() <= MAX_PHOTO_BYTES * 4 / 3
            })
            && serde_json::to_vec(self).is_ok_and(|bytes| bytes.len() <= MAX_DOCUMENT_BYTES)
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PilotState {
    pub profile: PilotProfile,
    pub revision: u64,
    pub remote_revision: u64,
    pub pending: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn old_reader_preserves_future_team_fields_and_accepts_empty_local_profile() {
        let mut profile: PilotProfile =
            serde_json::from_str(r#"{"team_memberships":["future"],"country":"ES"}"#)
                .expect("fixture válida");
        profile.public_name = "Piloto".into();
        assert!(profile.validate());
        assert_eq!(
            serde_json::to_value(profile).expect("fixture válida")["team_memberships"],
            serde_json::json!(["future"])
        );
        assert!(PilotProfile::default().validate());
    }
    #[test]
    fn profile_limits_and_country_reject_invalid_or_invented_data() {
        assert!(country_valid("ES"));
        assert!(country_valid("AX"));
        for country in ["es", "ZZ", "", "USA"] {
            assert!(!country_valid(country));
        }
        let mut profile = PilotProfile {
            public_name: "a".repeat(65),
            ..Default::default()
        };
        assert!(!profile.validate());
        profile.public_name = "a\n".into();
        assert!(!profile.validate());
        profile.public_name.clear();
        profile.simulators = vec!["LMU".into(), "LMU".into()];
        assert!(!profile.validate());
    }
}
