use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, TimeDelta, Utc};
use ed25519_dalek::{Signer, SigningKey};
use sha2::{Digest, Sha256};
use std::{
    ffi::{OsStr, OsString},
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    os::windows::fs::MetadataExt,
    path::{Component, Path, PathBuf, Prefix},
    time::Duration,
};
use vantare_runtime::rights::{Devices, Owner, verifier::Verifier};
use vantare_services::{
    Error,
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

const QA_OWNER: &str = "vantare.operational.owner";
const MAX_CREDENTIAL_BYTES: usize = 32 * 1024;
const MAX_QA_LIFETIME: TimeDelta = TimeDelta::hours(24);
const MAX_FUTURE_ISSUANCE: TimeDelta = TimeDelta::minutes(5);
const HELP: &str = "\
Uso de vantare-qa-license:
  fingerprint
  keygen --out <dir>
  sign --key <priv> --fingerprint <huella> --out <cred.json>  (servidor)
  install-credential --credential <cred.json> --qa-root <dir>  (PC QA)
  install --key <priv> --qa-root <dir> --channel nightly  (solo pruebas en el mismo equipo)";

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
        [flag] if flag == "--help" => Ok(Some(HELP.into())),
        [command] if command == "fingerprint" => Ok(Some(fingerprint()?)),
        [command, flag, dir] if command == "keygen" && flag == "--out" => {
            keygen(Path::new(dir)).map(Some)
        }
        [command, options @ ..] if command == "sign" => {
            let [private, device, out] =
                option_values(options, ["--key", "--fingerprint", "--out"]).ok_or_else(usage)?;
            let device = device.to_str().ok_or_else(usage)?;
            sign_to_file(Path::new(private), device, Path::new(out), &env, now())?;
            Ok(None)
        }
        [command, options @ ..] if command == "install-credential" => {
            let [credential, root] =
                option_values(options, ["--credential", "--qa-root"]).ok_or_else(usage)?;
            let registry = env("VANTARE_LICENSE_PUBLIC_KEYS")
                .and_then(|value| value.into_string().ok())
                .filter(|value| !value.is_empty())
                .ok_or(Error::Unconfigured)?;
            let device = fingerprint()?;
            let now = now();
            let text = read_transfer(Path::new(credential))?;
            verify_transfer(&text, &registry, &device, now)?;
            install_binding(Path::new(root), &env, text, &registry, device, now)?;
            Ok(None)
        }
        [command, options @ ..] if command == "install" => {
            let [private, root, channel] =
                option_values(options, ["--key", "--qa-root", "--channel"]).ok_or_else(usage)?;
            if channel != "nightly" {
                return Err(usage().into());
            }
            let key = load_key(Path::new(private))?;
            let device = fingerprint()?;
            let now = now();
            let credential = sign(&key, &device, now)?;
            install_binding(
                Path::new(root),
                &env,
                serde_json::to_string(&credential)?,
                &key.public_entry(),
                device,
                now,
            )?;
            Ok(None)
        }
        _ => Err(usage().into()),
    }
}

fn option_values<'a, const N: usize>(
    options: &'a [OsString],
    names: [&str; N],
) -> Option<[&'a OsStr; N]> {
    let (pairs, tail) = options.as_chunks::<2>();
    if pairs.len() != N || !tail.is_empty() {
        return None;
    }
    let mut values = [OsStr::new(""); N];
    for (name, value) in names.into_iter().zip(&mut values) {
        *value = pairs.iter().find(|pair| pair[0] == name)?[1].as_os_str();
    }
    Some(values)
}

fn usage() -> io::Error {
    invalid(HELP)
}

