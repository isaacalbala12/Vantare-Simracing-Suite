use std::process::Command;

fn crate_root(path: &std::path::Path) -> &std::path::Path {
    path.ancestors()
        .find(|dir| dir.join("Cargo.toml").is_file())
        .expect("cada fuente debe pertenecer a un crate")
}

fn path_attributes(source: &str) -> Vec<&str> {
    source
        .split("#[")
        .skip(1)
        .filter_map(|attribute| {
            let attribute = attribute.split(']').next()?.trim();
            let value = attribute
                .strip_prefix("path")?
                .trim()
                .strip_prefix('=')?
                .trim();
            value.strip_prefix('"')?.split('"').next()
        })
        .collect()
}

#[test]
fn path_attribute_reader_handles_spacing_and_multiline_attributes() {
    assert_eq!(
        path_attributes("#[path=\"../one.rs\"]\n#[path \n = \"two.rs\"]\n#[cfg(test)]"),
        ["../one.rs", "two.rs"]
    );
}

#[test]
fn crate_boundaries_include_build_scripts_tests_and_vendor() {
    let native = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .canonicalize()
        .expect("workspace nativo");
    let hub = native.join("hub/src/lib.rs");
    assert_eq!(crate_root(&hub), crate_root(&native.join("hub/build.rs")));
    assert_eq!(
        crate_root(&hub),
        crate_root(&native.join("hub/tests/architecture.rs"))
    );
    for other in [
        "launcher/src/lib.rs",
        "ipc/src/lib.rs",
        "vendor/gpui_windows/src/gpui_windows.rs",
    ] {
        assert_ne!(crate_root(&hub), crate_root(&native.join(other)));
    }
}

#[test]
fn native_path_attributes_never_cross_crate_boundaries() {
    fn visit(directory: &std::path::Path) {
        for entry in std::fs::read_dir(directory).expect("directorio nativo") {
            let path = entry.expect("entrada nativa").path();
            if path.is_dir() {
                if !matches!(
                    path.file_name().and_then(|name| name.to_str()),
                    Some("target" | ".git")
                ) {
                    visit(&path);
                }
            } else if path.extension().is_some_and(|extension| extension == "rs") {
                let source = std::fs::read_to_string(&path).expect("fuente Rust");
                for relative in path_attributes(&source) {
                    let target = path
                        .parent()
                        .expect("directorio fuente")
                        .join(relative)
                        .canonicalize()
                        .expect("módulo referenciado existente");
                    assert_eq!(
                        crate_root(&path),
                        crate_root(&target),
                        "{} importa {} mediante #[path]; usar una dependencia de Cargo",
                        path.display(),
                        target.display()
                    );
                }
            }
        }
    }
    let native = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .canonicalize()
        .expect("workspace nativo");
    visit(&native);
}

#[test]
fn profiling_consumers_use_distinct_stage_names() {
    fn stages(directory: &std::path::Path, found: &mut std::collections::BTreeSet<String>) {
        for entry in std::fs::read_dir(directory).expect("consumidor de profiling") {
            let path = entry.expect("fuente de profiling").path();
            if path.is_dir() {
                stages(&path, found);
            } else if path.extension().is_some_and(|extension| extension == "rs") {
                let source = std::fs::read_to_string(path).expect("fuente Rust");
                for stage in source.split("profiling::Stage::").skip(1) {
                    found.insert(
                        stage
                            .chars()
                            .take_while(char::is_ascii_alphanumeric)
                            .collect(),
                    );
                }
            }
        }
    }
    let native = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let mut owners = std::collections::BTreeMap::new();
    for consumer in ["runtime", "ipc", "ui", "vendor/gpui_windows"] {
        let mut found = std::collections::BTreeSet::new();
        stages(&native.join(consumer).join("src"), &mut found);
        assert!(
            !found.is_empty(),
            "{consumer} debe mantener instrumentación"
        );
        for stage in found {
            assert!(
                owners.insert(stage.clone(), consumer).is_none(),
                "etapa {stage} compartida por consumidores: usar un nombre distinto"
            );
        }
    }
}

#[test]
fn hub_reuses_ui_without_acquiring_runtime_or_services() {
    let output = Command::new(env!("CARGO"))
        .args([
            "tree",
            "--offline",
            "-p",
            "vantare-hub",
            "--prefix",
            "none",
            "--edges",
            "normal",
        ])
        .output()
        .expect("cargo tree");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let tree = String::from_utf8_lossy(&output.stdout);
    assert!(tree.lines().any(|line| line.starts_with("vantare-ui ")));
    assert!(
        !tree
            .lines()
            .any(|line| line.starts_with("vantare-runtime "))
    );
}

#[test]
fn every_current_hub_section_has_an_honest_entry_point() {
    use vantare_hub::Section;
    assert_eq!(Section::ALL.len(), 14);
    for (index, section) in Section::ALL.iter().enumerate() {
        assert!(!section.label().is_empty());
        assert!(!section.subtitle().is_empty());
        assert!(!Section::ALL[..index].contains(section));
    }
}

