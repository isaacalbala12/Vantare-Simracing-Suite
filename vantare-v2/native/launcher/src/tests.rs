use super::*;
#[cfg(windows)]
use chain::{Chain, Status};
use discovery::{Discovery, Sources};
#[cfg(windows)]
use std::path::Path;
#[cfg(windows)]
use std::time::{Duration, Instant};
use std::{
    fs,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT: AtomicU64 = AtomicU64::new(0);

#[test]
fn legacy_import_keeps_its_origin_when_duplicated_without_marking_local_profiles() {
    let tree = Tree::new();
    let path = tree.0.join("launcher.json");
    let mut document = Document::default();
    document
        .profiles
        .push(Profile::new("legacy".into(), "Importado".into()));
    document
        .profiles
        .push(Profile::new("local".into(), "Creado aquí".into()));
    document.wails_import = Some(migration::Import {
        source: tree.0.join("wails.json"),
        launcher: std::collections::BTreeMap::from([(
            "launcherProfiles".into(),
            serde_json::json!([{ "id": "legacy" }]),
        )]),
    });
    fs::write(
        &path,
        serde_json::to_vec(&document).expect("legacy document"),
    )
    .expect("write");
    let store = Store::load(path).expect("load old document");
    assert!(store.document.profiles[0].imported);
    assert!(store.document.profiles[0].duplicate("copy".into()).imported);
    assert!(!store.document.profiles[1].imported);
}

#[test]
fn hotkeys_normalize_win32_codes_and_reject_reserved_unknown_or_duplicate_modifiers() {
    let key = triggers::Hotkey::parse(" SHIFT + Ctrl + 1 ")
        .expect("parse")
        .expect("assigned");
    assert_eq!(key.modifiers, 6);
    assert_eq!(key.virtual_key, u32::from(b'1'));
    assert_eq!(key.display(), "ctrl+shift+1");
    assert!(triggers::Hotkey::parse(" ").expect("unassigned").is_none());
    for invalid in [
        "ctrl+c",
        "win+l",
        "alt+f4",
        "alt+tab",
        "ctrl+ctrl+1",
        "meta+1",
        "a",
        "ctrl+enter",
        "ctrl+🙂",
    ] {
        assert!(triggers::Hotkey::parse(invalid).is_err(), "{invalid}");
    }
}

#[test]
fn trigger_preferences_save_atomically_allow_one_startup_profile_and_detect_hotkey_conflicts() {
    let mut document = Document::fresh_install();
    let mut creator = document.profiles[0].clone();
    creator.hotkey = "shift+ctrl+1".into();
    creator.launch_on_windows_startup = true;
    document.save_profile(creator).expect("first preference");
    let mut pro = document.profiles[1].clone();
    pro.hotkey = "ctrl+shift+1".into();
    pro.launch_on_windows_startup = true;
    assert!(document.save_profile(pro.clone()).is_err());
    assert!(document.profiles[0].launch_on_windows_startup);
    assert!(!document.profiles[1].launch_on_windows_startup);
    pro.hotkey = "ctrl+shift+2".into();
    document
        .save_profile(pro.clone())
        .expect("transfer startup preference");
    assert!(!document.profiles[0].launch_on_windows_startup);
    assert!(document.profiles[1].launch_on_windows_startup);
    assert_eq!(document.profiles[0].hotkey, "ctrl+shift+1");
    pro.steps.clear();
    assert!(document.save_profile(pro).is_err());
    assert_eq!(document.profiles[1].steps.len(), 4);
}

#[test]
fn steam_common_detects_non_game_catalog_apps_and_shortcuts_never_override_manual_paths() {
    let tree = Tree::new();
    let steam = tree.0.join("Steam");
    let obs = tree.file("Steam/steamapps/common/OBS/bin/64bit/obs64.exe", b"fixture");
    let shortcut_target = tree.file("elsewhere/Spotify.exe", b"fixture");
    let document = Document::default();
    let found = Discovery::scan(
        &document.apps,
        Sources {
            steam_roots: vec![steam],
            shortcuts: vec![shortcut_target.clone()],
            ..Default::default()
        },
    );
    assert_eq!(
        found.app("obs").expect("OBS").executable.as_ref(),
        Some(&obs)
    );
    assert_eq!(found.app("obs").expect("OBS").source, "Steam");
    assert_eq!(
        found.app("spotify").expect("Spotify").executable.as_ref(),
        Some(&shortcut_target)
    );
    assert_eq!(
        found.app("spotify").expect("Spotify").source,
        "acceso directo"
    );
    let mut overridden = document;
    overridden
        .apps
        .iter_mut()
        .find(|app| app.id == "spotify")
        .expect("app")
        .executable = Some(tree.0.join("missing/Spotify.exe"));
    let found = Discovery::scan(
        &overridden.apps,
        Sources {
            shortcuts: vec![shortcut_target],
            ..Default::default()
        },
    );
    assert!(
        found
            .app("spotify")
            .expect("manual wins")
            .executable
            .is_none()
    );
    assert!(
        !found
            .app("spotify")
            .expect("manual wins")
            .availability
            .launchable
    );
}

#[cfg(windows)]
#[test]
fn actual_lnk_is_read_without_modification_or_execution() {
    use std::os::windows::process::CommandExt;
    let tree = Tree::new();
    let system = PathBuf::from(std::env::var_os("SystemRoot").expect("Windows"));
    let target = tree.0.join("obs64.exe");
    fs::copy(system.join("System32/cmd.exe"), &target).expect("real PE fixture");
    let link = tree.0.join("OBS Studio.lnk");
    let marker = tree.0.join("must-not-run.txt");
    let script = "$shell=New-Object -ComObject WScript.Shell; $link=$shell.CreateShortcut($env:VANTARE_TEST_LINK); $link.TargetPath=$env:VANTARE_TEST_TARGET; $link.Arguments=('/d /c echo ran > '+[char]34+$env:VANTARE_TEST_MARKER+[char]34); $link.Save()";
    let output =
        std::process::Command::new(system.join("System32/WindowsPowerShell/v1.0/powershell.exe"))
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .env("VANTARE_TEST_LINK", &link)
            .env("VANTARE_TEST_TARGET", &target)
            .env("VANTARE_TEST_MARKER", &marker)
            .creation_flags(0x0800_0000)
            .output()
            .expect("create private fixture");
    assert!(output.status.success());
    let original = fs::read(&link).expect("actual lnk");
    let paths = shortcuts::resolve(std::slice::from_ref(&link)).expect("read via OS COM");
    assert_eq!(paths.as_slice(), std::slice::from_ref(&target));
    assert_eq!(fs::read(&link).expect("unchanged"), original);
    assert!(!marker.exists());
    assert!(
        discovery::running_all(&target)
            .expect("not executed")
            .is_empty()
    );
    let found = Discovery::scan(
        &Document::default().apps,
        Sources {
            shortcuts: paths,
            ..Default::default()
        },
    );
    assert_eq!(found.app("obs").expect("app").source, "acceso directo");
    assert!(shortcuts::resolve(&[PathBuf::from(r"\\server\share\OBS.lnk")]).is_err());
}

#[test]
fn fresh_install_seeds_templates_once_and_respects_explicit_empty_profiles() {
    let tree = Tree::new();
    let path = tree.0.join("launcher.json");
    let mut store = Store::load_with_wails(path.clone(), None).expect("fresh install");
    assert_eq!(
        store
            .document
            .profiles
            .iter()
            .map(|p| p.id.as_str())
            .collect::<Vec<_>>(),
        ["creator", "pro"]
    );
    assert_eq!(
        store.document.profiles[0]
            .steps
            .iter()
            .map(|s| s.app_id.as_str())
            .collect::<Vec<_>>(),
        ["lmu", "obs", "spotify"]
    );
    assert_eq!(store.document.profiles[1].steps.len(), 4);
    let mut empty = store.document.clone();
    empty.profiles.clear();
    store.replace(empty).expect("user deleted all profiles");
    assert!(
        Store::load_with_wails(path, None)
            .expect("reload")
            .document
            .profiles
            .is_empty()
    );
    let source = tree.file(
        "wails.json",
        br#"{"launcherProfiles":[],"launcherApps":{}}"#,
    );
    assert!(
        Store::load_with_wails(tree.0.join("other.json"), Some(&source))
            .expect("import empty")
            .document
            .profiles
            .is_empty()
    );
}

#[test]
fn editor_rejects_missing_steps_apps_duplicates_and_preserves_advanced_copies() {
    let tree = Tree::new();
    let executable = tree.file("tool.exe", b"path fixture");
    let mut document = Document::default();
    let id = document.add_app("Tool".into(), executable).expect("app");
    let found = Discovery::scan(&document.apps, Sources::default());
    let mut profile = Profile::new("source".into(), "Profile".into());
    assert!(profile.validate_editor(&found).is_err());
    profile.steps.push(Step {
        app_id: id.clone(),
        delay_seconds: 7200,
        args_override: None,
    });
    profile.name.clear();
    assert!(profile.validate_editor(&found).is_err());
    profile.name = "Profile".into();
    profile.steps[0].app_id = "obs".into();
    assert!(profile.validate_editor(&found).is_err());
    profile.steps[0].app_id = id;
    profile.steps.push(profile.steps[0].clone());
    assert!(profile.validate_editor(&found).is_err());
    profile.advanced = true;
    profile
        .validate_editor(&found)
        .expect("advanced duplicates allowed");
    profile.hotkey = "ctrl+shift+1".into();
    profile.launch_on_windows_startup = true;
    profile.favorite = true;
    profile.launch_count = 5;
    profile.description = "Description".into();
    profile.notes = "Notes".into();
    let mut copy = profile.duplicate("copy".into());
    assert_eq!(copy.name, "Profile (copia)");
    assert_eq!(copy.description, profile.description);
    assert_eq!(copy.notes, profile.notes);
    assert!(copy.hotkey.is_empty());
    assert!(!copy.launch_on_windows_startup);
    assert!(!copy.favorite);
    assert_eq!(copy.launch_count, 0);
    copy.steps[0].delay_seconds = 2;
    assert_eq!(profile.steps[0].delay_seconds, 7200);
    document.profiles.push(profile);
    document.lmu_trigger_profile = Some("source".into());
    document
        .remove_profile("source")
        .expect("confirmed deletion");
    assert!(document.lmu_trigger_profile.is_none());
    assert!(document.remove_profile("source").is_err());
}

#[test]
fn migration_imports_wails_once_without_modifying_source_or_other_settings() {
    let tree = Tree::new();
    let app = tree.file("herramienta.exe", b"fixture de ruta, no proceso");
    let settings = serde_json::json!({
        "schemaVersion": 7, "uiLocale": "es", "hotkeys": {"toggleOverlay":"ctrl+v"},
        "launcherApps": {"custom:tool": {
            "id":"custom:tool", "displayName":"Herramienta", "executablePath":"",
            "userExecutablePath": app, "args": "--name \"nombre con espacios\" \"\"",
            "isFavorite":true, "iconOverridePath":"icono.png"
        }},
        "launcherProfiles":[{
            "id":"rig", "name":"Mi rig", "description":"Descripción", "notes":"Notas",
            "isFavorite":true, "advanced":true, "hotkey":"ctrl+shift+r",
            "launchOnWindowsStartup":true, "launchCount":7,
            "lastLaunchedAt":"2026-09-30T12:00:00Z", "avgChainDurationMs":3000,
            "steps":[{"appId":"custom:tool", "delay":7200, "argsOverride":"--flag"}],
            "policy":{"alreadyRunning":"restart", "failure":"continue", "cancel":"close-started",
                "exit":"leave", "retry":"all", "maxRetries":2, "firstStepDelay":4000}
        }],
        "launcherLmuTriggerEnabled":true, "launcherLmuTriggerProfileId":"rig"
    });
    let original = serde_json::to_vec(&settings).expect("JSON Wails");
    let source = tree.file("configs/app-settings.json", &original);
    let path = tree.0.join("launcher.json");
    let imported = Store::load_with_wails(path.clone(), Some(&source)).expect("importar");
    let profile = &imported.document.profiles[0];
    assert_eq!(profile.name, "Mi rig");
    assert_eq!(profile.steps[0].delay_seconds, 7200);
    assert_eq!(profile.steps[0].args_override, Some(vec!["--flag".into()]));
    assert_eq!(profile.first_step_delay, 4000);
    assert_eq!(profile.notes, "Notas");
    assert_eq!(profile.launch_count, 7);
    assert_eq!(profile.hotkey, "ctrl+shift+r");
    assert_eq!(
        profile.policy.as_ref().expect("política").retry,
        policy::Retry::All
    );
    let app = imported.document.apps.last().expect("app importada");
    assert_eq!(app.args, ["--name", "nombre con espacios", ""]);
    assert!(app.favorite);
    assert_eq!(
        imported.document.lmu_trigger_profile.as_deref(),
        Some("rig")
    );
    let archive = &imported
        .document
        .wails_import
        .as_ref()
        .expect("archivo de migración")
        .launcher;
    assert!(!archive.contains_key("uiLocale"));
    assert!(!archive.contains_key("hotkeys"));
    assert_eq!(
        archive["launcherApps"]["custom:tool"]["iconOverridePath"],
        "icono.png"
    );
    assert_eq!(fs::read(&source).expect("original intacto"), original);
    let saved = fs::read(&path).expect("creado atómicamente");
    fs::write(&source, b"{").expect("Wails cambia después");
    let reloaded = Store::load_with_wails(path.clone(), Some(&source)).expect("nativo prevalece");
    assert_eq!(reloaded.document.profiles[0].name, "Mi rig");
    assert_eq!(fs::read(path).expect("no reimporta"), saved);
}

#[test]
fn migration_invalid_source_or_conflict_never_creates_partial_native_data() {
    let tree = Tree::new();
    let source = tree.file(
        "app-settings.json",
        br#"{"launcherProfiles":[{"id":"p","name":"P","steps":[{"appId":"missing","delay":0}]}]}"#,
    );
    let path = tree.0.join("launcher.json");
    assert!(Store::load_with_wails(path.clone(), Some(&source)).is_err());
    assert!(!path.exists());
    fs::write(&source, br#"{"launcherProfiles":[],"launcherApps":{}}"#).expect("vacío explícito");
    // Un fichero de lock residual no debe impedir cargar ni guardar.
    tree.file("launcher.json.lock", b"lock ajeno");
    Store::load_with_wails(path.clone(), Some(&source)).expect("un lock residual no debe bloquear");
    let store = Store::load_with_wails(path, Some(&source)).expect("vacío conservado");
    assert!(store.document.profiles.is_empty());
}

#[test]
fn migration_uses_wails_directory_priority_and_does_not_mix_installations() {
    let tree = Tree::new();
    let portable = tree.0.join("portable/configs");
    let installed = tree.0.join("roaming/configs");
    tree.file("roaming/configs/app-settings.json", b"{}");
    assert_eq!(
        migration::source_in(&[portable.clone(), installed.clone()]).expect("fuente"),
        Some(installed.join("app-settings.json"))
    );
    fs::create_dir_all(&portable).expect("portable sin ajustes");
    assert!(
        migration::source_in(&[portable.clone(), installed.clone()])
            .expect("sin mezcla")
            .is_none()
    );
    tree.file("portable/configs/app-settings.json", b"{}");
    assert_eq!(
        migration::source_in(&[portable.clone(), installed]).expect("portable"),
        Some(portable.join("app-settings.json"))
    );
}

#[test]
fn migration_arguments_follow_wails_without_shell_execution() {
    for (raw, expected) in [
        (
            r#"--name "dos palabras" """#,
            vec!["--name", "dos palabras", ""],
        ),
        (r"--path C:\rig\app", vec!["--path", r"C:\rig\app"]),
        (r#"--name \"quoted\""#, vec!["--name", "\"quoted\""]),
        ("a & b", vec!["a", "&", "b"]),
    ] {
        assert_eq!(migration::parse_args(raw).expect("tokens"), expected);
    }
    assert!(migration::parse_args("a\0b").is_err());
    assert!(migration::parse_args("\"abierta").is_err());
}

struct Tree(PathBuf);
impl Tree {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "vantare-native-launcher-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).expect("árbol exclusivo");
        Self(path)
    }
    fn file(&self, relative: &str, bytes: &[u8]) -> PathBuf {
        let path = self.0.join(relative);
        fs::create_dir_all(path.parent().expect("padre")).expect("directorios");
        fs::write(&path, bytes).expect("archivo real");
        path
    }
}
impl Drop for Tree {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).expect("limpiar árbol propio");
    }
}

