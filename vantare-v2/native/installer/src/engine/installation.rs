use super::{
    reject_links,
    validation::{channel, hex, hub_version, package_version},
};
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fmt, fs,
    io::{self, Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReadProfile {
    /// Existing Hub display checks, without byte authentication.
    Hub,
    /// Setup Probe: bind manifest, check installed inventory; no active rehash.
    Probe,
    /// Legacy interrupted uninstall may have already removed manifest/bin.
    /// Driver `DisplayVersion` remains a presentation fallback until step 4.
    Uninstall,
}

#[derive(Debug)]
pub enum ReadError {
    Io(io::Error),
    Invalid(&'static str),
    Json(serde_json::Error),
}
impl fmt::Display for ReadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => error.fmt(f),
            Self::Json(error) => error.fmt(f),
            Self::Invalid(reason) => f.write_str(reason),
        }
    }
}
impl std::error::Error for ReadError {}
impl From<io::Error> for ReadError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}
impl From<serde_json::Error> for ReadError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Generation {
    pub generation: String,
    /// Absent only in legacy partial-uninstall reads; never invent a binding.
    pub manifest_sha256: Option<String>,
}
impl Generation {
    fn valid(&self) -> bool {
        hex(&self.generation, 32)
            && self.manifest_sha256.as_deref().is_some_and(|hash| hex(hash, 64))
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct State {
    pub schema: u32,
    pub product: String,
    pub channel: String,
    pub active: Generation,
    pub previous: Option<Generation>,
}

#[derive(Debug, Deserialize)]
pub struct Manifest {
    pub schema: u32,
    pub product: String,
    pub candidate: bool,
    pub architecture: String,
    pub version: String,
    pub channel: String,
    #[serde(flatten)]
    fields: serde_json::Map<String, Value>,
}

#[derive(Debug)]
pub struct Installation {
    pub state: Option<State>,
    pub manifest: Option<Manifest>,
    pub data_path: PathBuf,
    /// Optional previous failures never rewrite state or block a valid active.
    pub previous_warning: Option<&'static str>,
}

fn require(valid: bool, reason: &'static str) -> Result<(), ReadError> {
    if valid {
        Ok(())
    } else {
        Err(ReadError::Invalid(reason))
    }
}

fn bytes(path: &Path, limit: Option<u64>, profile: ReadProfile) -> Result<Vec<u8>, ReadError> {
    if profile != ReadProfile::Hub {
        reject_links(path).map_err(|_| ReadError::Invalid("Ruta de instalación no válida"))?;
    }
    let meta = fs::symlink_metadata(path)?;
    require(meta.is_file(), "Se requiere un archivo regular")?;
    if let Some(limit) = limit {
        require(meta.len() <= limit, "Documento demasiado grande")?;
    }
    let mut result = Vec::new();
    fs::File::open(path)?
        .take(limit.map_or(u64::MAX, |n| n + 1))
        .read_to_end(&mut result)?;
    if let Some(limit) = limit {
        require(result.len() as u64 <= limit, "Documento demasiado grande")?;
    }
    // PS ReadAllText and the old Hub both consume UTF-8, but only PS accepts BOM.
    Ok(result)
}

fn json(raw: &[u8], profile: ReadProfile) -> Result<Value, ReadError> {
    let raw = if profile == ReadProfile::Hub {
        raw
    } else {
        raw.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(raw)
    };
    Ok(serde_json::from_slice(raw)?)
}

impl Manifest {
    pub fn read(path: &Path, profile: ReadProfile) -> Result<Self, ReadError> {
        let limit = if profile == ReadProfile::Hub {
            1024 * 1024
        } else {
            65536
        };
        let raw = bytes(path, Some(limit), profile)?;
        Self::decode(&raw, profile)
    }

    fn decode(raw: &[u8], profile: ReadProfile) -> Result<Self, ReadError> {
        let manifest: Self = if profile == ReadProfile::Hub {
            serde_json::from_slice(raw)?
        } else {
            serde_json::from_value(json(raw, profile)?)?
        };
        require(
            manifest.schema == 1
                && manifest.product == "vantare-native"
                && manifest.candidate
                && manifest.architecture == "windows-x64"
                && channel(&manifest.channel)
                && if profile == ReadProfile::Hub {
                    hub_version(&manifest.version)
                } else {
                    package_version(&manifest.version)
                },
            "Manifiesto, esquema o canal incompatible",
        )?;
        Ok(manifest)
    }

    fn installed(&self, directory: &Path, verify_files: bool) -> Result<(), ReadError> {
        let fields = &self.fields;
        require(
            fields.get("data_schema").and_then(Value::as_str) == Some("opaque-v1")
                && fields
                    .get("source_sha")
                    .and_then(Value::as_str)
                    .is_some_and(|s| hex(s, 40))
                && fields.get("source_dirty").is_some_and(Value::is_boolean)
                && matches!(
                    fields.get("build_profile").and_then(Value::as_str),
                    Some("Debug" | "Release")
                ),
            "Manifiesto, esquema o canal incompatible",
        )?;
        let files = fields
            .get("files")
            .and_then(Value::as_array)
            .ok_or(ReadError::Invalid("Inventario instalado vacío"))?;
        require(!files.is_empty(), "Inventario instalado vacío")?;
        let mut members = HashSet::new();
        for file in files {
            let path = file
                .get("path")
                .and_then(Value::as_str)
                .ok_or(ReadError::Invalid("Ruta de inventario inválida"))?;
            require(
                known_member(path, &self.channel) && members.insert(path),
                "Lista de archivos inválida o duplicada",
            )?;
            require(
                file.get("sha256")
                    .and_then(Value::as_str)
                    .is_some_and(|s| hex(s, 64)),
                "SHA de archivo inválido",
            )?;
            if verify_files {
                let target = directory.join(path);
                let expected = file["sha256"]
                    .as_str()
                    .ok_or(ReadError::Invalid("SHA inválido"))?;
                require(
                    fs::metadata(&target)?.len()
                        == file["size"]
                            .as_u64()
                            .ok_or(ReadError::Invalid("Tamaño inválido"))?
                        && hash_file(&target)? == expected,
                    "Integridad incorrecta",
                )?;
                if Path::new(path).extension() == Some(std::ffi::OsStr::new("exe")) {
                    verify_pe(&target)?;
                    let sidecar = fs::read_to_string(directory.join(format!("{path}.sha256")))?;
                    let name = target
                        .file_name()
                        .and_then(|s| s.to_str())
                        .ok_or(ReadError::Invalid("Nombre inválido"))?;
                    require(
                        sidecar == format!("{expected}  {name}\n"),
                        "Sidecar incorrecto",
                    )?;
                }
            }
        }
        for path in tree(directory)? {
            let relative = path
                .strip_prefix(directory)
                .map_err(|_| ReadError::Invalid("Ruta ajena"))?
                .to_string_lossy()
                .replace('\\', "/");
            require(
                relative.starts_with("data/")
                    || relative == "manifest.json"
                    || members.contains(relative.as_str()),
                "Archivo instalado no enumerado en el manifiesto",
            )?;
        }
        Ok(())
    }
}

// Generated at build time from the one existing packaging catalogue. Step 4
// migrates package ownership; step 7 retires this legacy source with PowerShell.
include!(concat!(env!("OUT_DIR"), "/installed-members.rs"));
fn known_member(path: &str, channel: &str) -> bool {
    KNOWN_MEMBERS.contains(&path)
        && (channel != "beta"
            || !matches!(
                path,
                "bin/vantare-workshop.exe" | "bin/vantare-workshop.exe.sha256"
            ))
}

/// Transitional closed inventory, shared with the packaging catalogue until
/// step 4 migrates package ownership and step 7 removes product PowerShell.
pub fn known_members(channel: &str) -> Vec<&'static str> {
    KNOWN_MEMBERS
        .iter()
        .copied()
        .filter(|path| known_member(path, channel))
        .collect()
}

fn hash_file(path: &Path) -> Result<String, ReadError> {
    reject_links(path).map_err(|_| ReadError::Invalid("Ruta de instalación no válida"))?;
    let mut hash = Sha256::new();
    io::copy(&mut fs::File::open(path)?, &mut hash)?;
    Ok(format!("{:x}", hash.finalize()))
}

fn verify_pe(path: &Path) -> Result<(), ReadError> {
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

fn tree(root: &Path) -> Result<Vec<PathBuf>, ReadError> {
    let mut pending = vec![root.to_path_buf()];
    let mut files = Vec::new();
    while let Some(directory) = pending.pop() {
        for entry in fs::read_dir(directory)? {
            let entry = entry?;
            let path = entry.path();
            require(
                !entry
                    .file_name()
                    .to_string_lossy()
                    .to_ascii_lowercase()
                    .starts_with(".env"),
                "Árbol .env rechazado antes de leerlo",
            )?;
            reject_links(&path).map_err(|_| ReadError::Invalid("Árbol con reparse point"))?;
            if entry.file_type()?.is_dir() {
                pending.push(path);
            } else {
                files.push(path);
            }
        }
    }
    Ok(files)
}

impl Installation {
    pub fn read(root: &Path, profile: ReadProfile) -> Result<Self, ReadError> {
        let path = root.join("state.json");
        let mut installation = Self {
            state: None,
            manifest: None,
            data_path: root.join("generations"),
            previous_warning: None,
        };
        if profile != ReadProfile::Hub && root.try_exists()? {
            tree(root)?;
        }
        let raw = match bytes(
            &path,
            (profile == ReadProfile::Hub).then_some(16 * 1024),
            profile,
        ) {
            Ok(raw) => raw,
            Err(ReadError::Io(error))
                if error.kind() == io::ErrorKind::NotFound && profile != ReadProfile::Hub =>
            {
                let retained = root.join("retained-data.json");
                if retained.try_exists()? {
                    let value = json(&bytes(&retained, None, profile)?, profile)?;
                    let id = value["generation"].as_str().ok_or(ReadError::Invalid(
                        "Referencia de datos conservados inválida",
                    ))?;
                    require(
                        value["schema"] == 1 && hex(id, 32),
                        "Referencia de datos conservados inválida",
                    )?;
                    installation.data_path = root.join("generations").join(id).join("data");
                }
                return Ok(installation);
            }
            Err(error) => return Err(error),
        };
        let (mut state, warning) = decode_state(&raw, profile)?;
        installation.previous_warning = warning;
        let active_valid = if profile == ReadProfile::Uninstall {
            hex(&state.active.generation, 32)
        } else {
            state.active.valid()
        };
        require(
            state.schema == 1
                && state.product == "vantare-native"
                && channel(&state.channel)
                && active_valid
                && (profile != ReadProfile::Uninstall || state.channel == "beta"),
            "Estado de instalación inválido",
        )?;
        installation.data_path = root
            .join("generations")
            .join(&state.active.generation)
            .join("data");
        if profile != ReadProfile::Uninstall {
            let manifest = read_generation(root, &state.active, &state.channel, profile, false)?;
            if profile == ReadProfile::Hub {
                require(
                    state.previous.as_ref().is_none_or(Generation::valid),
                    "Referencia anterior inválida",
                )?;
            } else if let Some(previous) = &state.previous
                && let Err(error) = read_generation(root, previous, &state.channel, profile, true)
            {
                installation.previous_warning = Some(if matches!(error, ReadError::Io(_)) {
                    "previous-unreadable"
                } else {
                    "previous-corrupt"
                });
                state.previous = None;
            }
            installation.manifest = Some(manifest);
        }
        installation.state = Some(state);
        Ok(installation)
    }

    pub fn installed_version(&self) -> Option<&str> {
        self.manifest.as_ref().map(|m| m.version.as_str())
    }
}

fn decode_state(
    raw: &[u8],
    profile: ReadProfile,
) -> Result<(State, Option<&'static str>), ReadError> {
    if profile == ReadProfile::Hub {
        return Ok((serde_json::from_slice(raw)?, None));
    }
    let mut value = json(raw, profile)?;
    require(
        value.is_object() && value["active"].is_object(),
        "Estado de instalación inválido",
    )?;
    if profile == ReadProfile::Probe {
        require(value.get("previous").is_some(), "Falta referencia anterior")?;
    }
    if let Some(map) = value.as_object_mut() {
        map.retain(|key, _| {
            ["schema", "product", "channel", "active", "previous"].contains(&key.as_str())
        });
    }
    for key in ["active", "previous"] {
        if let Some(map) = value[key].as_object_mut() {
            map.retain(|key, _| ["generation", "manifest_sha256"].contains(&key.as_str()));
        }
    }
    let previous = value["previous"].take();
    if profile == ReadProfile::Uninstall {
        // The legacy structural reader ignores missing/invalid manifest hashes.
        // Keep a real string if present; represent absence rather than fake SHA.
        if !value["active"]["manifest_sha256"].is_string() {
            value["active"]["manifest_sha256"] = Value::Null;
        }
    }
    let mut state: State = serde_json::from_value(value)?;
    let mut warning = None;
    if profile == ReadProfile::Probe && !previous.is_null() {
        match serde_json::from_value(previous) {
            Ok(reference) => state.previous = Some(reference),
            Err(_) => warning = Some("previous-corrupt"),
        }
    }
    Ok((state, warning))
}

fn read_generation(
    root: &Path,
    reference: &Generation,
    expected: &str,
    profile: ReadProfile,
    verify_files: bool,
) -> Result<Manifest, ReadError> {
    require(reference.valid(), "Referencia de generación inválida")?;
    let directory = root.join("generations").join(&reference.generation);
    let path = directory.join("manifest.json");
    let raw = bytes(
        &path,
        Some(if profile == ReadProfile::Hub {
            1024 * 1024
        } else {
            65536
        }),
        profile,
    )?;
    if profile != ReadProfile::Hub {
        require(
            reference.manifest_sha256.as_ref() == Some(&format!("{:x}", Sha256::digest(&raw)))
                && directory.join("data").is_dir(),
            "Generación activa/anterior incompleta",
        )?;
    }
    let manifest = Manifest::decode(&raw, profile)?;
    require(
        manifest.channel == expected && (profile == ReadProfile::Hub || manifest.channel == "beta"),
        "Canal incompatible",
    )?;
    if profile != ReadProfile::Hub {
        manifest.installed(&directory, verify_files)?;
    }
    Ok(manifest)
}
