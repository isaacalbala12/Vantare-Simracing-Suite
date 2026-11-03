//! Generation mutations. One bound installation snapshot per operation.
use super::{
    Generation, Installation, State, WriteError, installation, package, validation,
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
impl Package<'_> {
    fn expand(&self, destination: &Path, channel: &str) -> Result<super::Manifest> {
        let manifest = package::expand(self.archive, self.sha256, destination, channel)?;
        ensure(
            manifest.version == self.version,
            "Versión del paquete incompatible",
        )?;
        Ok(manifest)
    }
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
        (self.progress)(Progress::step("copy", 54, true));
        if self.cancel.load(Ordering::Acquire) {
            return Err(WriteError::new(5, "Instalación cancelada antes de copiar"));
        }
        // Same boundary as the legacy driver's copy acknowledgement: the UI
        // must stop offering cancellation before any generation mutation.
        (self.progress)(Progress::step("copy", 54, false));
        Ok(())
    }
}

const METADATA: &[&str] = &[
    "retained-data.json",
    "boot-pending.json",
    "update-status.json",
];
struct Before {
    state: Option<serde_json::Value>,
    files: BTreeMap<&'static str, Option<serde_json::Value>>,
    generations: BTreeSet<String>,
}
impl Before {
    fn capture(root: &Path, view: &Installation) -> Result<Self> {
        let mut files = BTreeMap::new();
        for &name in METADATA {
            let path = root.join(name);
            files.insert(name, disk::read_optional(&path, None)?);
        }
        Ok(Self {
            state: view.original_state.clone(),
            files,
            generations: generations(root)?
                .into_iter()
                .map(|(name, _)| name)
                .collect(),
        })
    }
    fn restore(&self, root: &Path, control: &mut Control<'_>) -> bool {
        // Without a restored state, neither old metadata nor its Windows
        // projection is authoritative. Preserve the committed generation.
        let restored = match &self.state {
            Some(state) => serde_json::to_vec_pretty(state)
                .map_err(WriteError::from)
                .and_then(|bytes| disk::commit_raw(root, &bytes, &mut |_| Ok(()))),
            None => disk::remove_file(&root.join("state.json")),
        };
        if let Err(cause) = restored {
            (control.warning)(&format!("No se pudo restaurar el estado: {cause}"));
            return false;
        }
        for &name in METADATA {
            let path = root.join(name);
            let restored = match &self.files[name] {
                Some(value) => serde_json::to_vec_pretty(value)
                    .map_err(WriteError::from)
                    .and_then(|bytes| fs::write(&path, bytes).map_err(WriteError::from)),
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
            let mut referenced = BTreeSet::new();
            if let Some(state) = &self.state {
                for reference in [&state["active"], &state["previous"]] {
                    if let Some(id) = reference["generation"].as_str() {
                        referenced.insert(id.to_owned());
                    }
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
        true
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
fn retained_source(
    root: &Path,
    incoming: [u16; 3],
    view: &Installation,
) -> Result<Option<PathBuf>> {
    if let Some(saved) = &view.retained {
        if incoming < saved.version_parts {
            return Err(WriteError::new(
                3,
                "Tus datos pertenecen a una versión más reciente",
            ));
        }
        ensure(
            view.data_path.is_dir(),
            "No se encuentran tus datos conservados",
        )?;
        return Ok(Some(view.data_path.clone()));
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

fn previous_generation(
    view: &mut Installation,
    root: &Path,
    repair: bool,
) -> Result<Option<Generation>> {
    match view.verify(root) {
        Ok(()) => Ok(view.state.as_ref().map(|state| state.active.clone())),
        Err(error) if !repair => Err(error.into()),
        Err(_) => Ok(view.usable_previous().cloned()),
    }
}

/// Explicit Setup owns both locks through generation and shell completion.
/// The finalizer receives the cached projection, including after rollback.
pub fn install(
    root: &Path,
    package: &Package<'_>,
    mode: Mode,
    control: &mut Control<'_>,
    mut finalize: impl FnMut(&mut Control<'_>, bool, Option<(&State, &str)>) -> Result<()>,
    mut prepare: impl FnMut() -> Result<()>,
) -> Result<()> {
    let root = disk::open_root(root, true)?;
    let _session = disk::lock(&root, "beta-session.lock")
        .map_err(|_| WriteError::new(2, "Cierra Vantare para continuar"))?;
    let _operation = disk::lock(&root, ".operation.lock")?;
    let mut view = Installation::read(&root)?;
    if mode == Mode::Repair && view.state.is_none() {
        return Err(WriteError::new(
            3,
            "Reparar exige una instalación de la misma versión",
        ));
    }
    prepare()?;
    let before = Before::capture(&root, &view)?;
    let stage = root.join("staging").join(format!("setup-{}", disk::id()?));
    let mut changed = false;
    let mut projected = false;
    let result = (|| {
        let incoming = package.expand(&stage, "beta")?;
        let source;
        let previous;
        let updating = view.state.is_some();
        if let Some(current) = &view.manifest {
            ensure(
                current.channel == "beta",
                "Canal de instalación incompatible",
            )?;
            if (mode == Mode::Repair && incoming.version != current.version)
                || incoming.version_parts < current.version_parts
            {
                return Err(WriteError::new(
                    3,
                    "Setup incompatible con la versión instalada",
                ));
            }
            let repair = incoming.version_parts == current.version_parts;
            previous = previous_generation(&mut view, &root, repair)?;
            source = Some(view.data_path.clone());
            ensure(
                !root.join("boot-pending.json").try_exists()?,
                "Hay un arranque pendiente de comprobar",
            )
            .map_err(|e| WriteError::new(4, e.to_string()))?;
        } else {
            source = retained_source(&root, incoming.version_parts, &view)?;
            previous = None;
        }
        let _handles = disk::binary_guard(&root)?;
        control.copy()?;
        changed = true;
        if updating {
            disk::write_json(
                &root.join("boot-pending.json"),
                &json!({"schema":1,
                "previous":previous.as_ref().map_or("",|reference|reference.generation.as_str()),"version":incoming.version}),
            )?;
        }
        let next = apply_generation(
            &root,
            &stage,
            &incoming,
            source.as_deref(),
            previous,
            control,
        )?;
        if updating {
            let temporary = root.join(format!("beta-{}.tmp", disk::id()?));
            disk::write_json(
                &temporary,
                &json!({"schema":1,"state":"applied","message":"Instalación aplicada; comprobando el arranque","version":incoming.version,"notes":""}),
            )?;
            disk::replace_temporary(&temporary, &root.join("update-status.json"))?;
        }
        fs::write(root.join("candidate.ps1"), package.candidate)?;
        fs::write(root.join("beta.ps1"), package.beta)?;
        disk::remove_file(&root.join("retained-data.json"))?;
        projected = true;
        finalize(control, false, Some((&next, &incoming.version)))
    })();
    if result.is_err()
        && changed
        && before.restore(&root, control)
        && projected
        && let Err(cause) = finalize(
            control,
            true,
            view.state.as_ref().zip(view.installed_version()),
        )
    {
        (control.warning)(&format!(
            "No se pudo resincronizar Windows tras restaurar el estado: {cause}"
        ));
    }
    // A failed authentication or cancellation cannot leave a partial staging tree.
    if let Err(cause) = disk::remove_owned_tree(&root, &stage) {
        if result.is_ok() {
            return Err(cause);
        }
        (control.warning)(&format!("No se pudo retirar el temporal: {cause}"));
    }
    result
}

fn apply_generation(
    root: &Path,
    stage: &Path,
    incoming: &super::Manifest,
    source: Option<&Path>,
    previous: Option<Generation>,
    control: &mut Control<'_>,
) -> Result<State> {
    let id = disk::id()?;
    let generation = disk::generation(root, &id)?;
    fs::create_dir_all(root.join("generations"))?;
    fs::rename(stage, &generation)?;
    if let Some(source) = source {
        disk::copy_data(source, &generation.join("data"))?;
    } else {
        fs::create_dir(generation.join("data"))?;
    }
    (control.checkpoint)("staged")?;
    let next = State {
        schema: 1,
        product: "vantare-native".into(),
        channel: incoming.channel.clone(),
        active: Generation {
            generation: id,
            manifest_sha256: Some(incoming.sha256().to_owned()),
        },
        previous,
    };
    disk::commit_raw(root, &serde_json::to_vec_pretty(&next)?, control.checkpoint)?;
    Ok(next)
}

/// Feed stays a PowerShell consumer until p6; this is the same native writer.
pub fn update(
    root: &Path,
    package: &Package<'_>,
    repair: bool,
    control: &mut Control<'_>,
) -> Result<()> {
    let root = disk::open_root(root, false)?;
    let _lock = disk::lock(&root, ".operation.lock")?;
    let mut view = Installation::read(&root)?;
    ensure(view.state.is_some(), "No hay instalación activa")?;
    let previous = previous_generation(&mut view, &root, repair)?;
    let _handles = disk::binary_guard(&root)?;
    let stage = root.join("staging").join(format!("update-{}", disk::id()?));
    let result = (|| {
        let incoming =
            package.expand(&stage, &view.state.as_ref().expect("checked state").channel)?;
        ensure(
            !repair || Some(incoming.version.as_str()) == view.installed_version(),
            "La reparación exige la misma versión",
        )?;
        apply_generation(
            &root,
            &stage,
            &incoming,
            Some(&view.data_path),
            previous,
            control,
        )?;
        Ok(())
    })();
    let cleanup = disk::remove_owned_tree(&root, &stage);
    result.and(cleanup)
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
    let Some(document) = installation::read_state(&root)? else {
        return finalize(control);
    };
    let state = document.state;
    ensure(
        document.previous_present
            && document.warning.is_none()
            && state.active.valid()
            && state.previous.as_ref().is_none_or(Generation::valid),
        "Referencia de generación inválida",
    )?;
    drop(disk::binary_guard(&root)?);
    // Authenticate all referenced inventories before deleting any member. A
    // generation without a state binding has no authority over foreign files.
    let mut owned = Vec::new();
    for (id, directory) in generations(&root)? {
        ensure(
            validation::hex(&id, 32),
            "Generación ajena; no se desinstala",
        )?;
        let reference = std::iter::once(&state.active)
            .chain(state.previous.iter())
            .find(|reference| reference.generation == id);
        let Some(reference) = reference else {
            (control.warning)(&format!(
                "Binarios conservados: {}; motivo: generación sin referencia SHA en active/previous (pendiente del paso 8)",
                directory.display()
            ));
            continue;
        };
        let path = directory.join("manifest.json");
        if !path.try_exists()? {
            continue;
        } // Retirement may already have removed it.
        let manifest = super::Manifest::authenticated(&directory, reference, &state.channel)?;
        owned.push((id, directory, manifest));
    }
    let retained = root.join("retained-data.json");
    if !retained.try_exists()? {
        let version = owned
            .iter()
            .find(|(id, _, _)| id == &state.active.generation)
            .map(|(_, _, manifest)| &manifest.version)
            .ok_or_else(|| {
                WriteError::new(
                    1,
                    "No se puede autenticar la versión de los datos conservados",
                )
            })?;
        disk::write_json(
            &retained,
            &json!({"schema":1,"generation":state.active.generation,"version":version}),
        )?;
    }
    for (_, directory, manifest) in owned {
        installation::walk(&directory, false)?;
        // Manifest last: an interrupted retirement can resume from the binding.
        let members: Vec<_> = manifest.files.into_iter().map(|file| file.path).collect();
        for member in members
            .iter()
            .map(String::as_str)
            .chain(std::iter::once("manifest.json"))
        {
            disk::remove_file(&directory.join(member))?;
            (control.checkpoint)("uninstall-member")?;
        }
        let mut parents = BTreeSet::new();
        for member in &members {
            parents.extend(
                Path::new(member)
                    .ancestors()
                    .skip(1)
                    .filter(|path| !path.as_os_str().is_empty())
                    .map(Path::to_path_buf),
            );
        }
        for parent in parents.iter().rev() {
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
