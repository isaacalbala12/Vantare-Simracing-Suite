#[cfg(windows)]
mod implementation;

#[path = "../../../../packaging/version.rs"]
mod product;

#[cfg(windows)]
fn main() {
    if product::print_version() {
        return;
    }
    implementation::run_cli();
}

#[cfg(not(windows))]
fn main() {
    if product::print_version() {
        return;
    }
    eprintln!("la captura de LMU requiere Windows");
    std::process::exit(1);
}
