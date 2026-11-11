use super::*;
fn save_new_selection(
    picker: &mut Picker,
    path: &Path,
    selected: &PickedApp,
    now: Instant,
) -> PathBuf {
    let bytes =
        serde_json::to_vec(&Document::fresh_install()).expect("canonical selection fixture");
    std::fs::write(path, &bytes).expect("canonical selection fixture");
    let draft = AppDraft {
        use_discovery: false,
        id: None,
        name: "QA canonical".into(),
        favorite: false,
    };
    picker
        .save(
            path,
            &draft,
            Some(&selected.token),
            &vantare_services::content_hash(&bytes),
            now,
        )
        .expect("canonical selection fixture");
    let saved = Document::from_bytes(&std::fs::read(path).expect("canonical selection fixture"))
        .expect("canonical selection fixture");
    saved
        .apps
        .last()
        .expect("canonical selection fixture")
        .executable
        .clone()
        .expect("canonical selection fixture")
}
#[test]
fn junction_choice_is_saved_canonical_and_cannot_be_retargeted_afterwards() {
    let root = crate::test_support::Root::new();
    let canonical_root = std::fs::canonicalize(&root.path).unwrap();
    let root_text = canonical_root.to_str().unwrap();
    // cmd's mklink builtin requires ordinary DOS paths, including backslashes.
    let directory = PathBuf::from(root_text.strip_prefix(r"\\?\").unwrap_or(root_text));
    let first = directory.join("first");
    let second = directory.join("second");
    let alias = directory.join("alias");
    std::fs::create_dir(&first).unwrap();
    std::fs::create_dir(&second).unwrap();
    std::fs::write(first.join("chosen.exe"), b"first inert fixture").unwrap();
    std::fs::write(second.join("chosen.exe"), b"second inert fixture").unwrap();
    let link = |target: &Path| {
        let result = std::process::Command::new("cmd")
            .args(["/D", "/C", "mklink", "/J"])
            .arg(&alias)
            .arg(target)
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "mklink: {} / {}",
            String::from_utf8_lossy(&result.stdout),
            String::from_utf8_lossy(&result.stderr)
        );
    };
    link(&first);
    let now = Instant::now();
    let mut picker = Picker::default();
    let selected = picker
        .selected(alias.join("chosen.exe").to_str(), None, now)
        .unwrap()
        .unwrap();
    let saved = save_new_selection(
        &mut picker,
        &root.path.join("launcher.json"),
        &selected,
        now,
    );
    assert_eq!(
        saved,
        canonical_executable(&first.join("chosen.exe")).unwrap()
    );
    assert!(!saved.to_str().unwrap().starts_with(r"\\?\"));
    assert!(!saved.starts_with(&alias));
    std::fs::remove_dir(&alias).unwrap();
    link(&second);
    assert_eq!(std::fs::read(saved).unwrap(), b"first inert fixture");
    std::fs::remove_dir(&alias).unwrap();
}
#[test]
fn symlink_choice_is_saved_canonical_or_reports_missing_privilege() {
    let root = crate::test_support::Root::new();
    let first = root.path.join("first.exe");
    let second = root.path.join("second.exe");
    let alias = root.path.join("alias.exe");
    std::fs::write(&first, b"first inert fixture").unwrap();
    std::fs::write(&second, b"second inert fixture").unwrap();
    if let Err(error) = std::os::windows::fs::symlink_file(&first, &alias) {
        if error.raw_os_error() == Some(1314)
            || error.kind() == std::io::ErrorKind::PermissionDenied
        {
            eprintln!("OMITIDO symlink: falta privilegio de Windows: {error}");
            return;
        }
        panic!("symlink fixture: {error}");
    }
    let now = Instant::now();
    let mut picker = Picker::default();
    let non_executable = root.path.join("private.txt");
    let invalid_alias = root.path.join("invalid.exe");
    std::fs::write(&non_executable, b"inert non executable").unwrap();
    std::os::windows::fs::symlink_file(&non_executable, &invalid_alias).unwrap();
    assert_eq!(
        picker.selected(invalid_alias.to_str(), None, now),
        Err(HostError::Denied)
    );
    assert!(picker.pending.is_none());
    let selected = picker.selected(alias.to_str(), None, now).unwrap().unwrap();
    assert_eq!(selected.name, "alias");
    let saved = save_new_selection(
        &mut picker,
        &root.path.join("launcher.json"),
        &selected,
        now,
    );
    assert_eq!(saved, canonical_executable(&first).unwrap());
    assert!(!saved.to_str().unwrap().starts_with(r"\\?\"));
    std::fs::remove_file(&alias).unwrap();
    std::os::windows::fs::symlink_file(&second, &alias).unwrap();
    assert_eq!(std::fs::read(saved).unwrap(), b"first inert fixture");
}
#[test]
fn selection_is_bound_to_its_app_and_replacement_clears_old_arguments() {
    let root = crate::test_support::Root::new();
    let path = root.path.join("launcher.json");
    let exe = root.path.join("chosen.exe");
    std::fs::write(&exe, b"inert QA fixture").unwrap();
    let mut document = Document::fresh_install();
    document.apps[0].args = vec!["private-old-argument".into()];
    document.profiles[0].steps[0].app_id = document.apps[0].id.clone();
    document.profiles[0].steps[0].args_override = Some(vec!["private-first-profile".into()]);
    document.profiles[1].steps[0].app_id = document.apps[0].id.clone();
    document.profiles[1].steps[0].args_override = Some(vec!["private-second-profile".into()]);
    document.profiles[0].steps[1].app_id = document.apps[1].id.clone();
    document.profiles[0].steps[1].args_override = Some(vec!["private-other-app".into()]);
    let bytes = serde_json::to_vec(&document).unwrap();
    Document::from_bytes(&bytes).expect("valid full catalog");
    std::fs::write(&path, &bytes).unwrap();
    let now = Instant::now();
    let mut picker = Picker::default();
    picker
        .request_dialog(7, Some(document.apps[0].id.clone()), now)
        .unwrap();
    let selected = picker
        .complete_dialog(
            &ExecutableSelection {
                id: 7,
                path: Some(exe.to_str().unwrap().into()),
            },
            now,
        )
        .unwrap()
        .unwrap();
    let revision = vantare_services::content_hash(&bytes);
    let mut wrong = get(&path, Some(&document.apps[1].id)).unwrap().draft;
    assert_eq!(
        picker.save(&path, &wrong, Some(&selected.token), &revision, now),
        Err(HostError::Denied)
    );
    wrong.id = None;
    assert_eq!(
        picker.save(&path, &wrong, Some(&selected.token), &revision, now),
        Err(HostError::Denied)
    );
    assert_eq!(std::fs::read(&path).unwrap(), bytes);
    let editor = get(&path, Some(&document.apps[0].id)).unwrap();
    assert!(editor.has_custom_arguments);
    assert_eq!(editor.custom_profiles, 2);
    assert!(!serde_json::to_string(&editor).unwrap().contains("private-"));
    let target = editor.draft;
    assert!(matches!(
        picker.save(&path, &target, Some(&selected.token), &"0".repeat(64), now),
        Err(HostError::LauncherConflict { .. })
    ));
    assert_eq!(std::fs::read(&path).unwrap(), bytes);
    picker
        .save(&path, &target, Some(&selected.token), &revision, now)
        .unwrap();
    let saved = Document::from_bytes(&std::fs::read(&path).unwrap()).unwrap();
    assert_eq!(
        saved.apps[0].executable,
        Some(canonical_executable(&exe).unwrap())
    );
    assert!(saved.apps[0].args.is_empty());
    assert_eq!(saved.apps[1], document.apps[1]);
    assert!(
        saved
            .profiles
            .iter()
            .flat_map(|profile| &profile.steps)
            .filter(|step| step.app_id == document.apps[0].id)
            .all(|step| step.args_override.is_none())
    );
    assert_eq!(
        serde_json::to_value(&saved.profiles[0].steps[1]).unwrap(),
        serde_json::to_value(&document.profiles[0].steps[1]).unwrap()
    );
    let editor = get(&path, Some(&document.apps[0].id)).unwrap();
    assert!(!editor.has_custom_arguments);
    assert_eq!(editor.custom_profiles, 0);
}

#[test]
fn discovery_reset_clears_only_the_app_and_its_profile_overrides_in_one_cas() {
    let root = crate::test_support::Root::new();
    let path = root.path.join("launcher.json");
    let exe = root.path.join("old.exe");
    std::fs::write(&exe, b"inert QA fixture").unwrap();
    let mut document = Document::fresh_install();
    document.apps[0].executable = Some(exe);
    document.profiles[0].steps[0].app_id = document.apps[0].id.clone();
    document.profiles[0].steps[0].args_override = Some(vec!["private-step".into()]);
    document.profiles[0].steps[1].app_id = document.apps[1].id.clone();
    document.profiles[0].steps[1].args_override = Some(vec!["keep-other-app".into()]);
    let bytes = serde_json::to_vec(&document).unwrap();
    std::fs::write(&path, &bytes).unwrap();
    let mut editor = get(&path, Some(&document.apps[0].id)).unwrap();
    assert!(document.apps[0].args.is_empty());
    assert!(editor.has_custom_arguments);
    assert_eq!(editor.custom_profiles, 1);
    editor.draft.use_discovery = true;
    let now = Instant::now();
    let mut picker = Picker::default();
    assert!(matches!(
        picker.save(&path, &editor.draft, None, &"0".repeat(64), now),
        Err(HostError::LauncherConflict { .. })
    ));
    assert_eq!(std::fs::read(&path).unwrap(), bytes);
    picker
        .save(&path, &editor.draft, None, &editor.revision, now)
        .unwrap();
    let saved = Document::from_bytes(&std::fs::read(&path).unwrap()).unwrap();
    assert!(saved.apps[0].executable.is_none());
    assert!(saved.profiles[0].steps[0].args_override.is_none());
    assert_eq!(
        serde_json::to_value(&saved.profiles[0].steps[1]).unwrap(),
        serde_json::to_value(&document.profiles[0].steps[1]).unwrap()
    );
}

#[test]
fn malformed_and_ambiguous_choices_never_mint_a_selection() {
    let root = crate::test_support::Root::new();
    let directory = root.path.join("directory.exe");
    std::fs::create_dir(&directory).unwrap();
    let ordinary = root.path.join("chosen.exe");
    std::fs::write(&ordinary, b"inert").unwrap();
    let folder = root.path.join("folder");
    std::fs::create_dir(&folder).unwrap();
    std::fs::write(folder.join("x.exe"), b"inert").unwrap();
    std::fs::write(
        format!("{}:stream.exe", ordinary.display()),
        b"inert stream",
    )
    .unwrap();
    let bad = [
        directory.to_str().unwrap().to_owned(),
        "relative.exe".into(),
        r"\\?\UNC\server\share\x.exe".into(),
        "a\0.exe".into(),
        format!("{}{}.exe", root.path.display(), "x".repeat(PICK_PATH_MAX)),
        format!("{}:stream.exe", ordinary.display()),
        root.path
            .join("folder.")
            .join("x.exe")
            .to_string_lossy()
            .into_owned(),
        root.path
            .join("folder ")
            .join("x.exe")
            .to_string_lossy()
            .into_owned(),
    ];
    for path in bad {
        let mut picker = Picker::default();
        assert_eq!(
            picker.selected(Some(&path), None, Instant::now()),
            Err(HostError::Denied)
        );
        assert!(picker.pending.is_none());
    }
}
#[test]
fn approved_file_leaf_is_projected_without_its_directory() {
    let root = crate::test_support::Root::new();
    let executable = root.path.join("chosen.exe");
    std::fs::write(&executable, b"inert").unwrap();
    let picked = Picker::default()
        .selected(executable.to_str(), None, Instant::now())
        .unwrap()
        .unwrap();
    assert_eq!(picked.file_name, "chosen.exe");
    assert_eq!(picked.name, "chosen");
    assert!(
        !serde_json::to_string(&picked)
            .unwrap()
            .contains(root.path.to_str().unwrap())
    );
}

#[test]
fn an_approved_selection_cannot_exceed_the_application_limit() {
    let root = crate::test_support::Root::new();
    let path = root.path.join("launcher.json");
    let executable = root.path.join("chosen.exe");
    std::fs::write(&executable, b"inert").unwrap();
    let mut document = Document::fresh_install();
    while document.apps.len() < APP_LIMIT {
        let mut app = document.apps[0].clone();
        app.id = format!("custom:{}", document.apps.len());
        app.executable = Some(executable.clone());
        document.apps.push(app);
    }
    let bytes = serde_json::to_vec(&document).unwrap();
    Document::from_bytes(&bytes).expect("valid full catalog");
    std::fs::write(&path, &bytes).unwrap();
    let now = Instant::now();
    let mut picker = Picker::default();
    let selection = picker
        .selected(executable.to_str(), None, now)
        .unwrap()
        .unwrap();
    let draft = AppDraft {
        id: None,
        name: "QA".into(),
        favorite: false,
        use_discovery: false,
    };
    assert_eq!(
        picker.save(
            &path,
            &draft,
            Some(&selection.token),
            &vantare_services::content_hash(&bytes),
            now
        ),
        Err(HostError::Denied)
    );
    assert_eq!(std::fs::read(path).unwrap(), bytes);
}
