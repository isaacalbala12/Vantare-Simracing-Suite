//! Manifiesto e incremental compartidos por Hub y Workshop; no hay procesos hijos.
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub scene: String,
    pub output: PathBuf,
    #[serde(default)]
    pub appearance: Option<String>,
    #[serde(default)]
    pub size: Option<[u32; 2]>,
    #[serde(default)]
    pub collapsed: bool,
    #[serde(default)]
    pub zoom: Option<u16>,
    #[serde(default)]
    pub widget: Option<String>,
    #[serde(default)]
    pub settings: Option<crate::Settings>,
    /// Número de fotos que se alimentan de una secuencia, desde su principio.
    #[serde(default)]
    pub until: Option<usize>,
    #[serde(default)]
    pub parameters: std::collections::BTreeMap<String, String>,
}

pub fn read(path: &Path) -> Result<Vec<Request>, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&bytes);
    let requests: Vec<Request> = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
    if requests.is_empty() {
        return Err("el lote está vacío".into());
    }
    let mut outputs = std::collections::HashSet::new();
    for request in &requests {
        if request.scene.is_empty()
            || request
                .output
                .extension()
                .is_none_or(|e| !e.eq_ignore_ascii_case("png"))
        {
            return Err("cada captura necesita scene y output PNG".into());
        }
        if request
            .size
            .is_some_and(|s| s.into_iter().any(|n| !(1..=8192).contains(&n)))
        {
            return Err("size debe tener dos dimensiones entre 1 y 8192".into());
        }
        let output = std::path::absolute(&request.output).map_err(|e| e.to_string())?;
        if !outputs.insert(output.to_string_lossy().to_lowercase()) {
            return Err("salida repetida en el lote".into());
        }
    }
    Ok(requests)
}

/// SHA256 de hashes de bloques de 1 MiB: memoria acotada también para el exe.
fn file_hash(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mut block = vec![0; 1024 * 1024];
    let mut hashes = String::new();
    loop {
        let mut used = 0;
        while used < block.len() {
            let count = file.read(&mut block[used..]).map_err(|e| e.to_string())?;
            if count == 0 {
                break;
            }
            used += count;
        }
        if used == 0 {
            break;
        }
        hashes.push_str(&vantare_services::content_hash(&block[..used]));
    }
    Ok(vantare_services::content_hash(hashes.as_bytes()))
}

