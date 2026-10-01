#[cfg(windows)]
mod implementation;

#[cfg(windows)]
fn main() -> std::process::ExitCode {
    implementation::run_cli()
}

#[cfg(not(windows))]
fn main() {
    eprintln!(
        "vantare-grabar-acc solo funciona en Windows: necesita la memoria compartida \
         y el broadcasting de ACC"
    );
    std::process::exit(1);
}
