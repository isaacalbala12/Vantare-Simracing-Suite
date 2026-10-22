// Identidad de producto fijada al compilar, compartida por todos los binarios.
use std::io::Write;
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
        let _written = writeln!(std::io::stdout(), "Vantare Native {VERSION} ({CHANNEL})");
        true
    } else {
        false
    }
}

/// Contrato Win32 compartido por el indicador y el Hub; PS se verifica en test.
pub const STARTUP_CLASS: &str = "VantareStartupIndicator";
pub const STARTUP_READY: u32 = 0x8069;
pub const STARTUP_MAINTENANCE: u32 = 0x806a;

#[cfg(test)]
mod startup_contract_tests {
    #[test]
    fn root_engine_uses_the_same_indicator_identity_and_message() {
        let script = include_str!("../../packaging/beta.ps1");
        assert!(script.contains(&format!(
            "const string Class = \"{}\";",
            super::STARTUP_CLASS
        )));
        assert!(script.contains(&format!(
            "const uint Maintenance = 0x{:x};",
            super::STARTUP_MAINTENANCE
        )));
    }
}