#[test]
fn invalid_cli_arguments_fail_before_opening_a_window() {
    let output = Command::new(env!("CARGO_BIN_EXE_vantare-hub"))
        .arg("--unknown")
        .output()
        .expect("arrancar proceso Hub");
    assert_eq!(output.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&output.stderr).contains("uso:"));
}

#[test]
fn version_cli_uses_the_shared_product_identity_without_opening_a_window() {
    let output = Command::new(env!("CARGO_BIN_EXE_vantare-hub"))
        .arg("--version")
        .output()
        .expect("consultar versión Hub");
    assert!(output.status.success());
    assert_eq!(
        String::from_utf8(output.stdout)
            .expect("versión UTF-8")
            .trim(),
        format!(
            "Vantare Native {} ({})",
            vantare_ipc::product::VERSION,
            vantare_ipc::product::CHANNEL
        )
    );
    assert!(output.stderr.is_empty());
}

#[test]
fn a_missing_scene_fails_without_creating_or_overwriting_user_data() {
    let path = std::env::temp_dir().join(format!("vantare-hub-preflight-{}", std::process::id()));
    assert!(!path.exists());
    let output = Command::new(env!("CARGO_BIN_EXE_vantare-hub"))
        .args(["--workshop", "--data-dir"])
        .arg(&path)
        .arg("--layout")
        .arg(path.join("layout.json"))
        .args(["--scene", "missing.snapshot.json"])
        .output()
        .expect("arrancar Hub");
    assert_eq!(output.status.code(), Some(1));
    assert!(!path.exists());
}

#[test]
fn corrupt_common_layout_fails_before_window_without_replacing_it() {
    let path = std::env::temp_dir().join(format!(
        "vantare-hub-layout-preflight-{}",
        std::process::id()
    ));
    std::fs::create_dir(&path).expect("temporal exclusivo");
    let layout = path.join("layout.json");
    std::fs::write(&layout, b"{").expect("layout inválido");
    let output = Command::new(env!("CARGO_BIN_EXE_vantare-hub"))
        .args(["--studio", "--data-dir"])
        .arg(&path)
        .arg("--layout")
        .arg(&layout)
        .output()
        .expect("arrancar Hub");
    assert_eq!(output.status.code(), Some(1));
    assert_eq!(std::fs::read(&layout).expect("documento preservado"), b"{");
    assert!(!path.join("workshop-selection.json").exists());
    std::fs::remove_file(layout).expect("limpiar archivo propio");
    std::fs::remove_dir(path).expect("limpiar directorio propio");
}

#[cfg(windows)]
#[test]
fn clean_packaged_generation_loads_widgets_and_saves_without_conflict() {
    let root =
        std::env::temp_dir().join(format!("vantare-studio-installed-{}", std::process::id()));
    assert!(!root.exists());
    let data = root.join("generations/clean/data");
    let output = Command::new(std::env::current_exe().expect("binario de regresión"))
        .args(["--exact", "installed_layout_bootstrap_child", "--nocapture"])
        .env("VANTARE_NATIVE_DATA_ROOT", &data)
        .env("VANTARE_STUDIO_INSTALLED_TEST", &data)
        .output()
        .expect("arranque aislado sin modificar el entorno de otros tests");
    let result = output.status.success();
    let created = data.join("Vantare/native/layout.json").is_file();
    if root.exists() {
        std::fs::remove_dir_all(root).expect("limpiar generación propia");
    }
    assert!(
        result,
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(
        created,
        "el proceso hijo debe crear el layout; no puede pasar sin ejecutar la regresión"
    );
}

#[cfg(windows)]
#[test]
fn installed_layout_bootstrap_child() {
    use vantare_hub::document::Editor;
    use vantare_ui::layout::Document;
    let Some(data) = std::env::var_os("VANTARE_STUDIO_INSTALLED_TEST") else {
        return;
    };
    let expected = std::path::PathBuf::from(data).join("Vantare/native/layout.json");
    let path = vantare_ui::layout::default_path().expect("ruta empaquetada común");
    assert_eq!(path, expected);
    let monitor = (0.0, 0.0, 1920.0, 1080.0);
    // Reproduce el orden real: Prepared abre Studio antes del primer frame de overlays.
    let mut studio = Editor::open(path.clone()).expect("Studio preparado en instalación limpia");
    let mut overlays = Document::open(path.clone()).expect("overlays preparados");
    overlays
        .initialize(monitor)
        .expect("overlays crean el layout");
    studio
        .initialize(monitor)
        .expect("Studio adopta el documento inicial");
    assert_eq!(studio.layout().instances.len(), 4);
    assert_eq!(studio.layout(), overlays.layout());
    studio.selected = Some("standings".into());
    studio
        .edit_selected(|item| item.x += 25.0)
        .expect("guardar sin conflicto");
    assert!(overlays.poll().expect("mostrar cambio en pista"));
    assert_eq!(overlays.layout(), studio.layout());
    studio
        .add(vantare_ui::Kind::Radar)
        .expect("añadir en instalación limpia");
    let reopened = Editor::open(path).expect("reiniciar Studio");
    assert_eq!(reopened.layout(), studio.layout());
    assert_eq!(reopened.layout().instances.len(), 5);
}
