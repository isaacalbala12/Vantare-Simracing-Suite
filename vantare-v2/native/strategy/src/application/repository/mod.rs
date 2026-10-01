//! Local Strategy document storage and Go-compatible repository migration.
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use serde::Deserialize;
use serde::de::{self, DeserializeSeed, MapAccess, SeqAccess, Visitor};
use serde_json::value::RawValue;
use sha2::{Digest, Sha256};

const REPOSITORY_VERSION_V1: &str = "strategy.repository.v1";
const REPOSITORY_VERSION_V2: &str = "strategy.repository.v2";
const HASH_ALGORITHM: &str = "sha256:strategy-repository-json-v1";
const FILE_NAME: &str = "strategy-repository.json";
const MAX_SAFE_GENERATION: u64 = (1_u64 << 53) - 1;
const MAX_REPOSITORY_BYTES: u64 = 64 << 20;
const MAX_DOCUMENT_BYTES: usize = 12 << 20;
static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(1);

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

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionHeader {
    repository_version: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MigrationStep {
    pub from: String,
    pub to: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RepositorySnapshot {
    pub generation: u64,
    /// Complete JSON documents with Go-compatible compact formatting.
    pub drafts: Vec<String>,
    pub revisions: Vec<String>,
}

/// Local repository that persists only Strategy JSON documents.
pub struct LocalRepository {
    root: PathBuf,
}

impl LocalRepository {
    pub fn open(root: impl AsRef<Path>) -> Result<Self, String> {
        let root = root.as_ref();
        fs::create_dir_all(root)
            .map_err(|error| format!("create repository directory: {error}"))?;
        let metadata =
            fs::metadata(root).map_err(|error| format!("inspect repository directory: {error}"))?;
        if !metadata.is_dir() {
            return Err("repository path is not a directory".into());
        }
        Ok(Self {
            root: root.to_path_buf(),
        })
    }

    pub fn load(&self) -> Result<RepositorySnapshot, String> {
        let Some(envelope) = self.load_envelope()? else {
            return Ok(empty_snapshot());
        };
        snapshot_from_envelope(&envelope)
    }

    /// Replaces drafts and revisions in one generation-checked local commit.
    pub fn save_documents(
        &self,
        expected_generation: u64,
        drafts: &[String],
        revisions: &[String],
    ) -> Result<RepositorySnapshot, String> {
        let mut envelope = match self.load_envelope()? {
            Some(envelope) => envelope,
            None => empty_envelope()?,
        };
        if envelope.generation != expected_generation {
            return Err("repository_version_conflict".into());
        }
        if envelope.generation >= MAX_SAFE_GENERATION {
            return Err("repository_generation_limit".into());
        }
        let next_drafts = parse_documents(drafts)?;
        let next_revisions = parse_documents(revisions)?;
        envelope.generation += 1;
        envelope.drafts = Some(next_drafts);
        envelope.revisions = Some(next_revisions);
        envelope.content_hash = hash_envelope(&envelope)?;
        let bytes = encode_pretty_envelope(&envelope)?;
        if bytes.len() as u64 > MAX_REPOSITORY_BYTES {
            return Err("repository_size_limit".into());
        }
        atomic_write(&self.root.join(FILE_NAME), &bytes)?;
        snapshot_from_envelope(&envelope)
    }

    fn load_envelope(&self) -> Result<Option<DiskEnvelope>, String> {
        let path = self.root.join(FILE_NAME);
        let bytes = match fs::read(&path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(format!("read Strategy repository: {error}")),
        };
        if bytes.len() as u64 > MAX_REPOSITORY_BYTES {
            return Err("repository_size_limit".into());
        }
        let (migrated, steps) = migrate_repository_json(&bytes)?;
        if !steps.is_empty() {
            atomic_write(&path, &migrated)?;
        }
        let envelope = decode_envelope(&migrated)?;
        validate_envelope(&envelope)?;
        Ok(Some(envelope))
    }
}

/// Migrates v1 to v2; v2 bytes are returned unchanged, making the gate idempotent.
pub fn migrate_repository_json(document: &[u8]) -> Result<(Vec<u8>, Vec<MigrationStep>), String> {
    reject_duplicate_json_keys(document)?;
    let header: VersionHeader = serde_json::from_slice(document)
        .map_err(|error| format!("corrupt_repository: decode version: {error}"))?;
    match header.repository_version.as_str() {
        REPOSITORY_VERSION_V2 => Ok((document.to_vec(), Vec::new())),
        REPOSITORY_VERSION_V1 => migrate_v1(document),
        version => Err(format!("unsupported_repository_version: {version}")),
    }
}

fn migrate_v1(document: &[u8]) -> Result<(Vec<u8>, Vec<MigrationStep>), String> {
    let mut envelope = decode_envelope(document)?;
    if envelope.hash_algorithm != HASH_ALGORITHM || envelope.strategy_document.is_some() {
        return Err("corrupt_repository: unsupported v1 repository envelope".into());
    }
    let expected_hash = hash_envelope(&envelope)?;
    if envelope.content_hash != expected_hash {
        return Err("corrupt_repository: repository content hash mismatch".into());
    }
    envelope.repository_version = REPOSITORY_VERSION_V2.into();
    envelope.content_hash = hash_envelope(&envelope)?;
    let migrated = encode_pretty_envelope(&envelope)?;
    Ok((
        migrated,
        vec![MigrationStep {
            from: REPOSITORY_VERSION_V1.into(),
            to: REPOSITORY_VERSION_V2.into(),
        }],
    ))
}

fn decode_envelope(document: &[u8]) -> Result<DiskEnvelope, String> {
    serde_json::from_slice(document)
        .map_err(|error| format!("corrupt_repository: decode envelope: {error}"))
}

fn validate_envelope(envelope: &DiskEnvelope) -> Result<(), String> {
    if envelope.repository_version != REPOSITORY_VERSION_V2
        || envelope.hash_algorithm != HASH_ALGORITHM
        || envelope.generation > MAX_SAFE_GENERATION
        || envelope.content_hash != hash_envelope(envelope)?
    {
        return Err("corrupt_repository: invalid v2 envelope or content hash".into());
    }
    Ok(())
}

fn empty_envelope() -> Result<DiskEnvelope, String> {
    let mut envelope = DiskEnvelope {
        repository_version: REPOSITORY_VERSION_V2.into(),
        hash_algorithm: HASH_ALGORITHM.into(),
        generation: 0,
        drafts: Some(Vec::new()),
        revisions: Some(Vec::new()),
        active_plan: None,
        activations: None,
        strategy_document: None,
        pending_revision: None,
        content_hash: String::new(),
    };
    envelope.content_hash = hash_envelope(&envelope)?;
    Ok(envelope)
}

fn snapshot_from_envelope(envelope: &DiskEnvelope) -> Result<RepositorySnapshot, String> {
    let drafts = envelope
        .drafts
        .as_ref()
        .into_iter()
        .flatten()
        .map(|document| compact_document(document.get()))
        .collect::<Result<Vec<_>, _>>()?;
    let revisions = envelope
        .revisions
        .as_ref()
        .into_iter()
        .flatten()
        .map(|document| compact_document(document.get()))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(RepositorySnapshot {
        generation: envelope.generation,
        drafts,
        revisions,
    })
}

fn compact_document(document: &str) -> Result<String, String> {
    String::from_utf8(compact_json(document.as_bytes())?)
        .map_err(|error| format!("decode repository document: {error}"))
}

fn empty_snapshot() -> RepositorySnapshot {
    RepositorySnapshot {
        generation: 0,
        drafts: Vec::new(),
        revisions: Vec::new(),
    }
}

fn parse_documents(documents: &[String]) -> Result<Vec<Box<RawValue>>, String> {
    documents
        .iter()
        .map(|document| {
            if document.len() > MAX_DOCUMENT_BYTES {
                return Err("repository_document_size_limit".into());
            }
            reject_duplicate_json_keys(document.as_bytes())?;
            if !document.trim_start().starts_with('{') {
                return Err("invalid_repository_document".into());
            }
            serde_json::from_str::<Box<RawValue>>(document)
                .map_err(|error| format!("invalid_repository_document: {error}"))
        })
        .collect()
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

fn encode_pretty_envelope(envelope: &DiskEnvelope) -> Result<Vec<u8>, String> {
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
    fields.push(("contentHash", encode_json_string(&envelope.content_hash)?));
    let compact = encode_object(fields)?;
    let mut pretty = pretty_json(&compact)?;
    pretty.push(b'\n');
    Ok(pretty)
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

fn pretty_json(value: &[u8]) -> Result<Vec<u8>, String> {
    let mut index = 0;
    let mut output = Vec::with_capacity(value.len());
    pretty_value(value, &mut index, 0, &mut output)?;
    if index != value.len() {
        return Err("invalid_repository_json".into());
    }
    Ok(output)
}

fn pretty_value(
    value: &[u8],
    index: &mut usize,
    depth: usize,
    output: &mut Vec<u8>,
) -> Result<(), String> {
    match value.get(*index).copied() {
        Some(b'{') => {
            *index += 1;
            output.push(b'{');
            if value.get(*index) == Some(&b'}') {
                *index += 1;
                output.push(b'}');
                return Ok(());
            }
            output.push(b'\n');
            loop {
                indent(output, depth + 1);
                let key = read_json_string(value, index)?;
                output.extend_from_slice(&encode_json_string(&key)?);
                expect_byte(value, index, b':')?;
                output.extend_from_slice(b": ");
                pretty_value(value, index, depth + 1, output)?;
                match value.get(*index) {
                    Some(b',') => {
                        *index += 1;
                        output.extend_from_slice(b",\n");
                    }
                    Some(b'}') => {
                        *index += 1;
                        output.push(b'\n');
                        indent(output, depth);
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
            if value.get(*index) == Some(&b']') {
                *index += 1;
                output.push(b']');
                return Ok(());
            }
            output.push(b'\n');
            loop {
                indent(output, depth + 1);
                pretty_value(value, index, depth + 1, output)?;
                match value.get(*index) {
                    Some(b',') => {
                        *index += 1;
                        output.extend_from_slice(b",\n");
                    }
                    Some(b']') => {
                        *index += 1;
                        output.push(b'\n');
                        indent(output, depth);
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
                if matches!(byte, b',' | b']' | b'}') {
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

fn indent(output: &mut Vec<u8>, depth: usize) {
    for _ in 0..depth * 2 {
        output.push(b' ');
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

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "repository path has no parent directory".to_owned())?;
    let mut temporary_path = None;
    let mut temporary_file = None;
    for _ in 0..16 {
        let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let candidate = parent.join(format!(
            ".strategy-repository-{}-{sequence}.tmp",
            std::process::id()
        ));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        match options.open(&candidate) {
            Ok(file) => {
                temporary_path = Some(candidate);
                temporary_file = Some(file);
                break;
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(format!("create repository temporary file: {error}")),
        }
    }
    let temporary_path =
        temporary_path.ok_or_else(|| "could not allocate repository temporary file".to_owned())?;
    let result = write_and_replace(path, &temporary_path, bytes, temporary_file);
    if result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    result
}

fn write_and_replace(
    path: &Path,
    temporary_path: &Path,
    bytes: &[u8],
    temporary_file: Option<File>,
) -> Result<(), String> {
    let mut file =
        temporary_file.ok_or_else(|| "repository temp file was not opened".to_owned())?;
    file.write_all(bytes)
        .map_err(|error| format!("write repository temporary file: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("sync repository temporary file: {error}"))?;
    drop(file);
    fs::rename(temporary_path, path)
        .map_err(|error| format!("replace Strategy repository: {error}"))?;
    #[cfg(unix)]
    {
        let parent = path
            .parent()
            .ok_or_else(|| "repository path has no parent directory".to_owned())?;
        File::open(parent)
            .and_then(|directory| directory.sync_all())
            .map_err(|error| format!("sync repository directory: {error}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    static TEST_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    fn temp_root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "vantare-strategy-repository-{}-{}",
            std::process::id(),
            TEST_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ))
    }

    #[test]
    fn go_v1_migration_matches_golden_and_is_idempotent() {
        let source = include_bytes!("../../../testdata/oracle/repository-v1-go.json");
        let golden = include_bytes!("../../../testdata/oracle/repository-v2-go.golden.json");
        let (migrated, steps) = migrate_repository_json(source).expect("migrate Go v1 fixture");
        assert_eq!(migrated, golden);
        assert_eq!(
            steps,
            vec![MigrationStep {
                from: REPOSITORY_VERSION_V1.into(),
                to: REPOSITORY_VERSION_V2.into(),
            }]
        );
        let (again, steps) = migrate_repository_json(&migrated).expect("v2 no-op");
        assert_eq!(again, migrated);
        assert!(steps.is_empty());
    }

    #[test]
    fn current_go_v2_fixture_is_a_byte_exact_noop() {
        let fixture = include_bytes!("../../../testdata/oracle/repository-v2-go.golden.json");
        let (migrated, steps) = migrate_repository_json(fixture).expect("current v2 fixture");
        assert_eq!(migrated, fixture);
        assert!(steps.is_empty());
    }

    #[test]
    fn migration_rejects_duplicate_keys_and_corrupt_hashes() {
        let duplicate = br#"{"repositoryVersion":"strategy.repository.v1","generation":1,"nested":{"x":1,"x":2}}"#;
        assert!(migrate_repository_json(duplicate).is_err());
        let source = include_bytes!("../../../testdata/oracle/repository-v1-go.json");
        let mut corrupt = source.to_vec();
        let hash = b"293c8df977de65a61b166b6a66f80dc4cf121b0fc1597fac0f62150f9b3255ee";
        let position = corrupt
            .windows(hash.len())
            .position(|window| window == hash)
            .expect("fixture hash");
        corrupt[position] = b'0';
        assert!(migrate_repository_json(&corrupt).is_err());
    }

    #[test]
    fn local_repository_persists_documents_with_generation_checks() {
        let root = temp_root();
        let repository = LocalRepository::open(&root).expect("open local repository");
        assert_eq!(repository.load().expect("empty snapshot"), empty_snapshot());
        let committed = repository
            .save_documents(
                0,
                &[r#"{"draftId":"draft-1","payload":{"laps":10}}"#.into()],
                &[r#"{"revisionId":"revision-1","contentHash":"abc"}"#.into()],
            )
            .expect("save draft and revision");
        assert_eq!(committed.generation, 1);
        assert_eq!(repository.load().expect("reload"), committed);
        assert_eq!(
            repository
                .save_documents(0, &[], &[])
                .expect_err("stale generation"),
            "repository_version_conflict"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn load_applies_v1_migration_to_disk_once() {
        let root = temp_root();
        fs::create_dir_all(&root).expect("create fixture directory");
        let fixture = include_bytes!("../../../testdata/oracle/repository-v1-go.json");
        fs::write(root.join(FILE_NAME), fixture).expect("write v1 fixture");
        let repository = LocalRepository::open(&root).expect("open repository");
        let snapshot = repository.load().expect("migrate and read");
        assert_eq!(snapshot.generation, 7);
        assert_eq!(snapshot.drafts.len(), 1);
        let bytes = fs::read(root.join(FILE_NAME)).expect("read migrated file");
        assert_eq!(
            bytes,
            include_bytes!("../../../testdata/oracle/repository-v2-go.golden.json")
        );
        let _ = fs::remove_dir_all(root);
    }
}
