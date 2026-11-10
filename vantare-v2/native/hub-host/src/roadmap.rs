//! Read-only projection of the core's published roadmap. No renderer paths or network.
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_ipc::services_protocol::roadmap_document::Publication;
pub const REFRESH_MS: u32 = 300_000;
pub const MAX_ITEMS: usize = 40;
pub const MAX_DOCUMENT_BYTES: usize = 40_000;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RoadmapItem {
    pub id: String,
    pub section: String,
    pub title: String,
    pub body: String,
    pub area: Option<String>,
    pub version: Option<String>,
    pub due_date: Option<String>,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RoadmapPublication {
    pub id: String,
    pub published_at: String,
    pub items: Vec<RoadmapItem>,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RoadmapView {
    pub publication: Option<RoadmapPublication>,
    pub stale: bool,
}
pub fn project(
    publication: Option<Publication>,
    stale: bool,
) -> Result<RoadmapView, crate::protocol::HostError> {
    let publication = publication
        .map(|publication| {
            let document = &publication.document;
            if ![1, 2].contains(&document.schema_version)
                || document.items.len() > MAX_ITEMS
                || serde_json::to_vec(document)
                    .map_err(|_| crate::protocol::HostError::Denied)?
                    .len()
                    > MAX_DOCUMENT_BYTES
                || document
                    .items
                    .iter()
                    .any(|item| !["next", "later", "now", "done"].contains(&item.section.as_str()))
            {
                return Err(crate::protocol::HostError::Denied);
            }
            Ok(RoadmapPublication {
                id: publication.id,
                published_at: publication.published_at,
                items: publication
                    .document
                    .items
                    .into_iter()
                    .map(|item| RoadmapItem {
                        id: item.id,
                        section: item.section,
                        title: item.title.es,
                        body: item.body.es,
                        area: item.area,
                        version: item.version,
                        due_date: item.due_date,
                    })
                    .collect(),
            })
        })
        .transpose()?;
    Ok(RoadmapView { publication, stale })
}
#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> Publication {
        serde_json::from_str(include_str!(
            "../../../hub-web/fixtures/roadmap-publication.json"
        ))
        .expect("fixture")
    }
    #[test]
    fn projection_preserves_literal_titles_ids_and_legacy_lane() {
        let mut sample = sample();
        sample.document.items[0].section = "later".into();
        let expected = sample.document.items[0].title.es.clone();
        let value = project(Some(sample), false)
            .expect("published")
            .publication
            .expect("some");
        assert_eq!(value.items[0].title, expected);
        assert_eq!(value.items[0].section, "later");
    }
    #[test]
    fn accepts_empty_publications_and_rejects_unknown_and_oversize() {
        let mut value = sample();
        value.document.items.clear();
        assert!(
            project(Some(value), false)
                .expect("empty publication")
                .publication
                .expect("published")
                .items
                .is_empty()
        );
        let mut value = sample();
        value.document.items[0].section = "private".into();
        assert!(project(Some(value), false).is_err());
        let mut value = sample();
        value.document.items[0].body.es = "x".repeat(MAX_DOCUMENT_BYTES);
        assert!(project(Some(value), false).is_err());
        assert_eq!(project(None, true).expect("absent").publication, None);
    }
}

/// The host owns the budget; renderer mounts cannot reset it. The caller supplies the clock.
fn reserve_refresh(last: &mut Option<std::time::Instant>, now: std::time::Instant) -> bool {
    if last.is_some_and(|last| {
        now.saturating_duration_since(last)
            < std::time::Duration::from_millis(u64::from(REFRESH_MS))
    }) {
        return false;
    }
    *last = Some(now);
    true
}
pub fn cached_if_throttled(
    last: &mut Option<std::time::Instant>,
    now: std::time::Instant,
    cached: &RoadmapView,
) -> Option<RoadmapView> {
    (!reserve_refresh(last, now)).then(|| cached.clone())
}
#[cfg(test)]
mod refresh_tests {
    use super::*;
    use std::time::{Duration, Instant};
    #[test]
    fn repeated_entries_and_failed_attempts_return_cache_without_another_service_attempt() {
        let now = Instant::now();
        let mut last = None;
        let publication = serde_json::from_str(include_str!(
            "../../../hub-web/fixtures/roadmap-publication.json"
        ))
        .expect("fixture");
        let mut cached = project(Some(publication), false).expect("published");
        assert!(cached_if_throttled(&mut last, now, &cached).is_none());
        // After a failed attempt the published value remains available and becomes stale.
        cached.stale = true;
        for elapsed in [0, 1, REFRESH_MS - 1] {
            assert_eq!(
                cached_if_throttled(
                    &mut last,
                    now + Duration::from_millis(u64::from(elapsed)),
                    &cached
                ),
                Some(cached.clone())
            );
        }
        let next = now + Duration::from_millis(u64::from(REFRESH_MS));
        assert!(cached_if_throttled(&mut last, next, &cached).is_none());
        assert_eq!(cached_if_throttled(&mut last, next, &cached), Some(cached));
    }
}
