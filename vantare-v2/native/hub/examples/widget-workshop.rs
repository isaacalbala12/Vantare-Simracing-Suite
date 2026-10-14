//! Banco local del Workshop real del Hub; ejemplo de QA, fuera del binario instalado.
//! No conecta servicios reales ni modifica derechos de producto.
use std::{fs, path::PathBuf};
use vantare_hub::{
    Section,
    demo::{CaptureState, DemoData},
    shell::{self, Options, navigation::Access},
};

fn main() -> Result<(), String> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let [directory, kind, frame] = args.as_slice() else {
        return Err("uso: widget-workshop DIRECTORIO-AISLADO WIDGET FOTO".into());
    };
    let kind: vantare_ui::Kind = kind.parse().map_err(|()| "widget desconocido")?;
    let root = PathBuf::from(directory);
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let fixtures = vantare_hub::scene::fixtures_root().ok_or("faltan fixtures")?;
    let approved = fixtures.join(format!("{}-design-system.sequence.json", kind.name()));
    let scene = if approved.is_file() {
        approved
    } else {
        fixtures.join(format!("{}.snapshot.json", kind.name()))
    };
    let frame: usize = frame.parse().map_err(|_| "foto inválida")?;
    let selection = serde_json::json!({"version":1,"widget":kind.name(),"scene":scene,"frame":frame,"looping":false,"comparison":"hidden","background":1});
    fs::write(root.join("workshop-selection.json"), selection.to_string())
        .map_err(|e| e.to_string())?;
    let capture = CaptureState::parse("workshop-base")?;
    shell::run_with_access(
        Options {
            controlled: false,
            data_dir: root.clone(),
            scene: None,
            layout: root.join("layout.json"),
            engineer: root.join("engineer.json"),
            section: Section::Workshop,
            pipe: Some("isa1629-demo-no-producer".into()),
            recordings: None,
            launcher_file: root.join("launcher.json"),
            demo: Some(DemoData::load()?),
            capture: Some(capture),
            capture_output: None,
            capture_appearance: None,
            capture_size: Some((
                if kind == vantare_ui::Kind::BroadcastTower {
                    1800
                } else {
                    1440
                },
                900,
            )),
            capture_zoom: Some(100),
        },
        Access {
            catalog: vantare_ipc::control::CatalogAccess::Pro,
            verified: true,
            engineer: true,
            strategy: true,
            analysis: true,
            calendar: true,
            tester: true,
            ..Default::default()
        },
    )
}
