//! Contratos previos del paso 4: escritores actuales, solo ficheros QA.
use std::{
    fs,
    path::{Path, PathBuf},
};
use vantare_ui::layout::{Document, Error as LayoutError, Layout, Presentation};

fn qa() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "vantare-1869-writers-{}",
        vantare_services::random_id().expect("QA id")
    ));
    fs::create_dir_all(&root).expect("QA directory");
    root
}
fn appended(path: &Path, suffix: &str) -> PathBuf {
    let mut value = path.as_os_str().to_os_string();
    value.push(suffix);
    value.into()
}

#[test]
fn launcher_and_engineer_preserve_observed_bytes_and_cooperate_with_their_locks() {
    let root = qa();
    for engineer in [false, true] {
        let path = root.join(if engineer {
            "engineer.json"
        } else {
            "launcher.json"
        });
        let save = |expected, bytes: &[u8]| {
            if engineer {
                vantare_ipc::engineer_control::save(&path, expected, bytes)
                    .map_err(|e| e.to_string())
            } else {
                vantare_launcher::files::save(&path, bytes, expected)
            }
        };
        save(None, b"first").expect("create");
        assert!(save(None, b"wrong").is_err());
        assert!(save(Some(b"stale"), b"wrong").is_err());
        assert_eq!(fs::read(&path).expect("kept"), b"first");
        let lock = fs::OpenOptions::new()
            .write(true)
            .open(appended(&path, ".lock"))
            .expect("same lock name");
        lock.try_lock().expect("hold writer");
        assert!(save(Some(b"first"), b"blocked").is_err());
        assert_eq!(fs::read(&path).expect("kept under lock"), b"first");
        drop(lock);
        save(Some(b"first"), b"second").expect("released");
        assert_eq!(fs::read(&path).expect("saved"), b"second");
        assert!(!appended(&path, ".bak").exists());
    }
    fs::remove_dir_all(root).expect("QA cleanup");
}

#[test]
fn layout_and_presentation_backup_and_json_sibling_names_are_characterized() {
    let root = qa();
    let path = root.join("custom.layout");
    let original = serde_json::to_vec_pretty(&Layout::default()).expect("current format");
    fs::write(&path, &original).expect("seed");
    let mut first = Document::open(path.clone()).expect("first editor");
    let mut second = Document::open(path.clone()).expect("second editor");
    let changed = Layout {
        hide_off_track: true,
        ..Layout::default()
    };
    first.save(&changed).expect("save");
    assert_eq!(
        fs::read(path.with_extension("json.bak")).expect("legacy backup name"),
        original
    );
    assert!(path.with_extension("json.lock").exists());
    assert!(matches!(
        second.save(&Layout::default()),
        Err(LayoutError::Conflict)
    ));
    assert_eq!(
        Document::open(path.clone()).expect("reopen").layout(),
        &changed
    );
    Presentation::show(&path).expect("show once");
    Presentation::show(&path).expect("show twice");
    assert!(!path.with_extension("show.json.bak").exists());
    // hide sigue retirando copias derivadas de versiones anteriores.
    fs::write(path.with_extension("show.json.bak"), b"1").expect("legacy show backup");
    Presentation::hide(&path).expect("hide");
    assert!(!path.with_extension("show.json").exists());
    assert!(!path.with_extension("show.json.bak").exists());
    fs::remove_dir_all(root).expect("QA cleanup");
}

#[test]
fn orphan_handling_characterization_preserves_documents_when_a_pid_is_reused() {
    let root = qa();
    let launcher = root.join("launcher.json");
    let engineer = root.join("engineer.json");
    let layout = root.join("layout.json");
    fs::write(&launcher, b"before").expect("launcher seed");
    fs::write(&engineer, b"before").expect("engineer seed");
    let original = serde_json::to_vec_pretty(&Layout::default()).expect("current layout");
    fs::write(&layout, &original).expect("layout seed");
    for path in [&launcher, &engineer, &layout] {
        fs::write(
            appended(path, &format!(".{}.0.tmp", std::process::id())),
            b"orphan",
        )
        .expect("reused PID fixture");
    }
    vantare_launcher::files::save(&launcher, b"after", Some(b"before"))
        .expect("launcher removes orphan");
    assert_eq!(fs::read(&launcher).expect("launcher saved"), b"after");
    let mut document = Document::open(layout.clone()).expect("layout");
    document
        .save(&Layout::default())
        .expect("layout removes orphan");
    assert_eq!(
        fs::read(layout.with_extension("json.bak")).expect("layout backup"),
        original
    );
    // E ya retira esos huérfanos con el lock tomado.
    vantare_ipc::engineer_control::save(&engineer, Some(b"before"), b"after")
        .expect("engineer removes orphan");
    assert_eq!(fs::read(&engineer).expect("engineer saved"), b"after");
    fs::remove_dir_all(root).expect("QA cleanup");
}
