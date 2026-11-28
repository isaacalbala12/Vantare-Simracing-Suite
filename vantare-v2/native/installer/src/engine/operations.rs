//! Generation mutations. One bound installation snapshot per operation.
use super::{
    Generation, Installation, State, WriteError, installation, package, product, validation,
    windows,
    write_fs::{self as disk, Result, ensure},
};
use crate::model::{Mode, Progress};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs, io,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};

pub struct Package<'a> {
    pub archive: &'a Path,
    pub sha256: &'a str,
    pub version: &'a str,
    /// Canal que el manifiesto autenticado debe declarar (#2812).
    pub channel: &'a str,
}
impl Package<'_> {
    fn expand(&self, destination: &Path) -> Result<super::Manifest> {
        let manifest = package::expand(self.archive, self.sha256, destination, self.channel)?;
        ensure(
            manifest.version == self.version,
            "Versión del paquete incompatible",
        )?;
        Ok(manifest)
    }
}
/// Restos de una instalación sin `state.json` (desinstalación a medias): son de
/// este canal si lo dicen sus datos conservados. Sin ellos solo beta, el único
/// producto anterior a #2812, los reconoce; otro producto los rechaza.
pub fn residue_owned(root: &Path, channel: &str) -> Result<()> {
    let view = Installation::read(root)?;
    let owner = view
        .retained
        .as_ref()
        .map_or(product::UNDECLARED_CHANNEL, |saved| saved.channel());
    ensure(
        owner == channel,
        "Los restos de esta carpeta son de otro canal; se conservan",
    )
}
/// Solo los canales con identidad de producto propia se instalan (#2812).
fn installable(channel: &str) -> Result<()> {
    ensure(
        product::for_channel(channel).is_some(),
        "Canal sin producto de instalación",
    )
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
fn renew_launcher(root: &Path, state: &State) -> Result<bool> {
    let source = launcher_source(root, state);
    renew_launcher_from(root, &source)
}
fn renew_launcher_from(root: &Path, source: &Path) -> Result<bool> {
    let target = root.join("Vantare.exe");
    let existed = target.try_exists()?;
    let expected = installation::hash_file(source)?;
    if existed && expected == installation::hash_file(&target)? {
        return Ok(false);
    }
    let temporary = root.join(format!("launcher-{}.tmp", disk::id()?));
    fs::copy(source, &temporary)?;
    fs::OpenOptions::new()
        .write(true)
        .open(&temporary)?
        .sync_all()?;
    let old = if root.join("Vantare.exe.old").try_exists()? {
        root.join(format!("Vantare-{}.old", disk::id()?))
    } else {
        root.join("Vantare.exe.old")
    };
    if existed && windows::replace_backed_up(&temporary, &target, &old).is_ok() {
        ensure(
            installation::hash_file(&target)? == expected,
            "Lanzador renovado alterado",
        )?;
        return Ok(false);
    }
    if existed {
        fs::rename(&target, &old)?;
    }
    if let Err(error) = disk::replace_temporary(&temporary, &target) {
        if existed && !target.try_exists()? {
            let _ = fs::rename(&old, &target);
        }
        return Err(error);
    }
    ensure(
        installation::hash_file(&target)? == expected,
        "Lanzador renovado alterado",
    )?;
    Ok(!existed)
}
fn launcher_source(root: &Path, state: &State) -> PathBuf {
    root.join("generations")
        .join(&state.active.generation)
        .join("bin/vantare.exe")
}
pub fn recover_launcher(root: &Path, state: &State) -> Result<()> {
    let expected = installation::hash_file(&launcher_source(root, state))?;
    let target = root.join("Vantare.exe");
    if target.try_exists()? && installation::hash_file(&target)? == expected {
        clear_launcher_notice(root);
        return Ok(());
    }
    let old = root.join("Vantare.exe.old");
    if old.try_exists()? && installation::hash_file(&old)? == expected {
        if target.try_exists()? {
            let _ = renew_launcher_from(root, &old)?;
        } else {
            fs::rename(&old, &target)?;
        }
    } else {
        let _ = renew_launcher(root, state)?;
    }
    ensure(
        installation::hash_file(&target)? == expected,
        "Lanzador raíz inválido",
    )?;
    clear_launcher_notice(root);
    Ok(())
}
fn clear_launcher_notice(root: &Path) {
    let path = root.join("update-status.json");
    let Ok(Some(mut status)) = disk::read_optional(&path, Some(65536)) else {
        return;
    };
    if status["state"] == "rollback"
        && status["message"] == "Se restauró la versión anterior; el lanzador requiere Reparar"
    {
        status["message"] = "Se restauró la versión anterior".into();
        if let Err(error) = disk::publish_json(&path, &status) {
            eprintln!("No se pudo limpiar el aviso del lanzador: {error}");
        }
    }
}
#[cfg(all(test, windows))]
mod launcher_tests {
    use super::*;
    #[test]
    fn renews_a_running_root_launcher_by_renaming_it() {
        let parent = if std::env::var("CI").as_deref() == Ok("true") {
            PathBuf::from(std::env::var_os("RUNNER_TEMP").unwrap())
        } else {
            PathBuf::from("D:/VantareServer/qa/isa-1840")
        };
        let root = parent.join(format!("live-launcher-{}", std::process::id()));
        super::super::context::qa_path(&root).unwrap();
        let id = "a".repeat(32);
        let bin = root.join("generations").join(&id).join("bin");
        fs::create_dir_all(&bin).unwrap();
        let system = PathBuf::from(std::env::var_os("WINDIR").unwrap()).join("System32/cmd.exe");
        let launcher = root.join("Vantare.exe");
        fs::copy(&system, &launcher).unwrap();
        let mut next = fs::read(&system).unwrap();
        next.push(0);
        fs::write(bin.join("vantare.exe"), &next).unwrap();
        let state = State {
            schema: 1,
            product: "vantare-native".into(),
            channel: "beta".into(),
            active: Generation {
                generation: id,
                manifest_sha256: Some("b".repeat(64)),
            },
            previous: None,
        };
        let mut child = std::process::Command::new(&launcher)
            .args(["/D", "/C", "ping -n 5 127.0.0.1 >NUL"])
            .spawn()
            .unwrap();
        assert!(!renew_launcher(&root, &state).unwrap());
        assert_eq!(fs::read(&launcher).unwrap(), next);
        assert!(root.join("Vantare.exe.old").is_file());
        child.kill().unwrap();
        child.wait().unwrap();
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn interrupted_rename_restores_the_old_launcher_before_cleanup() {
        let parent = if std::env::var("CI").as_deref() == Ok("true") {
            PathBuf::from(std::env::var_os("RUNNER_TEMP").unwrap())
        } else {
            PathBuf::from("D:/VantareServer/qa/isa-1840")
        };
        let root = parent.join(format!("interrupted-launcher-{}", std::process::id()));
        super::super::context::qa_path(&root).unwrap();
        let id = "a".repeat(32);
        let bin = root.join("generations").join(&id).join("bin");
        fs::create_dir_all(&bin).unwrap();
        let original = b"active launcher";
        fs::write(bin.join("vantare.exe"), original).unwrap();
        let target = root.join("Vantare.exe");
        fs::write(&target, original).unwrap();
        let state = State {
            schema: 1,
            product: "vantare-native".into(),
            channel: "beta".into(),
            active: Generation {
                generation: id,
                manifest_sha256: Some("b".repeat(64)),
            },
            previous: None,
        };
        fs::rename(&target, root.join("Vantare.exe.old")).unwrap();
        fs::write(
            root.join(format!("launcher-{}.tmp", "c".repeat(32))),
            b"partial",
        )
        .unwrap();
        recover_launcher(&root, &state).unwrap();
        assert_eq!(fs::read(&target).unwrap(), original);
        assert!(!root.join("Vantare.exe.old").exists());
        fs::write(&target, b"altered root launcher").unwrap();
        fs::write(root.join("Vantare.exe.old"), original).unwrap();
        recover_launcher(&root, &state).unwrap();
        assert_eq!(fs::read(&target).unwrap(), original);
        assert!(root.join("Vantare.exe.old").exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn failed_renewal_after_state_commit_clears_marker_and_allows_retry() {
        let parent = if std::env::var("CI").as_deref() == Ok("true") {
            PathBuf::from(std::env::var_os("RUNNER_TEMP").unwrap())
        } else {
            PathBuf::from("D:/VantareServer/qa/isa-1840")
        };
        let root = parent.join(format!("rollback-launcher-error-{}", std::process::id()));
        super::super::context::qa_path(&root).unwrap();
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("boot-pending.json"), b"{}").unwrap();
        finish_rollback(&root, "0.0.989", false, || {
            Err(WriteError::new(1, "simulated rename failure"))
        })
        .unwrap();
        assert!(!root.join("boot-pending.json").exists());
        let status = disk::read_json(&root.join("update-status.json"), None).unwrap();
        assert_eq!(status["state"], "rollback");
        assert!(status["rejectedVersion"].is_null());
        let id = "a".repeat(32);
        let bin = root.join("generations").join(&id).join("bin");
        fs::create_dir_all(&bin).unwrap();
        fs::write(bin.join("vantare.exe"), b"restored").unwrap();
        fs::write(root.join("Vantare.exe"), b"broken").unwrap();
        let state = State {
            schema: 1,
            product: "vantare-native".into(),
            channel: "beta".into(),
            active: Generation {
                generation: id,
                manifest_sha256: Some("b".repeat(64)),
            },
            previous: None,
        };
        recover_launcher(&root, &state).unwrap();
        assert_eq!(fs::read(root.join("Vantare.exe")).unwrap(), b"restored");
        let status = disk::read_json(&root.join("update-status.json"), None).unwrap();
        assert_eq!(status["message"], "Se restauró la versión anterior");
        fs::remove_dir_all(root).unwrap();
    }
}
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
        if let Some(state) = &self.state
            && let Ok(state) = serde_json::from_value::<State>(state.clone())
            && let Err(error) = renew_launcher(root, &state)
        {
            (control.warning)(&format!("Rollback: lanzador anterior: {error}"));
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
/// Una raíz sin estado con datos de otro producto no se toca (#2812): ni sus
/// datos conservados ni las copias sin referencia de otro dueño (#2817).
fn foreign_data(root: &Path, view: &Installation, channel: &str) -> Result<()> {
    if let Some(saved) = &view.retained {
        return ensure(
            saved.channel() == channel,
            "Los datos conservados en esta carpeta son de otro canal; se conservan",
        );
    }
    for (id, directory) in generations(root)? {
        if validation::hex(&id, 32) && directory.join("data").is_dir() {
            ensure(
                unreferenced_owner(&directory)? == channel,
                "Hay datos de otra instalación en esta carpeta; se conservan",
            )?;
        }
    }
    Ok(())
}
/// Dueño de una copia de datos sin `retained-data.json` (#2817): el canal que
/// declara el `manifest.json` que aún conserve su generación (por ejemplo, una
/// instalación cortada antes de escribir `state.json`), leído con el mismo
/// lector cerrado y con tope que el resto del motor. Sin manifiesto, beta, el
/// único producto anterior a que los datos declararan su canal. Un manifiesto
/// que no se puede leer no dice de quién es: nadie la adopta, y se dice así.
fn unreferenced_owner(generation: &Path) -> Result<String> {
    let path = generation.join("manifest.json");
    if !path.try_exists()? {
        return Ok(product::UNDECLARED_CHANNEL.to_owned());
    }
    super::Manifest::read(&path)
        .map(|manifest| manifest.channel)
        .map_err(|_| WriteError::new(1, UNREADABLE_COPY))
}
const UNREADABLE_COPY: &str = "No se puede leer manifest.json de una copia de tus datos en esta carpeta, el archivo que dice de qué instalación es. No se ha borrado nada y tus datos siguen ahí. Instala en otra carpeta o escribe a soporte";
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
#[allow(clippy::too_many_lines)] // One transaction keeps its rollback state in scope.
pub fn install(
    root: &Path,
    package: &Package<'_>,
    mode: Mode,
    control: &mut Control<'_>,
    mut finalize: impl FnMut(&mut Control<'_>, bool, Option<(&State, &str)>) -> Result<()>,
    mut prepare: impl FnMut() -> Result<()>,
) -> Result<()> {
    installable(package.channel)?;
    let root = disk::open_root(root, true)?;
    let _session = disk::lock(&root, "beta-session.lock")
        .map_err(|_| WriteError::new(2, "Cierra Vantare para continuar"))?;
    let _operation = disk::lock(&root, ".operation.lock")?;
    let mut view = Installation::read(&root)?;
    // Otro producto en esta raíz: ni se lee su versión ni se toca nada.
    ensure(
        view.state
            .as_ref()
            .is_none_or(|state| state.channel == package.channel),
        "Canal de instalación incompatible",
    )?;
    // Y sin estado, sus datos conservados: se rechaza antes de retirar un
    // marcador huérfano o de escribir el temporal en la raíz.
    if view.state.is_none() {
        foreign_data(&root, &view, package.channel)?;
    }
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
    let mut created_launcher = false;
    let result = (|| {
        let incoming = package.expand(&stage)?;
        let source;
        let previous;
        let updating = view.state.is_some();
        if let Some(current) = &view.manifest {
            ensure(
                current.channel == package.channel,
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
        let next = apply_generation(
            &root,
            &stage,
            &incoming,
            source.as_deref(),
            previous,
            updating,
            control,
        )?;
        if incoming.engine() == 2 {
            created_launcher = renew_launcher(&root, &next)?;
        }
        if updating {
            // As the feed and Confirm do: a version rejected by an earlier
            // rollback stays rejected, so the feed does not offer it again (#2825).
            status(
                &root,
                "applied",
                "Instalación aplicada; comprobando el arranque",
                &incoming.version,
            )?;
        }
        disk::remove_file(&root.join("retained-data.json"))?;
        projected = true;
        finalize(control, false, Some((&next, &incoming.version)))
    })();
    let restored = result.is_err() && changed && before.restore(&root, control);
    if restored
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
    if restored
        && created_launcher
        && let Err(error) = disk::remove_file(&root.join("Vantare.exe"))
    {
        (control.warning)(&format!(
            "No se pudo retirar el lanzador tras rollback: {error}"
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
    pending: bool,
    control: &mut Control<'_>,
) -> Result<State> {
    let id = disk::id()?;
    let generation = disk::generation(root, &id)?;
    fs::create_dir_all(root.join("generations"))?;
    if pending {
        disk::publish_json(
            &root.join("boot-pending.json"),
            &json!({"schema":1,"previous":previous.as_ref().map_or("",|reference|reference.generation.as_str()),
                "version":incoming.version,"stagedGeneration":id,"manifestSha256":incoming.sha256()}),
        )?;
    }
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

/// The session applies a staged, previously authenticated feed package only
/// after all children have exited. Setup's explicit Update uses the same path.
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
    ensure(
        view.state
            .as_ref()
            .is_some_and(|state| state.channel == package.channel),
        "El actualizador no cambia de canal",
    )?;
    installable(package.channel)?;
    ensure(
        !root.join("boot-pending.json").try_exists()?,
        "Hay un arranque pendiente",
    )?;
    let before = Before::capture(&root, &view)?;
    let previous = previous_generation(&mut view, &root, repair)?;
    let _handles = disk::binary_guard_running(&root)?;
    let stage = root.join("staging").join(format!("update-{}", disk::id()?));
    let result = (|| {
        let incoming = package.expand(&stage)?;
        ensure(
            !repair || Some(incoming.version.as_str()) == view.installed_version(),
            "La reparación exige la misma versión",
        )?;
        ensure(
            repair
                || view
                    .manifest
                    .as_ref()
                    .is_some_and(|current| incoming.version_parts > current.version_parts),
            "La actualización exige una versión mayor",
        )?;
        ensure(incoming.engine() == 2, "El feed exige motor 2")?;
        let next = apply_generation(
            &root,
            &stage,
            &incoming,
            Some(&view.data_path),
            previous,
            true,
            control,
        )?;
        renew_launcher(&root, &next)?;
        status(
            &root,
            "applied",
            "Instalación aplicada; comprobando el arranque",
            &incoming.version,
        )?;
        Ok(())
    })();
    if result.is_err() {
        before.restore(&root, control);
    }
    let cleanup = disk::remove_owned_tree(&root, &stage);
    result.and(cleanup)
}

/// Caller holds .operation.lock when a concurrent session can be staging.
pub fn status(root: &Path, state: &str, message: &str, version: &str) -> Result<()> {
    let rejected = if matches!(state, "rollback" | "repair") {
        Some(version.to_owned())
    } else {
        disk::read_optional(&root.join("update-status.json"), Some(65536))?
            .and_then(|old| old["rejectedVersion"].as_str().map(str::to_owned))
    };
    publish_status(root, state, message, version, rejected.as_deref())
}
fn publish_status(
    root: &Path,
    state: &str,
    message: &str,
    version: &str,
    rejected: Option<&str>,
) -> Result<()> {
    disk::publish_json(
        &root.join("update-status.json"),
        &json!({"schema":1,"state":state,"message":message,"version":version,"notes":"","rejectedVersion":rejected}),
    )
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BootRecovery {
    Restored,
    RepairRequired,
}

/// A window from the active generation has acknowledged readiness. The
/// launcher has already checked that its session is alive before calling.
pub fn confirm(root: &Path) -> Result<()> {
    confirm_reporting(root, &mut |note| eprintln!("{note}"))
}
/// `confirm`, handing the caller the log of the generations left without a
/// reference: what was retired and what was kept, with its path and reason.
pub fn confirm_reporting(root: &Path, note: &mut dyn FnMut(&str)) -> Result<()> {
    confirm_within(root, GATHER_BUDGET, note)
}
/// Confirm runs with the Hub open while the launcher holds its locks: the
/// recordings are compared for this long at most, and what is left waits,
/// untouched, for the next sweep (#2746, condition 9).
pub const GATHER_BUDGET: Duration = Duration::from_secs(30);
/// `confirm_reporting` with its own limit for gathering the recordings.
pub fn confirm_within(root: &Path, budget: Duration, note: &mut dyn FnMut(&str)) -> Result<()> {
    let root = disk::open_root(root, false)?;
    let _operation = disk::lock(&root, ".operation.lock")?;
    let note = &mut logged(&root, note);
    let marker = disk::read_json(&root.join("boot-pending.json"), Some(4096))?;
    let view = Installation::read(&root)?;
    let manifest = view
        .manifest
        .as_ref()
        .ok_or_else(|| WriteError::new(1, "Falta generación activa"))?;
    ensure(
        marker["schema"] == 1 && marker["version"] == manifest.version && manifest.engine() == 2,
        "Confirmación de generación inválida",
    )?;
    status(
        &root,
        "current",
        "Versión actualizada y arranque confirmado",
        &manifest.version,
    )?;
    disk::remove_file(&root.join("boot-pending.json"))?;
    // The way back ended with the marker: from here on nothing can fail the
    // confirmation, and no earlier step retires a generation.
    match installation::read_state(&root) {
        Ok(Some(document)) if references_bound(&document) => {
            let deadline = Instant::now().checked_add(budget);
            let mut within = |_: &str| {
                ensure(
                    deadline.is_none_or(|deadline| Instant::now() < deadline),
                    "se acabó el tiempo de Confirm",
                )
            };
            if let Err(error) = gather(&root, &document.state, &mut within, note) {
                note(&format!(
                    "Grabaciones: se sigue en la siguiente recogida; motivo: {error}"
                ));
            }
            retire_orphans(&root, &document.state, note);
        }
        _ => note(&kept(
            &root.join("generations"),
            "las referencias de state.json no son fiables",
        )),
    }
    Ok(())
}

/// Both references decoded and bound by SHA: the only basis for deleting files.
fn references_bound(document: &installation::StateDocument) -> bool {
    document.previous_present
        && document.warning.is_none()
        && document.state.active.valid()
        && document
            .state
            .previous
            .as_ref()
            .is_none_or(Generation::valid)
}
/// The launcher has no console and the log of Uninstall lives in a temporary
/// folder: the notes of the engine also reach the log of the installation.
fn logged<'a>(root: &'a Path, note: &'a mut dyn FnMut(&str)) -> impl FnMut(&str) + 'a {
    move |text| {
        let text = disk::relative(root, text);
        disk::log(root, &text);
        note(&text);
    }
}
fn kept(path: &Path, reason: impl std::fmt::Display) -> String {
    format!(
        "Generación sin referencia: se conserva {}; motivo: {reason}",
        path.display()
    )
}
/// Binaries of the generations that `state.json` no longer names (#2740).
/// Runs only after a confirmed boot or while uninstalling, never fails its
/// caller and never lists, reads or removes a `data` folder.
fn retire_orphans(root: &Path, state: &State, note: &mut dyn FnMut(&str)) {
    let listed = match generations(root) {
        Ok(listed) => listed,
        Err(error) => {
            note(&kept(&root.join("generations"), error));
            return;
        }
    };
    for (id, directory) in listed {
        if std::iter::once(&state.active)
            .chain(state.previous.iter())
            .any(|reference| reference.generation.eq_ignore_ascii_case(&id))
        {
            continue;
        }
        if !validation::hex(&id, 32) {
            note(&kept(&directory, "el nombre no es de una generación"));
            continue;
        }
        match retire_orphan(&directory, &state.channel, note) {
            Ok(0) => {}
            Ok(retired) => note(&format!(
                "Generación sin referencia: retirados {retired} archivos de {}; sus datos se conservan",
                directory.display()
            )),
            Err(error) => note(&kept(&directory, error)),
        }
    }
}
/// `state.json` keeps no SHA for an orphan, so ownership is proven by content:
/// a valid manifest of this product and channel, and each file equal to its
/// declaration. Anything else stays where it is, with its reason in the log.
fn retire_orphan(directory: &Path, channel: &str, note: &mut dyn FnMut(&str)) -> Result<usize> {
    let listed = installation::walk(directory, true)?;
    if listed.is_empty() {
        // Only the data is left, or nothing: this fails unless it is empty.
        let _ = fs::remove_dir(directory);
        return Ok(0);
    }
    let manifest = super::Manifest::read(&directory.join("manifest.json"))
        .map_err(|error| WriteError::new(1, format!("manifiesto ausente o no válido ({error})")))?;
    ensure(manifest.channel == channel, "manifiesto de otro canal")?;
    let files = || listed.iter().filter(|(_, is_directory)| !is_directory);
    // Only a probe: an image in use right now keeps the whole generation. The
    // handles are not held; what protects each file later is the exclusive
    // open of `retire_member`.
    for (file, _) in files().filter(|(file, _)| {
        file.extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
    }) {
        disk::open_exclusive(file).map_err(|error| {
            WriteError::new(2, format!("{} está en uso ({error})", file.display()))
        })?;
    }
    let mut retired = 0;
    for (file, _) in files() {
        let relative = file
            .strip_prefix(directory)
            .map_err(|error| WriteError::new(1, error.to_string()))?
            .to_string_lossy()
            .replace('\\', "/");
        if relative.eq_ignore_ascii_case("manifest.json") {
            continue;
        }
        let declared = manifest
            .files
            .iter()
            .find(|member| member.path.eq_ignore_ascii_case(&relative));
        match declared.map(|member| retire_member(file, member)) {
            Some(Ok(())) => retired += 1,
            Some(Err(error)) => note(&kept(file, error)),
            None => note(&kept(file, "no figura en el manifiesto")),
        }
    }
    let finish = || -> Result<()> {
        let members: Vec<_> = manifest.files.iter().map(|file| &file.path).collect();
        remove_empty_parents(directory, &members)?;
        // Manifest last, once nothing else is left beside the data: a sweep
        // that was cut short resumes from it.
        if let [(last, false)] = installation::walk(directory, true)?.as_slice()
            && last
                .file_name()
                .is_some_and(|name| name.eq_ignore_ascii_case("manifest.json"))
        {
            disk::remove_file(last)?;
            let _ = fs::remove_dir(directory);
        }
        Ok(())
    };
    if let Err(error) = finish() {
        note(&kept(directory, error));
    }
    Ok(retired)
}
/// The bytes are hashed through the exclusive handle that proves nobody else
/// has the file open; only a file equal to its declaration is removed.
fn retire_member(path: &Path, member: &installation::Member) -> Result<()> {
    let mut file = disk::open_exclusive(path)
        .map_err(|error| WriteError::new(2, format!("en uso o sin permiso ({error})")))?;
    let (size, sha256) = fingerprint(&mut file)?;
    ensure(
        size == member.size && sha256 == member.sha256,
        "no coincide con el tamaño y el SHA-256 del manifiesto",
    )?;
    drop(file);
    Ok(fs::remove_file(path)?)
}
/// Size and SHA-256 of the bytes behind an open handle.
pub(super) fn fingerprint(file: &mut fs::File) -> Result<(u64, String)> {
    let mut hash = Sha256::new();
    let size = io::copy(file, &mut hash)?;
    Ok((size, format!("{:x}", hash.finalize())))
}
/// Folders that held members, deepest first; one with anything left stays.
fn remove_empty_parents(directory: &Path, members: &[&String]) -> Result<()> {
    let mut parents = BTreeSet::new();
    for member in members {
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
    Ok(())
}

/// Called by the root launcher after the failed session has exited. Motor 1
/// remains readable for migration but is never run again as automatic rollback.
pub fn rollback(root: &Path) -> Result<BootRecovery> {
    rollback_with_policy(root, true)
}
pub fn rollback_retryable(root: &Path) -> Result<BootRecovery> {
    rollback_with_policy(root, false)
}
pub fn discard_stale_boot_marker(root: &Path) -> Result<bool> {
    let marker_path = root.join("boot-pending.json");
    if !marker_path.try_exists()? {
        return Ok(false);
    }
    let root = disk::open_root(root, false)?;
    let marker_path = root.join("boot-pending.json");
    let _operation = disk::lock(&root, ".operation.lock")?;
    let view = Installation::read(&root)?;
    let marker = disk::read_json(&marker_path, Some(4096))?;
    if let Some((state, active)) = view.state.as_ref().zip(view.manifest.as_ref()) {
        let id = marker["stagedGeneration"].as_str().unwrap_or("");
        let sha = marker["manifestSha256"].as_str().unwrap_or("");
        if marker["schema"] == 1
            && marker["previous"] == state.active.generation
            && marker["version"].as_str().is_some_and(|version| {
                version != active.version && validation::version(version).is_ok()
            })
            && validation::hex(id, 32)
            && validation::hex(sha, 64)
            && state
                .previous
                .as_ref()
                .is_none_or(|previous| previous.generation != id)
            && state.active.generation != id
        {
            let orphan = disk::generation(&root, id)?;
            if orphan.try_exists()? {
                let reference = Generation {
                    generation: id.to_owned(),
                    manifest_sha256: Some(sha.to_owned()),
                };
                if super::Manifest::authenticated(&orphan, &reference, &state.channel)
                    .is_ok_and(|manifest| manifest.version == marker["version"])
                    && let Err(error) = disk::remove_owned_tree(&root, &orphan)
                {
                    eprintln!(
                        "Arranque: no se pudo retirar la generación staged huérfana {}: {error}",
                        orphan.display()
                    );
                }
            }
            disk::remove_file(&marker_path)?;
            return Ok(true);
        }
    }
    let stale = view
        .state
        .as_ref()
        .zip(view.manifest.as_ref())
        .is_some_and(|(state, active)| {
            marker["schema"] == 1
                && marker["previous"] == state.active.generation
                && state.previous.is_some()
                && marker["version"].as_str().is_some_and(|version| {
                    validation::version(version).is_ok()
                        && version != active.version
                        && view
                            .previous_manifest
                            .as_ref()
                            .is_none_or(|previous| previous.version == version)
                })
        });
    if stale {
        if marker["rejectOnRollback"] == true {
            let version = marker["version"].as_str().expect("validated stale version");
            publish_status(
                &root,
                "rollback",
                "Se restauró la versión anterior",
                version,
                Some(version),
            )?;
        }
        disk::remove_file(&marker_path)?;
    }
    Ok(stale)
}
fn rollback_with_policy(root: &Path, reject_version: bool) -> Result<BootRecovery> {
    let root = disk::open_root(root, false)?;
    let _session = disk::lock(&root, "beta-session.lock")?;
    let _operation = disk::lock(&root, ".operation.lock")?;
    let mut marker = disk::read_json(&root.join("boot-pending.json"), Some(4096))?;
    let view = Installation::read_for_rollback(&root)?;
    let mut state = view
        .state
        .ok_or_else(|| WriteError::new(1, "Falta estado para rollback"))?;
    ensure(
        product::for_channel(&state.channel).is_some() && marker["schema"] == 1,
        "Rollback inválido",
    )?;
    let active = view
        .manifest
        .ok_or_else(|| WriteError::new(1, "Falta manifiesto activo"))?;
    ensure(
        marker["version"] == active.version,
        "Marker de arranque ajeno",
    )?;
    let previous = state
        .previous
        .as_ref()
        .zip(view.previous_manifest)
        .and_then(|(reference, manifest)| {
            manifest
                .installed(&root.join("generations").join(&reference.generation), true)
                .ok()?;
            Some(manifest)
        });
    let expected = state
        .previous
        .as_ref()
        .map_or("", |reference| reference.generation.as_str());
    ensure(marker["previous"] == expected, "Marker de arranque ajeno")?;
    if previous
        .as_ref()
        .is_none_or(|manifest| manifest.engine() != 2)
    {
        publish_status(
            &root,
            "repair",
            "Falló el arranque; ejecuta Reparar. Tus datos anteriores se conservan.",
            &active.version,
            reject_version.then_some(active.version.as_str()),
        )?;
        disk::remove_file(&root.join("boot-pending.json"))?;
        return Ok(BootRecovery::RepairRequired);
    }
    let prior = state.previous.take().expect("previous authenticated");
    state.previous = Some(std::mem::replace(&mut state.active, prior));
    marker["rejectOnRollback"] = reject_version.into();
    disk::publish_json(&root.join("boot-pending.json"), &marker)?;
    disk::commit_raw(&root, &serde_json::to_vec_pretty(&state)?, &mut |_| Ok(()))?;
    finish_rollback(&root, &active.version, reject_version, || {
        renew_launcher(&root, &state)
    })?;
    Ok(BootRecovery::Restored)
}
fn finish_rollback(
    root: &Path,
    failed_version: &str,
    reject_version: bool,
    renew: impl FnOnce() -> Result<bool>,
) -> Result<()> {
    disk::remove_file(&root.join("boot-pending.json"))?;
    let renewed = renew();
    let message = if renewed.is_ok() {
        "Se restauró la versión anterior"
    } else {
        "Se restauró la versión anterior; el lanzador requiere Reparar"
    };
    if let Err(error) = publish_status(
        root,
        "rollback",
        message,
        failed_version,
        reject_version.then_some(failed_version),
    ) {
        eprintln!("Rollback: no se pudo publicar el estado: {error}");
    }
    if let Err(error) = renewed {
        eprintln!("Rollback: no se pudo renovar Vantare.exe: {error}");
    }
    Ok(())
}

#[allow(clippy::too_many_lines)] // The ownership checks and deletion share one transaction.
pub fn uninstall(
    root: &Path,
    channel: &str,
    control: &mut Control<'_>,
    mut finalize: impl FnMut(&mut Control<'_>) -> Result<()>,
) -> Result<()> {
    let root = disk::open_root(root, false)?;
    let _session = disk::lock(&root, "beta-session.lock")?;
    let _lock = disk::lock(&root, ".operation.lock")?;
    let state_path = root.join("state.json");
    let Some(document) = installation::read_state(&root)? else {
        // Una desinstalación a medias ya no tiene state.json: solo se termina
        // si sus datos conservados son de este canal (#2812).
        residue_owned(&root, channel)?;
        return finalize(control);
    };
    ensure(
        document.state.channel == channel,
        "La instalación pertenece a otro canal; no se desinstala",
    )?;
    ensure(
        references_bound(&document),
        "Referencia de generación inválida",
    )?;
    let state = document.state;
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
            continue; // Retired below, by content.
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
        let mut saved = json!({"schema":1,"generation":state.active.generation,"version":version});
        if state.channel != product::UNDECLARED_CHANNEL {
            saved["channel"] = state.channel.clone().into();
        }
        disk::write_json(&retained, &saved)?;
    }
    // Before anything is retired and while `state.json` still names `previous`.
    gather(
        &root,
        &state,
        control.checkpoint,
        &mut logged(&root, control.warning),
    )?;
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
        remove_empty_parents(&directory, &members.iter().collect::<Vec<_>>())?;
    }
    retire_orphans(&root, &state, &mut logged(&root, control.warning));
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

/// What one adoption did with the recordings of a generation.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Adoption {
    pub moved: usize,
    pub duplicates: usize,
    pub kept: usize,
}
/// The session only moves. Confirm and Uninstall also remove a copy proven
/// identical to the recording that is already in the single folder.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Duplicates {
    Keep,
    RemoveIdentical,
}
/// Brings the recordings of `generations/<id>/data/hub/recordings` into the
/// single `<root>/recordings` folder (ADR 0111 §4). The session calls it at
/// every start with `Duplicates::Keep`. An error means that nothing was
/// attempted (code 2: another operation holds the lock), or that a checkpoint
/// cut it short. Whatever is doubtful stays where it is, with its reason in
/// `note`; running it again continues where it stopped.
pub fn adopt_recordings(
    root: &Path,
    generation: &str,
    duplicates: Duplicates,
    checkpoint: &mut dyn FnMut(&str) -> Result<()>,
    note: &mut dyn FnMut(&str),
) -> Result<Adoption> {
    let root = disk::open_root(root, false)?;
    // Busy is not a refusal: the caller may wait for its turn. Only a lock
    // that somebody holds is busy; failing to open it otherwise is a failure.
    let _operation =
        disk::try_lock(&root, ".operation.lock").map_err(|error| match error.raw_os_error() {
            Some(32) => WriteError::new(2, "Hay otra operación de la instalación en curso"),
            _ => error.into(),
        })?;
    // Without both references nobody knows which generation is `previous`.
    let document = installation::read_state(&root)?
        .filter(references_bound)
        .ok_or_else(|| WriteError::new(1, "Las referencias de state.json no son fiables"))?;
    let note = &mut |text: &str, once: bool| {
        let text = disk::relative(&root, text);
        if once {
            disk::log_once(&root, &text);
        } else {
            disk::log(&root, &text);
        }
        note(&text);
    };
    adopt(
        &root,
        &document.state,
        generation,
        duplicates,
        false,
        checkpoint,
        note,
    )
}
/// `sweep`: Confirm and Uninstall gathering from every generation (ADR 0111
/// T3). They move only a recording whose header says it is whole, and write
/// one note per reason, as the session does.
fn adopt(
    root: &Path,
    state: &State,
    generation: &str,
    duplicates: Duplicates,
    sweep: bool,
    checkpoint: &mut dyn FnMut(&str) -> Result<()>,
    note: &mut dyn FnMut(&str, bool),
) -> Result<Adoption> {
    let source = disk::generation(root, generation)?.join("data/hub/recordings");
    // `previous` keeps its copy: it is what a failed version goes back to.
    ensure(
        state
            .previous
            .as_ref()
            .is_none_or(|previous| !previous.generation.eq_ignore_ascii_case(generation)),
        "La generación anterior conserva sus grabaciones para la vuelta atrás",
    )?;
    let (source, single) = (disk::path(&source)?, disk::path(&root.join("recordings"))?);
    let mut adoption = Adoption::default();
    if !source.is_dir() {
        return Ok(adoption);
    }
    ensure(
        !single.try_exists()? || single.is_dir(),
        "La carpeta única de grabaciones no es una carpeta",
    )?;
    let listed = list(&source)?;
    let present = if single.is_dir() {
        list(&single)?
    } else {
        Vec::new()
    };
    // The session finds what stays again at every start: one note per reason,
    // written to the log once. The sweep writes one note per reason too, so
    // that many generations do not rotate the log; a direct call, one per file.
    let summarize = sweep || duplicates == Duplicates::Keep;
    let mut stays = BTreeMap::<String, Vec<&str>>::new();
    for (name, is_file) in &listed {
        if name == "recording-status.json" {
            continue; // The state of the recorder, which writes its own in the single folder.
        }
        let (path, target) = (source.join(name), single.join(name));
        let outcome = if !is_file {
            Err("no es un archivo normal".to_owned())
        } else if !recording_name(name) {
            Err("el nombre no es de una grabación".to_owned())
        } else if unfinished(&listed, name) {
            Err(BESIDE.to_owned())
        } else if unfinished(&present, name) {
            Err(IN_SINGLE.to_owned())
        } else if !present
            .iter()
            .any(|(other, _)| other.eq_ignore_ascii_case(name))
        {
            // Held until the rename: nobody else has it open, and nobody can open it.
            match disk::open_recording(&path, true) {
                Err(error) => Err(unavailable("la grabación")(error)),
                Ok(file) => {
                    checkpoint("adopt-move")?;
                    let whole = if sweep { intact(&file) } else { Ok(()) };
                    whole
                        .and_then(|()| move_recording(&file, name, &source, &single))
                        .map(|()| adoption.moved += 1)
                }
            }
        } else if duplicates == Duplicates::Keep {
            Err("ya existe en la carpeta única y este paso no compara".to_owned())
        } else {
            checkpoint("adopt-remove")?;
            remove_identical(&path, &target).map(|()| adoption.duplicates += 1)
        };
        if let Err(reason) = outcome {
            adoption.kept += 1;
            if summarize {
                stays.entry(reason).or_default().push(name);
            } else {
                let path = path.display();
                note(
                    &format!("Grabaciones: se conserva {path}; motivo: {reason}"),
                    false,
                );
            }
        }
    }
    let source = source.display();
    for (reason, names) in &stays {
        let shown = names[..names.len().min(5)].join(", ");
        let more = match names.len() - names.len().min(5) {
            0 => String::new(),
            more => format!(" y {more} más"),
        };
        let count = names.len();
        note(
            &format!(
                "Grabaciones de {source}: se conservan {count} ({shown}{more}); motivo: {reason}"
            ),
            duplicates == Duplicates::Keep,
        );
    }
    if adoption.moved + adoption.duplicates > 0 {
        note(
            &format!(
                "Grabaciones de {source}: adoptadas {}; copias repetidas retiradas {}",
                adoption.moved, adoption.duplicates
            ),
            false,
        );
    }
    Ok(adoption)
}
/// `series-<epoch>-<pid>.duckdb`: the only name the recorder gives a recording.
fn recording_name(name: &str) -> bool {
    installation::safe_member(name)
        && name
            .strip_prefix("series-")
            .and_then(|rest| rest.strip_suffix(".duckdb"))
            .and_then(|pair| pair.split_once('-'))
            .is_some_and(|(epoch, process)| {
                [epoch, process].iter().all(|digits| {
                    !digits.is_empty() && digits.bytes().all(|byte| byte.is_ascii_digit())
                })
            })
}
fn unavailable(whose: &'static str) -> impl Fn(io::Error) -> String {
    move |error| format!("{whose} está en uso o no se puede leer ({error})")
}
const BESIDE: &str = "tiene al lado un .wal o un temporal: está en curso o sin cerrar";
const IN_SINGLE: &str = "en la carpeta única hay un .wal o un temporal con su nombre";
/// (name, is a regular file): a link or a folder is neither followed nor moved.
fn list(directory: &Path) -> Result<Vec<(String, bool)>> {
    let mut listed = Vec::new();
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        listed.push((name, entry.file_type()?.is_file()));
    }
    listed.sort();
    Ok(listed)
}
/// A `.wal` or a temporary beside a recording: still being written, or cut short.
fn unfinished(folder: &[(String, bool)], name: &str) -> bool {
    let prefix = format!("{name}.");
    folder
        .iter()
        .any(|(other, _)| other.to_ascii_lowercase().starts_with(&prefix))
}
/// One rename inside the volume, through the handle that proves nobody else has
/// the recording open: whole in the source or whole in the single folder, never
/// a copy and never over another file. What the lists said when they were taken
/// is looked at again with the recording held.
fn move_recording(
    file: &fs::File,
    name: &str,
    source: &Path,
    single: &Path,
) -> std::result::Result<(), String> {
    let failed = |error: &dyn std::fmt::Display| format!("no se pudo mover ({error})");
    let finished = |folder: &Path, reason: &str| match list(folder) {
        Ok(found) if unfinished(&found, name) => Err(reason.to_owned()),
        found => found.map(drop).map_err(|error| failed(&error)),
    };
    finished(source, BESIDE)?;
    fs::create_dir_all(single).map_err(|error| failed(&error))?;
    finished(single, IN_SINGLE)?;
    windows::rename_open(file, &single.join(name)).map_err(|error| failed(&error))
}
/// The only deletion of user data in the engine. The copy goes away through
/// the exclusive handle that hashed it, while nobody can write the one kept.
fn remove_identical(path: &Path, target: &Path) -> std::result::Result<(), String> {
    let mut twin =
        disk::open_recording(target, false).map_err(unavailable("la de la carpeta única"))?;
    let mut copy = disk::open_recording(path, true).map_err(unavailable("la copia"))?;
    let identical = (|| -> Result<bool> {
        Ok(copy.metadata()?.len() == twin.metadata()?.len()
            && fingerprint(&mut copy)? == fingerprint(&mut twin)?)
    })()
    .map_err(|error| format!("no se pudo comparar ({error})"))?;
    if !identical {
        return Err("su contenido es distinto del de la carpeta única".to_owned());
    }
    windows::delete_open(&copy).map_err(|error| format!("no se pudo retirar la copia ({error})"))
}
/// The storage format `intact` reads: version 64, the one `DuckDB` 1.5.5 writes
/// and `storage` pins (`Cargo.lock`; a test fails when it changes, so that the
/// reader is checked again). Another version is not read: the recording stays.
const STORAGE_VERSION: u64 = 64;
const DUCK_HEADER: usize = 4096;
/// A `DuckDB` 1.5.5 file is a main header (its mark and storage version), two
/// database headers and the blocks the newest of them counts; each one starts
/// with the checksum of the rest. Every block in the file is verified, so a
/// copy cut short, or one whose blocks never reached the disk (zeros), stays
/// where it is (#2746, condition 6). A checkpoint writes the header and only
/// then cuts the free blocks off the end (#2815): blocks the file lacks must
/// all be in the free list of that header. Checked against recordings of the
/// real recorder (`tests/fixtures/grabaciones-reales.py`) and of hub-host.
const IN_USE: &str = "falta un bloque en uso";
fn intact(mut file: &fs::File) -> std::result::Result<(), String> {
    let broken = |detail: &str| {
        format!("no es una grabación completa ({detail}): puede ser una copia cortada")
    };
    let length = file
        .metadata()
        .map_err(|error| format!("no se pudo leer ({error})"))?
        .len();
    let mut head = [0_u8; 3 * DUCK_HEADER];
    io::Read::read_exact(&mut file, &mut head).map_err(|_| broken("la cabecera está cortada"))?;
    let headers = head.as_chunks::<DUCK_HEADER>().0;
    if &head[8..12] != b"DUCK" {
        return Err(broken("no lleva la marca DUCK"));
    }
    if !headers.iter().all(|header| sound(header)) {
        return Err(broken("falla la suma de control de una cabecera"));
    }
    let version = word(&head, 12);
    if version != STORAGE_VERSION {
        return Err(broken(&format!(
            "versión de almacenamiento {version}; solo se lee la {STORAGE_VERSION} de DuckDB 1.5.5"
        )));
    }
    // iteration, meta block, free list, block count, block size. As `DuckDB`
    // does, the one at 8 192 wins a tie.
    let newest = if word(&headers[1], 8) > word(&headers[2], 8) {
        &headers[1]
    } else {
        &headers[2]
    };
    let blocks = word(newest, 32);
    let size = usize::try_from(word(newest, 40))
        .ok()
        .filter(|size| (DUCK_HEADER..=1 << 24).contains(size) && size.is_power_of_two())
        .ok_or_else(|| broken("tamaño de bloque no válido"))?;
    let room = length.saturating_sub(head.len() as u64) / size as u64;
    let present = blocks.min(room);
    let mut block = vec![0_u8; size];
    for _ in 0..present {
        io::Read::read_exact(&mut file, &mut block).map_err(|_| broken(IN_USE))?;
        if !sound(&block) {
            return Err(broken("falla la suma de control de un bloque"));
        }
    }
    if present < blocks {
        let pointer = word(newest, 24);
        if pointer == u64::MAX {
            return Err(broken(IN_USE)); // No free list: every block is in use.
        }
        free_tail(file, pointer, blocks, present, size).map_err(broken)?;
    }
    Ok(())
}
fn word(bytes: &[u8], at: usize) -> u64 {
    u64::from_le_bytes(bytes[at..at + 8].try_into().expect("eight bytes"))
}
/// `DuckDB`: 5381, then each further 8-byte word multiplied and xored in.
fn sound(block: &[u8]) -> bool {
    word(block, 0)
        == block[8..]
            .as_chunks::<8>()
            .0
            .iter()
            .fold(5381_u64, |sum, chunk| {
                sum ^ u64::from_le_bytes(*chunk).wrapping_mul(0xbf58_476d_1ce4_e5b9)
            })
}
/// Whether every block from `present` to `blocks` is in the free list `pointer`
/// names, as `DuckDB` 1.5.5 writes it: a count and that many block ids, 8 bytes
/// each, along a chain of metadata parts. A block holds 64 parts after its
/// checksum, of `(size - 8) / 64` bytes rounded down to 8, each starting with
/// the pointer to the next (block id in the low 56 bits, part in the high 8;
/// all ones: none). Only blocks already verified are read, each part once, so
/// a chain ends within the file. Memory is one bit per part and one per missing
/// block, and a list that could not name every missing block is not read: a
/// header that counts more blocks than the file could list stops at once.
fn free_tail(
    mut file: &fs::File,
    pointer: u64,
    blocks: u64,
    present: u64,
    size: usize,
) -> std::result::Result<(), &'static str> {
    const OUTSIDE: &str = "la lista de bloques libres apunta fuera de lo comprobado";
    const LIMIT: &str = "la lista de bloques libres supera su tope";
    let part = (size - 8) / 64 / 8 * 8;
    let missing = blocks - present;
    // Every part of every verified block, filled with ids.
    let room = present.saturating_mul(64 * (part as u64 - 8) / 8);
    if missing > room {
        return Err(IN_USE);
    }
    let bits = |count: u64| usize::try_from(count.div_ceil(64)).map_err(|_| LIMIT);
    let (mut seen, mut free) = (
        vec![0_u64; bits(present * 64)?],
        vec![0_u64; bits(missing)?],
    );
    let mark = |set: &mut [u64], at: u64| {
        let (word, bit) = (usize::try_from(at / 64).expect("within the set"), at % 64);
        let new = set[word] & (1 << bit) == 0;
        set[word] |= 1 << bit;
        new
    };
    let (mut next, mut buffer, mut at) = (pointer, vec![0_u8; part], part);
    let mut read = || -> std::result::Result<u64, &'static str> {
        let mut bytes = [0_u8; 8];
        for byte in &mut bytes {
            if at == part {
                let (block, index) = (next & ((1 << 56) - 1), next >> 56);
                if next == u64::MAX || block >= present || index >= 64 {
                    return Err(OUTSIDE);
                }
                if !mark(&mut seen, block * 64 + index) {
                    return Err("la lista de bloques libres vuelve a una parte ya leída");
                }
                let offset = 3 * DUCK_HEADER as u64 + block * size as u64 + 8;
                io::Seek::seek(&mut file, io::SeekFrom::Start(offset + index * part as u64))
                    .and_then(|_| io::Read::read_exact(&mut file, &mut buffer))
                    .map_err(|_| OUTSIDE)?;
                (next, at) = (word(&buffer, 0), 8);
            }
            *byte = buffer[at];
            at += 1;
        }
        Ok(u64::from_le_bytes(bytes))
    };
    let count = read()?;
    if count > blocks {
        return Err(LIMIT);
    }
    if count < missing {
        return Err(IN_USE);
    }
    let mut found = 0;
    for _ in 0..count {
        let id = read()?;
        if (present..blocks).contains(&id) && mark(&mut free, id - present) {
            found += 1;
        }
    }
    if found < missing {
        return Err(IN_USE);
    }
    Ok(())
}
/// The generation an unconfirmed update staged, which a sweep never gathers
/// from. An error when `boot-pending.json` cannot be read or does not name a
/// generation: then nothing is gathered (ADR 0111 T3).
fn staged(root: &Path) -> std::result::Result<Option<String>, ()> {
    match disk::read_optional(&root.join("boot-pending.json"), Some(4096)) {
        Ok(None) => Ok(None),
        Ok(Some(marker)) => marker["stagedGeneration"]
            .as_str()
            .filter(|id| validation::hex(id, 32))
            .map(|id| Some(id.to_owned()))
            .ok_or(()),
        Err(_) => Err(()),
    }
}
/// ADR 0111 T3: after a confirmed boot and while uninstalling, the active
/// generation and then the orphans, newest first, bring their recordings to
/// the single folder: a recording only if whole, and a repeated copy is
/// removed only when its hash matches. Never `previous`, never the generation
/// an unconfirmed update staged. Doubts stay with a note; only a cut of
/// `checkpoint` is returned, and the next sweep continues where it stopped.
fn gather(
    root: &Path,
    state: &State,
    checkpoint: &mut dyn FnMut(&str) -> Result<()>,
    note: &mut dyn FnMut(&str),
) -> Result<()> {
    let kept = |reason: &dyn std::fmt::Display| {
        format!("Grabaciones: no se recogen de las generaciones; motivo: {reason}")
    };
    let Ok(staged) = staged(root) else {
        note(&kept(
            &"boot-pending.json no se puede leer o no nombra su generación",
        ));
        return Ok(());
    };
    // A link, a junction or a file there is never used (T2b): said once.
    match disk::path(&root.join("recordings")) {
        Ok(single) if single.try_exists().is_ok_and(|exists| !exists) || single.is_dir() => {}
        Ok(_) => {
            note(&kept(&"la carpeta única de grabaciones no es una carpeta"));
            return Ok(());
        }
        Err(error) => {
            note(&kept(&error));
            return Ok(());
        }
    }
    let listed = match generations(root) {
        Ok(listed) => listed,
        Err(error) => {
            note(&kept(&error));
            return Ok(());
        }
    };
    let named = |id: &str, reference: Option<&Generation>| {
        reference.is_some_and(|reference| reference.generation.eq_ignore_ascii_case(id))
    };
    let mut orphans: Vec<_> = listed
        .into_iter()
        .filter(|(id, _)| {
            validation::hex(id, 32)
                && !named(id, Some(&state.active))
                && !named(id, state.previous.as_ref())
        })
        .map(|(id, directory)| {
            let created = fs::metadata(&directory)
                .and_then(|metadata| metadata.created())
                .unwrap_or(std::time::UNIX_EPOCH);
            (std::cmp::Reverse(created), id)
        })
        .collect();
    orphans.sort();
    let order = std::iter::once(state.active.generation.clone())
        .chain(orphans.into_iter().map(|(_, id)| id))
        .filter(|id| {
            staged
                .as_deref()
                .is_none_or(|staged| !staged.eq_ignore_ascii_case(id))
        });
    for id in order {
        let mut cut = false;
        let mut step = |point: &str| checkpoint(point).inspect_err(|_| cut = true);
        let result = adopt(
            root,
            state,
            &id,
            Duplicates::RemoveIdentical,
            true,
            &mut step,
            &mut |text: &str, _: bool| note(text),
        );
        match result {
            Err(error) if cut => return Err(error),
            Err(error) => note(&format!(
                "Grabaciones de la generación {id}: no se recogen; motivo: {error}"
            )),
            Ok(_) => {}
        }
    }
    Ok(())
}
