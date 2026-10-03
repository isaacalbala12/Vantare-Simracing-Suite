#[cfg(windows)]
mod implementation;

#[cfg(windows)]
fn main() {
    vantare_services::diagnostics::install_panic_hook("vantare-grabar-lmu");
    implementation::run_cli();
}

#[cfg(not(windows))]
fn main() {
    vantare_services::diagnostics::install_panic_hook("vantare-grabar-lmu");
    eprintln!("la captura de LMU requiere Windows");
    std::process::exit(1);
}
