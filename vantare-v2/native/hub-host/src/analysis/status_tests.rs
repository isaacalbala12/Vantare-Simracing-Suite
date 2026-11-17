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
    let root = std::env::temp_dir().join(vantare_services::random_id().unwrap());
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
    let root = std::env::temp_dir().join(vantare_services::random_id().unwrap());
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
