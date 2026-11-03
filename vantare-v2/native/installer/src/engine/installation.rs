//! Shared metadata and authenticated generations. No GPUI or mutation.
use super::{
    reject_links,
    validation::{channel, hex, version},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fmt, fs,
    io::{self, Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};

#[derive(Debug)]
pub enum ReadError {
    Io(io::Error),
    Invalid(&'static str),
    Rejected(Rejection),
}

/// Stable violated invariants; presentation text is not an error protocol.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Rejection {
    State,
    Manifest,
    Reference,
    Binding,
    Inventory,
    MissingPrevious,
}
impl Rejection {
    pub fn code(self) -> &'static str {
        self.description().0
    }
    fn description(self) -> (&'static str, &'static str) {
        match self {
            Self::State => ("state-contract", "Estado de instalación inválido"),
            Self::Manifest => (
                "manifest-contract",
                "Manifiesto, esquema o canal incompatible",
            ),
            Self::Reference => ("generation-reference", "Referencia de generación inválida"),
            Self::Binding => (
                "generation-binding",
                "Generación activa/anterior incompleta",
            ),
            Self::Inventory => ("inventory", "Lista de archivos inválida o duplicada"),
            Self::MissingPrevious => ("previous-missing", "Falta referencia anterior"),
        }
    }
}
impl From<Rejection> for ReadError {
    fn from(reason: Rejection) -> Self {
        Self::Rejected(reason)
    }
}
impl From<&'static str> for ReadError {
    fn from(reason: &'static str) -> Self {
        Self::Invalid(reason)
    }
}
impl fmt::Display for ReadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => error.fmt(f),
            Self::Invalid(reason) => f.write_str(reason),
            Self::Rejected(reason) => f.write_str(reason.description().1),
        }
    }
}
impl std::error::Error for ReadError {}
impl From<io::Error> for ReadError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Generation {
    pub generation: String,
    pub manifest_sha256: Option<String>,
}
impl Generation {
    pub(super) fn valid(&self) -> bool {
        hex(&self.generation, 32)
            && self
                .manifest_sha256
                .as_deref()
                .is_some_and(|hash| hex(hash, 64))
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct State {
    pub schema: u32,
    pub product: String,
    pub channel: String,
    pub active: Generation,
    pub previous: Option<Generation>,
}
impl State {
    /// Informational state remains readable after an interrupted legacy retirement.
    /// Mutations validate references from the same decoder before deleting files.
    pub fn read(root: &Path) -> Result<Option<Self>, ReadError> {
        Ok(read_state(root)?.map(|document| document.state))
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Member {
    pub path: String,
    pub size: u64,
    pub sha256: String,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    schema: u32,
    product: String,
    candidate: bool,
    architecture: String,
    pub version: String,
    pub channel: String,
    data_schema: String,
    source_sha: String,
    pub source_dirty: bool,
    build_profile: String,
    pub files: Vec<Member>,
    #[serde(default)]
    pub engine: Option<u32>,
    #[serde(skip)]
    sha256: String,
    #[serde(skip)]
    pub version_parts: [u16; 3],
}
impl Manifest {
    pub fn read(path: &Path) -> Result<Self, ReadError> {
        Self::decode(&bytes(path)?)
    }
    pub(super) fn decode(raw: &[u8]) -> Result<Self, ReadError> {
        let mut manifest: Self =
            serde_json::from_slice(utf8(raw)).map_err(|_| Rejection::Manifest)?;
        manifest.version_parts = version(&manifest.version).map_err(|_| Rejection::Manifest)?;
        require(
            manifest.schema == 1
                && manifest.product == "vantare-native"
                && manifest.candidate
                && manifest.architecture == "windows-x64"
                && channel(&manifest.channel)
                && manifest.data_schema == "opaque-v1"
                && hex(&manifest.source_sha, 40)
                && matches!(manifest.build_profile.as_str(), "Debug" | "Release")
                && matches!(manifest.engine, None | Some(1 | 2)),
            Rejection::Manifest,
        )?;
        let mut names = HashSet::new();
        require(!manifest.files.is_empty(), Rejection::Inventory)?;
        for file in &manifest.files {
            require(
                safe_member(&file.path)
                    && names.insert(file.path.to_ascii_lowercase())
                    && hex(&file.sha256, 64),
                Rejection::Inventory,
            )?;
        }
        manifest.sha256 = format!("{:x}", Sha256::digest(raw));
        Ok(manifest)
    }
    pub fn sha256(&self) -> &str {
        &self.sha256
    }
    pub fn engine(&self) -> u32 {
        self.engine.unwrap_or(1)
    }
    pub(super) fn bound(
        root: &Path,
        reference: &Generation,
        expected: &str,
    ) -> Result<Self, ReadError> {
        let directory = root.join("generations").join(&reference.generation);
        let manifest = Self::authenticated(&directory, reference, expected)?;
        reject_links(&directory.join("data"))
            .map_err(|_| ReadError::Invalid("Ruta de datos no válida"))?;
        require(directory.join("data").is_dir(), Rejection::Binding)?;
        Ok(manifest)
    }
    pub(super) fn authenticated(
        directory: &Path,
        reference: &Generation,
        expected: &str,
    ) -> Result<Self, ReadError> {
        require(reference.valid(), Rejection::Reference)?;
        let manifest = Self::read(&directory.join("manifest.json"))?;
        require(
            reference.manifest_sha256.as_deref() == Some(manifest.sha256()),
            Rejection::Binding,
        )?;
        require(manifest.channel == expected, Rejection::Manifest)?;
        Ok(manifest)
    }
    pub(super) fn installed(&self, directory: &Path, verify_files: bool) -> Result<(), ReadError> {
        let members: HashSet<_> = self
            .files
            .iter()
            .map(|file| file.path.to_ascii_lowercase())
            .collect();
        for (path, is_directory) in walk(directory, true)? {
            if is_directory {
                continue;
            }
            let relative = path
                .strip_prefix(directory)
                .map_err(|_| ReadError::Invalid("Ruta ajena"))?
                .to_string_lossy()
                .replace('\\', "/")
                .to_ascii_lowercase();
            require(
                relative == "manifest.json" || members.contains(&relative),
                "Archivo instalado no enumerado en el manifiesto",
            )?;
        }
        if verify_files {
            for file in &self.files {
                let target = directory.join(&file.path);
                require(
                    fs::metadata(&target)?.len() == file.size && hash_file(&target)? == file.sha256,
                    "Integridad incorrecta",
                )?;
                if Path::new(&file.path)
                    .extension()
                    .and_then(|extension| extension.to_str())
                    .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
                {
                    verify_pe(&target)?;
                    let name = target
                        .file_name()
                        .and_then(|name| name.to_str())
                        .ok_or(ReadError::Invalid("Nombre inválido"))?;
                    require(
                        fs::read_to_string(directory.join(format!("{}.sha256", file.path)))?
                            == format!("{}  {name}\n", file.sha256),
                        "Sidecar incorrecto",
                    )?;
                }
            }
        }
        Ok(())
    }
}

/// Names are authorized by the bound manifest, never by an installer catalogue.
pub fn safe_member(path: &str) -> bool {
    !path.eq_ignore_ascii_case("manifest.json")
        && path.split('/').all(|segment| {
            let stem = segment.split('.').next().unwrap_or("").to_ascii_uppercase();
            let device = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
                || ((stem.starts_with("COM") || stem.starts_with("LPT"))
                    && stem.len() == 4
                    && matches!(stem.as_bytes()[3], b'1'..=b'9'));
            if device {
                return false;
            }
            !segment.eq_ignore_ascii_case("data")
                && segment.split('.').all(|part| {
                    !part.is_empty()
                        && part
                            .bytes()
                            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
                })
        })
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Retained {
    schema: u32,
    pub generation: String,
    pub version: String,
    #[serde(skip)]
    pub version_parts: [u16; 3],
}
#[derive(Debug)]
pub struct Installation {
    pub state: Option<State>,
    pub manifest: Option<Manifest>,
    pub data_path: PathBuf,
    pub previous_warning: Option<&'static str>,
    pub previous_manifest: Option<Manifest>,
    pub(super) original_state: Option<Value>,
    pub(super) retained: Option<Retained>,
}
pub(super) struct StateDocument {
    pub(super) state: State,
    original: Value,
    pub(super) previous_present: bool,
    pub(super) warning: Option<&'static str>,
}
fn require(valid: bool, reason: impl Into<ReadError>) -> Result<(), ReadError> {
    if valid { Ok(()) } else { Err(reason.into()) }
}
fn bytes(path: &Path) -> Result<Vec<u8>, ReadError> {
    reject_links(path).map_err(|_| ReadError::Invalid("Ruta de instalación no válida"))?;
    let file = fs::File::open(path)?;
    require(file.metadata()?.is_file(), "Se requiere un archivo regular")?;
    let mut raw = Vec::new();
    file.take(65537).read_to_end(&mut raw)?;
    require(raw.len() <= 65536, "Documento demasiado grande")?;
    Ok(raw)
}
fn utf8(raw: &[u8]) -> &[u8] {
    raw.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(raw)
}
pub(super) fn read_state(root: &Path) -> Result<Option<StateDocument>, ReadError> {
    let raw = match bytes(&root.join("state.json")) {
        Ok(raw) => raw,
        Err(ReadError::Io(error)) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let original: Value = serde_json::from_slice(utf8(&raw)).map_err(|_| Rejection::State)?;
    require(
        original.is_object() && original["active"].is_object(),
        Rejection::State,
    )?;
    let mut active = original.clone();
    let previous = active["previous"].take();
    let mut state: State = serde_json::from_value(active).map_err(|_| Rejection::State)?;
    require(
        state.schema == 1 && state.product == "vantare-native" && channel(&state.channel),
        Rejection::State,
    )?;
    require(hex(&state.active.generation, 32), Rejection::Reference)?;
    let mut warning = None;
    if !previous.is_null() {
        match serde_json::from_value(previous) {
            Ok(reference) => state.previous = Some(reference),
            Err(_) => warning = Some("previous-corrupt"),
        }
    }
    Ok(Some(StateDocument {
        state,
        previous_present: original.get("previous").is_some(),
        original,
        warning,
    }))
}

pub fn hash_file(path: &Path) -> Result<String, ReadError> {
    reject_links(path).map_err(|_| ReadError::Invalid("Ruta de instalación no válida"))?;
    let mut hash = Sha256::new();
    io::copy(&mut fs::File::open(path)?, &mut hash)?;
    Ok(format!("{:x}", hash.finalize()))
}

pub(super) fn verify_pe(path: &Path) -> Result<(), ReadError> {
    let mut file = fs::File::open(path)?;
    let length = file.metadata()?.len();
    require(length >= 64, "Binario sin cabecera MZ")?;
    let mut header = [0; 64];
    file.read_exact(&mut header)?;
    require(header.starts_with(b"MZ"), "Binario sin cabecera MZ")?;
    let offset = u64::from(u32::from_le_bytes([
        header[60], header[61], header[62], header[63],
    ]));
    require(offset <= length - 6, "Cabecera PE fuera del archivo")?;
    file.seek(SeekFrom::Start(offset))?;
    let mut signature = [0; 6];
    file.read_exact(&mut signature)?;
    require(
        signature == *b"PE\0\0\x64\x86",
        "Se requiere PE Windows x64",
    )
}

pub(super) fn walk(root: &Path, skip_data: bool) -> Result<Vec<(PathBuf, bool)>, ReadError> {
    let mut pending = vec![(root.to_path_buf(), false)];
    let mut files = Vec::new();
    while let Some((directory, in_data)) = pending.pop() {
        for entry in fs::read_dir(directory)? {
            let entry = entry?;
            let path = entry.path();
            if !in_data {
                require(
                    !entry
                        .file_name()
                        .to_string_lossy()
                        .to_ascii_lowercase()
                        .starts_with(".env"),
                    "Árbol .env rechazado antes de leerlo",
                )?;
            }
            reject_links(&path).map_err(|_| ReadError::Invalid("Árbol con reparse point"))?;
            let in_data = in_data || skip_data && path == root.join("data");
            let is_directory = entry.file_type()?.is_dir();
            if is_directory && !in_data {
                pending.push((path.clone(), in_data));
            }
            if !in_data {
                files.push((path, is_directory));
            }
        }
    }
    Ok(files)
}

impl Installation {
    pub fn read(root: &Path) -> Result<Self, ReadError> {
        Self::read_inner(root, true)
    }
    pub fn read_for_rollback(root: &Path) -> Result<Self, ReadError> {
        Self::read_inner(root, false)
    }
    fn read_inner(root: &Path, inspect_active: bool) -> Result<Self, ReadError> {
        let mut view = Self {
            state: None,
            manifest: None,
            data_path: root.join("generations"),
            previous_warning: None,
            previous_manifest: None,
            original_state: None,
            retained: None,
        };
        let Some(document) = read_state(root)? else {
            let path = root.join("retained-data.json");
            if path.try_exists()? {
                let mut saved: Retained = serde_json::from_slice(utf8(&bytes(&path)?))
                    .map_err(|_| ReadError::Invalid("Referencia de datos conservados inválida"))?;
                saved.version_parts = version(&saved.version)
                    .map_err(|_| ReadError::Invalid("Versión conservada inválida"))?;
                require(
                    saved.schema == 1 && hex(&saved.generation, 32),
                    "Referencia de datos conservados inválida",
                )?;
                view.data_path = root
                    .join("generations")
                    .join(&saved.generation)
                    .join("data");
                view.retained = Some(saved);
            }
            return Ok(view);
        };
        require(document.previous_present, Rejection::MissingPrevious)?;
        let state = document.state;
        view.data_path = root
            .join("generations")
            .join(&state.active.generation)
            .join("data");
        view.manifest = Some(Manifest::bound(root, &state.active, &state.channel)?);
        view.previous_warning = document.warning;
        if let Some(previous) = &state.previous {
            if previous.generation == state.active.generation {
                view.previous_warning = Some("previous-corrupt");
            } else {
                let cached = Manifest::bound(root, previous, &state.channel);
                match cached {
                    Ok(manifest) => view.previous_manifest = Some(manifest),
                    Err(error) => view.previous_warning = Some(previous_failure(&error)),
                }
            }
        }
        view.original_state = Some(document.original);
        view.state = Some(state);
        if inspect_active {
            view.check_files(root, false)?;
        }
        Ok(view)
    }
    /// Reuses decoded/bound manifests. A repair may inspect the active failure
    /// while retaining a verified previous; neither generation is re-read.
    pub fn verify(&mut self, root: &Path) -> Result<(), ReadError> {
        self.check_files(root, true)
    }
    fn check_files(&mut self, root: &Path, verify_files: bool) -> Result<(), ReadError> {
        let Some(state) = &self.state else {
            return Ok(());
        };
        let active = self
            .manifest
            .as_ref()
            .ok_or(ReadError::Invalid("Falta manifiesto activo"))?
            .installed(
                &root.join("generations").join(&state.active.generation),
                verify_files,
            );
        if let (Some(reference), Some(manifest)) = (&state.previous, &self.previous_manifest)
            && let Err(error) = manifest.installed(
                &root.join("generations").join(&reference.generation),
                verify_files,
            )
        {
            self.previous_warning = Some(previous_failure(&error));
            self.previous_manifest = None;
        }
        active
    }
    pub fn usable_previous(&self) -> Option<&Generation> {
        self.previous_manifest.as_ref()?;
        self.state.as_ref()?.previous.as_ref()
    }
    pub fn installed_version(&self) -> Option<&str> {
        self.manifest
            .as_ref()
            .map(|manifest| manifest.version.as_str())
    }
}
fn previous_failure(error: &ReadError) -> &'static str {
    if matches!(error, ReadError::Io(_)) {
        "previous-unreadable"
    } else {
        "previous-corrupt"
    }
}

#[cfg(test)]
mod member_tests {
    #[test]
    fn arbitrary_safe_members_are_allowed_but_data_and_escapes_are_not() {
        assert!(super::safe_member("assets/new-resource.bin"));
        for path in [
            "data/user.json",
            "../outside",
            "/rooted",
            "C:/rooted",
            ".env",
            "bin//a.exe",
            "manifest.json",
            "bin/CON.txt",
            "bin/LPT1.exe",
        ] {
            assert!(!super::safe_member(path), "{path}");
        }
    }
}
