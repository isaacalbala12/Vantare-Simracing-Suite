use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, TimeDelta, Utc};
use ed25519_dalek::{Signer, SigningKey};
use sha2::{Digest, Sha256};
use std::{
    ffi::OsString,
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    os::windows::fs::MetadataExt,
    path::{Component, Path, PathBuf, Prefix},
    time::Duration,
};
use vantare_runtime::rights::{Devices, Owner};
use vantare_services::{
    license::{Capability, ClaimsV1, CredentialV1},
    storage::private_acl,
};

pub(super) type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

// UUID reservado para qa-license, nunca emitido por el servidor real.
const QA_SUBJECT: &str = "5a5a5a5a-0000-4000-8000-51414c494345";
const MARKER: &str = ".vantare-qa-license";
const MARKER_CONTENT: &[u8; 21] = b"vantare-qa-license-v1";
const KEY_FILE: &str = "qa-license.key";
const KEY_ID_LEN: usize = 11;
const REPARSE_POINT: u32 = 0x400; // FILE_ATTRIBUTE_REPARSE_POINT

pub(super) fn run(
    args: &[OsString],
    env: impl Fn(&str) -> Option<OsString>,
    fingerprint: impl FnOnce() -> vantare_services::Result<String>,
    now: impl FnOnce() -> DateTime<Utc>,
) -> Result<Option<String>> {
    if ["VANTARE_BETA_ROOT", "VANTARE_BOOT_TOKEN"]
        .iter()
        .any(|name| env(name).is_some())
    {
        return Err(invalid("ejecuta la herramienta fuera de una instalación de Vantare").into());
    }
    match args {
        [command, flag, dir] if command == "keygen" && flag == "--out" => {
            keygen(Path::new(dir)).map(Some)
        }
        [command, options @ ..] if command == "install" => {
            let (key, root) = install_paths(options).ok_or_else(usage)?;
            let key = load_key(key)?;
            let device = fingerprint()?;
            let now = now();
            let credential = sign(&key, &device, now)?;
            let (profile, _marker_lock) = prepare_profile(root, &env)?;
            // Mismo almacén que ipc::paths::Root::rights() y rights::production.
            let rights = profile.join("Vantare/native/rights/nightly");
            let mut owner = Owner::open(
                &rights,
                Some(&key.public_entry()),
                Devices { legacy: device },
                1,
                now,
            )?;
            owner.install(serde_json::to_string(&credential)?, now, Duration::ZERO)?;
            Ok(None)
        }
        _ => Err(usage().into()),
    }
}

fn install_paths(options: &[OsString]) -> Option<(&Path, &Path)> {
    if options.len() != 6 {
        return None;
    }
    let value = |flag| {
        options
            .chunks_exact(2)
            .find(|pair| pair[0] == flag)
            .map(|pair| pair[1].as_os_str())
    };
    if value("--channel")? != "nightly" {
        return None;
    }
    Some((Path::new(value("--key")?), Path::new(value("--qa-root")?)))
}

fn usage() -> io::Error {
    invalid("uso: keygen --out <dir> | install --key <priv> --qa-root <dir> --channel nightly")
}

