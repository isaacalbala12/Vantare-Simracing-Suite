//! Filesystem contract shared by the writer. No shell, discovery or GPUI.
use super::{installation, validation};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

#[derive(Debug)]
pub struct WriteError {
    pub code: u8,
    pub message: String,
}
impl WriteError {
    pub fn new(code: u8, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}
impl std::fmt::Display for WriteError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}
impl std::error::Error for WriteError {}
impl From<io::Error> for WriteError {
    fn from(error: io::Error) -> Self {
        Self::new(1, error.to_string())
    }
}
impl From<super::ReadError> for WriteError {
    fn from(error: super::ReadError) -> Self {
        Self::new(1, error.to_string())
    }
}
impl From<serde_json::Error> for WriteError {
    fn from(error: serde_json::Error) -> Self {
        Self::new(1, error.to_string())
    }
}
impl From<zip::result::ZipError> for WriteError {
    fn from(error: zip::result::ZipError) -> Self {
        Self::new(1, error.to_string())
    }
}
pub type Result<T> = std::result::Result<T, WriteError>;
pub fn ensure(condition: bool, message: &str) -> Result<()> {
    if condition {
        Ok(())
    } else {
        Err(WriteError::new(1, message))
    }
}

pub fn path(value: &Path) -> Result<PathBuf> {
    ensure(
        !value.as_os_str().to_string_lossy().trim().is_empty(),
        "Se necesita una ruta local explícita",
    )?;
    let absolute = std::path::absolute(value)?;
    #[cfg(windows)]
    {
        use std::path::{Component, Prefix};
        ensure(
            matches!(absolute.components().next(), Some(Component::Prefix(prefix)) if matches!(prefix.kind(), Prefix::Disk(_))),
            "Se requiere un volumen local",
        )?;
        super::platform::local_volume(&absolute, false)?;
    }
    ensure(
        absolute.parent().is_some(),
        "No se permite la raíz del volumen",
    )?;
    for ancestor in absolute.ancestors() {
        ensure(
            !ancestor.file_name().is_some_and(|name| {
                name.to_string_lossy()
                    .to_ascii_lowercase()
                    .starts_with(".env")
            }),
            "No se permiten rutas .env",
        )?;
    }
    super::reject_links(&absolute).map_err(|error| WriteError::new(1, error))?;
    Ok(absolute)
}

pub fn open_root(root: &Path, initialize: bool) -> Result<PathBuf> {
    let root = path(root)?;
    #[cfg(windows)]
    super::platform::local_volume(&root, true)?;
    let marker = root.join(".vantare-native");
    if !marker.try_exists()? {
        ensure(initialize, "No es una instalación nativa candidata")?;
        ensure(
            !root.try_exists()? || fs::read_dir(&root)?.next().is_none(),
            "Instalar exige una carpeta vacía o reconocida",
        )?;
        fs::create_dir_all(&root)?;
        write_new(&marker, b"offline-candidate-v1")?;
    }
    installation::tree(&root)?;
    ensure(
        fs::read(&marker)? == b"offline-candidate-v1",
        "Marcador de instalación desconocido",
    )?;
    Ok(root)
}

pub fn write_new(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(0);
    }
    let mut file = options.open(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}