#[test]
fn discovery_reads_real_known_registry_and_steam_trees_and_keeps_evidence_distinct() {
    let tree = Tree::new();
    let obs = tree.file("obs/bin/64bit/OBS64.EXE", b"fixture de ruta, no proceso");
    let crew = tree.file("crew/CrewChiefV4.exe", b"fixture de ruta");
    let game = tree.file(
        "library/steamapps/common/Le Mans Ultimate/Le Mans Ultimate.exe",
        b"fixture de ruta",
    );
    let steam = tree.file("steam/steam.exe", b"fixture de ruta");
    let library = tree.0.join("library");
    let escaped = library.to_string_lossy().replace('\\', "\\\\");
    tree.file(
        "steam/steamapps/libraryfolders.vdf",
        format!("\"libraryfolders\" {{ \"0\" {{ \"path\" \"{escaped}\" }} }}").as_bytes(),
    );
    tree.file(
        "library/steamapps/appmanifest_2399420.acf",
        br#""AppState" { "appid" "2399420" "StateFlags" "4" "installdir" "Le Mans Ultimate" }"#,
    );
    let sources = Sources {
        known_paths: vec![("obs".into(), tree.0.join("obs"))],
        registry: vec![
            ("Crew Chief V4".into(), tree.0.join("crew")),
            ("MoTeC i2".into(), tree.0.join("missing")),
        ],
        steam_roots: vec![tree.0.join("steam")],
        shortcuts: vec![],
        warnings: vec![],
    };
    let discovered = Discovery::scan(&Document::default().apps, sources);
    assert!(discovered.warnings.is_empty(), "{:?}", discovered.warnings);
    assert_eq!(discovered.steam_executable, Some(steam));
    assert_eq!(discovered.app("obs").expect("OBS").executable, Some(obs));
    assert_eq!(
        discovered.app("crewchief").expect("CC").executable,
        Some(crew)
    );
    assert_eq!(
        discovered.app("lmu").expect("LMU").executable,
        Some(game.clone())
    );
    let motec = &discovered.app("motec").expect("MoTeC").availability;
    assert!(motec.catalogued && motec.found && !motec.installed && !motec.launchable);
    fs::remove_file(game).expect("desaparece el ejecutable del juego");
    let discovered = Discovery::scan(
        &Document::default().apps,
        Sources {
            steam_roots: vec![tree.0.join("steam")],
            ..Sources::default()
        },
    );
    let lmu = &discovered.app("lmu").expect("LMU").availability;
    assert!(lmu.installed && lmu.found && !lmu.launchable);
    let spotify = &discovered.app("spotify").expect("Spotify").availability;
    assert!(spotify.catalogued && !spotify.found && !spotify.installed && !spotify.launchable);
}

