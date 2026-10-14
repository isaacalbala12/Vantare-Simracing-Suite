//! Captura reproducible de un layout y una secuencia; solo herramientas de QA.
#[cfg(feature = "parity-capture")]
fn main() -> std::process::ExitCode {
    let result = (|| -> Result<_, Box<dyn std::error::Error>> {
        let args: Vec<_> = std::env::args().skip(1).collect();
        if args.len() != 3 {
            return Err("uso: looks layout.json fotos.json medicion.json".into());
        }
        let layout = vantare_ui::layout::Layout::from_json(&std::fs::read(&args[0])?)?;
        let instance = layout.instances.first().ok_or("layout vacío")?;
        let snapshots =
            vantare_ui::workshop::snapshots_from_json(&std::fs::read_to_string(&args[1])?)?;
        Ok(vantare_ui::benchmark::run(
            instance.settings.clone(),
            layout.preferences,
            snapshots,
            (&args[2]).into(),
        ))
    })();
    match result {
        Ok(code) => code,
        Err(error) => {
            eprintln!("{error}");
            std::process::ExitCode::FAILURE
        }
    }
}
#[cfg(not(feature = "parity-capture"))]
fn main() {
    eprintln!("requiere parity-capture");
}
