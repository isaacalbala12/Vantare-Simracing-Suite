#![allow(clippy::unwrap_used)]
use super::*;
use serde_json::{Value, json};
// Literal format from runtime::service::series::{status,prune}, G4a.
fn core() -> Value {
    json!({"schema":"vantare.recording-status.v1","state":"recording",
      "file":"series-123-456.duckdb","startedAtMs":42,"cause":null,
      "durableWatermark":"18446744073709551615","attempted":"0",
      "limits":{"maxRecordings":200,"maxBytes":5_368_709_120_u64},
      "counts":{"recordings":1,"bytes":4096},
      "lastPrune":{"atMs":40,"items":[{"name":"series-1-2.duckdb",
      "sizeBytes":4096,"modifiedAtMs":10,"reason":"cuota de nº","result":"borrada"}]}})
}
#[test]
fn core_format_and_broken_files() {
    let root = fs::canonicalize(std::env::temp_dir())
        .unwrap()
        .join(vantare_services::random_id().unwrap());
    std::fs::create_dir(&root).unwrap();
    let paths =
        std::collections::BTreeMap::from([("a".repeat(64), root.join("series-123-456.duckdb"))]);
    assert!(read(&root, &paths).is_none());
    let path = root.join("recording-status.json");
    for bytes in [vec![], b"{".to_vec(), vec![b' '; 65537]] {
        std::fs::write(&path, bytes).unwrap();
        assert!(read(&root, &paths).is_none());
    }
    std::fs::write(&path, serde_json::to_vec(&core()).unwrap()).unwrap();
    let status = read(&root, &paths).unwrap();
    assert_eq!(status.row_id, Some("a".repeat(64)));
    assert_eq!(
        status.durable_watermark.as_deref(),
        Some("18446744073709551615")
    );
    assert_eq!(read(&root, &BTreeMap::default()).unwrap().row_id, None);
    std::fs::write(root.join("series-123-456.duckdb"), []).unwrap();
    let mut catalog = crate::analysis::catalog::State::new(root.clone());
    assert_eq!(catalog.status().unwrap().row_id, None);
    let row = catalog.catalog().unwrap().remove(0);
    for _ in 0..3 {
        assert_eq!(
            catalog.status().unwrap().row_id.as_deref(),
            Some(row.id.as_str())
        );
    }
    let mut boundary = serde_json::to_vec(&core()).unwrap();
    boundary.resize(65536, b' ');
    std::fs::write(&path, &boundary).unwrap();
    assert!(read(&root, &paths).is_some());
    boundary.push(b' ');
    std::fs::write(&path, boundary).unwrap();
    assert!(read(&root, &paths).is_none());
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        std::fs::write(&path, serde_json::to_vec(&core()).unwrap()).unwrap();
        let guard = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&path)
            .unwrap();
        assert!(read(&root, &paths).is_none());
        drop(guard);
    }
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn invalid_fields_reject_the_whole_file_and_fifty_items_fit() {
    let root = fs::canonicalize(std::env::temp_dir())
        .unwrap()
        .join(vantare_services::random_id().unwrap());
    std::fs::create_dir(&root).unwrap();
    let path = root.join("recording-status.json");
    let paths = BTreeMap::default();
    let mut bad = Vec::new();
    for (key, value) in [
        ("schema", json!("other")),
        ("state", json!("other")),
        ("startedAtMs", json!(-1)),
        ("startedAtMs", json!(9_007_199_254_740_992_u64)),
        ("attempted", json!("18446744073709551616")),
        ("attempted", json!(1)),
    ] {
        let mut v = core();
        v[key] = value;
        bad.push(v);
    }
    for name in ["a/b.duckdb", r"a\b.duckdb", "C:x", "..", "", "other.duckdb"] {
        let mut v = core();
        v["lastPrune"]["items"][0]["name"] = json!(name);
        bad.push(v);
    }
    for key in ["reason", "result"] {
        let mut v = core();
        v["lastPrune"]["items"][0][key] = json!("other");
        bad.push(v);
    }
    let mut v = core();
    v["lastPrune"]["items"] = json!(vec![v["lastPrune"]["items"][0].clone(); 51]);
    bad.push(v);
    for v in bad {
        std::fs::write(&path, serde_json::to_vec(&v).unwrap()).unwrap();
        assert!(read(&root, &paths).is_none(), "{v}");
    }
    for name in [
        "series-123-456.duckdb",
        "series-123-456.duckdb.creating-7-8",
    ] {
        let mut v = core();
        v["cause"] = json!("otra causa");
        v["lastPrune"]["items"][0]["name"] = json!(name);
        std::fs::write(&path, serde_json::to_vec(&v).unwrap()).unwrap();
        assert_eq!(
            read(&root, &paths).unwrap().cause,
            Some(AnalysisRecordingCause::Unknown)
        );
    }
    let mut v = core();
    v["lastPrune"]["items"] = json!(vec![v["lastPrune"]["items"][0].clone(); 50]);
    std::fs::write(&path, serde_json::to_vec(&v).unwrap()).unwrap();
    let status = read(&root, &paths).unwrap();
    assert_eq!(status.last_prune.items.len(), 50);
    let result = crate::protocol::Reply::AnalysisStatus {
        status: Some(status),
    };
    assert!(
        serde_json::to_vec(&crate::protocol::HostToUi::Response {
            id: u32::MAX,
            result
        })
        .unwrap()
        .len()
            < crate::frame::LIMIT
    );
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn maps_core_text_once_and_rejects_unsafe_fields() {
    use AnalysisRecordingCause::{
        FinishTimeout, HelperMissing, InvalidDirectory, PruneIncomplete, QuotaUnmet, Unknown,
        VolumeWithoutHardLinks, WriterDown,
    };
    for (text, expected) in [
        ("directorio inválido", InvalidDirectory),
        ("helper ausente", HelperMissing),
        (
            "volumen sin enlaces duros (NTFS/ReFS)",
            VolumeWithoutHardLinks,
        ),
        ("writer caído", WriterDown),
        ("finish vencido", FinishTimeout),
        ("cuota no alcanzada", QuotaUnmet),
        ("poda incompleta", PruneIncomplete),
        ("other", Unknown),
    ] {
        let mut v = core();
        v["cause"] = json!(text);
        assert_eq!(
            project(&v, Path::new("."), &BTreeMap::default())
                .unwrap()
                .cause,
            Some(expected)
        );
    }
    // El núcleo cierra como `stopped` con esa causa una grabación que no pudo
    // empezar: un fallo pasajero, nunca el «no es una carpeta» del anfitrión.
    let mut v = core();
    v["state"] = json!("stopped");
    v["cause"] = json!("directorio inválido");
    let said = project(&v, Path::new("."), &BTreeMap::default()).unwrap();
    assert_eq!(said.cause, Some(Unknown));
    for (reason, result) in [
        ("cuota de nº", "borrada"),
        ("cuota de bytes", "omitida en uso"),
        ("huérfano", "error"),
    ] {
        let mut v = core();
        v["lastPrune"]["items"][0]["reason"] = json!(reason);
        v["lastPrune"]["items"][0]["result"] = json!(result);
        assert!(project(&v, Path::new("."), &BTreeMap::default()).is_some());
    }
    for pointer in [
        "/limits/maxBytes",
        "/limits/maxRecordings",
        "/lastPrune/atMs",
        "/lastPrune/items/0/sizeBytes",
        "/lastPrune/items/0/modifiedAtMs",
    ] {
        for number in [json!(-1), json!(9_007_199_254_740_992_u64)] {
            let mut v = core();
            *v.pointer_mut(pointer).unwrap() = number;
            assert!(
                project(&v, Path::new("."), &BTreeMap::default()).is_none(),
                "{pointer}"
            );
        }
    }
}

struct Directory(PathBuf);
impl Directory {
    fn new() -> Self {
        let root = fs::canonicalize(std::env::temp_dir())
            .unwrap()
            .join(format!(
                "host-status-{}",
                vantare_services::random_id().unwrap()
            ));
        fs::create_dir(&root).unwrap();
        Self(root)
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn directory_link(target: &Path, link: &Path) {
    #[cfg(unix)]
    std::os::unix::fs::symlink(target, link).unwrap();
    #[cfg(windows)]
    {
        let output = std::process::Command::new("cmd.exe")
            .args(["/d", "/c", "mklink", "/J"])
            .arg(link)
            .arg(target)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "junction sin privilegios: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
}
fn file_link(target: &Path, link: &Path) -> bool {
    #[cfg(unix)]
    let result = std::os::unix::fs::symlink(target, link);
    #[cfg(windows)]
    let result = std::os::windows::fs::symlink_file(target, link);
    match result {
        Ok(()) => true,
        #[cfg(windows)]
        Err(error) if error.raw_os_error() == Some(1314) => {
            eprintln!(
                "OMITIDO: symlink de fichero requiere privilegios o Developer Mode ({error}); junction y metadatos de handle se prueban aparte"
            );
            false
        }
        Err(error) => panic!("crear symlink: {error}"),
    }
}
fn write_recording(root: &Path) {
    fs::create_dir_all(root).unwrap();
    fs::write(
        root.join("recording-status.json"),
        serde_json::to_vec(&core()).unwrap(),
    )
    .unwrap();
    fs::write(root.join("series-123-456.duckdb"), []).unwrap();
}
fn rejects_recording_directory(root: &Path) {
    // Never read; and the Hub says that nothing is recorded there.
    let said = read(root, &BTreeMap::new()).expect("a status of its own");
    let stopped = AnalysisRecordingState::Stopped;
    let cause = Some(AnalysisRecordingCause::InvalidDirectory);
    assert_eq!((said.state, said.cause, said.row_id), (stopped, cause, None));
    assert_eq!(
        super::super::recordings(root).unwrap_err().code,
        super::super::ErrorCode::Unreadable
    );
    let error = super::super::Reader::open(
        &root.join("must-not-start.exe"),
        &root.join("series-123-456.duckdb"),
        std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    )
    .err()
    .expect("reader rejects before spawning");
    assert_eq!(error.code, super::super::ErrorCode::Unreadable);
}
#[test]
fn data_dir_inside_a_relocated_profile_keeps_status_catalog_and_stamps_working() {
    let owned = Directory::new();
    let profile = owned.0.join("physical-profile");
    let root = profile.join("AppData/Vantare/native/recordings");
    write_recording(&root);
    let link = owned.0.join("relocated-profile");
    directory_link(&profile, &link);
    assert!(super::super::reparse(&fs::symlink_metadata(&link).unwrap()));
    let aliased = link.join("AppData/Vantare/native/recordings");
    assert!(read(&aliased, &BTreeMap::new()).is_some());
    let paths = super::super::recordings(&aliased).unwrap();
    assert_eq!(paths, vec![aliased.join("series-123-456.duckdb")]);
    assert!(super::super::stamp(&paths[0]).is_ok());
    let mut catalog = super::super::catalog::State::new(aliased);
    assert_eq!(catalog.catalog().unwrap().len(), 1);
    assert!(catalog.status().is_some());
}
#[test]
fn rejects_a_link_at_recordings_or_between_data_dir_and_recordings() {
    let owned = Directory::new();
    let data = owned.0.join("data");
    let physical = owned.0.join("physical");
    write_recording(&physical.join("recordings"));
    fs::create_dir(&data).unwrap();
    let recordings_link = data.join("recordings");
    directory_link(&physical.join("recordings"), &recordings_link);
    rejects_recording_directory(&recordings_link);
    let intermediate = data.join("intermediate");
    directory_link(&physical, &intermediate);
    rejects_recording_directory(&intermediate.join("recordings"));
}
// Una instalación recién hecha aún no tiene `recordings`: eso no es «carpeta
// no válida» y Análisis no da ningún aviso (revisión de datos de #2781, R7).
#[test]
fn a_recordings_folder_that_does_not_exist_yet_has_no_status() {
    let owned = Directory::new();
    assert!(read(&owned.0.join("recordings"), &BTreeMap::new()).is_none());
    // Tampoco si falta su carpeta madre.
    let deeper = owned.0.join("sin-crear").join("recordings");
    assert!(read(&deeper, &BTreeMap::new()).is_none());
}
#[test]
fn rejects_file_links_including_a_swap_at_open_without_reading_the_target() {
    let owned = Directory::new();
    let target = owned.0.join("target.json");
    let path = owned.0.join("recording-status.json");
    fs::write(&target, serde_json::to_vec(&core()).unwrap()).unwrap();
    if !file_link(&target, &path) {
        return;
    }
    assert!(read(&owned.0, &BTreeMap::new()).is_none());
    fs::remove_file(&path).unwrap();
    fs::write(&path, serde_json::to_vec(&core()).unwrap()).unwrap();
    // Deterministic replacement exactly between path validation and opening.
    assert!(
        read_with(&owned.0, &BTreeMap::new(), |path| {
            fs::remove_file(path).unwrap();
            assert!(file_link(&target, path));
            open_status(path)
        })
        .is_none()
    );
}
#[test]
fn opened_handle_remains_authoritative_after_atomic_path_replacement() {
    let owned = Directory::new();
    let path = owned.0.join("recording-status.json");
    fs::write(&path, serde_json::to_vec(&core()).unwrap()).unwrap();
    let status = read_with(&owned.0, &BTreeMap::new(), |path| {
        let file = open_status(path)?;
        fs::rename(path, owned.0.join("previous.json")).unwrap();
        fs::write(path, vec![b' '; usize::try_from(LIMIT + 1).unwrap()]).unwrap();
        Ok(file)
    })
    .expect("read metadata and bytes from the original handle, not its replaced path");
    assert_eq!(status.started_at_ms, 42);
    assert!(read(&owned.0, &BTreeMap::new()).is_none());
}
#[cfg(windows)]
#[test]
fn recording_without_a_writer_reads_as_stopped_without_a_cause() {
    use std::os::windows::fs::OpenOptionsExt;
    let root = fs::canonicalize(std::env::temp_dir())
        .unwrap()
        .join(vantare_services::random_id().unwrap());
    std::fs::create_dir(&root).unwrap();
    let database = root.join("series-123-456.duckdb");
    let mut status = core();
    status["cause"] = json!("writer caído");
    std::fs::write(
        root.join("recording-status.json"),
        serde_json::to_vec(&status).unwrap(),
    )
    .unwrap();
    let paths = BTreeMap::default();
    // Archivo inexistente: duda, se conserva lo que dice el Core.
    assert!(writer_alive(&database));
    assert_eq!(
        read(&root, &paths).unwrap().state,
        AnalysisRecordingState::Recording
    );
    // Recién publicado y aún sin writer: dentro del margen se trata como vivo.
    std::fs::write(&database, []).unwrap();
    assert!(writer_alive(&database));
    assert_eq!(
        read(&root, &paths).unwrap().state,
        AnalysisRecordingState::Recording
    );
    backdate(&database);
    // Writer vivo (apertura exclusiva): sigue «recording».
    let writer = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .share_mode(0)
        .open(&database)
        .unwrap();
    assert!(writer_alive(&database));
    let live = read(&root, &paths).unwrap();
    assert_eq!(live.state, AnalysisRecordingState::Recording);
    assert_eq!(live.cause, Some(AnalysisRecordingCause::WriterDown));
    // Corte del Core: el archivo queda libre y se muestra como parada.
    drop(writer);
    assert!(!writer_alive(&database));
    let dead = read(&root, &paths).unwrap();
    assert_eq!(dead.state, AnalysisRecordingState::Stopped);
    assert_eq!(dead.cause, None);
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn only_plain_names_are_probed() {
    for name in ["series-1-2.duckdb", "a.duckdb"] {
        assert!(plain_name(name), "{name}");
    }
    for name in [
        "",
        "..",
        "../x.duckdb",
        "sub/x.duckdb",
        r"sub\x.duckdb",
        r"C:\x.duckdb",
        "/x.duckdb",
    ] {
        assert!(!plain_name(name), "{name}");
    }
}
#[test]
fn epoch_comes_from_the_name_only_when_valid() {
    let now = 1_800_000_000_000_u64;
    let at = |name: &str| recording_epoch_ms(Path::new(name), now);
    assert_eq!(at("series-1700000000000-42.duckdb"), Some(1_700_000_000_000));
    // Nombre de reserva con nanosegundos.
    assert_eq!(at("series-1700000000000123456-42.duckdb"), Some(1_700_000_000_000));
    // Hasta un día de margen por relojes desajustados.
    assert_eq!(at("series-1800000000000-1.duckdb"), Some(now));
    for name in [
        "series-0-42.duckdb",
        "series-1800086400001-1.duckdb",
        "series-99999999999999999999-1.duckdb",
        "series-abc-1.duckdb",
        "series--1.duckdb",
        "series-17.duckdb",
        "recording.duckdb",
        "series-17-1.duckdb.wal",
    ] {
        assert_eq!(at(name), None, "{name}");
    }
}
fn created_ms(path: &Path) -> u64 {
    let created = std::fs::metadata(path).unwrap().created().unwrap();
    u64::try_from(created.duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()).unwrap()
}
#[test]
fn catalog_dates_and_orders_by_the_name_epoch_not_the_copy_date() {
    let root = fs::canonicalize(std::env::temp_dir())
        .unwrap()
        .join(vantare_services::random_id().unwrap());
    std::fs::create_dir(&root).unwrap();
    // Copiadas ahora (fecha de creación = ahora) en orden contrario a su época.
    for name in ["series-1700000003000-1.duckdb", "series-1700000001000-1.duckdb", "series-1700000002000-1.duckdb"] {
        std::fs::write(root.join(name), []).unwrap();
    }
    let rows = crate::analysis::catalog::State::new(root.clone()).catalog().unwrap();
    let dates: Vec<u64> = rows.iter().map(|row| row.started_at_ms).collect();
    assert_eq!(dates, [1_700_000_003_000, 1_700_000_002_000, 1_700_000_001_000]);
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn catalog_keeps_the_file_date_without_a_valid_epoch() {
    let root = fs::canonicalize(std::env::temp_dir())
        .unwrap()
        .join(vantare_services::random_id().unwrap());
    std::fs::create_dir(&root).unwrap();
    let names = ["manual.duckdb", "series-0-1.duckdb", "series-99999999999999-1.duckdb", "series-x-1.duckdb"];
    for name in names {
        std::fs::write(root.join(name), []).unwrap();
    }
    let rows = crate::analysis::catalog::State::new(root.clone()).catalog().unwrap();
    assert_eq!(rows.len(), names.len(), "ninguna grabación se oculta");
    let expected = created_ms(&root.join("manual.duckdb"));
    for row in &rows {
        assert!(row.started_at_ms.abs_diff(expected) < 60_000, "{}", row.started_at_ms);
    }
    std::fs::remove_dir_all(root).unwrap();
}