#[test]
fn vanished_override_never_falls_back_and_steam_manifest_cannot_escape_library() {
    let tree = Tree::new();
    tree.file("known/obs64.exe", b"path fixture");
    tree.file(
        "steam/steamapps/appmanifest_2399420.acf",
        br#""appid" "2399420" "StateFlags" "4" "installdir" "../../outside""#,
    );
    tree.file("outside/LMU.exe", b"path fixture");
    let mut document = Document::default();
    document
        .apps
        .iter_mut()
        .find(|app| app.id == "obs")
        .expect("OBS")
        .executable = Some(tree.0.join("gone.exe"));
    let found = Discovery::scan(
        &document.apps,
        Sources {
            known_paths: vec![("obs".into(), tree.0.join("known"))],
            steam_roots: vec![tree.0.join("steam")],
            ..Sources::default()
        },
    );
    assert!(!found.app("obs").expect("OBS").availability.launchable);
    assert!(!found.app("lmu").expect("LMU").availability.launchable);
}

#[test]
fn local_store_is_atomic_conflict_aware_and_rolls_back_memory_on_failure() {
    let tree = Tree::new();
    let path = tree.0.join("launcher.json");
    let mut first = Store::load(path.clone()).expect("nuevo");
    assert!(!path.exists());
    let mut document = first.document.clone();
    let executable = tree.file("Manual app.exe", b"fixture de ruta");
    let id = document
        .add_app("Aplicación de prueba".into(), executable)
        .expect("manual");
    let mut profile = Profile::new("rig".into(), "Sim rig".into());
    profile.steps.push(Step {
        app_id: id.clone(),
        delay_seconds: 3,
        args_override: Some(vec!["argumento con espacios".into()]),
    });
    document.profiles.push(profile);
    document.lmu_trigger_profile = Some("rig".into());
    assert!(document.remove_app(&id).is_err());
    first.replace(document).expect("persistir");
    let mut stale = Store::load(path.clone()).expect("otro lector");
    let mut updated = first.document.clone();
    updated.profiles[0].name = "Nombre nuevo".into();
    first.replace(updated).expect("reemplazo real en Windows");
    assert!(stale.replace(stale.document.clone()).is_err());
    assert_eq!(stale.document.profiles[0].name, "Sim rig");
    assert_eq!(
        Store::load(path.clone()).expect("releer").document.profiles[0].name,
        "Nombre nuevo"
    );
    fs::write(&path, b"{").expect("simular corrupción en archivo de prueba");
    assert!(Store::load(path.clone()).is_err());
    assert_eq!(fs::read(path).expect("preservado"), b"{");
}

