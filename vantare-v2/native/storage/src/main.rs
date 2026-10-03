use std::io;
#[path = "../../packaging/version.rs"]
mod product;

use std::path::PathBuf;

fn main() {
    if product::print_version() {
        return;
    }
    vantare_services::diagnostics::install_panic_hook("vantare-storage");
    if let Err(error) = execute() {
        eprintln!("almacenamiento: {error}");
        std::process::exit(1);
    }
}

fn execute() -> vantare_storage::Result<()> {
    let mut args = std::env::args_os().skip(1);
    let path = PathBuf::from(args.next().ok_or("falta ruta de DB")?);
    let mode = args.next();
    let read_only = mode.as_deref() == Some(std::ffi::OsStr::new("--read-only"));
    if (mode.is_some() && !read_only) || args.next().is_some() {
        return Err("uso: vantare-storage <DB> [--read-only]".into());
    }
    vantare_storage::serve(&path, read_only, io::stdin().lock(), io::stdout().lock())
}
