use super::*;

#[test]
fn launcher_demo_loads_wails_catalog_without_machine_discovery_or_launch_paths() {
    let demo = crate::demo::DemoData::load().expect("fixture Wails");
    let store = demo_store(PathBuf::from("capture-only-launcher.json"), &demo).expect("store demo");
    let discovery = crate::launcher::demo_discovery(&demo);

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