#[test]
fn invalid_data_is_rejected_before_writing_or_starting() {
    let tree = Tree::new();
    let mut store = Store::load(tree.0.join("launcher.json")).expect("nuevo");
    let mut bad = store.document.clone();
    bad.apps[0].args = vec!["a\0b".into()];
    assert!(store.replace(bad).is_err());
    let mut bad = store.document.clone();
    let mut profile = Profile::new("bad".into(), "bad".into());
    profile.max_retries = 4;
    bad.profiles.push(profile);
    assert!(store.replace(bad).is_err());
    let mut bad = store.document.clone();
    bad.lmu_trigger_profile = Some("missing".into());
    assert!(store.replace(bad).is_err());
    let mut bad = store.document.clone();
    bad.apps.push(App {
        id: "custom:no-path".into(),
        name: "Sin ruta".into(),
        executable: None,
        args: vec![],
        favorite: false,
    });
    assert!(store.replace(bad).is_err());
    assert!(!store.path.exists());
}

#[cfg(windows)]
fn process_fixture(tree: &Tree, exit_code: i32) -> (Document, Profile, Discovery) {
    let source =
        PathBuf::from(std::env::var_os("SystemRoot").expect("Windows")).join("System32/cmd.exe");
    let executable = tree.0.join("real cmd.exe");
    fs::copy(source, &executable).expect("copia real de cmd en árbol propio");
    let mut document = Document::default();
    let id = document
        .add_app("Proceso de prueba".into(), executable)
        .expect("app");
    document.apps.last_mut().expect("manual").args =
        vec!["/d".into(), "/c".into(), format!("exit {exit_code}")];
    let mut profile = Profile::new("test".into(), "Prueba".into());
    profile.reuse_running = false;
    profile.steps.push(Step {
        app_id: id,
        delay_seconds: 0,
        args_override: None,
    });
    let discovered = Discovery::scan(&document.apps, Sources::default());
    (document, profile, discovered)
}

