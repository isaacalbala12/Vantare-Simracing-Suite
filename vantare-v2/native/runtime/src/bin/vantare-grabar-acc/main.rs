#[cfg(windows)]
mod implementation;

#[path = "../../../../packaging/version.rs"]
mod product;

#[cfg(windows)]
fn main() -> std::process::ExitCode {
    if product::print_version() {
        return std::process::ExitCode::SUCCESS;
    }
    implementation::run_cli()
}

#[cfg(not(windows))]
fn main() {
    if product::print_version() {
        return;
    }
    eprintln!(
        "vantare-grabar-acc solo funciona en Windows: necesita la memoria compartida \
         y el broadcasting de ACC"
    );
    std::process::exit(1);
}
