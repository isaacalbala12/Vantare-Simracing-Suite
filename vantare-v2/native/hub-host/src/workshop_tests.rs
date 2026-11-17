#![allow(clippy::unwrap_used)]
use super::*;

#[derive(Deserialize)]
struct Source<'a> {
    #[serde(borrow)]
    frames: Vec<Frame<'a>>,
}

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../ui/fixtures")
}

#[test]
fn real_fixtures_are_grouped_and_resolved_without_exposing_paths() {
    let scenes = Scenes::load(Some(fixtures()));
    let widgets = scenes.widgets();
    assert_eq!(
        widgets.iter().map(|entry| entry.kind).collect::<Vec<_>>(),
        WidgetKind::ALL
    );
    assert_eq!(
        widgets
            .iter()
            .map(|entry| entry.scenes.len())
            .sum::<usize>(),
        74
    );
    let standings = &widgets[0].scenes;
    assert_eq!(standings.len(), 12);
    assert!(standings.windows(2).all(|w| w[0].id < w[1].id));
    let scene = standings
        .iter()
        .find(|scene| scene.id == "standings-default")
        .unwrap();
    assert_eq!((scene.frames, scene.frame_ms), (1, Some(1200)));
    let original = fs::read_to_string(fixtures().join("standings-default.scene.json")).unwrap();
    let source: Source<'_> = serde_json::from_str(&original).unwrap();
    assert_eq!(
        scenes
            .snapshot(WidgetKind::Standings, "standings-default", 0)
            .unwrap(),
        source.frames[0].snapshot.get().as_bytes()
    );
    assert_eq!(
        scenes
            .snapshot(WidgetKind::Standings, "standings", 0)
            .unwrap(),
        fs::read(fixtures().join("standings.snapshot.json")).unwrap()
    );
    for (kind, id, frame) in [
        (WidgetKind::Relative, "standings-default", 0),
        (WidgetKind::Standings, "standings-default", 1),
        (WidgetKind::Standings, "unknown", 0),
        (WidgetKind::Standings, "../standings", 0),
    ] {
        assert_eq!(
            scenes.snapshot(kind, id, frame),
            Err(PreviewError::InvalidInput)
        );
    }
    assert!(!serde_json::to_string(&widgets).unwrap().contains(".json"));
}

#[test]
fn invalid_files_are_omitted_and_catalog_is_bounded() {
    let root = std::env::temp_dir().join(vantare_services::random_id().unwrap());
    fs::create_dir(&root).unwrap();
    let real = fixtures().join("standings.snapshot.json");
    fs::copy(&real, root.join("standings.snapshot.json")).unwrap();
    fs::copy(&real, root.join("unknown.snapshot.json")).unwrap();
    fs::copy(&real, root.join("standings.sequence.json")).unwrap();
    fs::write(root.join("standings-invalid.snapshot.json"), "{}").unwrap();
    let mut oversized = fs::read(&real).unwrap();
    oversized.resize(usize::try_from(BYTE_LIMIT + 1).unwrap(), b' ');
    fs::write(root.join("standings-oversized.snapshot.json"), oversized).unwrap();
    fs::write(root.join("oversize.scene.json"), serde_json::to_vec(&serde_json::json!({
        "widget":"standings", "label":"a", "frameMs":1, "watchFor":null,
        "frames":vec![serde_json::json!({"snapshot":serde_json::from_slice::<serde_json::Value>(&fs::read(&real).unwrap()).unwrap()}); FRAME_LIMIT+1],
    })).unwrap()).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(&real, root.join("standings-link.snapshot.json")).unwrap();
    #[cfg(windows)]
    if let Err(error) =
        std::os::windows::fs::symlink_file(&real, root.join("standings-link.snapshot.json"))
    {
        assert_eq!(
            error.raw_os_error(),
            Some(1314),
            "create fixture symlink: {error}"
        );
        eprintln!("fixture symlink case omitted: Windows requires symlink privilege (1314)");
    }
    let scenes = Scenes::load(Some(root.clone()));
    assert_eq!(
        scenes.widgets()[0]
            .scenes
            .iter()
            .map(|s| s.id.as_str())
            .collect::<Vec<_>>(),
        ["standings"]
    );
    fs::write(root.join("standings.snapshot.json"), "invalid after scan").unwrap();
    fs::copy(&real, root.join("standings-added.snapshot.json")).unwrap();
    assert_eq!(scenes.widgets()[0].scenes.len(), 1);
    assert_eq!(
        scenes.snapshot(WidgetKind::Standings, "standings-added", 0),
        Err(PreviewError::InvalidInput)
    );
    assert_eq!(
        scenes.snapshot(WidgetKind::Standings, "standings", 0),
        Err(PreviewError::InvalidInput)
    );
    for i in 0..FILE_LIMIT + 1 {
        fs::hard_link(&real, root.join(format!("standings-{i}.snapshot.json"))).unwrap_or_else(
            |_| {
                fs::copy(&real, root.join(format!("standings-{i}.snapshot.json"))).unwrap();
            },
        );
    }
    assert!(Scenes::load(Some(root.clone())).widgets()[0].scenes.len() <= FILE_LIMIT);
    fs::remove_dir_all(root).unwrap();
    let missing = Scenes::load(None);
    assert!(
        missing
            .widgets()
            .iter()
            .all(|entry| entry.scenes.is_empty())
    );
    assert_eq!(
        missing.snapshot(WidgetKind::Standings, "standings", 0),
        Err(PreviewError::NoDemo)
    );
    for (id, valid) in id_cases() {
        assert_eq!(valid_scene_id(&id), valid, "{id:?}");
    }
}
