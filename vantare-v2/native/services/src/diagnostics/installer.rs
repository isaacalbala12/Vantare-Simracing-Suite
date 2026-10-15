//! Contrato inerte hasta integrarlo en #1591; nunca cambia una decisión guardada.
use super::read_bounded;
use crate::{Error, Result};
use serde::Deserialize;
use std::path::Path;

pub const CHOICE_FILE: &str = "installer-analytics-consent.json";

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Choice {
    version: u8,
    usage: bool,
    explicit: bool,
}

pub fn choice(root: &Path) -> Result<Option<bool>> {
    match read_bounded(&root.join(CHOICE_FILE), 1024) {
        Ok(bytes) => Ok(serde_json::from_slice::<Choice>(&bytes)
            .ok()
            .filter(|choice| choice.version == 1 && choice.explicit)
            .map(|choice| choice.usage)),
        Err(Error::NotFound | Error::TooLarge) => Ok(None),
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn installer_choice_is_versioned_explicit_and_closed() {
        let root = super::super::tests::root();
        assert_eq!(choice(&root).expect("absent"), None);
        for (document, expected) in [
            (r#"{"version":1,"usage":true,"explicit":true}"#, Some(true)),
            (
                r#"{"version":1,"usage":false,"explicit":true}"#,
                Some(false),
            ),
            (r#"{"version":1,"usage":true,"explicit":false}"#, None),
            (r#"{"version":2,"usage":true,"explicit":true}"#, None),
            (
                r#"{"version":1,"usage":true,"explicit":true,"email":"private"}"#,
                None,
            ),
            (r#"{"usage":true}"#, None),
            ("invalid", None),
        ] {
            std::fs::write(root.join(CHOICE_FILE), document).expect("fixture");
            assert_eq!(choice(&root).expect("choice"), expected);
        }
        std::fs::remove_dir_all(root).expect("cleanup");
    }
}
