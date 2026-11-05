//! Importación única de los dos borradores antiguos del Hub.
use super::{
    diagnostic::Module,
    model::{FIELD_LIMITS, MODULES},
    store,
};
use crate::{files, services::protocol::report_document::Fields};
use serde::Deserialize;
use std::{
    fs,
    path::{Path, PathBuf},
    time::SystemTime,
};

const EDITOR_LIMIT: u64 = 512 * 1024;
const LOCAL_LIMIT: u64 = 16 * 1024;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EditorDocument {
    version: u32,
    fields: Fields,
}

struct Source {
    path: PathBuf,
    bytes: Vec<u8>,
    modified: SystemTime,
    fields: Fields,
    mapped_module: Option<&'static str>,
}

pub(crate) struct LegacyDraft {
    sources: Vec<Source>,
    selected: usize,
    pub(crate) fields: Fields,
    pub(crate) differing: Vec<&'static str>,
    pub(crate) warning: Option<String>,
}

fn read(path: &Path, limit: u64) -> Result<Option<(Vec<u8>, SystemTime)>, String> {
    let metadata = match fs::symlink_metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => metadata,
        _ => return Err("Borrador antiguo no legible; se conserva el archivo".into()),
    };
    let modified = metadata
        .modified()
        .map_err(|_| "mtime del borrador no disponible")?;
    let bytes = files::read(path, limit)
        .map_err(|_| "Borrador antiguo no legible; se conserva el archivo")?;
    let after =
        fs::symlink_metadata(path).map_err(|_| "Borrador antiguo cambió durante la lectura")?;
    if !after.is_file()
        || after.file_type().is_symlink()
        || after.modified().ok() != Some(modified)
        || after.len() != bytes.len() as u64
    {
        return Err("Borrador antiguo cambió durante la lectura".into());
    }
    Ok(Some((bytes, modified)))
}

fn clean(fields: &mut Fields) {
    for (field, limit) in [
        &mut fields.action_text,
        &mut fields.expected_text,
        &mut fields.observed_text,
        &mut fields.context_text,
    ]
    .into_iter()
    .zip(FIELD_LIMITS)
    {
        *field = store::clean_field(field, limit);
    }
}

fn editor(path: PathBuf) -> Result<Option<Source>, String> {
    let Some((bytes, modified)) = read(&path, EDITOR_LIMIT)? else {
        return Ok(None);
    };
    let mut document: EditorDocument = serde_json::from_slice(&bytes)
        .map_err(|_| "Borrador del editor inválido; se conserva el archivo")?;
    if document.version != 1 {
        return Err("Versión del borrador del editor desconocida; se conserva el archivo".into());
    }
    clean(&mut document.fields);
    if !MODULES.iter().any(|(id, _)| *id == document.fields.module) {
        return Err("Módulo del borrador del editor inválido; se conserva el archivo".into());
    }
    Ok(Some(Source {
        path,
        bytes,
        modified,
        fields: document.fields,
        mapped_module: None,
    }))
}

fn module_id(module: Module) -> (&'static str, Option<&'static str>) {
    match module {
        Module::Hub => ("hub", None),
        Module::Launcher => ("launcher", None),
        Module::Studio => ("overlay_studio", None),
        Module::Calendar => ("calendar", None),
        Module::Strategy => ("strategy", None),
        Module::Engineer => ("engineer", None),
        Module::Analysis => ("telemetry_analysis", None),
        Module::TestingCenter => ("testing_center", None),
        Module::Workshop => ("unknown", Some("Workshop")),
        Module::Notifications => ("unknown", Some("Notificaciones")),
    }
}

