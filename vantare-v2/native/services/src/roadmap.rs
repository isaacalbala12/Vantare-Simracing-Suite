pub use crate::protocol::roadmap_document::Publication;
use crate::{Error, Result, http::Http, license::uuid, storage::Store};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use url::Url;

fn validate(publication: &Publication) -> Result<()> {
    if !uuid(&publication.id)
        || chrono::DateTime::parse_from_rfc3339(&publication.published_at).is_err()
        || publication.document.schema_version != 1
        || publication.document.items.len() > 40
    {
        return Err(Error::Version);
    }
    let mut ids = HashSet::new();
    for item in &publication.document.items {
        if !uuid(&item.id)
            || !ids.insert(&item.id)
            || !matches!(item.section.as_str(), "now" | "next" | "done")
            || item.title.es.trim().is_empty()
        {
            return Err(Error::Protocol);
        }
        for text in [
            &item.title.es,
            &item.title.en,
            &item.title.pt,
            &item.title.it,
        ] {
            if text.chars().count() > 120 || text.contains('\0') {
                return Err(Error::TooLarge);
            }
        }
        for text in [&item.body.es, &item.body.en, &item.body.pt, &item.body.it] {
            if text.chars().count() > 600 || text.contains('\0') {
                return Err(Error::TooLarge);
            }
        }
    }
    if serde_json::to_vec(&publication.document)
        .map_err(|_| Error::Protocol)?
        .len()
        > 40_000
    {
        return Err(Error::TooLarge);
    }
    Ok(())
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Cached {
    version: u8,
    publication: Publication,
    fetched_at: u64,
}
pub struct Roadmap {
    cached: Option<Cached>,
}
impl Roadmap {
    pub fn restore(store: &Store) -> Result<Self> {
        let cached = match store.load::<Cached>("roadmap") {
            Ok(cache) if cache.version == 1 => {
                validate(&cache.publication).map_err(|_| Error::Storage)?;
                Some(cache)
            }
            Err(Error::NotFound) => None,
            _ => return Err(Error::Storage),
        };
        Ok(Self { cached })
    }
    pub fn publication(&self) -> Option<&Publication> {
        self.cached.as_ref().map(|cached| &cached.publication)
    }
    pub fn fetched_at(&self) -> Option<u64> {
        self.cached.as_ref().map(|cached| cached.fetched_at)
    }
    pub fn refresh(
        &mut self,
        http: &Http,
        base: &Url,
        anon: &str,
        now: u64,
        store: &Store,
    ) -> Result<()> {
        if anon.is_empty() {
            return Err(Error::Unconfigured);
        }
        let url = base
            .join("rest/v1/rpc/visual_roadmap_current")
            .map_err(|_| Error::Unconfigured)?;
        // POST is an explicitly read-only RPC. One request per manual refresh.
        let mut rows: Vec<Publication> = http
            .post_json(&url, &serde_json::json!({}), Some(anon), Some(anon))?
            .success()?
            .json()?;
        if rows.len() > 1 {
            return Err(Error::Protocol);
        }
        let publication = rows.pop().ok_or(Error::NotFound)?;
        validate(&publication)?;
        let cached = Cached {
            version: 1,
            publication,
            fetched_at: now,
        };
        store.save("roadmap", &cached)?;
        self.cached = Some(cached);
        Ok(())
    }
}

#[cfg(all(test, any(windows, unix)))]
mod tests {
    use super::*;
    use crate::test_http::Server;
    use std::time::Duration;
    #[test]
    fn last_valid_publication_survives_offline_future_schema_empty_and_restart() {
        let publication = serde_json::json!({"id":"550e8400-e29b-41d4-a716-446655440000","published_at":"2026-09-30T10:00:00Z","document":{"schemaVersion":1,"items":[]}});
        let mut incompatible = publication.clone();
        incompatible["document"]["schemaVersion"] = serde_json::json!(2);
        let server = Server::start(vec![
            (200, serde_json::json!([publication]).to_string()),
            (503, "{}".into()),
            (200, serde_json::json!([incompatible]).to_string()),
            (200, "[]".into()),
        ]);
        let (root, store) = crate::test_store("roadmap-test");
        let mut roadmap = Roadmap::restore(&store).expect("cache");
        assert!(roadmap.publication().is_none());
        roadmap
            .refresh(
                &Http::default(),
                &server.base,
                "public-fixture",
                100,
                &store,
            )
            .expect("refresh");
        assert!(
            roadmap
                .publication()
                .expect("valid empty publication")
                .document
                .items
                .is_empty()
        );
        for expected in [Error::Offline, Error::Version, Error::NotFound] {
            assert_eq!(
                roadmap
                    .refresh(
                        &Http::default(),
                        &server.base,
                        "public-fixture",
                        101,
                        &store
                    )
                    .err(),
                Some(expected)
            );
            assert_eq!(roadmap.fetched_at(), Some(100));
        }
        assert_eq!(
            Roadmap::restore(&store).expect("restart").fetched_at(),
            Some(100)
        );
        for _ in 0..4 {
            let request = server
                .requests
                .recv_timeout(Duration::from_secs(3))
                .expect("capture");
            assert!(request.starts_with("POST /rest/v1/rpc/visual_roadmap_current "));
        }
        server.finish();
        drop(store);
        crate::cleanup_store(&root, "roadmap-test", &["roadmap"]);
    }
    #[test]
    fn publication_validation_rejects_duplicates_unknown_sections_and_text_limits() {
        let text = crate::protocol::roadmap_document::Localized {
            es: "Título".into(),
            en: String::new(),
            pt: String::new(),
            it: String::new(),
        };
        let item = crate::protocol::roadmap_document::Item {
            id: "550e8400-e29b-41d4-a716-446655440001".into(),
            section: "now".into(),
            title: text.clone(),
            body: text,
        };
        let mut publication:Publication=serde_json::from_value(serde_json::json!({"id":"550e8400-e29b-41d4-a716-446655440000","published_at":"2026-09-30T10:00:00Z","document":{"schemaVersion":1,"items":[]}})).expect("test");
        publication.document.items = vec![item.clone(), item];
        assert!(validate(&publication).is_err());
        publication.document.items.pop();
        publication.document.items[0].section = "invented".into();
        assert!(validate(&publication).is_err());
        publication.document.items[0].section = "now".into();
        publication.document.items[0].title.es = "ñ".repeat(121);
        assert!(validate(&publication).is_err());
    }
}
