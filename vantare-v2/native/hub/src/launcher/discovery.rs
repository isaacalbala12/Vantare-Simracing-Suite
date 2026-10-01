//! Discovery acotado: hechos locales, sin persistir detecciones ni consultar red.
use super::{App, CATALOG, is_executable};
use crate::files;
use std::{
    collections::BTreeMap,
    fs,
    path::{Component, Path, PathBuf},
};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
#[allow(clippy::struct_excessive_bools)] // Cuatro hechos independientes del contrato productivo.
pub struct Availability {
    pub catalogued: bool,
    pub found: bool,
    pub installed: bool,
    pub launchable: bool,
}

#[derive(Clone, Debug)]
pub struct Detected {
    pub id: String,
    pub executable: Option<PathBuf>,
    pub source: &'static str,
    pub availability: Availability,
}

#[derive(Default)]
pub struct Sources {
    pub known_paths: Vec<(String, PathBuf)>,
    pub registry: Vec<(String, PathBuf)>,
    pub steam_roots: Vec<PathBuf>,
    pub shortcuts: Vec<PathBuf>,
    pub warnings: Vec<String>,
}

#[derive(Default)]
pub struct Discovery {
    pub apps: Vec<Detected>,
    pub steam_executable: Option<PathBuf>,
    pub warnings: Vec<String>,
}

fn expand(template: &str) -> Option<PathBuf> {
    let end = template.strip_prefix('%')?.find('%')? + 1;
    let value = std::env::var_os(&template[1..end])?;
    Some(PathBuf::from(value).join(template[end + 1..].trim_start_matches('\\')))
}

impl Sources {
    pub fn system() -> Self {
        let mut result = Self::default();
        for app in CATALOG {
            for template in app.paths {
                if let Some(path) = expand(template) {
                    result.known_paths.push((app.id.into(), path));
                }
            }
        }
        for template in [r"%PROGRAMFILES(X86)%\Steam", r"%PROGRAMFILES%\Steam"] {
            if let Some(path) = expand(template) {
                result.steam_roots.push(path);
            }
        }
        result.shortcuts = super::shortcuts::system(&mut result.warnings);
        #[cfg(windows)]
        super::windows::registry_sources(&mut result);
        result
    }
}

// Un índice por árbol; no seguir junctions/symlinks ni recorrer un disco entero.
fn index(
    root: &Path,
    depth: u8,
    result: &mut BTreeMap<String, PathBuf>,
    budget: &mut usize,
    warnings: &mut Vec<String>,
) {
    if fs::symlink_metadata(root).is_ok_and(|meta| meta.file_type().is_symlink()) {
        return;
    }
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return,
        Err(error) => {
            warnings.push(format!("leer {}: {error}", root.display()));
            return;
        }
    };
    for entry in entries {
        if *budget == 0 {
            return;
        }
        *budget -= 1;
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                warnings.push(format!("entrada de {}: {error}", root.display()));
                continue;
            }
        };
        let kind = match entry.file_type() {
            Ok(kind) => kind,
            Err(error) => {
                warnings.push(format!("tipo de archivo: {error}"));
                continue;
            }
        };
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() && depth > 0 {
            index(&entry.path(), depth - 1, result, budget, warnings);
        } else if kind.is_file() {
            let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
            if CATALOG.iter().any(|app| {
                app.executables
                    .iter()
                    .any(|exe| exe.eq_ignore_ascii_case(&name))
            }) {
                result.entry(name).or_insert_with(|| entry.path());
            }
        }
    }
}

fn find(root: &Path, names: &[&str], warnings: &mut Vec<String>) -> Option<PathBuf> {
    if !super::is_local_path(root) {
        if !root.as_os_str().is_empty() {
            warnings.push(format!("se omite ruta no local: {}", root.display()));
        }
        return None;
    }
    // Priorizar el exe directo: no agotar el presupuesto en GameData/mods antes de verlo.
    for name in names {
        let path = root.join(name);
        if is_executable(&path) {
            return Some(path);
        }
    }
    let mut executables = BTreeMap::new();
    let mut budget = 20_000;
    index(root, 3, &mut executables, &mut budget, warnings);
    if budget == 0 {
        warnings.push(format!(
            "scan truncado a 20000 entradas: {}",
            root.display()
        ));
    }
    names
        .iter()
        .find_map(|name| executables.get(&name.to_ascii_lowercase()).cloned())
}

