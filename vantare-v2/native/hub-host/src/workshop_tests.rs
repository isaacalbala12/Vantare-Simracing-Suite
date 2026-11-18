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
    let mut expected = std::collections::BTreeMap::<String, Vec<String>>::new();
    for entry in fs::read_dir(fixtures()).unwrap() {
        let path = entry.unwrap().path();
        let name = path.file_name().unwrap().to_str().unwrap();
        if let Some(id) = name.strip_suffix(".scene.json") {
            let scene: serde_json::Value =
                serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
            expected
                .entry(scene["widget"].as_str().unwrap().into())
                .or_default()
                .push(id.into());
        } else if let Some(id) = name.strip_suffix(".snapshot.json")
            && let Some(kind) = WidgetKind::ALL
                .iter()
                .map(|kind| kind.id())
                .filter(|kind| id == *kind || id.starts_with(&format!("{kind}-")))
                .max_by_key(|kind| kind.len())
        {
            expected.entry(kind.into()).or_default().push(id.into());
        }
    }
    for widget in &widgets {
        let mut ids = expected.remove(widget.kind.id()).unwrap_or_default();
        ids.sort_unstable();
        assert_eq!(
            widget
                .scenes
                .iter()
                .map(|entry| &entry.id)
                .collect::<Vec<_>>(),
            ids.iter().collect::<Vec<_>>()
        );
    }
    assert!(expected.is_empty());
    let standings = &widgets[0].scenes;
    assert!(standings.windows(2).all(|w| w[0].id < w[1].id));
    let scene = standings
        .iter()
        .find(|scene| scene.id == "standings-default")
        .unwrap();
    assert_eq!((scene.frames, scene.frame_ms), (1, Some(1200)));
    let original = fs::read_to_string(fixtures().join("standings-vantare.scene.json")).unwrap();
    let source: Source<'_> = serde_json::from_str(&original).unwrap();
    assert_ne!(
        source.frames[0].snapshot.get(),
        source.frames[2].snapshot.get()
    );
    assert_eq!(
        scenes
            .snapshot(WidgetKind::Standings, "standings-vantare", 2)
            .unwrap(),
        source.frames[2].snapshot.get().as_bytes(),
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

fn snapshot_value() -> serde_json::Value {
    serde_json::from_slice(&fs::read(fixtures().join("standings.snapshot.json")).unwrap()).unwrap()
}

fn scene_value(frames: &[serde_json::Value]) -> serde_json::Value {
    serde_json::json!({
        "widget": "standings",
        "label": "Escena",
        "frameMs": 1,
        "watchFor": null,
        "frames": frames,
    })
}

fn captioned_frame(caption: &str) -> serde_json::Value {
    serde_json::json!({"snapshot": snapshot_value(), "caption": caption})
}

fn caption_scenes(cases: &[(&str, serde_json::Value)]) -> Vec<WidgetScenes> {
    let root = std::env::temp_dir().join(vantare_services::random_id().unwrap());
    fs::create_dir(&root).unwrap();
    for (id, value) in cases {
        fs::write(root.join(format!("{id}.scene.json")), serde_json::to_vec(value).unwrap())
            .unwrap();
    }
    let widgets = Scenes::load(Some(root.clone())).widgets();
    fs::remove_dir_all(root).unwrap();
    widgets
}

#[test]
fn real_fixtures_carry_the_exact_frame_captions() {
    let widgets = Scenes::load(Some(fixtures())).widgets();
    let scene = |widget: &str, id: &str| {
        widgets
            .iter()
            .find(|entry| entry.kind.id() == widget)
            .unwrap()
            .scenes
            .iter()
            .find(|scene| scene.id == id)
            .unwrap()
    };
    let mut scenes = 0;
    let mut snapshots = 0;
    for entry in fs::read_dir(fixtures()).unwrap() {
        let path = entry.unwrap().path();
        let name = path.file_name().unwrap().to_str().unwrap().to_owned();
        if let Some(id) = name.strip_suffix(".scene.json") {
            let source: serde_json::Value =
                serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
            let expected: Vec<&str> = source["frames"]
                .as_array()
                .unwrap()
                .iter()
                .map(|frame| frame["caption"].as_str().unwrap())
                .collect();
            let listed = scene(source["widget"].as_str().unwrap(), id);
            assert_eq!(listed.captions, expected, "{name}");
            assert_eq!(listed.captions.len(), usize::try_from(listed.frames).unwrap());
            scenes += 1;
        } else if let Some(id) = name.strip_suffix(".snapshot.json") {
            let Some(widget) = snapshot_widget(id) else {
                continue;
            };
            let listed = scene(widget.id(), id);
            assert_eq!((listed.frames, listed.captions.len()), (1, 0), "{name}");
            snapshots += 1;
        }
    }
    assert!(scenes > 0 && snapshots > 0);
}

#[test]
fn invalid_captions_keep_the_scene_without_texts() {
    let cases = [
        (
            "standings-two",
            scene_value(&[
                captioned_frame("Primer pie"),
                captioned_frame("Segundo pie"),
            ]),
        ),
        ("standings-long", scene_value(&[captioned_frame(&"é".repeat(161))])),
        ("standings-empty", scene_value(&[captioned_frame("")])),
        ("standings-blank", scene_value(&[captioned_frame("   ")])),
        ("standings-newline", scene_value(&[captioned_frame("a\nb")])),
        ("standings-nul", scene_value(&[captioned_frame("a\0b")])),
        ("standings-tab", scene_value(&[captioned_frame("a\tb")])),
        (
            "standings-missing",
            scene_value(&[serde_json::json!({"snapshot": snapshot_value()})]),
        ),
        (
            "standings-crowded",
            scene_value(
                &(0..=12)
                    .map(|frame| captioned_frame(&format!("Fotograma {frame}")))
                    .collect::<Vec<_>>(),
            ),
        ),
    ];
    let widgets = caption_scenes(&cases);
    let listed = &widgets[0].scenes;
    let mut expected = cases.iter().map(|(id, _)| *id).collect::<Vec<_>>();
    expected.sort_unstable();
    assert_eq!(
        listed.iter().map(|scene| scene.id.as_str()).collect::<Vec<_>>(),
        expected
    );
    let find = |id: &str| listed.iter().find(|scene| scene.id == id).unwrap();
    assert_eq!(find("standings-two").captions, ["Primer pie", "Segundo pie"]);
    assert_eq!(find("standings-two").frames, 2);
    for id in [
        "standings-long",
        "standings-empty",
        "standings-blank",
        "standings-newline",
        "standings-nul",
        "standings-tab",
        "standings-missing",
        "standings-crowded",
    ] {
        assert!(find(id).captions.is_empty(), "{id}");
        assert!(find(id).frames > 0, "{id}");
    }
    assert_eq!(find("standings-crowded").frames, 13);
    let json = serde_json::to_string(&widgets).unwrap();
    assert!(!json.contains(".json"));
}

#[test]
fn caption_limits_are_exact() {
    let full = "é".repeat(160);
    let cases = [
        (
            "standings-max",
            scene_value(
                &(0..12)
                    .map(|_| captioned_frame(&full))
                    .collect::<Vec<_>>(),
            ),
        ),
        ("standings-over", scene_value(&[captioned_frame(&"a".repeat(161))])),
        (
            "standings-many",
            scene_value(
                &(0..13)
                    .map(|_| captioned_frame(&"a".repeat(160)))
                    .collect::<Vec<_>>(),
            ),
        ),
    ];
    let widgets = caption_scenes(&cases);
    let find = |id: &str| {
        widgets[0]
            .scenes
            .iter()
            .find(|scene| scene.id == id)
            .unwrap()
    };
    let max = find("standings-max");
    assert_eq!((max.frames, max.captions.len()), (12, 12));
    assert!(max.captions.iter().all(|caption| caption == &full));
    assert!(find("standings-over").captions.is_empty(), "over");
    assert!(find("standings-many").captions.is_empty(), "many");
    assert_eq!(find("standings-many").frames, 13);
}

#[test]
fn real_catalog_with_captions_fits_the_ui_frame_limit() {
    let widgets = Scenes::load(Some(fixtures())).widgets();
    let entries = widgets
        .iter()
        .map(|widget| widget.scenes.len())
        .sum::<usize>();
    let reply = crate::protocol::HostToUi::Response {
        id: 1,
        result: crate::protocol::Reply::WorkshopCatalog { widgets },
    };
    let bytes = serde_json::to_vec(&reply).unwrap();
    assert!(bytes.len() < crate::frame::LIMIT, "{}", bytes.len());
    // Worst case with four UTF-8 bytes per caption character.
    assert!(entries * CAPTION_COUNT_LIMIT * CAPTION_LIMIT * 4 < crate::frame::LIMIT);
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
    let mut unknown: serde_json::Value =
        serde_json::from_slice(&fs::read(fixtures().join("standings-default.scene.json")).unwrap())
            .unwrap();
    unknown["widget"] = "unknown-widget".into();
    fs::write(
        root.join("unknown-widget.scene.json"),
        serde_json::to_vec(&unknown).unwrap(),
    )
    .unwrap();
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
    assert_eq!(
        scenes
            .widgets()
            .iter()
            .map(|widget| widget.scenes.len())
            .sum::<usize>(),
        1
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

#[test]
fn file_cap_selects_the_first_names_in_lexical_order() {
    let names = (0..=FILE_LIMIT)
        .map(|index| format!("standings-{index:04}.snapshot.json"))
        .collect::<Vec<_>>();
    assert_eq!(
        sorted_fixture_names(names.iter().rev().cloned()),
        names[..FILE_LIMIT]
    );
    let root = std::env::temp_dir().join(vantare_services::random_id().unwrap());
    fs::create_dir(&root).unwrap();
    let bytes = fs::read(fixtures().join("standings.snapshot.json")).unwrap();
    for name in names.iter().rev() {
        fs::write(root.join(name), &bytes).unwrap();
    }
    let scenes = Scenes::load(Some(root.clone()));
    fs::remove_dir_all(root).unwrap();
    assert!(
        scenes.widgets()[0]
            .scenes
            .iter()
            .map(|scene| scene.id.as_str())
            .eq(names
                .iter()
                .take(FILE_LIMIT)
                .map(|name| name.strip_suffix(".snapshot.json").unwrap()))
    );
}
