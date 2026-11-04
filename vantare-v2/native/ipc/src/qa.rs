//! Deliberately absent from distribution. No credentials or authority decisions.
use serde::Deserialize;
use std::{
    env, io,
    path::PathBuf,
    sync::OnceLock,
    time::{Duration, Instant},
};

pub const MARKER: &str = "VANTARE_QA_E2E_NOT_FOR_DISTRIBUTION_1916";
const OWNER: &[u8] = b"VANTA-126 qa-e2e fixture";
struct Settings {
    root: PathBuf,
    clock: PathBuf,
}
static SETTINGS: OnceLock<Settings> = OnceLock::new();

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Tick {
    pub wall_ms: u64,
    pub real_anchor_ms: u64,
    pub monotonic_ms: u64,
    pub phase: String,
    pub session: u64,
}
fn invalid() -> io::Error {
    io::Error::other("invalid isolated qa-e2e configuration")
}
fn settings() -> &'static Settings {
    SETTINGS.get().expect("qa-e2e startup validation required")
}
pub fn startup() -> io::Result<bool> {
    if env::args().nth(1).as_deref() == Some("--qa-e2e-probe") {
        println!("{MARKER}");
        return Ok(true);
    }
    let root = PathBuf::from(env::var_os("VANTARE_QA_ROOT").ok_or_else(invalid)?);
    if !root.is_absolute() {
        return Err(invalid());
    }
    let root = root.canonicalize()?;
    #[cfg(windows)]
    if !root.starts_with(PathBuf::from("D:/VantareServer/qa/licencias-e2e").canonicalize()?) {
        return Err(invalid());
    }
    if std::fs::read(root.join("qa-e2e-owned"))? != OWNER {
        return Err(invalid());
    }
    for (key, name) in [
        ("VANTARE_NATIVE_DATA_ROOT", "native"),
        ("LOCALAPPDATA", "local"),
        ("APPDATA", "roaming"),
    ] {
        let value = PathBuf::from(env::var_os(key).ok_or_else(invalid)?).canonicalize()?;
        if !value.starts_with(&root) || value != root.join(name).canonicalize()? {
            return Err(invalid());
        }
    }
    let clock =
        PathBuf::from(env::var_os("VANTARE_QA_CLOCK").ok_or_else(invalid)?).canonicalize()?;
    if !clock.starts_with(&root) {
        return Err(invalid());
    }
    SETTINGS
        .set(Settings { root, clock })
        .map_err(|_| invalid())?;
    let _ = tick()?;
    Ok(false)
}
pub fn root() -> &'static std::path::Path {
    &settings().root
}
pub fn tick() -> io::Result<Tick> {
    let bytes = std::fs::read(&settings().clock)?;
    if bytes.len() > 4096 {
        return Err(invalid());
    }
    let mut tick: Tick = serde_json::from_slice(&bytes).map_err(|_| invalid())?;
    if !(1..=253_402_300_799_000).contains(&tick.wall_ms)
        || tick.monotonic_ms > 3650 * 86_400_000
        || !matches!(tick.phase.as_str(), "Live" | "Paused" | "Stale" | "Waiting")
    {
        return Err(invalid());
    }
    let real = u64::try_from(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| invalid())?
            .as_millis(),
    )
    .map_err(|_| invalid())?;
    tick.wall_ms = tick
        .wall_ms
        .checked_add(real.checked_sub(tick.real_anchor_ms).ok_or_else(invalid)?)
        .ok_or_else(invalid)?;
    Ok(tick)
}
pub fn instant() -> Instant {
    Instant::now() + Duration::from_millis(tick().expect("qa-e2e clock unavailable").monotonic_ms)
}
pub fn wall_ms() -> io::Result<u64> {
    Ok(tick()?.wall_ms)
}
