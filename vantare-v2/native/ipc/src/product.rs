// Identidad de producto fijada al compilar, compartida por todos los binarios.
pub const VERSION: &str = match option_env!("VANTARE_VERSION") {
    Some(value) => value,
    None => env!("CARGO_PKG_VERSION"),
};
pub const CHANNEL: &str = match option_env!("VANTARE_BUILD_CHANNEL") {
    Some(value) => value,
    None => "development",
};
pub fn print_version() -> bool {
    if std::env::args().nth(1).as_deref() == Some("--version") {
        println!("Vantare Native {VERSION} ({CHANNEL})");
        true
    } else {
        false
    }
}
