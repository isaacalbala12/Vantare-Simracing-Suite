use super::*;
use chain::{Chain, Status};
use discovery::{Discovery, Sources};
use std::{
    fs,
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, Instant},
};

static NEXT: AtomicU64 = AtomicU64::new(0);

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
    tree.file("launcher.json.lock", b"lock ajeno");
    assert!(Store::load_with_wails(path.clone(), Some(&source)).is_err());
    assert!(!path.exists());
    fs::remove_file(tree.0.join("launcher.json.lock")).expect("retirar lock propio");
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

#[test]
fn launcher_demo_loads_wails_catalog_without_machine_discovery_or_launch_paths() {
    let demo = crate::demo::DemoData::load().expect("fixture Wails");
    let store =
        Store::demo(PathBuf::from("capture-only-launcher.json"), &demo).expect("store demo");
    let discovery = Discovery::demo(&demo);

    assert_eq!(store.document.apps.len(), 7);
    assert_eq!(store.document.profiles.len(), 2);
    assert_eq!(store.document.profiles[0].name, "Creador de Contenido");
    assert!(
        !store
            .document
            .apps
            .iter()
            .any(|app| app.executable.is_some())
    );
    assert!(discovery.warnings.is_empty());
    assert!(
        discovery
            .apps
            .iter()
            .all(|app| !app.availability.launchable)
    );
    assert!(discovery.app("lmu").is_some_and(|app| {
        app.availability.found && app.availability.installed && !app.availability.launchable
    }));
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
        policy::Close::CloseStarted,
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
        cancel: policy::Close::CloseStarted,
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
        let mut chain = Chain::start(document, profile, found).expect("cadena");
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
        // Limpiar el PID que acaba de lanzar este test antes de cualquier assert posterior.
        if let Some(event) = launched {
            let pid = event.pid.expect("pid real");
            let status = std::process::Command::new("taskkill.exe")
                .args(["/PID", &pid.to_string(), "/F"])
                .output()
                .expect("limpiar proceso creado por test");
            assert!(
                status.status.success(),
                "{}",
                String::from_utf8_lossy(&status.stderr)
            );
        }
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