fn local(path: PathBuf) -> Result<Option<Source>, String> {
    let Some((bytes, modified)) = read(&path, LOCAL_LIMIT)? else {
        return Ok(None);
    };
    let draft: store::Draft = serde_json::from_slice(&bytes)
        .map_err(|_| "Borrador local inválido; se conserva el archivo")?;
    draft
        .validate()
        .map_err(|_| "Borrador local inválido; se conserva el archivo")?;
    let (module, mapped_module) = module_id(draft.module);
    let mut fields = Fields {
        action_text: draft.fields[0].clone(),
        expected_text: draft.fields[1].clone(),
        observed_text: draft.fields[2].clone(),
        context_text: draft.fields[3].clone(),
        module: module.into(),
    };
    clean(&mut fields);
    Ok(Some(Source {
        path,
        bytes,
        modified,
        fields,
        mapped_module,
    }))
}

fn differing(a: &Fields, b: &Fields) -> Vec<&'static str> {
    [
        ("module", a.module != b.module),
        ("action_text", a.action_text != b.action_text),
        ("expected_text", a.expected_text != b.expected_text),
        ("observed_text", a.observed_text != b.observed_text),
        ("context_text", a.context_text != b.context_text),
    ]
    .into_iter()
    .filter_map(|(name, diff)| diff.then_some(name))
    .collect()
}

impl LegacyDraft {
    pub(crate) fn load(data: &Path) -> Result<Option<Self>, String> {
        let base = data.join("testing-center");
        let mut warning = None;
        let mut sources = Vec::new();
        for result in [
            editor(base.join("editor-draft.json")),
            local(base.join("report-draft.json")),
        ] {
            match result {
                Ok(Some(source)) => sources.push(source),
                Ok(None) => {}
                Err(error) => {
                    eprintln!("{error}");
                    warning = Some(error);
                }
            }
        }
        if sources.is_empty() {
            return warning.map_or(Ok(None), Err);
        }
        let selected = usize::from(sources.len() == 2 && sources[1].modified > sources[0].modified);
        let fields = sources[selected].fields.clone();
        let differing = if sources.len() == 2 {
            differing(&sources[0].fields, &sources[1].fields)
        } else {
            Vec::new()
        };
        if !differing.is_empty() {
            eprintln!("borradores antiguos distintos en: {}", differing.join(","));
        }
        for source in &sources {
            if let Some(module) = source.mapped_module {
                eprintln!("módulo antiguo asignado a Sin determinar: {module}");
            }
        }
        Ok(Some(Self {
            sources,
            selected,
            fields,
            differing,
            warning,
        }))
    }

