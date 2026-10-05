//! Opt-in, local timings. Never log request bodies, identities or credentials.
use std::{
    fs::OpenOptions,
    io::Write,
    time::{SystemTime, UNIX_EPOCH},
};

pub(crate) fn render_enabled() -> bool {
    std::env::var("RUST_LOG").is_ok_and(|value| value.contains("vantare_admin=trace"))
}

pub(crate) fn record(event: &str, elapsed_us: u128, outcome: &str) {
    if std::env::var_os("RUST_LOG").is_none() {
        return;
    }
    let Ok(root) = vantare_services::app::default_root() else {
        return;
    };
    let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(root.join("admin-timings.log"))
    else {
        return;
    };
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |t| t.as_secs());
    // Best effort diagnostics: logging failure must never interrupt administration.
    let _ = writeln!(
        file,
        "{stamp} event={event} elapsed_us={elapsed_us} outcome={outcome}"
    );
}