#[cfg(windows)]
struct ProcessCleanup(processes::Shared);

#[cfg(windows)]
#[test]
fn imported_profile_waits_for_review_before_any_child_process() {
    let tree = Tree::new();
    let (document, mut profile, found) = process_fixture(&tree, 0);
    profile.imported = true;
    profile.id = format!("review-{}", vantare_services::random_id().expect("id"));
    let chain = Chain::start(document, profile, found).expect("chain");
    let event = chain
        .progress
        .recv_timeout(Duration::from_secs(5))
        .expect("review before launch");
    assert_eq!(event.status, Status::Waiting);
    assert!(event.pid.is_none());
    let decision = event.decision.expect("review");
    assert_eq!(
        decision.actions,
        [chain::Action::Trust, chain::Action::Cancel]
    );
    assert!(decision.message.contains("real cmd.exe"));
    assert!(decision.message.contains("exit 0"));
    chain
        .answer(decision.id, chain::Action::Cancel)
        .expect("cancel");
    let events = collect(&chain);
    assert!(events.iter().all(|event| event.pid.is_none()));
    assert!(events.iter().all(|event| event.status != Status::Launching));
}
#[cfg(windows)]
impl Drop for ProcessCleanup {
    fn drop(&mut self) {
        if let Ok(mut registry) = self.0.lock()
            && let Err(error) = registry.close_profile("test")
        {
            eprintln!("limpiar proceso propio del test: {error}");
        }
    }
}

#[cfg(windows)]
fn collect(chain: &Chain) -> Vec<chain::Progress> {
    let mut events = vec![];
    loop {
        let event = chain
            .progress
            .recv_timeout(Duration::from_secs(10))
            .expect("progreso real");
        let finished =
            event.step.is_none() && matches!(event.status, Status::Done | Status::Cancelled);
        events.push(event);
        if finished {
            return events;
        }
    }
}

#[cfg(unix)]
#[test]
fn system_discovery_is_empty_on_unix() {
    let sources = Sources::system();
    assert!(sources.known_paths.is_empty());
    assert!(sources.registry.is_empty());
    assert!(sources.steam_roots.is_empty());
    assert!(sources.warnings.is_empty());
}

#[cfg(windows)]
#[test]
fn retry_policies_distinguish_failed_steps_whole_chain_and_ask() {
    for (retry, first_count, second_count) in [
        (policy::Retry::Failed, 1, 3),
        (policy::Retry::All, 3, 3),
        (policy::Retry::Ask, 1, 1),
    ] {
        let tree = Tree::new();
        let (document, mut profile, found) = process_fixture(&tree, 0);
        let mut second = profile.steps[0].clone();
        second.args_override = Some(vec!["/d".into(), "/c".into(), "exit 5".into()]);
        profile.steps.push(second);
        profile.policy = Some(policy::Policy {
            retry,
            max_retries: 2,
            failure: policy::Failure::Continue,
            already_running: policy::Running::Reuse,
            ..Default::default()
        });
        let mut chain = Chain::start(document, profile, found).expect("chain");
        let events = collect(&chain);
        chain.shutdown().expect("join");
        for (step, expected) in [(0, first_count), (1, second_count)] {
            assert_eq!(
                events
                    .iter()
                    .filter(|e| e.step == Some(step) && e.status == Status::Launching)
                    .count(),
                expected
            );
        }
    }
}

