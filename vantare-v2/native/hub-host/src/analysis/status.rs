//! Tolerant projection of the Core status; no catalog mutation or worker.
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
};
pub const PRUNE_MAX: usize = 50;
const LIMIT: u64 = 64 * 1024;
#[cfg_attr(any(test, feature = "bindings"), derive(ts_rs::TS))]
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub enum AnalysisRecordingState {
    Recording,
    Degraded,
    Stopped,
}
#[cfg_attr(any(test, feature = "bindings"), derive(ts_rs::TS))]
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub enum AnalysisRecordingCause {
    InvalidDirectory,
    HelperMissing,
    VolumeWithoutHardLinks,
    WriterDown,
    FinishTimeout,
    QuotaUnmet,
    PruneIncomplete,
    Unknown,
}
#[cfg_attr(any(test, feature = "bindings"), derive(ts_rs::TS))]
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub enum AnalysisPruneReason {
    Count,
    Bytes,
    Orphan,
}
#[cfg_attr(any(test, feature = "bindings"), derive(ts_rs::TS))]
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub enum AnalysisPruneResult {
    Deleted,
    SkippedInUse,
    Error,
}
#[cfg_attr(any(test, feature = "bindings"), derive(ts_rs::TS))]
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisRecordingStatus {
    pub state: AnalysisRecordingState,
    pub cause: Option<AnalysisRecordingCause>,
    pub row_id: Option<String>,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub started_at_ms: u64,
    pub durable_watermark: Option<String>,
    pub attempted: Option<String>,
    pub limits: AnalysisRecordingLimits,
    pub last_prune: AnalysisLastPrune,
}
#[cfg_attr(any(test, feature = "bindings"), derive(ts_rs::TS))]
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisRecordingLimits {
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub max_recordings: u64,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub max_bytes: u64,
}
#[cfg_attr(any(test, feature = "bindings"), derive(ts_rs::TS))]
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisLastPrune {
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub at_ms: u64,
    pub items: Vec<AnalysisPruneItem>,
}
#[cfg_attr(any(test, feature = "bindings"), derive(ts_rs::TS))]
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisPruneItem {
    pub name: String,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub size_bytes: u64,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub modified_at_ms: u64,
    pub reason: AnalysisPruneReason,
    pub result: AnalysisPruneResult,
}

