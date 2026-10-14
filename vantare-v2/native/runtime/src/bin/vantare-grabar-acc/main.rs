#[cfg(windows)]
mod implementation;

use vantare_ipc::product;

#[test]
fn windows_implementation_has_no_unreachable_unix_entrypoint() {
    let source = include_str!("implementation.rs").replace('\r', "");
    assert!(!source.contains("#[cfg(not(windows))]\nfn main()"));
}

#[cfg(windows)]
fn main() -> std::process::ExitCode {
    if product::print_version() {
        return std::process::ExitCode::SUCCESS;
    }
    vantare_services::diagnostics::install_panic_hook("vantare-grabar-acc");
    implementation::run_cli()
}

#[cfg(not(windows))]
fn main() {
    if product::print_version() {
        return;
    }
    vantare_services::diagnostics::install_panic_hook("vantare-grabar-acc");
    eprintln!(
        "vantare-grabar-acc solo funciona en Windows: necesita la memoria compartida \
         y el broadcasting de ACC"
    );
    std::process::exit(1);
}