/// Tokens citados VDF, incluidos escapes de Steam; no interpretar comandos/rutas.
fn vdf_values(text: &str, key: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut chars = text.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '/' && chars.peek() == Some(&'/') {
            for ch in chars.by_ref() {
                if ch == '\n' {
                    break;
                }
            }
        } else if ch == '"' {
            let mut token = String::new();
            let mut closed = false;
            while let Some(ch) = chars.next() {
                match ch {
                    '"' => {
                        closed = true;
                        break;
                    }
                    '\\' => {
                        if let Some(next) = chars.next() {
                            token.push(next);
                        }
                    }
                    _ => token.push(ch),
                }
            }
            if closed {
                tokens.push(token);
            }
        }
    }
    tokens
        .windows(2)
        .filter(|pair| pair[0].eq_ignore_ascii_case(key))
        .map(|pair| pair[1].clone())
        .collect()
}

fn read_vdf(path: &Path, warnings: &mut Vec<String>) -> Option<String> {
    match fs::metadata(path) {
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return None,
        Err(error) => {
            warnings.push(format!("inspeccionar {}: {error}", path.display()));
            return None;
        }
    }
    match files::read(path, 1024 * 1024) {
        Ok(bytes) => match String::from_utf8(bytes) {
            Ok(text) => Some(text),
            Err(error) => {
                warnings.push(format!("VDF {}: {error}", path.display()));
                None
            }
        },
        Err(error) => {
            warnings.push(error);
            None
        }
    }
}

impl Discovery {
    pub fn demo(data: &crate::demo::DemoData) -> Self {
        Self {
            apps: data
                .launcher
                .apps
                .iter()
                .map(|app| Detected {
                    id: app.id.clone(),
                    executable: None,
                    source: "fixture demo Wails",
                    availability: Availability {
                        catalogued: true,
                        found: app.found,
                        installed: app.installed,
                        launchable: false,
                    },
                })
                .collect(),
            ..Self::default()
        }
    }

    pub fn scan(apps: &[App], mut sources: Sources) -> Self {
        let mut result = Self {
            warnings: std::mem::take(&mut sources.warnings),
            ..Self::default()
        };
        let mut libraries: Vec<_> = sources
            .steam_roots
            .iter()
            .filter(|path| super::is_local_path(path))
            .cloned()
            .collect();
        for root in libraries.clone() {
            let steam = root.join("steam.exe");
            if result.steam_executable.is_none() && is_executable(&steam) {
                result.steam_executable = Some(steam);
            }
            if let Some(text) = read_vdf(
                &root.join("steamapps/libraryfolders.vdf"),
                &mut result.warnings,
            ) {
                libraries.extend(
                    vdf_values(&text, "path")
                        .into_iter()
                        .map(PathBuf::from)
                        .filter(|path| super::is_local_path(path)),
                );
            }
        }
        libraries.sort_by_key(|path| path.to_string_lossy().to_ascii_lowercase());
        libraries.dedup_by(|a, b| {
            a.to_string_lossy()
                .eq_ignore_ascii_case(&b.to_string_lossy())
        });
        let mut steam_files = BTreeMap::new();
        let mut budget = 20000;
        for library in &libraries {
            index(
                &library.join("steamapps/common"),
                4,
                &mut steam_files,
                &mut budget,
                &mut result.warnings,
            );
        }
        for app in apps {
            result.apps.push(detect_app(
                app,
                &sources,
                &libraries,
                &steam_files,
                &mut result.warnings,
            ));
        }
        result
    }

    pub fn app(&self, id: &str) -> Option<&Detected> {
        self.apps.iter().find(|app| app.id == id)
    }
}