fn safe(v: &Value) -> Option<u64> {
    v.as_u64().filter(|n| *n < (1_u64 << 53))
}
fn decimal(v: &Value) -> Result<Option<String>, ()> {
    if v.is_null() {
        return Ok(None);
    }
    let s = v.as_str().ok_or(())?;
    let n = s.parse::<u64>().map_err(|_| ())?;
    (n.to_string() == s).then(|| Some(s.to_owned())).ok_or(())
}
fn text(v: &Value) -> Result<Option<&str>, ()> {
    if v.is_null() {
        Ok(None)
    } else {
        v.as_str().map(Some).ok_or(())
    }
}
// Same grammar as runtime::service::series::prune; no cross-crate dependency.
pub fn recording_name(name: &str) -> bool {
    fn pair(s: &str) -> bool {
        s.split_once('-').is_some_and(|(a, b)| {
            [a, b]
                .iter()
                .all(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()))
        })
    }
    fn database(s: &str) -> bool {
        s.strip_prefix("series-")
            .and_then(|s| s.strip_suffix(".duckdb"))
            .is_some_and(pair)
    }
    !name.is_empty()
        && !name.contains(['/', '\\', ':'])
        && !name.contains("..")
        && (database(name)
            || name
                .split_once(".creating-")
                .is_some_and(|(base, suffix)| database(base) && pair(suffix)))
}
fn cause(s: &str) -> AnalysisRecordingCause {
    use AnalysisRecordingCause::{
        FinishTimeout, HelperMissing, InvalidDirectory, PruneIncomplete, QuotaUnmet, Unknown,
        VolumeWithoutHardLinks, WriterDown,
    };
    match s {
        "directorio inválido" => InvalidDirectory,
        "helper ausente" => HelperMissing,
        "volumen sin enlaces duros (NTFS/ReFS)" => VolumeWithoutHardLinks,
        "writer caído" => WriterDown,
        "finish vencido" => FinishTimeout,
        "cuota no alcanzada" => QuotaUnmet,
        "poda incompleta" => PruneIncomplete,
        _ => Unknown,
    }
}
/// Margen tras crear el archivo: el helper lo publica (`hard_link`, `storage`
/// `create_database`) y solo después lo abre en escritura y avisa «ready», mientras
/// el Core ya escribió «recording». Dentro de ese margen no se afirma nada.
const PUBLISH_GRACE: std::time::Duration = std::time::Duration::from_secs(5);
/// ¿Tiene un writer abierta esta grabación? Apertura exclusiva de solo lectura,
/// sin efectos: solo una apertura correcta de un archivo ya asentado prueba que
/// no. Cualquier duda (en uso, sin permiso, recién creado, otro sistema) cuenta
/// como viva para no abrir una grabación en escritura.
pub fn writer_alive(path: &Path) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        let settled = fs::metadata(path)
            .and_then(|metadata| metadata.created())
            .ok()
            .and_then(|created| std::time::SystemTime::now().duration_since(created).ok())
            .is_some_and(|age| age >= PUBLISH_GRACE);
        !settled
            || fs::OpenOptions::new()
                .read(true)
                .share_mode(0)
                .open(path)
                .is_err()
    }
    #[cfg(not(windows))]
    {
        let _ = (path, PUBLISH_GRACE);
        true
    }
}
/// Solo tests: hace «asentado» un archivo recién creado.
#[cfg(all(test, windows))]
pub fn backdate(path: &Path) {
    use std::os::windows::fs::FileTimesExt;
    let old = std::time::SystemTime::now() - PUBLISH_GRACE * 2;
    fs::OpenOptions::new()
        .write(true)
        .open(path)
        .unwrap()
        .set_times(fs::FileTimes::new().set_created(old))
        .unwrap();
}
/// Nombre de archivo de grabación sin ruta: lo que escribe el Core en `file`.
pub fn plain_name(file: &str) -> bool {
    let mut parts = Path::new(file).components();
    matches!(parts.next(), Some(std::path::Component::Normal(_))) && parts.next().is_none()
}
fn project(
    v: &Value,
    root: &Path,
    paths: &BTreeMap<String, PathBuf>,
) -> Option<AnalysisRecordingStatus> {
    if v.get("schema")?.as_str()? != "vantare.recording-status.v1" {
        return None;
    }
    let mut state = serde_json::from_value(v.get("state")?.clone()).ok()?;
    let file = text(v.get("file")?).ok()?;
    if file.is_some_and(|name| !recording_name(name)) {
        return None;
    }
    // Tras un corte del Core el JSON sigue diciendo «recording». Sin writer, el
    // host lo muestra como parada (sin causa inventada).
    let dead = state == AnalysisRecordingState::Recording
        && file.is_some_and(|name| {
            let path = root.join(name);
            path.is_file() && !writer_alive(&path)
        });
    if dead {
        state = AnalysisRecordingState::Stopped;
    }
    let row_id = file.and_then(|name| {
        paths
            .iter()
            .find(|(_, path)| **path == root.join(name))
            .map(|(id, _)| id.clone())
    });
    let limits = v.get("limits")?;
    let prune = v.get("lastPrune")?;
    let raw = prune.get("items")?.as_array()?;
    if raw.len() > PRUNE_MAX {
        return None;
    }
    let mut items = Vec::new();
    for item in raw {
        let name = item.get("name")?.as_str()?;
        if !recording_name(name) {
            return None;
        }
        let reason = match item.get("reason")?.as_str()? {
            "cuota de nº" => AnalysisPruneReason::Count,
            "cuota de bytes" => AnalysisPruneReason::Bytes,
            "huérfano" => AnalysisPruneReason::Orphan,
            _ => return None,
        };
        let result = match item.get("result")?.as_str()? {
            "borrada" => AnalysisPruneResult::Deleted,
            "omitida en uso" => AnalysisPruneResult::SkippedInUse,
            "error" => AnalysisPruneResult::Error,
            _ => return None,
        };
        items.push(AnalysisPruneItem {
            name: name.into(),
            size_bytes: safe(item.get("sizeBytes")?)?,
            modified_at_ms: safe(item.get("modifiedAtMs")?)?,
            reason,
            result,
        });
    }
    Some(AnalysisRecordingStatus {
        state,
        cause: if dead {
            None
        } else {
            text(v.get("cause")?).ok()?.map(cause)
        },
        row_id,
        started_at_ms: safe(v.get("startedAtMs")?)?,
        durable_watermark: decimal(v.get("durableWatermark")?).ok()?,
        attempted: decimal(v.get("attempted")?).ok()?,
        limits: AnalysisRecordingLimits {
            max_recordings: safe(limits.get("maxRecordings")?)?,
            max_bytes: safe(limits.get("maxBytes")?)?,
        },
        last_prune: AnalysisLastPrune {
            at_ms: safe(prune.get("atMs")?)?,
            items,
        },
    })
}
pub fn read(root: &Path, paths: &BTreeMap<String, PathBuf>) -> Option<AnalysisRecordingStatus> {
    read_with(root, paths, open_status)
}
fn open_status(path: &Path) -> std::io::Result<fs::File> {
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // Open the reparse point itself so handle metadata can reject it.
        options.custom_flags(windows_sys::Win32::Storage::FileSystem::FILE_FLAG_OPEN_REPARSE_POINT);
    }
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        use std::os::unix::fs::OpenOptionsExt;
        // O_NOFOLLOW | O_NONBLOCK: do not follow a swapped link or block on a FIFO.
        #[cfg(target_os = "linux")]
        options.custom_flags(0x0002_0000 | 0x0800);
        #[cfg(target_os = "macos")]
        options.custom_flags(0x100 | 0x4);
    }
    options.open(path)
}
fn read_with(
    root: &Path,
    paths: &BTreeMap<String, PathBuf>,
    open: impl FnOnce(&Path) -> std::io::Result<fs::File>,
) -> Option<AnalysisRecordingStatus> {
    super::regular_directory(root).ok()?;
    let path = root.join("recording-status.json");
    // std OpenOptions on Windows keeps FILE_SHARE_DELETE for atomic Core replacement.
    let file = open(&path).ok()?;
    let metadata = file.metadata().ok()?;
    if !metadata.is_file() || super::reparse(&metadata) || metadata.len() > LIMIT {
        return None;
    }
    let mut bytes = Vec::new();
    file.take(LIMIT + 1).read_to_end(&mut bytes).ok()?;
    if bytes.len() as u64 > LIMIT {
        return None;
    }
    project(&serde_json::from_slice(&bytes).ok()?, root, paths)
}
#[cfg(test)]
#[path = "status_tests.rs"]
mod tests;
