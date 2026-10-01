#[cfg(windows)]
mod implementation;

#[cfg(windows)]
fn main() {
    implementation::run_cli();
}

#[cfg(not(windows))]
fn main() {
    eprintln!("la captura de LMU requiere Windows");
    std::process::exit(1);
}