fn detect_app(
    app: &App,
    sources: &Sources,
    libraries: &[PathBuf],
    steam_files: &BTreeMap<String, PathBuf>,
    warnings: &mut Vec<String>,
) -> Detected {
    let official = CATALOG.iter().find(|entry| entry.id == app.id);
    let mut detected = Detected {
        id: app.id.clone(),
        executable: None,
        source: "catálogo",
        availability: Availability {
            catalogued: official.is_some(),
            ..Availability::default()
        },
    };
    if let Some(path) = &app.executable {
        // Un override desaparecido conserva autoridad: nunca sustituirlo silenciosamente.
        detected.source = "manual";
        detected.availability.found = path.exists();
        if is_executable(path) {
            detected.executable = Some(path.clone());
        }
    } else if let Some(official) = official {
        for (name, root) in &sources.registry {
            if !official
                .matchers
                .iter()
                .any(|matcher| name.to_ascii_lowercase().contains(matcher))
            {
                continue;
            }
            detected.availability.found = true;
            detected.source = "registro";
            if let Some(path) = find(root, official.executables, warnings) {
                detected.executable = Some(path);
                break;
            }
        }
        if detected.executable.is_none() {
            for (id, root) in &sources.known_paths {
                if id == &app.id
                    && let Some(path) = find(root, official.executables, warnings)
                {
                    detected.executable = Some(path);
                    detected.source = "ruta conocida";
                    detected.availability.found = true;
                    break;
                }
            }
        }
        detect_steam(official, libraries, &mut detected, warnings);
        if detected.executable.is_none() {
            detected.executable = official
                .executables
                .iter()
                .find_map(|exe| steam_files.get(&exe.to_ascii_lowercase()))
                .cloned();
            if detected.executable.is_some() {
                detected.source = "Steam";
                detected.availability.found = true;
            }
        }
        if detected.executable.is_none() && official.steam_id.is_none() {
            detected.executable = sources
                .shortcuts
                .iter()
                .find(|path| {
                    path.file_name().is_some_and(|file| {
                        official
                            .executables
                            .iter()
                            .any(|exe| file.eq_ignore_ascii_case(exe))
                    }) && is_executable(path)
                })
                .cloned();
            if detected.executable.is_some() {
                detected.source = "acceso directo";
                detected.availability.found = true;
            }
        }
        if detected
            .executable
            .as_ref()
            .and_then(|path| path.file_name())
            .is_some_and(|name| app.id == "discord" && name.eq_ignore_ascii_case("Update.exe"))
        {
            // Discord usa Update.exe como bootstrapper; sus argumentos no son opcionales.
            detected.source = "Discord updater";
        }
    }
    detected.availability.installed |= detected.executable.is_some();
    detected.availability.launchable = detected.executable.is_some();
    detected
}

fn detect_steam(
    official: &super::CatalogApp,
    libraries: &[PathBuf],
    detected: &mut Detected,
    warnings: &mut Vec<String>,
) {
    let Some(steam_id) = official.steam_id else {
        return;
    };
    for root in libraries {
        let manifest = root.join(format!("steamapps/appmanifest_{steam_id}.acf"));
        let Some(text) = read_vdf(&manifest, warnings) else {
            continue;
        };
        if vdf_values(&text, "appid")
            .first()
            .and_then(|id| id.parse::<u32>().ok())
            != Some(steam_id)
        {
            continue;
        }
        detected.availability.found = true;
        let installed = vdf_values(&text, "StateFlags")
            .first()
            .and_then(|flag| flag.parse::<u32>().ok())
            .is_some_and(|flags| flags & 4 != 0);
        detected.availability.installed |= installed;
        if !installed || detected.executable.is_some() {
            continue;
        }
        if let Some(dir) = vdf_values(&text, "installdir").first() {
            let dir = Path::new(dir);
            if dir
                .components()
                .all(|part| matches!(part, Component::Normal(_)))
                && !dir.as_os_str().is_empty()
            {
                detected.executable = find(
                    &root.join("steamapps/common").join(dir),
                    official.executables,
                    warnings,
                );
                detected.source = "Steam";
            }
        }
    }
}

pub fn running(path: &Path) -> Result<Option<u32>, String> {
    Ok(running_all(path)?.into_iter().next())
}
pub fn running_all(path: &Path) -> Result<Vec<u32>, String> {
    #[cfg(windows)]
    {
        super::windows::running_all(path)
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Ok(vec![])
    }
}