#[cfg(windows)]
#[test]
fn selected_retry_keeps_original_indices_and_does_not_repeat_ready_steps() {
    let tree = Tree::new();
    let (document, mut profile, found) = process_fixture(&tree, 0);
    let mut second = profile.steps[0].clone();
    second.args_override = Some(vec!["/d".into(), "/c".into(), "exit 5".into()]);
    profile.steps.push(second);
    let mut initial = Chain::start(document.clone(), profile.clone(), found).expect("chain");
    let events = collect(&initial);
    initial.shutdown().expect("join");
    let selected = chain::retry_steps(&profile, &events, chain::RetryScope::Failed);
    assert_eq!(selected, [1]);
    assert_eq!(
        chain::retry_steps(&profile, &events, chain::RetryScope::All),
        [0, 1]
    );
    profile.steps[1].args_override = Some(vec!["/d".into(), "/c".into(), "exit 0".into()]);
    let found = Discovery::scan(&document.apps, Sources::default());
    let shared = std::sync::Arc::new(std::sync::Mutex::new(processes::Processes::default()));
    let mut retried =
        Chain::start_selected(document, profile, found, shared, selected).expect("retry");
    let events = collect(&retried);
    retried.shutdown().expect("join");
    assert!(!events.iter().any(|e| e.step == Some(0)));
    assert!(
        events
            .iter()
            .any(|e| e.step == Some(1) && e.status == Status::Ready)
    );
    assert!(events.last().expect("done").success);
}

#[cfg(windows)]
#[test]
fn running_ask_rejects_stale_answers_and_never_grants_external_ownership() {
    let tree = Tree::new();
    let (document, mut profile, found) = process_fixture(&tree, 0);
    let executable = document
        .apps
        .last()
        .expect("app")
        .executable
        .as_ref()
        .expect("exe");
    let mut existing = std::process::Command::new(executable)
        .args(["/d", "/c", "for /l %i in (1,1,20000000) do @rem"])
        .stdout(std::process::Stdio::null())
        .spawn()
        .expect("external child");
    let shared = std::sync::Arc::new(std::sync::Mutex::new(processes::Processes::default()));
    profile.policy = Some(policy::Policy::default());
    let mut chain =
        Chain::start_with_processes(document, profile, found, shared.clone()).expect("chain");
    let mut decision = None;
    while decision.is_none() {
        decision = chain
            .progress
            .recv_timeout(Duration::from_secs(5))
            .expect("decision")
            .decision;
    }
    let decision = decision.expect("decision");
    assert_eq!(
        decision.actions,
        [chain::Action::Reuse, chain::Action::Cancel]
    );
    chain
        .answer(decision.id + 1, chain::Action::Reuse)
        .expect("stale reply");
    assert!(
        chain
            .progress
            .recv_timeout(Duration::from_millis(100))
            .is_err()
    );
    chain
        .answer(decision.id, chain::Action::Reuse)
        .expect("reply");
    let events = collect(&chain);
    chain.shutdown().expect("join");
    let still_open = existing.try_wait().expect("state").is_none();
    existing.kill().expect("cleanup");
    existing.wait().expect("reap");
    assert!(still_open);
    assert!(events.last().expect("done").success);
    assert!(
        !shared
            .lock()
            .expect("registry")
            .has_profile("test")
            .expect("ownership")
    );
}

#[cfg(windows)]
#[test]
fn failure_ask_continues_or_stops_and_cancel_closes_only_started_children() {
    for action in [chain::Action::Continue, chain::Action::Stop] {
        let tree = Tree::new();
        let (document, mut profile, found) = process_fixture(&tree, 7);
        let mut next = profile.steps[0].clone();
        next.args_override = Some(vec!["/d".into(), "/c".into(), "exit 0".into()]);
        profile.steps.push(next);
        profile.policy = Some(policy::Policy {
            already_running: policy::Running::Reuse,
            ..Default::default()
        });
        let mut chain = Chain::start(document, profile, found).expect("chain");
        loop {
            if let Some(decision) = chain
                .progress
                .recv_timeout(Duration::from_secs(5))
                .expect("event")
                .decision
            {
                chain.answer(decision.id, action).expect("answer");
                break;
            }
        }
        let events = collect(&chain);
        chain.shutdown().expect("join");
        assert_eq!(
            events
                .iter()
                .any(|e| e.step == Some(1) && e.status == Status::Ready),
            action == chain::Action::Continue
        );
    }
    for close in [
        policy::Close::Leave,
        policy::Close::Started,
        policy::Close::Ask,
    ] {
        let tree = Tree::new();
        let (mut document, mut profile, found) = process_fixture(&tree, 0);
        document.apps.last_mut().expect("app").args = vec![
            "/d".into(),
            "/c".into(),
            "for /l %i in (1,1,20000000) do @rem".into(),
        ];
        profile.policy = Some(policy::Policy {
            cancel: close,
            ..Default::default()
        });
        let shared = std::sync::Arc::new(std::sync::Mutex::new(processes::Processes::default()));
        let mut chain =
            Chain::start_with_processes(document, profile, found, shared.clone()).expect("chain");
        while chain
            .progress
            .recv_timeout(Duration::from_secs(5))
            .expect("launch")
            .status
            != Status::Launching
        {}
        chain.cancel();
        if close == policy::Close::Ask {
            loop {
                if let Some(decision) = chain
                    .progress
                    .recv_timeout(Duration::from_secs(5))
                    .expect("close decision")
                    .decision
                {
                    chain
                        .answer(decision.id, chain::Action::CloseStarted)
                        .expect("close answer");
                    break;
                }
            }
        }
        assert_eq!(
            collect(&chain).last().expect("cancelled").status,
            Status::Cancelled
        );
        chain.shutdown().expect("join");
        let mut registry = shared.lock().expect("registry");
        let owns = registry.has_profile("test").expect("state");
        registry.close_profile("test").expect("cleanup owned child");
        assert_eq!(owns, close == policy::Close::Leave);
    }
}

