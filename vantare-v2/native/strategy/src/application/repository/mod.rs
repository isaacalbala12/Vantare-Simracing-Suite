//! Read-only import of the last legacy draft. Never rewrites the repository.
use serde::Deserialize;
use serde::de::{self, DeserializeSeed, MapAccess, SeqAccess, Visitor};
use serde_json::value::RawValue;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Read;
use std::path::Path;

const REPOSITORY_VERSION_V1: &str = "strategy.repository.v1";
const REPOSITORY_VERSION_V2: &str = "strategy.repository.v2";
const HASH_ALGORITHM: &str = "sha256:strategy-repository-json-v1";
const FILE_NAME: &str = "strategy-repository.json";
const MAX_SAFE_GENERATION: u64 = (1_u64 << 53) - 1;
const MAX_REPOSITORY_BYTES: u64 = 64 << 20;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiskEnvelope {
    repository_version: String,
    hash_algorithm: String,
    generation: u64,
    drafts: Option<Vec<Box<RawValue>>>,
    revisions: Option<Vec<Box<RawValue>>>,
    active_plan: Option<Box<RawValue>>,
    activations: Option<Vec<Box<RawValue>>>,
    strategy_document: Option<Box<RawValue>>,
    pending_revision: Option<Box<RawValue>>,
    content_hash: String,
}

/// Returns only observed draft bytes after validating the complete v1/v2 hash.
/// The caller validates the Strategy document and atomically creates its primary
/// file. Once that file exists it must stop consulting this legacy source.
pub fn import_last_draft(root: impl AsRef<Path>) -> Result<Option<Vec<u8>>, String> {
    let file = match File::open(root.as_ref().join(FILE_NAME)) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("read Strategy repository: {error}")),
    };
    if file
        .metadata()
        .map_err(|error| format!("stat Strategy repository: {error}"))?
        .len()
        > MAX_REPOSITORY_BYTES
    {
        return Err("repository_size_limit".into());
    }
    let bytes = read_repository_bytes(file)?;
    let envelope = decode_repository(&bytes)?;
    let Some(draft) = envelope.drafts.as_deref().and_then(|drafts| drafts.last()) else {
        return Ok(None);
    };
    let bytes = draft.get().as_bytes();
    if bytes.len() > crate::document::MAX_BYTES {
        return Err("repository_document_size_limit".into());
    }
    if !draft.get().starts_with('{') {
        return Err("invalid_repository_document".into());
    }
    Ok(Some(bytes.to_vec()))
}

fn decode_repository(bytes: &[u8]) -> Result<DiskEnvelope, String> {
    reject_duplicate_json_keys(bytes)?;
    let envelope: DiskEnvelope = serde_json::from_slice(bytes)
        .map_err(|error| format!("corrupt_repository: decode envelope: {error}"))?;
    if !matches!(
        envelope.repository_version.as_str(),
        REPOSITORY_VERSION_V1 | REPOSITORY_VERSION_V2
    ) {
        return Err(format!(
            "unsupported_repository_version: {}",
            envelope.repository_version
        ));
    }
    if envelope.hash_algorithm != HASH_ALGORITHM
        || envelope.generation > MAX_SAFE_GENERATION
        || (envelope.repository_version == REPOSITORY_VERSION_V1
            && envelope.strategy_document.is_some())
        || envelope.content_hash != hash_envelope(&envelope)?
    {
        return Err("corrupt_repository: invalid envelope or content hash".into());
    }
    Ok(envelope)
}

fn read_repository_bytes(reader: impl Read) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    reader
        .take(MAX_REPOSITORY_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("read Strategy repository: {error}"))?;
    if bytes.len() as u64 > MAX_REPOSITORY_BYTES {
        return Err("repository_size_limit".into());
    }
    Ok(bytes)
}

fn hash_envelope(envelope: &DiskEnvelope) -> Result<String, String> {
    let mut fields = vec![
        (
            "repositoryVersion",
            encode_json_string(&envelope.repository_version)?,
        ),
        (
            "hashAlgorithm",
            encode_json_string(&envelope.hash_algorithm)?,
        ),
        ("generation", envelope.generation.to_string().into_bytes()),
        ("drafts", encode_raw_array(envelope.drafts.as_deref())?),
        (
            "revisions",
            encode_raw_array(envelope.revisions.as_deref())?,
        ),
    ];
    if let Some(active_plan) = &envelope.active_plan {
        fields.push(("activePlan", compact_json(active_plan.get().as_bytes())?));
    }
    if let Some(activations) = envelope
        .activations
        .as_deref()
        .filter(|items| !items.is_empty())
    {
        fields.push(("activations", encode_raw_array(Some(activations))?));
    }
    if let Some(strategy_document) = &envelope.strategy_document {
        fields.push((
            "strategyDocument",
            compact_json(strategy_document.get().as_bytes())?,
        ));
    }
    if let Some(pending_revision) = &envelope.pending_revision {
        fields.push((
            "pendingRevision",
            compact_json(pending_revision.get().as_bytes())?,
        ));
    }
    let encoded = encode_object(fields)?;
    let digest = Sha256::digest(encoded);
    let mut result = String::with_capacity(64);
    for byte in digest {
        use std::fmt::Write as _;
        write!(&mut result, "{byte:02x}").map_err(|_| "invalid_repository_hash")?;
    }
    Ok(result)
}