fn tree_hash(path: &Path) -> Result<String, String> {
    if path.is_file() {
        return file_hash(path);
    }
    let mut entries = fs::read_dir(path)
        .map_err(|e| e.to_string())?
        .map(|entry| entry.map(|e| e.path()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    entries.sort();
    let mut hashes = Vec::new();
    for entry in entries {
        // Never follow symlinks or read configuration/secrets, even in fixtures.
        if entry
            .symlink_metadata()
            .map_err(|e| e.to_string())?
            .file_type()
            .is_symlink()
        {
            return Err("enlace no permitido en entradas de captura".into());
        }
        if entry
            .file_name()
            .is_some_and(|n| n.to_string_lossy().starts_with(".env"))
        {
            continue;
        }
        hashes.push((
            entry.file_name().map(|n| n.to_string_lossy().into_owned()),
            tree_hash(&entry)?,
        ));
    }
    Ok(vantare_services::content_hash(
        &serde_json::to_vec(&hashes).map_err(|e| e.to_string())?,
    ))
}

// Injectable lookup keeps tests isolated from the process environment.
fn control_inputs(
    get: impl Fn(&'static str) -> Option<std::ffi::OsString>,
) -> Result<Vec<String>, String> {
    let mut hashes = Vec::new();
    for name in [
        "GPUI_DISABLE_DIRECT_COMPOSITION",
        "VANTARE_CAPTURE_POLICY",
        "VANTARE_TESTING_CAPTURE_PREVIEW",
        "VANTARE_CAPTURE_CALENDAR_VIEW",
        "VANTARE_CAPTURE_CALENDAR",
        "VANTARE_CAPTURE_ROADMAP_VIEW",
        "VANTARE_CAPTURE_THEME_MENU",
        "VANTARE_CAPTURE_SESSION",
        "VANTARE_CAPTURE_WIDGET",
        "VANTARE_CAPTURE_INSPECTOR",
    ] {
        if let Some(value) = get(name) {
            if (name == "VANTARE_CAPTURE_POLICY" && value != "ipc")
                || name == "VANTARE_TESTING_CAPTURE_PREVIEW"
            {
                hashes.push(file_hash(Path::new(&value))?);
            }
            if name == "VANTARE_CAPTURE_POLICY" && value == "ipc" {
                return Err("captura incremental no admite política IPC live".into());
            }
            hashes.push(format!("{name}={}", value.to_string_lossy()));
        }
    }
    Ok(hashes)
}

pub fn inputs_hash(fixtures: &[PathBuf]) -> Result<String, String> {
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut hashes = vec![file_hash(&executable)?];
    for path in fixtures {
        hashes.push(tree_hash(path)?);
    }
    hashes.extend(control_inputs(std::env::var_os)?);
    if let Some(directory) = executable.parent() {
        let mut libraries = fs::read_dir(directory)
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("dll")))
            .collect::<Vec<_>>();
        libraries.sort();
        for library in libraries {
            hashes.push(file_hash(&library)?);
        }
    }
    Ok(vantare_services::content_hash(hashes.join("\n").as_bytes()))
}

#[derive(Deserialize, Serialize)]
struct Receipt {
    inputs: String,
    png: String,
}

pub struct Cache {
    output: PathBuf,
    receipt: PathBuf,
    inputs: String,
}
impl Cache {
    pub fn new(output: PathBuf, inputs: &[u8], common: &str) -> Result<Self, String> {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .ancestors()
            .nth(3)
            .ok_or("raíz del repo")?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        if let Some(parent) = output.parent().filter(|p| !p.as_os_str().is_empty()) {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let parent = output
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."))
            .canonicalize()
            .map_err(|e| e.to_string())?;
        if parent.starts_with(root) {
            return Err("la evidencia debe quedar fuera del repo".into());
        }
        let receipt = output.with_extension("png.capture.json");
        let inputs = vantare_services::content_hash(&[common.as_bytes(), inputs].concat());
        Ok(Self {
            output,
            receipt,
            inputs,
        })
    }
    pub fn fresh(&self) -> bool {
        fs::read(&self.receipt)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Receipt>(&bytes).ok())
            .is_some_and(|r| {
                r.inputs == self.inputs && file_hash(&self.output).is_ok_and(|hash| hash == r.png)
            })
    }
    pub fn commit(&self) -> Result<(), String> {
        let receipt = Receipt {
            inputs: self.inputs.clone(),
            png: file_hash(&self.output)?,
        };
        let temporary = self
            .receipt
            .with_extension(format!("json.{}.tmp", std::process::id()));
        fs::write(
            &temporary,
            serde_json::to_vec(&receipt).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        fs::rename(temporary, &self.receipt).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preview_contents_invalidate_inputs_without_environment_mutation() {
        let path =
            std::env::temp_dir().join(format!("capture-preview-test-{}.json", std::process::id()));
        let lookup = |name| {
            (name == "VANTARE_TESTING_CAPTURE_PREVIEW").then(|| path.clone().into_os_string())
        };
        fs::write(&path, b"preview-a").expect("preview inicial");
        let first = super::control_inputs(lookup).expect("entradas iniciales");
        fs::write(&path, b"preview-b").expect("preview cambiado en la misma ruta");
        let second = super::control_inputs(lookup).expect("entradas nuevas");
        assert_ne!(first, second);
        assert_ne!(
            second,
            super::control_inputs(|_| None).expect("sin preview")
        );
        assert!(
            super::control_inputs(|name| (name == "VANTARE_CAPTURE_POLICY").then(|| "ipc".into()))
                .is_err()
        );
        fs::remove_file(path).expect("limpiar preview");
    }
    #[test]
    fn manifest_rejects_duplicates_bad_dimensions_and_unknown_fields() {
        let path =
            std::env::temp_dir().join(format!("capture-manifest-{}.json", std::process::id()));
        for json in [
            "[]",
            r#"[{"scene":"a","output":"x.png","size":[0,900]}]"#,
            r#"[{"scene":"a","output":"x.png","unknown":true}]"#,
            r#"[{"scene":"a","output":"x.png"},{"scene":"b","output":"X.png"}]"#,
        ] {
            fs::write(&path, json).expect("manifiesto inválido");
            assert!(read(&path).is_err(), "{json}");
        }
        fs::write(&path, r#"[{"scene":"a","output":"x.png","size":[1440,900]},{"scene":"b","output":"y.png","appearance":"vantare-light"}]"#).expect("manifiesto");
        let requests = read(&path).expect("lote");
        assert_eq!(requests.len(), 2);
        assert_eq!(requests[0].size, Some([1440, 900]));
        assert_eq!(requests[1].appearance.as_deref(), Some("vantare-light"));
        fs::remove_file(path).expect("limpiar");
    }
    #[test]
    fn incremental_requires_input_hash_and_intact_output() {
        let root = std::env::temp_dir().join(format!("capture-cache-test-{}", std::process::id()));
        fs::create_dir_all(&root).expect("temporal");
        let output = root.join("capture.png");
        let cache =
            Cache::new(output.clone(), b"scene-a-size-1440-dark", "binary-a").expect("cache");
        assert!(!cache.fresh());
        fs::write(&output, b"png-original").expect("PNG");
        cache.commit().expect("recibo");
        assert!(cache.fresh());
        assert!(
            !Cache::new(output.clone(), b"scene-b-size-1280-light", "binary-a")
                .expect("escena nueva")
                .fresh()
        );
        assert!(
            !Cache::new(output.clone(), b"scene-a-size-1440-dark", "binary-b")
                .expect("binario nuevo")
                .fresh()
        );
        fs::write(output, b"png-damaged").expect("PNG modificado");
        assert!(!cache.fresh());
        fs::remove_dir_all(root).expect("limpiar");
    }
}
