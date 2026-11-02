//! Generation mutations. Windows projection is one explicit finalizer until p5.
use super::{
    Generation, Installation, ReadProfile, State, WriteError, installation, package, validation,
    write_fs::{self as disk, Result, ensure},
};
use crate::model::{Mode, Progress};
use serde_json::json;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};

pub struct Package<'a> {
    pub archive: &'a Path,
    pub sha256: &'a str,
    pub version: &'a str,
    pub candidate: &'a [u8],
    pub beta: &'a [u8],
}
pub struct Control<'a> {
    pub cancel: &'a AtomicBool,
    pub progress: &'a mut dyn FnMut(Progress),
    /// Production is inert; QA interrupts at real filesystem boundaries.
    pub checkpoint: &'a mut dyn FnMut(&str) -> Result<()>,
    pub warning: &'a mut dyn FnMut(&str),
}
impl Control<'_> {
    fn copy(&mut self) -> Result<()> {
        (self.progress)(Progress {
            step: "copy".into(),
            percent: 54,
            done: 0,
            total: 0,
            can_cancel: true,
        });
        if self.cancel.load(Ordering::Acquire) {
            return Err(WriteError::new(5, "Instalación cancelada antes de copiar"));
        }
        // Same boundary as the legacy driver's copy acknowledgement: the UI
        // must stop offering cancellation before any generation mutation.
        (self.progress)(Progress {
            step: "copy".into(),
            percent: 54,
            done: 0,
            total: 0,
            can_cancel: false,
        });
        Ok(())
    }
}