fn sign_to_file(
    private: &Path,
    device: &str,
    out: &Path,
    env: &impl Fn(&str) -> Option<OsString>,
    now: DateTime<Utc>,
) -> Result<()> {
    if device.len() != 64
        || !device
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(invalid("huella legacy inválida").into());
    }
    let out = canonical_candidate(out)?;
    let parent = out
        .parent()
        .ok_or_else(|| invalid("falta directorio de salida"))?;
    reject_git(parent)?;
    let key_path = canonical_candidate(private)?;
    let key_dir = key_path
        .parent()
        .ok_or_else(|| invalid("falta directorio de clave"))?;
    if path_starts_with(&out, key_dir) {
        return Err(
            invalid("la credencial debe quedar fuera de la carpeta de la clave privada").into(),
        );
    }
    reject_real_path(&out, env)?;
    reject_real_path(&key_path, env)?;

    let credential = sign(&load_key(private)?, device, now)?;
    let encoded = serde_json::to_vec(&credential)?;
    let mut file = OpenOptions::new().write(true).create_new(true).open(out)?;
    file.write_all(&encoded)?;
    file.sync_all()?;
    Ok(())
}

fn read_transfer(path: &Path) -> Result<String> {
    let path = canonical_candidate(path)?;
    if !fs::metadata(&path)?.is_file() {
        return Err(invalid("la credencial debe ser un archivo local").into());
    }
    let mut text = String::new();
    File::open(path)?
        .take((MAX_CREDENTIAL_BYTES + 1) as u64)
        .read_to_string(&mut text)?;
    if text.len() > MAX_CREDENTIAL_BYTES {
        return Err(Error::TooLarge.into());
    }
    Ok(text)
}

fn verify_transfer(text: &str, registry: &str, device: &str, now: DateTime<Utc>) -> Result<()> {
    let credential: CredentialV1 = serde_json::from_str(text)?;
    if !credential.key_id.starts_with("qa-") {
        return Err(Error::InvalidCredential.into());
    }
    Verifier::public_keys(registry)?.v1(&credential, QA_SUBJECT, device)?;
    let [owner] = credential.claims.capabilities.as_slice() else {
        return Err(Error::InvalidCredential.into());
    };
    if owner.key != QA_OWNER || owner.perpetual || !owner.scope_version.is_empty() {
        return Err(Error::InvalidCredential.into());
    }
    let issued = DateTime::parse_from_rfc3339(&credential.claims.issued_at)?;
    let age = now.fixed_offset() - issued;
    if !(-MAX_FUTURE_ISSUANCE..=MAX_QA_LIFETIME).contains(&age) {
        return Err(Error::Clock.into());
    }
    let until = DateTime::parse_from_rfc3339(&owner.paid_through)?;
    if until <= now.fixed_offset() {
        return Err(Error::Expired.into());
    }
    if until <= issued || until - issued > MAX_QA_LIFETIME {
        return Err(Error::InvalidCredential.into());
    }
    Ok(())
}

fn install_binding(
    root: &Path,
    env: &impl Fn(&str) -> Option<OsString>,
    text: String,
    registry: &str,
    device: String,
    now: DateTime<Utc>,
) -> Result<()> {
    let (profile, _marker_lock) = prepare_profile(root, env)?;
    // Mismo almacén que ipc::paths::Root::rights() y rights::production.
    let rights = profile.join("Vantare/native/rights/nightly");
    let mut owner = Owner::open(&rights, Some(registry), Devices { legacy: device }, 1, now)?;
    owner.install(text, now, Duration::ZERO)?;
    Ok(())
}

fn reject_git(directory: &Path) -> io::Result<()> {
    for ancestor in directory.ancestors() {
        if ancestor.join(".git").try_exists()? {
            return Err(invalid("la salida QA debe quedar fuera del repositorio"));
        }
    }
    Ok(())
}

fn reject_real_path(path: &Path, env: &impl Fn(&str) -> Option<OsString>) -> Result<()> {
    for name in ["LOCALAPPDATA", "APPDATA", "VANTARE_NATIVE_DATA_ROOT"] {
        if let Some(real) = env(name).filter(|value| !value.is_empty()) {
            let real = canonical_candidate(Path::new(&real))?;
            if path_starts_with(path, &real) || path_starts_with(&real, path) {
                return Err(invalid("la ruta QA coincide con una raíz de datos real").into());
            }
        }
    }
    Ok(())
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
    reject_git(&out)?;

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
                key: QA_OWNER.into(),
                paid_through: (now + MAX_QA_LIFETIME).to_rfc3339(),
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
    reject_real_path(&profile, env)?;

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