pub fn write_json(path: &Path, value: &impl Serialize) -> Result<()> {
    write_new(path, &serde_json::to_vec_pretty(value)?)
}
pub fn read_json(path: &Path, limit: Option<u64>) -> Result<serde_json::Value> {
    self::path(path)?;
    if let Some(limit) = limit {
        ensure(
            fs::metadata(path)?.len() <= limit,
            "Documento demasiado grande",
        )?;
    }
    let raw = fs::read(path)?;
    Ok(serde_json::from_slice(
        raw.strip_prefix(b"\xef\xbb\xbf").unwrap_or(&raw),
    )?)
}
pub fn lock(root: &Path, name: &str) -> Result<fs::File> {
    let mut options = fs::OpenOptions::new();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(0);
    }
    let file = options.open(root.join(name))?;
    #[cfg(not(windows))]
    file.try_lock()
        .map_err(|error| WriteError::new(2, error.to_string()))?;
    Ok(file)
}
pub fn binary_guard(root: &Path) -> Result<Vec<fs::File>> {
    let generations = root.join("generations");
    if !generations.try_exists()? {
        return Ok(Vec::new());
    }
    let mut handles = Vec::new();
    for file in installation::tree(&generations)? {
        if file
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
        {
            let mut options = fs::OpenOptions::new();
            options.read(true).write(true);
            #[cfg(windows)]
            {
                use std::os::windows::fs::OpenOptionsExt;
                options.share_mode(0);
            }
            handles.push(options.open(file).map_err(|_| {
                WriteError::new(
                    2,
                    "Cierra los procesos de esta instalación; no se mata la aplicación",
                )
            })?);
        }
    }
    Ok(handles)
}
pub fn id() -> Result<String> {
    #[cfg(windows)]
    {
        super::platform::new_id()
    }
    #[cfg(not(windows))]
    {
        Ok(format!(
            "{:032x}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|error| WriteError::new(1, error.to_string()))?
                .as_nanos()
        ))
    }
}
pub fn replace(source: &Path, target: &Path) -> Result<()> {
    #[cfg(windows)]
    {
        super::platform::replace(source, target)
    }
    #[cfg(not(windows))]
    {
        fs::rename(source, target)?;
        Ok(())
    }
}
pub fn commit(
    root: &Path,
    state: &super::State,
    checkpoint: &mut dyn FnMut(&str) -> Result<()>,
) -> Result<()> {
    commit_raw(root, &serde_json::to_vec_pretty(state)?, checkpoint)
}
pub fn commit_raw(
    root: &Path,
    bytes: &[u8],
    checkpoint: &mut dyn FnMut(&str) -> Result<()>,
) -> Result<()> {
    let temporary = root.join(format!(".state-{}.tmp", id()?));
    write_new(&temporary, bytes)?;
    checkpoint("before-commit")?;
    replace(&temporary, &root.join("state.json"))?;
    checkpoint("after-commit")
}
pub fn remove_file(path: &Path) -> Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}
pub fn remove_owned_tree(root: &Path, owned: &Path) -> Result<()> {
    let root = path(root)?;
    let owned = path(owned)?;
    ensure(
        owned != root && owned.starts_with(&root),
        "Limpieza fuera de su raíz poseída",
    )?;
    if owned.try_exists()? {
        installation::tree(&owned)?;
        fs::remove_dir_all(&owned)?;
    }
    Ok(())
}

// Directories (including empty ones) and opaque file bytes all participate.
pub fn data_index(root: &Path) -> Result<BTreeMap<PathBuf, Option<(u64, String)>>> {
    path(root)?;
    ensure(root.is_dir(), "No se encuentran los datos conservados")?;
    installation::tree(root)?;
    let mut index = BTreeMap::new();
    let mut pending = vec![root.to_path_buf()];
    while let Some(directory) = pending.pop() {
        for entry in fs::read_dir(directory)? {
            let entry = entry?;
            let file = entry.path();
            let relative = file
                .strip_prefix(root)
                .map_err(|error| WriteError::new(1, error.to_string()))?
                .to_path_buf();
            if entry.file_type()?.is_dir() {
                index.insert(relative, None);
                pending.push(file);
            } else {
                index.insert(
                    relative,
                    Some((entry.metadata()?.len(), installation::hash_file(&file)?)),
                );
            }
        }
    }
    Ok(index)
}
pub fn copy_data(source: &Path, destination: &Path) -> Result<()> {
    let before = data_index(source)?;
    fs::create_dir_all(destination)?;
    for (relative, entry) in &before {
        let target = destination.join(relative);
        if entry.is_none() {
            fs::create_dir_all(&target)?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            #[cfg(windows)]
            super::platform::copy_new(&source.join(relative), &target)?;
            #[cfg(not(windows))]
            {
                let mut output = fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&target)?;
                io::copy(&mut fs::File::open(source.join(relative))?, &mut output)?;
                output.sync_all()?;
            }
        }
    }
    ensure(
        data_index(source)? == before && data_index(destination)? == before,
        "Los datos cambiaron durante la copia; no se activa la generación",
    )
}
pub fn generation(root: &Path, id: &str) -> Result<PathBuf> {
    ensure(validation::hex(id, 32), "Referencia de generación inválida")?;
    path(&root.join("generations").join(id))
}
