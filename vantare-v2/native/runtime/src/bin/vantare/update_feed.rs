//! Public beta feed. Only the compiled Ed25519 key authorizes an offer; GitHub
//! metadata selects candidates but never grants package authority.
use serde::Deserialize;
use sha2::Digest;
use std::{
    fs,
    io::{self, Read, Write},
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
use vantare_installer::engine::{hash_file, validation::version, write_fs as disk};

const REPO: &str = "isaacalbala12/Vantare-Downloads";
const LIMIT: u64 = 128 * 1024 * 1024;
const QUERY_TIMEOUT: Duration = Duration::from_secs(30);
const PACKAGE_TIMEOUT: Duration = Duration::from_mins(5);

#[derive(Clone, Debug, Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
pub struct Offer {
    pub schema: u32,
    pub product: String,
    pub channel: String,
    pub version: String,
    pub url: String,
    pub sha256: String,
    pub notes: String,
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
        let payload = vantare_services::update_manifest::verify(signed).map_err(failure)?;
        let offer: Self = serde_json::from_slice(&payload).map_err(failure)?;
        offer.validate()?;
        Ok(offer)
    }
    fn validate(&self) -> io::Result<()> {
        let url = format!(
            "https://github.com/{REPO}/releases/download/native-beta-v{}/vantare-native-amd64-package.zip",
            self.version
        );
        if self.schema != 1
            || self.product != "vantare-native"
            || self.channel != "beta"
            || self.url != url
            || version(&self.version).is_err()
            || self.notes.len() > 8192
            || self.sha256.len() != 64
            || !self
                .sha256
                .bytes()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
        {
            return Err(failure("Oferta beta firmada incompatible"));
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
        .header("User-Agent", "Vantare-Native-Beta")
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

/// Downloads into an isolated staging directory. The caller still validates
/// the archive inventory and active installation before publishing pending.
pub fn check(
    current: &str,
    staging: &Path,
    cancelled: &AtomicBool,
    rejected: Option<&str>,
) -> io::Result<Option<Downloaded>> {
    let current = version(current).map_err(failure)?;
    let query_agent = agent(QUERY_TIMEOUT);
    let releases: Vec<Release> = serde_json::from_slice(&get(
        &query_agent,
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
        let manifest_url = format!(
            "https://github.com/{REPO}/releases/download/{}/vantare-native-beta.json",
            release.tag_name
        );
        let Ok(signed) = get(&query_agent, &manifest_url, 65536) else {
            continue;
        };
        let Ok(offer) = Offer::verify(&signed) else {
            continue;
        };
        if !tag_matches(&release.tag_name, &offer) {
            continue;
        }
        fs::create_dir_all(staging)?;
        let target = staging.join(format!("{}.zip", offer.sha256));
        if cached(&target, &offer.sha256)? {
            return Ok(Some(Downloaded { signed, offer }));
        }
        let temporary = staging.join(format!("{}.download", offer.sha256));
        discard_orphan(&temporary)?;
        let result = download(
            &agent(PACKAGE_TIMEOUT),
            &offer.url,
            &temporary,
            &offer.sha256,
            cancelled,
            LIMIT,
        );
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result?;
        fs::rename(temporary, target)?;
        return Ok(Some(Downloaded { signed, offer }));
    }
    Ok(None)
}

fn cached(target: &Path, expected: &str) -> io::Result<bool> {
    if !target.try_exists()? {
        return Ok(false);
    }
    disk::path(target).map_err(failure)?;
    if hash_file(target).map_err(failure)? == expected {
        return Ok(true);
    }
    fs::remove_file(target)?;
    Ok(false)
}

fn tag_matches(tag: &str, offer: &Offer) -> bool {
    tag == format!("native-beta-v{}", offer.version)
}

fn eligible(release: &Release, current: [u16; 3], rejected: Option<&str>) -> Option<[u16; 3]> {
    let tag = release.tag_name.strip_prefix("native-beta-v")?;
    let parsed = version(tag).ok()?;
    (parsed > current && !release.draft && Some(tag) != rejected).then_some(parsed)
}

fn discard_orphan(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

fn download(
    agent: &ureq::Agent,
    url: &str,
    target: &Path,
    expected: &str,
    cancelled: &AtomicBool,
    limit: u64,
) -> io::Result<()> {
    let mut response = agent
        .get(url)
        .header("User-Agent", "Vantare-Native-Beta")
        .call()
        .map_err(failure)?;
    if response.status().as_u16() != 200 {
        return Err(failure("Paquete HTTP no disponible"));
    }
    let mut input = response.body_mut().with_config().limit(limit).reader();
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)?;
    let mut digest = sha2::Sha256::new();
    let mut chunk = vec![0; 65536];
    loop {
        if cancelled.load(Ordering::Acquire) {
            return Err(failure("Descarga cancelada"));
        }
        let count = input.read(&mut chunk)?;
        if count == 0 {
            break;
        }
        digest.update(&chunk[..count]);
        output.write_all(&chunk[..count])?;
    }
    output.sync_all()?;
    if format!("{:x}", digest.finalize()) != expected {
        return Err(failure("SHA del paquete incorrecto"));
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::time::Instant;
    fn qa_root(name: &str) -> std::path::PathBuf {
        let parent = if std::env::var("CI").as_deref() == Ok("true") {
            std::path::PathBuf::from(std::env::var_os("RUNNER_TEMP").expect("CI QA root"))
        } else {
            std::path::PathBuf::from("D:/VantareServer/qa/isa-1840")
        };
        let root = parent.join(format!("{name}-{}", std::process::id()));
        vantare_installer::engine::context::qa_path(&root).unwrap();
        root
    }
    #[test]
    fn feed_version_is_closed_and_numeric() {
        assert_eq!(version("0.0.988"), Ok([0, 0, 988]));
        for invalid in ["", "1.2", "01.2.3", "1.2.3.4", "1.2.3-x", "65536.0.0"] {
            assert!(version(invalid).is_err());
        }
    }

    #[test]
    fn offer_rejects_untrusted_origin_channel_sha_fields_and_tag() {
        let valid = Offer {
            schema: 1,
            product: "vantare-native".into(),
            channel: "beta".into(),
            version: "0.0.989".into(),
            url: format!(
                "https://github.com/{REPO}/releases/download/native-beta-v0.0.989/vantare-native-amd64-package.zip"
            ),
            sha256: "a".repeat(64),
            notes: String::new(),
        };
        valid.validate().unwrap();
        assert!(tag_matches("native-beta-v0.0.989", &valid));
        assert!(!tag_matches("native-beta-v0.0.990", &valid));
        let mut bad = valid.clone();
        bad.url = "https://example.com/package.zip".into();
        assert!(bad.validate().is_err());
        let mut bad = valid.clone();
        bad.channel = "master".into();
        assert!(bad.validate().is_err());
        let mut bad = valid.clone();
        bad.sha256 = "Z".repeat(64);
        assert!(bad.validate().is_err());
        let raw = serde_json::to_value(&valid).unwrap();
        let mut extra = raw.as_object().unwrap().clone();
        extra.insert("surprise".into(), serde_json::json!(true));
        assert!(serde_json::from_value::<Offer>(serde_json::Value::Object(extra)).is_err());
    }

    #[test]
    fn rejected_version_is_not_restaged_after_rollback() {
        let release = Release {
            draft: false,
            tag_name: "native-beta-v0.0.989".into(),
        };
        assert_eq!(eligible(&release, [0, 0, 988], None), Some([0, 0, 989]));
        assert_eq!(eligible(&release, [0, 0, 988], Some("0.0.989")), None);
        assert_eq!(eligible(&release, [0, 0, 989], None), None);
    }

    fn slow_offer() -> (String, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = format!("http://{}", listener.local_addr().unwrap());
        let thread = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0; 512];
            let _ = stream.read(&mut request).unwrap();
            // Deliberately longer than the short query budget used below.
            std::thread::sleep(Duration::from_millis(80));
            let _ = stream.write_all(
                b"HTTP/1.1 200 OK\r\nContent-Length: 7\r\nConnection: close\r\n\r\npackage",
            );
        });
        (address, thread)
    }

    #[test]
    fn package_download_has_a_separate_longer_deadline() {
        assert!(PACKAGE_TIMEOUT > QUERY_TIMEOUT);
        let (url, server) = slow_offer();
        let start = Instant::now();
        let short = get(&agent(Duration::from_millis(20)), &url, 1024);
        server.join().unwrap();
        assert!(short.is_err());
        assert!(start.elapsed() >= Duration::from_millis(20));

        let (url, server) = slow_offer();
        let root = qa_root("feed-timeout");
        fs::create_dir_all(&root).unwrap();
        let target = root.join("package.download");
        let expected = format!("{:x}", sha2::Sha256::digest(b"package"));
        download(
            &agent(Duration::from_millis(500)),
            &url,
            &target,
            &expected,
            &AtomicBool::new(false),
            LIMIT,
        )
        .unwrap();
        server.join().unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"package");
        fs::remove_file(&target).unwrap();
        fs::remove_dir(&root).unwrap();
    }

    #[test]
    fn package_rejects_wrong_sha_and_size_limit() {
        for (expected, limit) in [
            ("0".repeat(64), LIMIT),
            (format!("{:x}", sha2::Sha256::digest(b"package")), 6),
        ] {
            let (url, server) = slow_offer();
            let root = qa_root("feed-reject");
            fs::create_dir_all(&root).unwrap();
            let path = root.join(format!("{}-{limit}.download", std::process::id()));
            assert!(
                download(
                    &agent(Duration::from_secs(1)),
                    &url,
                    &path,
                    &expected,
                    &AtomicBool::new(false),
                    limit
                )
                .is_err()
            );
            server.join().unwrap();
            fs::remove_file(path).unwrap();
            fs::remove_dir(root).unwrap();
        }
    }

    #[test]
    fn abandoned_partial_download_can_be_retried() {
        let root = qa_root("feed-orphan");
        fs::create_dir_all(&root).unwrap();
        let target = root.join("package.download");
        fs::write(&target, b"partial").unwrap();
        discard_orphan(&target).unwrap();
        let mut next = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
            .unwrap();
        next.write_all(b"verified").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"verified");
        fs::remove_file(&target).unwrap();
        fs::remove_dir(&root).unwrap();
    }

    #[test]
    fn altered_cached_archive_is_removed_before_redownload() {
        let root = qa_root("feed-altered");
        vantare_installer::engine::context::qa_path(&root).unwrap();
        fs::create_dir_all(&root).unwrap();
        let path = root.join("archive.zip");
        fs::write(&path, b"tampered").unwrap();
        let expected = format!("{:x}", sha2::Sha256::digest(b"authentic"));
        assert!(!cached(&path, &expected).unwrap());
        assert!(!path.exists());
        fs::write(&path, b"authentic").unwrap();
        assert!(cached(&path, &expected).unwrap());
        fs::remove_dir_all(root).unwrap();
    }
}
