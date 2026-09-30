//! Escena ejecutable de variantes; usa el layout y el Overlay productivos.
//! Compilar con rustc contra los rlib de cargo test (ver VARIANTES.md).
use std::{error::Error, path::PathBuf, sync::Arc};
fn main() -> Result<(), Box<dyn Error>> {
    let mut args = std::env::args().skip(1);
    let layout = PathBuf::from(args.next().ok_or("falta layout.json")?);
    let scene = args.next().ok_or("falta snapshot.json")?;
    let json = std::fs::read_to_string(scene)?;
    let snapshots = vantare_ui::workshop::snapshots_from_json(&json)?;
    let (sender, receiver) = flume::unbounded();
    for snapshot in snapshots {
        sender.send(Arc::new(snapshot))?;
    }
    vantare_ui::run_layout(layout, receiver, Default::default())?;
    drop(sender);
    Ok(())
}