    /// Se llama solo después de confirmar en Services el mismo contenido DPAPI.
    pub(crate) fn archive(&self) -> Result<(), String> {
        let order = if self.sources.len() == 2 {
            vec![1 - self.selected, self.selected]
        } else {
            vec![0]
        };
        for source in &self.sources {
            let target = source.path.with_extension("json.imported");
            let current = fs::symlink_metadata(&source.path).ok();
            let target_matches = fs::symlink_metadata(&target).ok().is_some_and(|info| {
                info.is_file()
                    && !info.file_type().is_symlink()
                    && files::read(&target, source.bytes.len() as u64)
                        .ok()
                        .as_deref()
                        == Some(&source.bytes)
            });
            let target_free = matches!(fs::symlink_metadata(&target), Err(error) if error.kind() == std::io::ErrorKind::NotFound);
            if !(target_free || target_matches)
                || !current.as_ref().is_some_and(|info| {
                    info.is_file()
                        && !info.file_type().is_symlink()
                        && info.modified().ok() == Some(source.modified)
                })
                || files::read(&source.path, source.bytes.len() as u64)
                    .ok()
                    .as_deref()
                    != Some(&source.bytes)
            {
                return Err("El borrador antiguo cambió; se conserva el archivo".into());
            }
        }
        for index in order {
            let source = &self.sources[index];
            let target = source.path.with_extension("json.imported");
            // hard_link crea el destino de forma exclusiva, incluso si otro
            // proceso lo crea después del preflight. Ningún original se pisa.
            if !target.exists() {
                fs::hard_link(&source.path, &target)
                    .map_err(|_| "No se pudo archivar el borrador antiguo")?;
            }
            if !fs::symlink_metadata(&target)
                .ok()
                .is_some_and(|info| info.is_file() && !info.file_type().is_symlink())
                || files::read(&target, source.bytes.len() as u64)
                    .ok()
                    .as_deref()
                    != Some(&source.bytes)
            {
                return Err("El archivo archivado cambió; se conserva el original".into());
            }
            fs::remove_file(&source.path)
                .map_err(|_| "El archivo se creó, pero no se pudo retirar el original")?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::empty_fields;
    use serde::Serialize;

    #[derive(Serialize)]
    struct EditorFixture<'a> {
        version: u32,
        fields: &'a Fields,
    }

    #[test]
    fn newest_legacy_draft_wins_and_archives_both_without_logging_text() {
        let root = std::env::temp_dir().join(format!("vanta-13b-{}", std::process::id()));
        let base = root.join("testing-center");
        fs::create_dir_all(&base).unwrap();
        let editor_fields = Fields {
            action_text: "editor-secret".into(),
            module: "hub".into(),
            ..empty_fields()
        };
        let editor_path = base.join("editor-draft.json");
        fs::write(
            &editor_path,
            serde_json::to_vec(&EditorFixture {
                version: 1,
                fields: &editor_fields,
            })
            .unwrap(),
        )
        .unwrap();
        let local_path = base.join("report-draft.json");
        let draft = store::Draft {
            schema_version: 1,
            module: Module::Workshop,
            fields: [
                "local-secret".into(),
                String::new(),
                String::new(),
                String::new(),
            ],
        };
        fs::write(&local_path, serde_json::to_vec(&draft).unwrap()).unwrap();
        let earlier = SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(100);
        let later = earlier + std::time::Duration::from_secs(1);
        fs::File::options()
            .write(true)
            .open(&editor_path)
            .unwrap()
            .set_times(fs::FileTimes::new().set_modified(earlier))
            .unwrap();
        fs::File::options()
            .write(true)
            .open(&local_path)
            .unwrap()
            .set_times(fs::FileTimes::new().set_modified(later))
            .unwrap();
        let chosen = LegacyDraft::load(&root).unwrap().unwrap();
        assert_eq!(chosen.fields.action_text, "local-secret");
        assert_eq!(chosen.fields.module, "unknown");
        assert_eq!(
            module_id(Module::Notifications),
            ("unknown", Some("Notificaciones"))
        );
        assert_eq!(chosen.differing, ["module", "action_text"]);
        assert!(editor_path.exists() && local_path.exists());
        chosen.archive().unwrap();
        assert!(!editor_path.exists() && !local_path.exists());
        assert!(editor_path.with_extension("json.imported").exists());
        assert!(local_path.with_extension("json.imported").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn editor_wins_equal_mtime_and_changed_source_is_never_archived() {
        let root = std::env::temp_dir().join(format!("vanta-13b-tie-{}", std::process::id()));
        let base = root.join("testing-center");
        fs::create_dir_all(&base).unwrap();
        let fields = Fields {
            action_text: "editor-secret".into(),
            ..empty_fields()
        };
        let editor_path = base.join("editor-draft.json");
        fs::write(
            &editor_path,
            serde_json::to_vec(&EditorFixture {
                version: 1,
                fields: &fields,
            })
            .unwrap(),
        )
        .unwrap();
        let local_path = base.join("report-draft.json");
        fs::write(
            &local_path,
            serde_json::to_vec(&store::Draft {
                schema_version: 1,
                ..store::Draft::default()
            })
            .unwrap(),
        )
        .unwrap();
        let time = SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(100);
        for path in [&editor_path, &local_path] {
            fs::File::options()
                .write(true)
                .open(path)
                .unwrap()
                .set_times(fs::FileTimes::new().set_modified(time))
                .unwrap();
        }
        let chosen = LegacyDraft::load(&root).unwrap().unwrap();
        assert_eq!(chosen.fields.action_text, "editor-secret");
        fs::write(&local_path, b"changed outside importer").unwrap();
        assert!(chosen.archive().is_err());
        assert!(editor_path.exists() && local_path.exists());
        assert!(!editor_path.with_extension("json.imported").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn malformed_legacy_file_leaves_corrupt_source_and_imports_valid_one() {
        let root = std::env::temp_dir().join(format!("vanta-13b-invalid-{}", std::process::id()));
        let base = root.join("testing-center");
        fs::create_dir_all(&base).unwrap();
        let editor_path = base.join("editor-draft.json");
        let local_path = base.join("report-draft.json");
        fs::write(&editor_path, b"invalid").unwrap();
        fs::write(
            &local_path,
            serde_json::to_vec(&store::Draft {
                schema_version: 1,
                ..store::Draft::default()
            })
            .unwrap(),
        )
        .unwrap();
        let chosen = LegacyDraft::load(&root).unwrap().unwrap();
        assert!(chosen.warning.is_some());
        chosen.archive().unwrap();
        assert_eq!(fs::read(&editor_path).unwrap(), b"invalid");
        assert!(!local_path.exists());
        assert!(local_path.with_extension("json.imported").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn existing_archive_cannot_be_overwritten() {
        let root = std::env::temp_dir().join(format!("vanta-13b-archive-{}", std::process::id()));
        let base = root.join("testing-center");
        fs::create_dir_all(&base).unwrap();
        let source = base.join("editor-draft.json");
        let archive = source.with_extension("json.imported");
        fs::write(
            &source,
            serde_json::to_vec(&EditorFixture {
                version: 1,
                fields: &empty_fields(),
            })
            .unwrap(),
        )
        .unwrap();
        fs::write(&archive, b"previous private archive").unwrap();
        let chosen = LegacyDraft::load(&root).unwrap().unwrap();
        assert!(chosen.archive().is_err());
        assert!(source.exists());
        assert_eq!(fs::read(&archive).unwrap(), b"previous private archive");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn identical_archive_from_interrupted_move_finishes_without_overwrite() {
        let root =
            std::env::temp_dir().join(format!("vanta-13b-interrupted-{}", std::process::id()));
        let base = root.join("testing-center");
        fs::create_dir_all(&base).unwrap();
        let path = base.join("editor-draft.json");
        fs::write(
            &path,
            serde_json::to_vec(&EditorFixture {
                version: 1,
                fields: &empty_fields(),
            })
            .unwrap(),
        )
        .unwrap();
        let chosen = LegacyDraft::load(&root).unwrap().unwrap();
        fs::hard_link(&path, path.with_extension("json.imported")).unwrap();
        chosen.archive().unwrap();
        assert!(!path.exists());
        assert!(path.with_extension("json.imported").exists());
        assert!(LegacyDraft::load(&root).unwrap().is_none());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn partial_archive_keeps_remaining_source_recoverable() {
        let root = std::env::temp_dir().join(format!("vanta-13b-partial-{}", std::process::id()));
        let base = root.join("testing-center");
        fs::create_dir_all(&base).unwrap();
        let editor = base.join("editor-draft.json");
        let local = base.join("report-draft.json");
        fs::write(
            &editor,
            serde_json::to_vec(&EditorFixture {
                version: 1,
                fields: &empty_fields(),
            })
            .unwrap(),
        )
        .unwrap();
        fs::write(
            &local,
            serde_json::to_vec(&store::Draft {
                schema_version: 1,
                ..store::Draft::default()
            })
            .unwrap(),
        )
        .unwrap();
        let chosen = LegacyDraft::load(&root).unwrap().unwrap();
        fs::hard_link(&editor, editor.with_extension("json.imported")).unwrap();
        fs::remove_file(&editor).unwrap();
        assert!(chosen.archive().is_err());
        let remaining = LegacyDraft::load(&root).unwrap().unwrap();
        remaining.archive().unwrap();
        assert!(!local.exists());
        assert!(editor.with_extension("json.imported").exists());
        assert!(local.with_extension("json.imported").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
