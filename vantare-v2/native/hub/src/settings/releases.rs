//! Resúmenes para clientes de las versiones publicadas; no se muestran notas internas.
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Release {
    pub schema_version: u32,
    pub tag: String,
    pub channel: String,
    pub title: String,
    pub summary: String,
    pub kind: String,
}

pub(super) fn news() -> Result<Vec<Release>, &'static str> {
    let releases: Vec<Release> = serde_json::from_str(include_str!("customer-news.json"))
        .map_err(|_| "Notas de versión inválidas")?;
    releases
        .into_iter()
        .map(|release| {
            if release.schema_version != 1
                || !matches!(release.kind.as_str(), "Nuevo" | "Mejora" | "Arreglo")
                || !matches!(release.channel.as_str(), "master" | "testers" | "nightly")
                || [&release.tag, &release.title, &release.summary]
                    .iter()
                    .any(|value| value.trim().is_empty())
            {
                return Err("Nota de versión fuera del contrato");
            }
            Ok(release)
        })
        .collect()
}

/// Un canal no anuncia las entregas restringidas a otro público.
pub(super) fn news_for_channel(channel: &str) -> Result<Vec<Release>, &'static str> {
    Ok(news()?
        .into_iter()
        .filter(|release| match channel {
            "nightly" => true,
            "testers" | "beta" => release.channel != "nightly",
            _ => release.channel == "master",
        })
        .collect())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn installed_channel_limits_visible_release_notes() {
        for channel in ["testers", "beta"] {
            let notes = news_for_channel(channel).expect("valid notes");
            assert!(!notes.is_empty());
            assert!(notes.iter().all(|note| note.channel != "nightly"));
        }
        for channel in ["master", "stable", "unknown"] {
            assert!(
                news_for_channel(channel)
                    .expect("notes")
                    .iter()
                    .all(|note| note.channel == "master")
            );
        }
        assert_eq!(
            news_for_channel("nightly").expect("notes").len(),
            news().expect("notes").len()
        );
    }
}
