#[cfg(windows)]
mod implementation;

use vantare_ipc::product;

#[cfg(windows)]
fn main() {
    if product::print_version() {
        return;
    }
    vantare_services::diagnostics::install_panic_hook("vantare-grabar-lmu");
    implementation::run_cli();
}

#[cfg(not(windows))]
fn main() {
    if product::print_version() {
        return;
    }
    vantare_services::diagnostics::install_panic_hook("vantare-grabar-lmu");
    eprintln!("la captura de LMU requiere Windows");
    std::process::exit(1);
}
