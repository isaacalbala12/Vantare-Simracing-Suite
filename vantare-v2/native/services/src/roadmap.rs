pub use crate::protocol::roadmap_document::Publication;
use crate::{Error, Result, http::Http, license::uuid, storage::Store};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use url::Url;

/// Un RFC3339 con fraccion de segundo y desplazamiento no llega a 40 caracteres.
///
/// Sin esta cota, un `published_at` de decenas de miles de digitos pasa
/// `parse_from_rfc3339` (chrono acepta un desplazamiento arbitrariamente largo)
/// y hace que la respuesta supere el marco del protocolo.
const MAX_TIMESTAMP_CHARS: usize = 40;
/// Presupuesto del documento.
const MAX_DOCUMENT_BYTES: usize = 40_000;
/// Presupuesto del conjunto publicado. `protocol::write` rechaza lo que supere
/// `MAX_FRAME`, y ese rechazo deja el servicio en FAILURE con la cache ya
/// escrita: reiniciar no lo cura, hay que borrar el fichero a mano.
const MAX_PUBLICATION_BYTES: usize = 56 * 1024;

fn validate(publication: &Publication) -> Result<()> {
    if !uuid(&publication.id)
        || publication.published_at.chars().count() > MAX_TIMESTAMP_CHARS
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
        > MAX_DOCUMENT_BYTES
    {
        return Err(Error::TooLarge);
    }
    // Cota del conjunto, no solo del documento: es la que ata el tamano de la
    // respuesta al marco del protocolo y protege ante campos futuros.
    if serde_json::to_vec(publication)
        .map_err(|_| Error::Protocol)?
        .len()
        > MAX_PUBLICATION_BYTES
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
        let cached = match store.load_for_restore::<Cached>("roadmap") {
            Ok(Some(cache)) if cache.version == 1 && validate(&cache.publication).is_ok() => {
                Some(cache)
            }
            Ok(None) | Err(Error::NotFound) => None,
            // Ilegible o invalido: se aparta y se sigue sin cache. Devolver
            // `Err` dejaba el roadmap muerto en cada arranque para siempre.
            Ok(_) => {
                store.quarantine("roadmap");
                None
            }

            Err(error) => return Err(error),
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
    #[test]
    fn timestamp_is_bounded_and_a_full_publication_stays_inside_the_frame() {
        let text = |count: usize| crate::protocol::roadmap_document::Localized {
            es: "x".repeat(count),
            en: String::new(),
            pt: String::new(),
            it: String::new(),
        };
        let mut publication: Publication = serde_json::from_value(serde_json::json!({
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "published_at": "2026-09-30T10:00:00Z",
            "document": {"schemaVersion": 1, "items": []}
        }))
        .expect("test");
        publication.document.items = (0..8)
            .map(|index| crate::protocol::roadmap_document::Item {
                id: format!("550e8400-e29b-41d4-a716-44665544000{index}"),
                section: "now".into(),
                title: text(120),
                body: text(600),
            })
            .collect();
        assert!(
            validate(&publication).is_ok(),
            "un documento lleno dentro de los limites debe pasar"
        );
        assert!(
            serde_json::to_vec(&publication).expect("serializar").len()
                < crate::protocol::MAX_FRAME,
            "un conjunto valido debe caber en el marco"
        );

        // `parse_from_rfc3339` acepta desplazamientos largos, asi que el
        // timestamp era el unico campo sin cota y desbordaba el marco: la
        // respuesta se rechazaba al escribir y el servicio moria con la cache
        // ya envenenada.
        publication.published_at = format!("2026-09-30T10:00:00+{}:00", "0".repeat(25_000));
        assert!(
            validate(&publication).is_err(),
            "un published_at de 25.000 digitos debe rechazarse"
        );
    }
    /// Un documento invalido apartaba el servicio para siempre: cada arranque
    /// devolvia `Err` y la unica salida era borrar el fichero a mano.
    #[test]
    fn a_corrupt_document_is_quarantined_and_the_service_still_starts() {
        let (_root, store) = crate::test_store("roadmap-quarantine");
        // Publicacion con id que no es uuid: JSON valido, contenido invalido.
        let corrupt: Cached = serde_json::from_value(serde_json::json!({
            "version": 1,
            "fetched_at": 1,
            "publication": {
                "id": "no-es-un-uuid",
                "published_at": "2026-09-30T10:00:00Z",
                "document": {"schemaVersion": 1, "items": []}
            }
        }))
        .expect("construir cache invalida");
        store
            .save("roadmap", &corrupt)
            .expect("guardar cache invalida");

        // Antes: Err en cada arranque. Ahora: arranca sin cache...
        let roadmap = Roadmap::restore(&store).expect("debe arrancar");
        assert!(roadmap.publication().is_none());

        // ...y el documento se ha APARTADO, no ignorado: por eso el siguiente
        // arranque tampoco tropieza.
        assert!(
            matches!(store.load::<Cached>("roadmap"), Err(Error::NotFound)),
            "el documento invalido debe quedar apartado"
        );
        assert!(
            Roadmap::restore(&store)
                .expect("segundo arranque")
                .publication()
                .is_none()
        );
    }
}