fn encode_object(fields: Vec<(&str, Vec<u8>)>) -> Result<Vec<u8>, String> {
    let mut output = Vec::new();
    output.push(b'{');
    for (index, (name, value)) in fields.into_iter().enumerate() {
        if index != 0 {
            output.push(b',');
        }
        output.extend_from_slice(&encode_json_string(name)?);
        output.push(b':');
        output.extend_from_slice(&value);
    }
    output.push(b'}');
    Ok(output)
}

fn encode_raw_array(items: Option<&[Box<RawValue>]>) -> Result<Vec<u8>, String> {
    let Some(items) = items else {
        return Ok(b"null".to_vec());
    };
    let mut output = Vec::from(&b"["[..]);
    for (index, item) in items.iter().enumerate() {
        if index != 0 {
            output.push(b',');
        }
        output.extend_from_slice(&compact_json(item.get().as_bytes())?);
    }
    output.push(b']');
    Ok(output)
}

fn encode_json_string(value: &str) -> Result<Vec<u8>, String> {
    let encoded =
        serde_json::to_vec(value).map_err(|error| format!("encode JSON string: {error}"))?;
    Ok(escape_go_html(&encoded))
}

fn escape_go_html(value: &[u8]) -> Vec<u8> {
    let mut output = Vec::with_capacity(value.len());
    let mut index = 0;
    while index < value.len() {
        if value[index..].starts_with(b"<") {
            output.extend_from_slice(b"\\u003c");
        } else if value[index..].starts_with(b">") {
            output.extend_from_slice(b"\\u003e");
        } else if value[index..].starts_with(b"&") {
            output.extend_from_slice(b"\\u0026");
        } else if value[index..].starts_with(&[0xe2, 0x80, 0xa8]) {
            output.extend_from_slice(b"\\u2028");
            index += 2;
        } else if value[index..].starts_with(&[0xe2, 0x80, 0xa9]) {
            output.extend_from_slice(b"\\u2029");
            index += 2;
        } else {
            output.push(value[index]);
        }
        index += 1;
    }
    output
}

fn compact_json(value: &[u8]) -> Result<Vec<u8>, String> {
    let mut index = 0;
    let mut output = Vec::with_capacity(value.len());
    compact_value(value, &mut index, &mut output)?;
    skip_whitespace(value, &mut index);
    if index != value.len() {
        return Err("invalid_repository_json".into());
    }
    Ok(output)
}

fn compact_value(value: &[u8], index: &mut usize, output: &mut Vec<u8>) -> Result<(), String> {
    skip_whitespace(value, index);
    match value.get(*index).copied() {
        Some(b'{') => {
            *index += 1;
            output.push(b'{');
            skip_whitespace(value, index);
            if value.get(*index) == Some(&b'}') {
                *index += 1;
                output.push(b'}');
                return Ok(());
            }
            loop {
                skip_whitespace(value, index);
                let key = read_json_string(value, index)?;
                output.extend_from_slice(&encode_json_string(&key)?);
                skip_whitespace(value, index);
                expect_byte(value, index, b':')?;
                output.push(b':');
                compact_value(value, index, output)?;
                skip_whitespace(value, index);
                match value.get(*index) {
                    Some(b',') => {
                        *index += 1;
                        output.push(b',');
                    }
                    Some(b'}') => {
                        *index += 1;
                        output.push(b'}');
                        break;
                    }
                    _ => return Err("invalid_repository_json".into()),
                }
            }
        }
        Some(b'[') => {
            *index += 1;
            output.push(b'[');
            skip_whitespace(value, index);
            if value.get(*index) == Some(&b']') {
                *index += 1;
                output.push(b']');
                return Ok(());
            }
            loop {
                compact_value(value, index, output)?;
                skip_whitespace(value, index);
                match value.get(*index) {
                    Some(b',') => {
                        *index += 1;
                        output.push(b',');
                    }
                    Some(b']') => {
                        *index += 1;
                        output.push(b']');
                        break;
                    }
                    _ => return Err("invalid_repository_json".into()),
                }
            }
        }
        Some(b'"') => {
            let string = read_json_string(value, index)?;
            output.extend_from_slice(&encode_json_string(&string)?);
        }
        Some(_) => {
            let start = *index;
            while let Some(byte) = value.get(*index) {
                if byte.is_ascii_whitespace() || matches!(byte, b',' | b']' | b'}') {
                    break;
                }
                *index += 1;
            }
            if *index == start {
                return Err("invalid_repository_json".into());
            }
            output.extend_from_slice(&value[start..*index]);
        }
        None => return Err("invalid_repository_json".into()),
    }
    Ok(())
}