const METADATA: &[&str] = &[
    "state.json",
    "candidate.ps1",
    "beta.ps1",
    "retained-data.json",
    "boot-pending.json",
    "update-status.json",
    "registration-identity.txt",
    "Uninstall.exe",
    "uninstall-vantare.ps1",
    "installer-ui.json",
    "installer-notices.txt",
];
struct Before {
    files: BTreeMap<&'static str, Option<Vec<u8>>>,
    generations: BTreeSet<String>,
}
impl Before {
    fn capture(root: &Path) -> Result<Self> {
        let mut files = BTreeMap::new();
        for &name in METADATA {
            let path = root.join(name);
            files.insert(
                name,
                if path.try_exists()? {
                    Some(fs::read(path)?)
                } else {
                    None
                },
            );
        }
        Ok(Self {
            files,
            generations: generations(root)?
                .into_iter()
                .map(|(name, _)| name)
                .collect(),
        })
    }
    fn restore(&self, root: &Path, control: &mut Control<'_>) {
        // State first; a denied file never prevents attempts on remaining metadata.
        for &name in METADATA {
            let path = root.join(name);
            let restored = match &self.files[name] {
                Some(bytes) => {
                    if fs::read(&path).ok().as_ref() == Some(bytes) {
                        Ok(())
                    } else if name == "state.json" {
                        disk::commit_raw(root, bytes, &mut |_| Ok(()))
                    } else {
                        fs::write(&path, bytes).map_err(WriteError::from)
                    }
                }
                None => disk::remove_file(&path),
            };
            if let Err(error) = restored {
                (control.warning)(&format!(
                    "Rollback: no se pudo restaurar {}: {error}",
                    path.display()
                ));
            }
        }
        let cleanup = || -> Result<()> {
            let view = Installation::read(root, ReadProfile::Probe)?;
            let mut referenced = BTreeSet::new();
            if let Some(state) = view.state {
                referenced.insert(state.active.generation);
                if let Some(previous) = state.previous {
                    referenced.insert(previous.generation);
                }
            }
            for (name, directory) in generations(root)? {
                if validation::hex(&name, 32)
                    && !self.generations.contains(&name)
                    && !referenced.contains(&name)
                {
                    disk::remove_owned_tree(root, &directory)?;
                }
            }
            Ok(())
        };
        if let Err(error) = cleanup() {
            (control.warning)(&format!(
                "Rollback: se conservan las generaciones al no poder comprobarlas: {error}"
            ));
        }
    }
}
fn generations(root: &Path) -> Result<Vec<(String, PathBuf)>> {
    let path = root.join("generations");
    if !path.try_exists()? {
        return Ok(Vec::new());
    }
    let mut result = Vec::new();
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            result.push((
                entry
                    .file_name()
                    .to_str()
                    .ok_or_else(|| WriteError::new(1, "Generación no Unicode"))?
                    .to_owned(),
                entry.path(),
            ));
        }
    }
    Ok(result)
}
fn state(root: &Path, repair: bool) -> Result<State> {
    Installation::read(
        root,
        if repair {
            ReadProfile::Probe
        } else {
            ReadProfile::Verified
        },
    )?
    .state
    .ok_or_else(|| WriteError::new(1, "No hay instalación activa"))
}
fn reference(id: String, directory: &Path) -> Result<Generation> {
    Ok(Generation {
        generation: id,
        manifest_sha256: Some(installation::hash_file(&directory.join("manifest.json"))?),
    })
}
fn retained_source(root: &Path, incoming: &str) -> Result<Option<PathBuf>> {
    let retained = root.join("retained-data.json");
    if retained.try_exists()? {
        let saved = disk::read_json(&retained, None)?;
        ensure(
            saved["schema"] == 1,
            "Referencia de datos conservados inválida",
        )?;
        let id = saved["generation"]
            .as_str()
            .ok_or_else(|| WriteError::new(1, "Referencia de datos conservados inválida"))?;
        let version = saved["version"]
            .as_str()
            .ok_or_else(|| WriteError::new(1, "Versión conservada inválida"))?;
        if validation::setup_version(incoming).map_err(|e| WriteError::new(1, e))?
            < validation::setup_version(version).map_err(|e| WriteError::new(1, e))?
        {
            return Err(WriteError::new(
                3,
                "Tus datos pertenecen a una versión más reciente",
            ));
        }
        let data = disk::generation(root, id)?.join("data");
        ensure(data.is_dir(), "No se encuentran tus datos conservados")?;
        return Ok(Some(data));
    }
    let mut source = None;
    let mut index = None;
    for (id, directory) in generations(root)? {
        let data = directory.join("data");
        if validation::hex(&id, 32) && data.is_dir() {
            let candidate = disk::data_index(&data)?;
            ensure(
                index.as_ref().is_none_or(|before| before == &candidate),
                "Hay varias copias antiguas diferentes de tus datos; se conservan todas",
            )?;
            if source.is_none() {
                source = Some(data);
                index = Some(candidate);
            }
        }
    }
    Ok(source)
}

