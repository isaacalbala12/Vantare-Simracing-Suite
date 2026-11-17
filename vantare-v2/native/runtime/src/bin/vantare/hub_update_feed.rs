//! Hub-only signed feed. Legacy `update_feed.rs` and installed clients are unchanged.
use serde::{Deserialize, Serialize};
use sha2::Digest;
use std::{
    fs,
    io::{self, Read, Write},
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
use vantare_installer::engine::{Manifest, hash_file, validation::version, write_fs as disk};
const REPO: &str = "isaacalbala12/Vantare-Downloads";
const ZIP_LIMIT: u64 = 256 * 1024 * 1024;
const EXPANDED_LIMIT: u64 = 768 * 1024 * 1024;
const QUERY_TIMEOUT: Duration = Duration::from_secs(30);
const PACKAGE_TIMEOUT: Duration = Duration::from_mins(5);
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Offer {
    pub schema: u32,
    pub product: String,
    pub channel: String,
    pub version: String,
    pub url: String,
    pub sha256: String,
    pub notes: String,
    pub compressed_bytes: u64,
    pub expanded_bytes: u64,
}
pub struct Downloaded {
    pub signed: Vec<u8>,
    pub offer: Offer,
}
#[derive(Deserialize)]
struct Release {
    draft: bool,
    tag_name: String,
}
fn failure(message: impl std::fmt::Display) -> io::Error {
    io::Error::other(message.to_string())
}
impl Offer {
    pub fn verify(signed: &[u8]) -> io::Result<Self> {
        let payload =
            vantare_services::update_manifest::verify_hub_update(signed).map_err(failure)?;
        let value: Self = serde_json::from_slice(&payload).map_err(failure)?;
        value.validate()?;
        Ok(value)
    }
    fn validate(&self) -> io::Result<()> {
        let expected = format!(
            "https://github.com/{REPO}/releases/download/hub-beta-v{}/vantare-native-amd64-package.zip",
            self.version
        );
        if self.schema != 2
            || self.product != "vantare-hub"
            || self.channel != "beta"
            || self.url != expected
            || version(&self.version).is_err()
            || !vantare_installer::engine::validation::hex(&self.sha256, 64)
            || self.notes.len() > 8192
            || self.compressed_bytes == 0
            || self.expanded_bytes == 0
        {
            return Err(failure("Oferta Hub firmada incompatible"));
        }
        if self.compressed_bytes > ZIP_LIMIT || self.expanded_bytes > EXPANDED_LIMIT {
            return Err(io::Error::new(
                io::ErrorKind::FileTooLarge,
                "Requiere Setup nuevo: paquete Hub fuera de los límites",
            ));
        }
        Ok(())
    }
    pub fn verify_expanded(&self, directory: &Path, manifest: &Manifest) -> io::Result<()> {
        let initial = fs::metadata(directory.join("manifest.json"))?.len();
        let actual = manifest.files.iter().try_fold(initial, |total, file| {
            total
                .checked_add(file.size)
                .ok_or_else(|| failure("Tamaño expandido fuera de rango"))
        })?;
        if actual != self.expanded_bytes {
            return Err(failure("Tamaño expandido distinto del firmado"));
        }
        Ok(())
    }
    pub fn verify_archive_length(&self, path: &Path) -> io::Result<()> {
        disk::path(path).map_err(failure)?;
        if fs::metadata(path)?.len() != self.compressed_bytes {
            return Err(failure("Longitud ZIP distinta de la firmada"));
        }
        Ok(())
    }
}
fn agent(timeout: Duration) -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(timeout))
        .max_redirects(3)
        .build()
        .into()
}
fn get(agent: &ureq::Agent, url: &str, limit: u64) -> io::Result<Vec<u8>> {
    let mut response = agent
        .get(url)
        .header("User-Agent", "Vantare-Hub-Beta")
        .call()
        .map_err(failure)?;
    if response.status().as_u16() != 200 {
        return Err(failure("Feed HTTP no disponible"));
    }
    response
        .body_mut()
        .with_config()
        .limit(limit)
        .read_to_vec()
        .map_err(failure)
}
pub fn check(
    current: &str,
    staging: &Path,
    cancelled: &AtomicBool,
    rejected: Option<&str>,
) -> io::Result<Option<Downloaded>> {
    let query = agent(QUERY_TIMEOUT);
    check_with(
        current,
        staging,
        cancelled,
        rejected,
        |url, limit| get(&query, url, limit),
        |offer, target, cancel| download(&agent(PACKAGE_TIMEOUT), offer, target, cancel),
    )
}
// Inject only the two I/O boundaries for CPU tests; no runtime endpoint/key override.
fn check_with(
    current: &str,
    staging: &Path,
    cancelled: &AtomicBool,
    rejected: Option<&str>,
    query: impl Fn(&str, u64) -> io::Result<Vec<u8>>,
    fetch: impl Fn(&Offer, &Path, &AtomicBool) -> io::Result<()>,
) -> io::Result<Option<Downloaded>> {
    let current = version(current).map_err(failure)?;
    disk::path(staging).map_err(failure)?;
    if cancelled.load(Ordering::Acquire) {
        return Ok(None);
    }
    let releases: Vec<Release> = serde_json::from_slice(&query(
        &format!("https://api.github.com/repos/{REPO}/releases?per_page=100"),
        512 * 1024,
    )?)
    .map_err(failure)?;
    let mut candidates: Vec<_> = releases
        .into_iter()
        .filter_map(|release| eligible(&release, current, rejected).map(|parsed| (parsed, release)))
        .collect();
    candidates.sort_by_key(|candidate| std::cmp::Reverse(candidate.0));
    for (_, release) in candidates {
        if cancelled.load(Ordering::Acquire) {
            return Ok(None);
        }
        let url = format!(
            "https://github.com/{REPO}/releases/download/{}/vantare-hub-beta.json",
            release.tag_name
        );
        let Ok(signed) = query(&url, 65536) else {
            continue;
        };
        let offer = match Offer::verify(&signed) {
            Ok(value) => value,
            Err(error) if error.kind() == io::ErrorKind::FileTooLarge => return Err(error),
            Err(_) => continue,
        };
        if !tag_matches(&release.tag_name, &offer) {
            continue;
        }
        // All authenticated preflight checks precede directory creation and ZIP GET.
        fs::create_dir_all(staging)?;
        let target = staging.join(format!("{}.zip", offer.sha256));
        if cached(&target, &offer)? {
            return Ok(Some(Downloaded { signed, offer }));
        }
        let temporary = staging.join(format!("{}.download", offer.sha256));
        disk::path(&temporary).map_err(failure)?;
        if let Err(error) = fs::remove_file(&temporary)
            && error.kind() != io::ErrorKind::NotFound
        {
            return Err(error);
        }
        let result = fetch(&offer, &temporary, cancelled);
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result?;
        offer.verify_archive_length(&temporary)?;
        fs::rename(temporary, target)?;
        return Ok(Some(Downloaded { signed, offer }));
    }
    Ok(None)
}
fn eligible(release: &Release, current: [u16; 3], rejected: Option<&str>) -> Option<[u16; 3]> {
    let tag = release.tag_name.strip_prefix("hub-beta-v")?;
    let parsed = version(tag).ok()?;
    (parsed > current && !release.draft && Some(tag) != rejected).then_some(parsed)
}
fn tag_matches(tag: &str, offer: &Offer) -> bool {
    tag == format!("hub-beta-v{}", offer.version)
}
fn cached(path: &Path, offer: &Offer) -> io::Result<bool> {
    if !path.try_exists()? {
        return Ok(false);
    }
    disk::path(path).map_err(failure)?;
    if offer.verify_archive_length(path).is_ok()
        && hash_file(path).map_err(failure)? == offer.sha256
    {
        return Ok(true);
    }
    fs::remove_file(path)?;
    Ok(false)
}
fn download(
    agent: &ureq::Agent,
    offer: &Offer,
    target: &Path,
    cancelled: &AtomicBool,
) -> io::Result<()> {
    // Only the authenticated/preflighted offer reaches this I/O boundary.
    let mut response = agent
        .get(&offer.url)
        .header("User-Agent", "Vantare-Hub-Beta")
        .call()
        .map_err(failure)?;
    if response.status().as_u16() != 200 {
        return Err(failure("Paquete HTTP no disponible"));
    }
    let mut input = response
        .body_mut()
        .with_config()
        .limit(offer.compressed_bytes + 1)
        .reader();
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)?;
    let mut digest = sha2::Sha256::new();
    let mut total = 0_u64;
    let mut chunk = vec![0_u8; 65536];
    loop {
        if cancelled.load(Ordering::Acquire) {
            return Err(failure("Descarga cancelada"));
        }
        let count = input.read(&mut chunk)?;
        if count == 0 {
            break;
        }
        total += u64::try_from(count).map_err(failure)?;
        if total > offer.compressed_bytes {
            return Err(failure("Longitud ZIP distinta de la firmada"));
        }
        digest.update(&chunk[..count]);
        output.write_all(&chunk[..count])?;
    }
    output.sync_all()?;
    if total != offer.compressed_bytes || format!("{:x}", digest.finalize()) != offer.sha256 {
        return Err(failure(
            "Longitud o SHA del paquete distintos de los firmados",
        ));
    }
    Ok(())
}
#[cfg(test)]
#[path = "hub_update_feed_tests.rs"]
mod tests;
