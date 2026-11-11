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
    let selected = picker.selected(alias.to_str(), None, now).unwrap().unwrap();
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
    let bytes = serde_json::to_vec(&document).unwrap();
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
    let target = get(&path, Some(&document.apps[0].id)).unwrap().draft;
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
}