/// Explicit Setup owns the session lock through generation and shell completion.
/// TODO(#1840 p5): replace the sole PS finalizer with `engine::shell::sync`.
pub fn install(
    root: &Path,
    package: &Package<'_>,
    mode: Mode,
    control: &mut Control<'_>,
    mut finalize: impl FnMut(&mut Control<'_>) -> Result<()>,
    mut prepare: impl FnMut() -> Result<()>,
) -> Result<()> {
    let root = disk::open_root(root, true)?;
    let _session = disk::lock(&root, "beta-session.lock")
        .map_err(|_| WriteError::new(2, "Cierra Vantare para continuar"))?;
    prepare()?;
    let before = Before::capture(&root)?;
    let result = (|| {
        let probe = root.join("staging").join(format!("setup-{}", disk::id()?));
        let incoming = package::expand(package.archive, package.sha256, &probe, "beta");
        let cleanup = disk::remove_owned_tree(&root, &probe);
        let incoming = incoming?;
        cleanup?;
        let next_version =
            validation::setup_version(&incoming.version).map_err(|e| WriteError::new(1, e))?;
        if root.join("state.json").try_exists()? {
            let view = Installation::read(&root, ReadProfile::Probe)?;
            let current = view
                .manifest
                .as_ref()
                .ok_or_else(|| WriteError::new(1, "Falta manifiesto activo"))?;
            ensure(
                current.channel == "beta",
                "Canal de instalación incompatible",
            )?;
            let current_version =
                validation::setup_version(&current.version).map_err(|e| WriteError::new(1, e))?;
            if mode == Mode::Repair && current.version != package.version {
                return Err(WriteError::new(
                    3,
                    "Reparar exige el Setup de la misma versión",
                ));
            }
            if next_version < current_version {
                return Err(WriteError::new(
                    3,
                    "Ya tienes una versión más reciente de Vantare",
                ));
            }
            control.copy()?;
            activate(
                &root,
                package,
                &incoming.version,
                next_version == current_version,
                control,
            )?;
        } else {
            if mode == Mode::Repair {
                return Err(WriteError::new(
                    3,
                    "Reparar exige una instalación de la misma versión",
                ));
            }
            let source = retained_source(&root, &incoming.version)?;
            let _handles = disk::binary_guard(&root)?;
            control.copy()?;
            install_candidate(&root, package, source.as_deref(), control)?;
        }
        fs::write(root.join("candidate.ps1"), package.candidate)?;
        fs::write(root.join("beta.ps1"), package.beta)?;
        disk::remove_file(&root.join("retained-data.json"))?;
        finalize(control)
    })();
    if result.is_err() {
        before.restore(&root, control);
    }
    result
}

fn install_candidate(
    root: &Path,
    package: &Package<'_>,
    source: Option<&Path>,
    control: &mut Control<'_>,
) -> Result<()> {
    let _lock = disk::lock(root, ".operation.lock")?;
    ensure(
        !root.join("state.json").try_exists()?,
        "Ya instalado; utilice actualización",
    )?;
    let id = disk::id()?;
    let generation = disk::generation(root, &id)?;
    package::expand(package.archive, package.sha256, &generation, "beta")?;
    if let Some(source) = source {
        disk::copy_data(source, &generation.join("data"))?;
    } else {
        fs::create_dir(generation.join("data"))?;
    }
    (control.checkpoint)("staged")?;
    fs::copy(generation.join("candidate.ps1"), root.join("candidate.ps1"))?;
    let next = State {
        schema: 1,
        product: "vantare-native".into(),
        channel: "beta".into(),
        active: reference(id, &generation)?,
        previous: None,
    };
    disk::commit(root, &next, control.checkpoint)?;
    Installation::read(root, ReadProfile::Verified)?;
    Ok(())
}

fn activate(
    root: &Path,
    package: &Package<'_>,
    version: &str,
    repair: bool,
    control: &mut Control<'_>,
) -> Result<()> {
    let before = state(root, repair)?;
    let marker = root.join("boot-pending.json");
    if marker.try_exists()? {
        return Err(WriteError::new(4, "Hay un arranque pendiente de comprobar"));
    }
    let previous = if repair && Installation::read(root, ReadProfile::Verified).is_err() {
        before
            .previous
            .as_ref()
            .map_or("", |previous| previous.generation.as_str())
    } else {
        &before.active.generation
    };
    disk::write_json(
        &marker,
        &json!({"schema":1,"previous":previous,"version":version}),
    )?;
    if let Err(error) = update(root, package, repair, control) {
        if state(root, repair).is_ok_and(|now| now.active.generation == before.active.generation) {
            disk::remove_file(&marker)?;
        }
        return Err(error);
    }
    let temporary = root.join(format!("beta-{}.tmp", disk::id()?));
    disk::write_json(
        &temporary,
        &json!({"schema":1,"state":"applied","message":"Instalación aplicada; comprobando el arranque","version":version,"notes":""}),
    )?;
    disk::replace(&temporary, &root.join("update-status.json"))
}

/// Shared generation update. The PS feed remains a legacy consumer until p6.
pub fn update(
    root: &Path,
    package: &Package<'_>,
    repair: bool,
    control: &mut Control<'_>,
) -> Result<()> {
    let root = disk::open_root(root, false)?;
    let _lock = disk::lock(&root, ".operation.lock")?;
    let before = state(&root, repair)?;
    let previous = if repair && Installation::read(&root, ReadProfile::Verified).is_err() {
        before.previous.clone()
    } else {
        Some(before.active.clone())
    };
    let _handles = disk::binary_guard(&root)?;
    let id = disk::id()?;
    let generation = disk::generation(&root, &id)?;
    let incoming = package::expand(
        package.archive,
        package.sha256,
        &generation,
        &before.channel,
    )?;
    if repair {
        let current = Installation::read(&root, ReadProfile::Probe)?
            .manifest
            .ok_or_else(|| WriteError::new(1, "Falta manifiesto activo"))?;
        ensure(
            incoming.version == current.version,
            "La reparación exige la misma versión",
        )?;
    }
    let source = disk::generation(&root, &before.active.generation)?.join("data");
    disk::copy_data(&source, &generation.join("data"))?;
    (control.checkpoint)("staged")?;
    let next = State {
        schema: 1,
        product: "vantare-native".into(),
        channel: before.channel,
        active: reference(id, &generation)?,
        previous,
    };
    disk::commit(&root, &next, control.checkpoint)?;
    Installation::read(&root, ReadProfile::Verified)?;
    Ok(())
}

pub fn uninstall(
    root: &Path,
    control: &mut Control<'_>,
    mut finalize: impl FnMut(&mut Control<'_>) -> Result<()>,
) -> Result<()> {
    let root = disk::open_root(root, false)?;
    let _session = disk::lock(&root, "beta-session.lock")?;
    let _lock = disk::lock(&root, ".operation.lock")?;
    let state_path = root.join("state.json");
    if !state_path.try_exists()? {
        return finalize(control);
    }
    let state = Installation::read(&root, ReadProfile::Retire)?
        .state
        .ok_or_else(|| WriteError::new(1, "No hay instalación activa"))?;
    drop(disk::binary_guard(&root)?);
    super::validate_catalogue()?;
    let retained = root.join("retained-data.json");
    if !retained.try_exists()? {
        let active = &state.active.generation;
        let version = installation::retention_version(&root, &state)?;
        disk::write_json(
            &retained,
            &json!({"schema":1,"generation":active,"version":version}),
        )?;
    }
    let members = super::known_members("beta");
    for (id, directory) in generations(&root)? {
        ensure(
            validation::hex(&id, 32),
            "Generación ajena; no se desinstala",
        )?;
        installation::tree(&directory)?;
        for member in members
            .iter()
            .copied()
            .chain(std::iter::once("manifest.json"))
        {
            disk::remove_file(&directory.join(member))?;
            (control.checkpoint)("uninstall-member")?;
        }
        let mut parents = BTreeSet::new();
        for member in &members {
            let mut parent = Path::new(member).parent();
            while let Some(path) = parent.filter(|p| !p.as_os_str().is_empty()) {
                parents.insert(path.to_path_buf());
                parent = path.parent();
            }
        }
        let mut parents: Vec<_> = parents.into_iter().collect();
        parents.sort_by_key(|path| std::cmp::Reverse(path.as_os_str().len()));
        for parent in parents {
            let path = directory.join(parent);
            if path.is_dir()
                && fs::read_dir(&path)?.next().is_none()
                && let Err(error) = fs::remove_dir(&path)
                && (!path.is_dir() || fs::read_dir(&path)?.next().is_none())
            {
                return Err(error.into());
            }
        }
    }
    disk::remove_file(&state_path)?;
    for name in [
        "boot-pending.json",
        "hub-ready",
        "update-status.json",
        "registration-status.json",
        "startup-options.json",
        "staging/pending.json",
    ] {
        disk::remove_file(&root.join(name))?;
    }
    finalize(control)
}