fn read_json_string(value: &[u8], index: &mut usize) -> Result<String, String> {
    if value.get(*index) != Some(&b'"') {
        return Err("invalid_repository_json".into());
    }
    let start = *index;
    *index += 1;
    let mut escaped = false;
    while let Some(byte) = value.get(*index) {
        *index += 1;
        if escaped {
            escaped = false;
        } else if *byte == b'\\' {
            escaped = true;
        } else if *byte == b'"' {
            return serde_json::from_slice(&value[start..*index])
                .map_err(|error| format!("invalid_repository_json: {error}"));
        }
    }
    Err("invalid_repository_json".into())
}

fn expect_byte(value: &[u8], index: &mut usize, expected: u8) -> Result<(), String> {
    if value.get(*index) != Some(&expected) {
        return Err("invalid_repository_json".into());
    }
    *index += 1;
    Ok(())
}

fn skip_whitespace(value: &[u8], index: &mut usize) {
    while value.get(*index).is_some_and(u8::is_ascii_whitespace) {
        *index += 1;
    }
}

fn reject_duplicate_json_keys(document: &[u8]) -> Result<(), String> {
    let mut deserializer = serde_json::Deserializer::from_slice(document);
    UniqueValue
        .deserialize(&mut deserializer)
        .map_err(|error| format!("corrupt_repository: {error}"))?;
    deserializer
        .end()
        .map_err(|error| format!("corrupt_repository: {error}"))
}

struct UniqueValue;

impl<'de> DeserializeSeed<'de> for UniqueValue {
    type Value = ();

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_any(UniqueVisitor)
    }
}

struct UniqueVisitor;