#[cfg(windows)]
#[test]
fn restart_requires_original_child_handle_and_transfers_ownership_to_new_child() {
    let tree = Tree::new();
    let (mut document, mut profile, found) = process_fixture(&tree, 0);
    let executable = document
        .apps
        .last()
        .expect("app")
        .executable
        .clone()
        .expect("exe");
    let args = ["/d", "/c", "for /l %i in (1,1,20000000) do @rem"];
    let mut external = std::process::Command::new(&executable)
        .args(args)
        .stdout(std::process::Stdio::null())
        .spawn()
        .expect("external");
    let mut registry = processes::Processes::default();
    assert!(registry.restart(&executable, &[external.id()]).is_err());
    external.kill().expect("cleanup");
    external.wait().expect("reap");
    let child = std::process::Command::new(&executable)
        .args(args)
        .stdout(std::process::Stdio::null())
        .spawn()
        .expect("owned");
    let old_pid = child.id();
    registry.record(
        "test",
        "custom:test",
        &fs::canonicalize(&executable).expect("identity"),
        child,
    );
    let shared = std::sync::Arc::new(std::sync::Mutex::new(registry));
    document.apps.last_mut().expect("app").args = args.iter().map(|v| (*v).into()).collect();
    profile.policy = Some(policy::Policy {
        already_running: policy::Running::Restart,
        cancel: policy::Close::Started,
        ..Default::default()
    });
    let mut chain = Chain::start_with_processes(document, profile, found, shared.clone())
        .expect("restart chain");
    let launched = loop {
        let event = chain
            .progress
            .recv_timeout(Duration::from_secs(5))
            .expect("launch");
        if event.status == Status::Launching {
            break event.pid.expect("new PID");
        }
    };
    chain.cancel();
    collect(&chain);
    chain.shutdown().expect("join");
    assert_ne!(old_pid, launched);
    assert!(
        !shared
            .lock()
            .expect("registry")
            .has_profile("test")
            .expect("closed")
    );
    assert!(
        discovery::running_all(&executable)
            .expect("Win32")
            .is_empty()
    );
}

#[cfg(windows)]
#[test]
fn chains_run_real_processes_and_report_nonzero_exit_and_spawn_failure() {
    for exit in [0, 7] {
        let tree = Tree::new();
        let (document, profile, found) = process_fixture(&tree, exit);
        let mut chain = Chain::start(document, profile, found).expect("cadena");
        let events = collect(&chain);
        chain.shutdown().expect("join");
        assert!(
            events
                .iter()
                .any(|event| event.status == Status::Launching && event.pid.is_some())
        );
        assert_eq!(events.last().expect("fin").success, exit == 0);
        if exit == 7 {
            assert!(
                events
                    .iter()
                    .any(|event| event.status == Status::Failed && event.message.contains('7'))
            );
        }
    }
    let tree = Tree::new();
    let (document, profile, found) = process_fixture(&tree, 0);
    fs::write(
        document
            .apps
            .last()
            .expect("app")
            .executable
            .as_ref()
            .expect("exe"),
        b"not a PE executable",
    )
    .expect("archivo inválido real");
    let chain = Chain::start(document, profile, found).expect("cadena");
    let events = collect(&chain);
    assert!(events.iter().any(|event| event.status == Status::Failed));
    assert!(!events.last().expect("fin").success);
}

#[cfg(windows)]
#[test]
fn cancellation_interrupts_delay_and_probe_without_starting_the_next_step() {
    for during_probe in [false, true] {
        let tree = Tree::new();
        let (mut document, mut profile, found) = process_fixture(&tree, 0);
        if during_probe {
            // Proceso real suficientemente largo para cancelar el sondeo; también termina solo.
            document.apps.last_mut().expect("app").args = vec![
                "/d".into(),
                "/c".into(),
                "for /l %i in (1,1,20000000) do @rem".into(),
            ];
        } else {
            profile.first_step_delay = 3600;
        }
        profile.steps.push(profile.steps[0].clone());
        let cleanup = ProcessCleanup(std::sync::Arc::new(std::sync::Mutex::new(
            processes::Processes::default(),
        )));
        let mut chain = Chain::start_with_processes(document, profile, found, cleanup.0.clone())
            .expect("cadena");
        let pending = chain
            .progress
            .recv_timeout(Duration::from_secs(5))
            .expect("pending");
        assert_eq!(pending.status, Status::Pending);
        let launched = if during_probe {
            Some(
                chain
                    .progress
                    .recv_timeout(Duration::from_secs(5))
                    .expect("launching"),
            )
        } else {
            None
        };
        let start = Instant::now();
        chain.cancel();
        let events = collect(&chain);
        chain.shutdown().expect("join cancelado");
        let elapsed = start.elapsed();
        if let Some(event) = launched {
            assert!(event.pid.is_some());
        }
        cleanup
            .0
            .lock()
            .expect("registry")
            .close_profile("test")
            .expect("cleanup by original child handle");
        assert!(elapsed < Duration::from_secs(1));
        assert!(!events.iter().any(|event| event.step == Some(1)));
        assert_eq!(events.last().expect("fin").status, Status::Cancelled);
        assert!(!events.last().expect("fin").success);
    }
}

