//! Grabadora autónoma: no abre Vantare, no escribe en LMU, no necesita Python.
#[cfg(windows)]
mod windows;

fn main() {
    #[cfg(windows)]
    if let Err(error) = windows::run() {
        eprintln!("ERROR: {error}");
        std::process::exit(1);
    }
    #[cfg(not(windows))]
    {
        eprintln!("La grabación requiere Windows");
        std::process::exit(1);
    }
}
