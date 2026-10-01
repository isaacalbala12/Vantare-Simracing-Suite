//! Las mismas notas versionadas que importa `frontend/src/hub/release-news.ts`.
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Release {
    pub schema_version: u32,
    pub tag: String,
    pub channel: String,
    pub title: String,
    pub summary: String,
}

pub(super) fn news() -> Result<Vec<Release>, &'static str> {
    [
        include_str!("../../../../docs/releases/v0.1.0.7-testers.2.json"),
        include_str!("../../../../docs/releases/v0.1.0.7-testers.1.json"),
        include_str!("../../../../docs/releases/v0.1.0.7-nightly.15.json"),
        include_str!("../../../../docs/releases/v0.1.0.7-nightly.14.json"),
        include_str!("../../../../docs/releases/v0.1.0.7-nightly.13.json"),
        include_str!("../../../../docs/releases/v0.1.0.7-nightly.12.json"),
        include_str!("../../../../docs/releases/v0.1.0.7-nightly.11.json"),
        include_str!("../../../../docs/releases/v0.1.0.7-nightly.10.json"),
        include_str!("../../../../docs/releases/v0.1.0.7-nightly.9.json"),
        include_str!("../../../../docs/releases/v0.1.0.7-nightly.8.json"),
        include_str!("../../../../docs/releases/v0.1.0.7-nightly.7.json"),
        include_str!("../../../../docs/releases/v0.1.0.7-nightly.6.json"),
        include_str!("../../../../docs/releases/v0.1.0.7-nightly.5.json"),
        include_str!("../../../../docs/releases/v0.1.0.7-nightly.4.json"),
        include_str!("../../../../docs/releases/v0.1.0.7-nightly.2.json"),
        include_str!("../../../../docs/releases/v0.1.0.7-nightly.1.json"),
        include_str!("../../../../docs/releases/v0.1.0.5-nightly.1.json"),
    ]
    .into_iter()
    .map(|json| {
        let release: Release =
            serde_json::from_str(json).map_err(|_| "Nota de versión inválida")?;
        if release.schema_version != 1
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
