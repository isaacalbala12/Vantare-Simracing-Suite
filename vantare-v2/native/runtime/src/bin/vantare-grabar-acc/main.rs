#[cfg(windows)]
mod implementation;

#[cfg(windows)]
fn main() -> std::process::ExitCode {
    vantare_services::diagnostics::install_panic_hook("vantare-grabar-acc");
    implementation::run_cli()
}

#[cfg(not(windows))]
fn main() {
    vantare_services::diagnostics::install_panic_hook("vantare-grabar-acc");
    eprintln!(
        "vantare-grabar-acc solo funciona en Windows: necesita la memoria compartida \
         y el broadcasting de ACC"
    );
    std::process::exit(1);
}
