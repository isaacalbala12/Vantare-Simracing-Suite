use super::*;
#[test]
fn catalog_limits_opacity_and_rotation() {
    let root = std::env::temp_dir().join(vantare_services::random_id().unwrap());
    let mut state = State::new(root.clone());
    assert_eq!(state.catalog().unwrap(), Vec::<AnalysisRow>::new());
    assert!(!root.exists());
    std::fs::create_dir(&root).unwrap();
    for n in 0..257 {
        std::fs::write(root.join(format!("secret-{n}.duckdb")), []).unwrap();
        if n == 254 || n == 255 {
            let rows = state.catalog().unwrap();
            assert_eq!(rows.len(), n + 1);
            assert!(
                rows.iter()
                    .all(|r| r.id.len() == 64 && !r.id.contains("secret"))
            );
            assert!(
                rows.windows(2)
                    .all(|r| r[0].started_at_ms >= r[1].started_at_ms)
            );
            let ordered_paths: Vec<_> = rows.iter().map(|r| state.paths[&r.id].clone()).collect();
            let serialized = serde_json::to_string(&rows).unwrap();
            assert!(!serialized.contains("secret-") && !serialized.contains("duckdb"));
            assert!(rows.iter().all(|r| r.size_bytes == 0));
            let repeated = state.catalog().unwrap();
            assert_eq!(
                ordered_paths,
                repeated
                    .iter()
                    .map(|r| state.paths[&r.id].clone())
                    .collect::<Vec<_>>()
            );
            let old: Vec<_> = rows.into_iter().map(|r| r.id).collect();
            assert!(
                state
                    .catalog()
                    .unwrap()
                    .iter()
                    .all(|r| !old.contains(&r.id))
            );
        }
    }
    assert_eq!(state.catalog(), Err(HostError::AnalysisTooMany));
    assert!(state.paths.is_empty());
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn c1_errors_have_explicit_wire_mapping() {
    use crate::analysis::ErrorCode::*;
    for (code, expected) in [
        (Missing, HostError::AnalysisNotFound),
        (Locked, HostError::AnalysisLocked),
        (Incompatible, HostError::AnalysisIncompatible),
        (Unreadable, HostError::AnalysisUnreadable),
        (Io, HostError::AnalysisUnreadable),
        (Changed, HostError::AnalysisChanged),
        (Limit, HostError::AnalysisTooLarge),
        (Cancelled, HostError::AnalysisCancelled),
        (Deadline, HostError::AnalysisTimeout),
    ] {
        assert_eq!(map_error(code), expected);
    }
}

#[test]
fn denied_catalog_tokens_can_be_discarded_without_touching_files() {
    let root = std::env::temp_dir().join(vantare_services::random_id().unwrap());
    std::fs::create_dir(&root).unwrap();
    let path = root.join("private.duckdb");
    std::fs::write(&path, b"recording").unwrap();
    let mut state = State::new(root.clone());
    assert_eq!(state.catalog().unwrap()[0].size_bytes, 9);
    state.clear();
    assert!(state.paths.is_empty());
    assert_eq!(std::fs::read(&path).unwrap(), b"recording");
    std::fs::remove_dir_all(root).unwrap();
}