impl<'de> Visitor<'de> for UniqueVisitor {
    type Value = ();

    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("a JSON value with unique object keys")
    }

    fn visit_bool<E>(self, _: bool) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_i64<E>(self, _: i64) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_u64<E>(self, _: u64) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_f64<E>(self, _: f64) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_str<E>(self, _: &str) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_string<E>(self, _: String) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_none<E>(self) -> Result<Self::Value, E> {
        Ok(())
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        while sequence.next_element_seed(UniqueValue)?.is_some() {}
        Ok(())
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let mut keys = std::collections::BTreeSet::new();
        while let Some(key) = map.next_key::<String>()? {
            if !keys.insert(key.clone()) {
                return Err(de::Error::custom(format!("duplicate object key {key:?}")));
            }
            map.next_value_seed(UniqueValue)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    struct Root(PathBuf);
    impl Root {
        fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let path = std::env::temp_dir().join(format!(
                "vantare-r9-import-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&path).expect("fresh owned root");
            Self(path)
        }
        fn load(&self, bytes: &[u8]) -> Result<Option<Vec<u8>>, String> {
            let path = self.0.join(FILE_NAME);
            fs::write(&path, bytes).expect("fixture");
            let result = import_last_draft(&self.0);
            assert_eq!(fs::read(&path).expect("untouched source"), bytes);
            assert_eq!(fs::read_dir(&self.0).expect("only source file").count(), 1);
            result
        }
    }
    impl Drop for Root {
        fn drop(&mut self) {
            if let Err(error) = fs::remove_dir_all(&self.0) {
                eprintln!("remove owned fixture: {error}");
            }
        }
    }

    // Only a test-fixture encoder. Production retains no repository writer.
    fn fixture(version: &str, generation: u64, drafts: &str) -> Vec<u8> {
        let text = format!(
            r#"{{"repositoryVersion":"{version}","hashAlgorithm":"{HASH_ALGORITHM}","generation":{generation},"drafts":[{drafts}],"revisions":[],"contentHash":""}}"#
        );
        let envelope: DiskEnvelope = serde_json::from_str(&text).expect("fixture envelope");
        let hash = hash_envelope(&envelope).expect("fixture hash");
        text.replace(r#""contentHash":"""#, &format!(r#""contentHash":"{hash}""#))
            .into_bytes()
    }

    #[test]
    fn both_frozen_go_versions_verify_without_migration_or_writing() {
        let root = Root::new();
        for bytes in [
            include_bytes!("../../../testdata/oracle/repository-v1-go.json").as_slice(),
            include_bytes!("../../../testdata/oracle/repository-v2-go.golden.json").as_slice(),
        ] {
            let draft = root
                .load(bytes)
                .expect("verified Go envelope")
                .expect("last draft");
            let value: serde_json::Value = serde_json::from_slice(&draft).expect("Go draft");
            assert_eq!(value["draftId"], "fixture-draft");
        }
    }

    #[test]
    fn imports_only_the_last_native_draft_with_unknown_bytes_unchanged() {
        let root = Root::new();
        let first = r#"{"contractVersion":"strategy.v2","schemaVersion":"2.1.0","generatedAt":"2026-11-01T00:00:00Z","events":[]}"#;
        let last = r#"{"contractVersion":"strategy.v2", "schemaVersion":"2.1.0", "generatedAt":"2026-11-02T00:00:00Z", "events":[], "future":{"gain":1.2300}}"#;
        for version in [REPOSITORY_VERSION_V1, REPOSITORY_VERSION_V2] {
            let bytes = fixture(version, 7, &format!("{first},{last}"));
            let imported = root.load(&bytes).expect("import").expect("draft");
            assert_eq!(imported, last.as_bytes());
            crate::document::Document::parse(&imported).expect("native document");
        }
    }

    #[test]
    fn missing_and_empty_sources_do_not_create_a_store() {
        let root = Root::new();
        let absent = root.0.join("absent");
        assert!(
            import_last_draft(&absent)
                .expect("absent repository")
                .is_none()
        );
        assert!(!absent.exists());
        let bytes = fixture(REPOSITORY_VERSION_V2, 0, "");
        assert!(root.load(&bytes).expect("empty source").is_none());
    }

    #[test]
    fn rejects_corrupt_hash_future_version_and_unsafe_generation_without_writes() {
        let root = Root::new();
        let valid = fixture(REPOSITORY_VERSION_V2, 7, r#"{"draftId":"draft"}"#);
        let envelope: DiskEnvelope = serde_json::from_slice(&valid).expect("valid source");
        let corrupt = String::from_utf8(valid)
            .expect("JSON")
            .replace(&envelope.content_hash, &"0".repeat(64));
        assert!(root.load(corrupt.as_bytes()).is_err());
        assert!(
            root.load(&fixture("strategy.repository.v3", 7, "{}"))
                .is_err()
        );
        assert!(
            root.load(&fixture(
                REPOSITORY_VERSION_V1,
                MAX_SAFE_GENERATION + 1,
                "{}"
            ))
            .is_err()
        );
    }

    #[test]
    fn duplicate_keys_are_rejected_even_with_a_matching_hash() {
        let root = Root::new();
        let bytes = fixture(
            REPOSITORY_VERSION_V2,
            7,
            r#"{"draftId":"first","draftId":"second"}"#,
        );
        let envelope: DiskEnvelope = serde_json::from_slice(&bytes).expect("raw duplicate source");
        assert_eq!(
            envelope.content_hash,
            hash_envelope(&envelope).expect("matching hash")
        );
        assert!(root.load(&bytes).is_err());
    }

    #[test]
    fn repository_read_stops_at_limit_plus_one() {
        let mut reader = std::io::repeat(b' ').take(MAX_REPOSITORY_BYTES * 2);
        assert!(read_repository_bytes(&mut reader).is_err());
        assert_eq!(reader.limit(), MAX_REPOSITORY_BYTES - 1);
    }

    #[test]
    fn oversized_or_nonobject_last_drafts_are_rejected_without_writes() {
        let root = Root::new();
        for draft in ["[]", "null", "true"] {
            let bytes = fixture(REPOSITORY_VERSION_V2, 7, draft);
            assert!(root.load(&bytes).is_err());
        }
        let draft = format!(
            r#"{{"future":"{}"}}"#,
            "x".repeat(crate::document::MAX_BYTES)
        );
        let bytes = fixture(REPOSITORY_VERSION_V2, 7, &draft);
        assert!(root.load(&bytes).is_err());
    }

    #[test]
    fn oversized_source_is_rejected_without_reading_or_changing_it() {
        let root = Root::new();
        let path = root.0.join(FILE_NAME);
        let file = File::create(&path).expect("sparse source");
        file.set_len(MAX_REPOSITORY_BYTES + 1).expect("oversize");
        drop(file);
        assert!(import_last_draft(&root.0).is_err());
        assert_eq!(
            fs::metadata(path).expect("preserved source").len(),
            MAX_REPOSITORY_BYTES + 1
        );
        assert_eq!(fs::read_dir(&root.0).expect("only source").count(), 1);
    }
}
