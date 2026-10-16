//! Host QA de #1630 reutilizado en #1638, fuera de distribución. Feed,
//! demanda/layout y pintores productivos, sin sesión ni derechos UI reales.

#[cfg(all(windows, feature = "paint-stats"))]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let [layout_flag, path, source_flag, source] = args.as_slice() else {
        return Err("uso: telemetry_live --layout layout.json --fuente pipe:nombre".into());
    };
    if layout_flag != "--layout" || source_flag != "--fuente" {
        return Err("se requiere layout explícito y pipe live aislado".into());
    }
    let pipe = source
        .strip_prefix("pipe:")
        .filter(|name| !name.is_empty())
        .ok_or("se requiere pipe explícito")?;
    if std::env::var_os("VANTARE_NATIVE_DATA_ROOT").is_none() {
        return Err("se requiere VANTARE_NATIVE_DATA_ROOT aislado".into());
    }
    let path = std::path::PathBuf::from(path);
    let document = vantare_ui::layout::Document::open(path.clone())?;
    let demand = vantare_ui::source::DemandHandle::new(document.layout().demand());
    let photos = vantare_ui::source::layout_feed(pipe, demand.clone())?;
    vantare_ui::run_layout_requested(path, photos, None, demand)?;
    Ok(())
}

#[cfg(not(all(windows, feature = "paint-stats")))]
fn main() -> std::process::ExitCode {
    eprintln!("telemetry_live es QA Windows; requiere paint-stats");
    std::process::ExitCode::FAILURE
}