fn invalid(message: &'static str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}

struct QaKey {
    id: String,
    signing: SigningKey,
}

impl QaKey {
    fn from_seed(seed: &[u8; 32]) -> Self {
        let signing = SigningKey::from_bytes(seed);
        let digest = Sha256::digest(signing.verifying_key().as_bytes());
        let id = format!(
            "qa-{:02x}{:02x}{:02x}{:02x}",
            digest[0], digest[1], digest[2], digest[3]
        );
        Self { id, signing }
    }

    fn public_entry(&self) -> String {
        let public = URL_SAFE_NO_PAD.encode(self.signing.verifying_key().as_bytes());
        format!("{}:{public}", self.id)
    }
}

fn keygen(out: &Path) -> Result<String> {
    let out = canonical_candidate(out)?;
    for ancestor in out.ancestors() {
        if ancestor.join(".git").try_exists()? {
            return Err(invalid("la clave privada debe quedar fuera del repositorio").into());
        }
    }

    let mut seed = [0; 32];
    getrandom::fill(&mut seed).map_err(|error| io::Error::other(error.to_string()))?;
    let key = QaKey::from_seed(&seed);
    seed.fill(0);
    fs::create_dir_all(&out)?;
    let dir = out.join(&key.id);
    fs::create_dir(&dir)?;
    private_acl(&dir)?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(dir.join(KEY_FILE))?;
    file.write_all(key.id.as_bytes())?;
    file.write_all(key.signing.as_bytes())?;
    file.sync_all()?;
    Ok(key.public_entry())
}

fn load_key(path: &Path) -> Result<QaKey> {
    drive_path(path)?;
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_file()
        || is_reparse_point(&metadata)
        || metadata.len() != (KEY_ID_LEN + 32) as u64
    {
        return Err(invalid("archivo de clave QA inválido").into());
    }
    let mut file = File::open(path)?;
    let mut id = [0; KEY_ID_LEN];
    file.read_exact(&mut id)?;
    if !id.starts_with(b"qa-") {
        return Err(invalid("key_id debe empezar por qa-").into());
    }
    let mut seed = [0; 32];
    file.read_exact(&mut seed)?;
    let key = QaKey::from_seed(&seed);
    seed.fill(0);
    if key.id.as_bytes() != id {
        return Err(invalid("key_id no corresponde a la clave QA").into());
    }
    Ok(key)
}

fn sign(key: &QaKey, device: &str, now: DateTime<Utc>) -> Result<CredentialV1> {
    if device.is_empty() {
        return Err(invalid("huella legacy ausente").into());
    }
    let mut credential = CredentialV1 {
        version: 1,
        algorithm: "Ed25519".into(),
        key_id: key.id.clone(),
        claims: ClaimsV1 {
            issuer: "vantare-license".into(),
            subject: QA_SUBJECT.into(),
            device_fingerprint: device.into(),
            issued_at: now.to_rfc3339(),
            capabilities: vec![Capability {
                key: "vantare.operational.owner".into(),
                paid_through: (now + TimeDelta::hours(24)).to_rfc3339(),
                perpetual: false,
                scope_version: String::new(),
            }],
        },
        signature: String::new(),
    };
    let signature = key.signing.sign(&credential.signing_bytes()?);
    credential.signature = URL_SAFE_NO_PAD.encode(signature.to_bytes());
    Ok(credential)
}

fn prepare_profile(
    path: &Path,
    env: &impl Fn(&str) -> Option<OsString>,
) -> Result<(PathBuf, File)> {
    let profile = canonical_candidate(path)?;
    for name in ["LOCALAPPDATA", "APPDATA", "VANTARE_NATIVE_DATA_ROOT"] {
        if let Some(real) = env(name).filter(|value| !value.is_empty()) {
            let real = canonical_candidate(Path::new(&real))?;
            if path_starts_with(&profile, &real) || path_starts_with(&real, &profile) {
                return Err(invalid("--qa-root coincide con una raíz de datos real").into());
            }
        }
    }

    let marker_path = profile.join(MARKER);
    let marker = match fs::symlink_metadata(path) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            fs::create_dir(&profile)?;
            private_acl(&profile)?;
            let mut marker = OpenOptions::new()
                .read(true)
                .write(true)
                .create_new(true)
                .open(&marker_path)?;
            marker.try_lock()?;
            marker.write_all(MARKER_CONTENT)?;
            marker.sync_all()?;
            marker
        }
        Ok(metadata) if metadata.is_dir() && !is_reparse_point(&metadata) => {
            let metadata = fs::symlink_metadata(&marker_path)
                .map_err(|_| invalid("--qa-root existente sin marcador QA"))?;
            if !metadata.is_file() || is_reparse_point(&metadata) {
                return Err(invalid("marcador QA inválido").into());
            }
            let mut marker = OpenOptions::new()
                .read(true)
                .write(true)
                .open(&marker_path)?;
            marker.try_lock()?;
            let mut content = [0; MARKER_CONTENT.len()];
            if marker.metadata()?.len() != MARKER_CONTENT.len() as u64
                || marker.read_exact(&mut content).is_err()
                || content != *MARKER_CONTENT
            {
                return Err(invalid("marcador QA inválido").into());
            }
            marker
        }
        Ok(_) => return Err(invalid("--qa-root debe ser un directorio local").into()),
        Err(error) => return Err(error.into()),
    };

    for entry in fs::read_dir(&profile)? {
        if entry?.file_name() != MARKER {
            return Err(invalid("--qa-root contiene datos anteriores").into());
        }
    }
    Ok((profile, marker))
}

fn drive_path(path: &Path) -> io::Result<()> {
    let local_drive = matches!(
        path.components().next(),
        Some(Component::Prefix(prefix))
            if matches!(prefix.kind(), Prefix::Disk(_) | Prefix::VerbatimDisk(_))
    );
    if !local_drive || !path.is_absolute() {
        return Err(invalid("se requiere una ruta absoluta en una unidad local"));
    }
    if path.components().any(|part| {
        matches!(part, Component::ParentDir | Component::CurDir)
            || matches!(part, Component::Normal(name)
                if name.to_string_lossy().ends_with([' ', '.']) || name.to_string_lossy().contains(':'))
    }) {
        return Err(invalid("ruta QA inválida"));
    }
    Ok(())
}

fn canonical_candidate(path: &Path) -> io::Result<PathBuf> {
    drive_path(path)?;
    match path.canonicalize() {
        Ok(canonical) => {
            drive_path(&canonical)?;
            Ok(canonical)
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            let parent = path
                .parent()
                .ok_or_else(|| invalid("falta directorio padre"))?;
            let name = path
                .file_name()
                .ok_or_else(|| invalid("falta nombre de directorio"))?;
            Ok(canonical_candidate(parent)?.join(name))
        }
        Err(error) => Err(error),
    }
}

fn is_reparse_point(metadata: &fs::Metadata) -> bool {
    metadata.file_attributes() & REPARSE_POINT != 0
}

fn path_starts_with(path: &Path, base: &Path) -> bool {
    let mut path = path.components();
    base.components().all(|part| {
        path.next().is_some_and(|other| {
            other
                .as_os_str()
                .to_string_lossy()
                .eq_ignore_ascii_case(&part.as_os_str().to_string_lossy())
        })
    })
}