#[cfg(windows)]
#[test]
fn continue_policy_executes_next_step_and_retry_budget_is_exact() {
    let tree = Tree::new();
    let (document, mut profile, found) = process_fixture(&tree, 5);
    profile.continue_on_error = true;
    profile.max_retries = 2;
    let mut next = profile.steps[0].clone();
    next.args_override = Some(vec!["/d".into(), "/c".into(), "exit 0".into()]);
    profile.steps.push(next);
    let chain = Chain::start(document, profile, found).expect("cadena");
    let events = collect(&chain);
    assert_eq!(
        events
            .iter()
            .filter(|event| event.step == Some(0) && event.status == Status::Launching)
            .count(),
        3
    );
    assert!(
        events
            .iter()
            .any(|event| event.step == Some(1) && event.status == Status::Ready)
    );
    assert!(!events.last().expect("fin").success);
}

#[cfg(windows)]
#[test]
fn stop_policy_does_not_execute_later_steps_and_vanished_executable_is_reported() {
    let tree = Tree::new();
    let (document, mut profile, found) = process_fixture(&tree, 5);
    let mut next = profile.steps[0].clone();
    next.args_override = Some(vec!["/d".into(), "/c".into(), "exit 0".into()]);
    profile.steps.push(next);
    let chain = Chain::start(document.clone(), profile.clone(), found).expect("cadena");
    let events = collect(&chain);
    assert!(!events.iter().any(|event| event.step == Some(1)));
    assert!(!events.last().expect("fin").success);
    let found = Discovery::scan(&document.apps, Sources::default());
    fs::remove_file(
        document
            .apps
            .last()
            .expect("app")
            .executable
            .as_ref()
            .expect("ruta"),
    )
    .expect("ejecutable desaparece tras discovery");
    let chain = Chain::start(document, profile, found).expect("cadena");
    let events = collect(&chain);
    assert!(!events.iter().any(|event| event.status == Status::Launching));
    assert!(events.iter().any(|event| event.status == Status::Failed));
}

#[cfg(windows)]
#[test]
fn reuse_observes_a_real_existing_process_and_does_not_spawn_another() {
    let tree = Tree::new();
    let (document, mut profile, found) = process_fixture(&tree, 7);
    let executable = document
        .apps
        .last()
        .expect("app")
        .executable
        .as_ref()
        .expect("ruta");
    let mut existing = std::process::Command::new(executable)
        .args(["/d", "/c", "for /l %i in (1,1,20000000) do @rem"])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .expect("proceso externo real creado por el test");
    let pid = existing.id();
    profile.reuse_running = true;
    let result = Chain::start(document, profile, found);
    let events = result.as_ref().map(collect);
    existing
        .kill()
        .expect("terminar solo el hijo propio del test");
    existing.wait().expect("recoger hijo propio");
    let events = events.expect("cadena");
    assert!(!events.iter().any(|event| event.status == Status::Launching));
    assert!(
        events
            .iter()
            .any(|event| event.status == Status::Ready && event.pid == Some(pid))
    );
    assert!(events.last().expect("fin").success);
}

#[cfg(windows)]
#[test]
fn win32_reads_actual_process_identity_and_registry_without_writing_them() {
    let executable = std::env::current_exe().expect("binario de tests");
    // Nextest ejecuta varios procesos del mismo binario: comprobar el nuestro entre todos.
    assert!(
        discovery::running_all(&executable)
            .expect("Win32")
            .contains(&std::process::id())
    );
    let sources = Sources::system();
    assert!(sources.steam_roots.iter().all(|path| path.is_absolute()));
}

#[test]
fn lmu_trigger_uses_rising_edges_and_can_be_disabled() {
    let mut trigger = LmuTrigger::default();
    assert!(!trigger.observe(true, false));
    assert!(trigger.observe(true, true));
    assert!(!trigger.observe(true, true));
    assert!(!trigger.observe(true, false));
    assert!(trigger.observe(true, true));
    assert!(!trigger.observe(false, true));
    assert!(trigger.observe(true, true));
}

#[cfg(windows)]
#[test]
fn network_paths_are_rejected_without_accessing_a_share() {
    for path in [r"\\server\share\app.exe", r"\\?\UNC\server\share\app.exe"] {
        assert!(!is_local_path(Path::new(path)));
        assert!(!is_executable(Path::new(path)));
        assert!(Store::load(PathBuf::from(path)).is_err());
    }
    assert!(is_local_path(Path::new(r"C:\rig\app.exe")));
    assert!(is_local_path(Path::new(r"\\?\C:\rig\app.exe")));
}

#[cfg(windows)]
#[test]
fn temporary_launch_does_not_consume_a_saved_profile_slot() {
    let tree = Tree::new();
    let (mut document, profile, found) = process_fixture(&tree, 0);
    document.profiles = (0..128)
        .map(|index| Profile::new(format!("saved:{index}"), format!("Perfil {index}")))
        .collect();
    document.lmu_trigger_profile = Some("saved:0".into());
    document.validate().expect("configuración llena válida");
    let chain =
        Chain::start(document, profile, found).expect("un lanzamiento no crea un perfil guardado");
    assert!(collect(&chain).last().expect("fin").success);
}

#[test]
fn discovery_prefers_the_root_executable_over_nested_copies() {
    let tree = Tree::new();
    tree.file("motec/a-child/app.exe", b"copia antigua");
    let primary = tree.file("motec/app.exe", b"ejecutable principal");
    let found = Discovery::scan(
        &Document::default().apps,
        Sources {
            known_paths: vec![("motec".into(), tree.0.join("motec"))],
            ..Sources::default()
        },
    );
    assert_eq!(found.app("motec").expect("MoTeC").executable, Some(primary));
}
