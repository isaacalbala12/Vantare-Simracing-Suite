use super::*;
use base64::{Engine, engine::general_purpose::STANDARD};
use ed25519_dalek::{Signer, SigningKey};
#[cfg(feature = "hub-update-qa")]
use std::cell::Cell;

fn offer() -> Offer {
    Offer {
        schema: 2,
        product: "vantare-hub".into(),
        channel: "beta".into(),
        version: "0.0.990".into(),
        url: format!(
            "https://github.com/{REPO}/releases/download/hub-beta-v0.0.990/vantare-native-amd64-package.zip"
        ),
        sha256: "a".repeat(64),
        notes: "Actualización para José".into(),
        compressed_bytes: ZIP_LIMIT,
        expanded_bytes: EXPANDED_LIMIT,
    }
}
fn signed(value: &Offer) -> Vec<u8> {
    let bytes = serde_json::to_vec(value).expect("valid test fixture");
    let key = SigningKey::from_bytes(&[42; 32]); // Existing public matrix TEST seed, never production.
    serde_json::to_vec(&serde_json::json!({"payload":STANDARD.encode(&bytes),"signature":STANDARD.encode(key.sign(&bytes).to_bytes())})).expect("valid test fixture")
}
fn qa_root() -> std::path::PathBuf {
    let base = if std::env::var("CI").as_deref() == Ok("true") {
        std::path::PathBuf::from(std::env::var_os("RUNNER_TEMP").expect("valid test fixture"))
    } else {
        std::path::PathBuf::from("D:/VantareServer/qa/isa-1995")
    };
    let root = base.join(format!(
        "hub-feed-{}",
        disk::id().expect("valid test fixture")
    ));
    vantare_installer::engine::context::qa_path(&root).expect("valid test fixture");
    root
}
#[test]
fn signed_bounds_accept_exact_and_reject_one_more_or_zero_without_large_payloads() {
    let valid = offer();
    valid.validate().expect("valid test fixture");
    for (compressed, expanded) in [
        (ZIP_LIMIT + 1, EXPANDED_LIMIT),
        (ZIP_LIMIT, EXPANDED_LIMIT + 1),
        (0, 1),
        (1, 0),
    ] {
        let mut bad = valid.clone();
        bad.compressed_bytes = compressed;
        bad.expanded_bytes = expanded;
        assert!(bad.validate().is_err());
    }
}
#[test]
fn schema_product_namespace_and_fields_are_closed() {
    let value = serde_json::to_value(offer()).expect("valid test fixture");
    for (field, bad) in [
        ("schema", serde_json::json!(1)),
        ("product", serde_json::json!("vantare-native")),
        ("channel", serde_json::json!("nightly")),
        ("version", serde_json::json!("01.0.990")),
        ("url", serde_json::json!("https://example.invalid/x.zip")),
        ("sha256", serde_json::json!("f")),
        ("notes", serde_json::json!("x".repeat(8193))),
    ] {
        let mut changed = value.clone();
        changed[field] = bad;
        assert!(
            serde_json::from_value::<Offer>(changed)
                .expect("valid test fixture")
                .validate()
                .is_err()
        );
    }
    let mut legacy = value.clone();
    legacy["url"] = serde_json::json!(offer().url.replace("hub-beta-v", "native-beta-v"));
    assert!(
        serde_json::from_value::<Offer>(legacy)
            .expect("valid test fixture")
            .validate()
            .is_err()
    );
    // Versión no canónica con su URL coherente: la rechaza la versión, no la URL.
    let mut padded = value.clone();
    padded["version"] = serde_json::json!("01.0.990");
    padded["url"] = serde_json::json!(offer().url.replace("0.0.990", "01.0.990"));
    assert!(
        serde_json::from_value::<Offer>(padded)
            .expect("valid test fixture")
            .validate()
            .is_err()
    );
    for (field, bad) in [
        ("surprise", serde_json::json!(true)),
        ("compressed_bytes", serde_json::json!(-1)),
        ("expanded_bytes", serde_json::json!(1.5)),
    ] {
        let mut changed = value.clone();
        changed[field] = bad;
        assert!(serde_json::from_value::<Offer>(changed).is_err());
    }
    for tag in [
        "native-beta-v0.0.990",
        "hub-beta-v0.0.989",
        "hub-beta-v0.0.991",
    ] {
        assert!(!tag_matches(tag, &offer()));
    }
    let release = Release {
        draft: false,
        tag_name: "hub-beta-v0.0.990".into(),
    };
    assert_eq!(eligible(&release, [0, 0, 989], None), Some([0, 0, 990]));
    assert_eq!(eligible(&release, [0, 0, 990], None), None);
    assert_eq!(eligible(&release, [0, 0, 991], None), None);
    assert_eq!(eligible(&release, [0, 0, 989], Some("0.0.990")), None);
}
#[cfg(not(feature = "hub-update-qa"))]
#[test]
fn distribution_client_rejects_a_valid_qa_signed_hub_offer() {
    assert!(Offer::verify(&signed(&offer())).is_err());
}
#[cfg(not(feature = "hub-update-qa"))]
#[test]
fn distribution_feed_skips_a_qa_signed_offer_without_download_or_staging() {
    let envelope = signed(&offer());
    let root = qa_root();
    let found = check_with(
        "0.0.989",
        &root,
        &AtomicBool::new(false),
        None,
        |url, _| {
            Ok(if url.contains("api.github.com") {
                br#"[{"draft":false,"tag_name":"hub-beta-v0.0.990"}]"#.to_vec()
            } else {
                envelope.clone()
            })
        },
        |_, _, _| panic!("a QA-signed offer reached the ZIP request"),
    )
    .expect("an unauthenticated offer is skipped, never fatal");
    assert!(found.is_none());
    assert!(!root.exists());
}
#[cfg(feature = "hub-update-qa")]
#[test]
fn authenticated_preflight_makes_zero_zip_requests_and_no_staging_when_oversized() {
    for (compressed, expanded, want_download) in [
        (ZIP_LIMIT, EXPANDED_LIMIT, true),
        (ZIP_LIMIT + 1, EXPANDED_LIMIT, false),
        (ZIP_LIMIT, EXPANDED_LIMIT + 1, false),
    ] {
        let mut candidate = offer();
        candidate.compressed_bytes = compressed;
        candidate.expanded_bytes = expanded;
        let envelope = signed(&candidate);
        let root = qa_root();
        let downloads = Cell::new(0);
        let result = check_with(
            "0.0.989",
            &root,
            &AtomicBool::new(false),
            None,
            |url, _| {
                if url.contains("api.github.com") {
                    Ok(br#"[{"draft":false,"tag_name":"hub-beta-v0.0.990"}]"#.to_vec())
                } else {
                    assert!(url.ends_with("/vantare-hub-beta.json"));
                    Ok(envelope.clone())
                }
            },
            |_, _, _| {
                downloads.set(downloads.get() + 1);
                Err(failure("Test stops before a large ZIP request"))
            },
        );
        assert!(result.is_err());
        assert_eq!(downloads.get(), usize::from(want_download));
        assert_eq!(root.exists(), want_download);
        if root.exists() {
            fs::remove_dir_all(root).expect("valid test fixture");
        }
    }
}
#[cfg(feature = "hub-update-qa")]
#[test]
fn isolated_authority_accepts_qa_signature_and_rejects_modified_payload() {
    let valid = signed(&offer());
    assert!(vantare_services::update_manifest::verify(&valid).is_err());
    Offer::verify(&valid).expect("valid test fixture");
    let mut changed: serde_json::Value =
        serde_json::from_slice(&valid).expect("valid test fixture");
    let mut other = offer();
    other.notes = "changed".into();
    changed["payload"] =
        serde_json::json!(STANDARD.encode(serde_json::to_vec(&other).expect("valid test fixture")));
    assert!(Offer::verify(&serde_json::to_vec(&changed).expect("valid test fixture")).is_err());
}
#[test]
fn download_requires_exact_signed_length_and_hash() {
    use std::{net::TcpListener, time::Instant};
    for (length, wrong_hash) in [(4, false), (5, false), (6, false), (5, true)] {
        let listener = TcpListener::bind("127.0.0.1:0").expect("valid test fixture");
        listener.set_nonblocking(true).expect("valid test fixture");
        let url = format!(
            "http://{}",
            listener.local_addr().expect("valid test fixture")
        );
        let server = std::thread::spawn(move || {
            // Bounded test watchdog: the fixture also exits if the client never connects.
            let until = Instant::now() + Duration::from_secs(5);
            loop {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        // Winsock accept inherits the listener's nonblocking mode.
                        stream
                            .set_nonblocking(false)
                            .expect("blocking test connection");
                        stream
                            .set_read_timeout(Some(Duration::from_secs(3)))
                            .expect("valid test fixture");
                        // Consume the complete GET headers before replying/closing;
                        // unread request bytes at close can reset a Windows connection.
                        let mut request = Vec::new();
                        while !request.ends_with(b"\r\n\r\n") {
                            assert!(request.len() < 4096, "bounded test request headers");
                            let mut byte = [0];
                            stream.read_exact(&mut byte).expect("read test GET headers");
                            request.push(byte[0]);
                        }
                        stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello").expect("write complete test response");
                        break;
                    }
                    Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                        assert!(Instant::now() < until);
                        std::thread::sleep(Duration::from_millis(1));
                    }
                    Err(error) => panic!("{error}"),
                }
            }
        });
        let root = qa_root();
        fs::create_dir_all(&root).expect("valid test fixture");
        let target = root.join("package.download");
        let mut expected = offer();
        expected.url = url;
        expected.compressed_bytes = length;
        expected.sha256 = format!("{:x}", sha2::Sha256::digest(b"hello"));
        if wrong_hash {
            expected.sha256 = "0".repeat(64);
        }
        let result = download(
            // Cleartext is limited to this loopback fixture in cfg(test).
            &ureq::Agent::config_builder()
                .timeout_global(Some(Duration::from_secs(3)))
                .https_only(false)
                .build()
                .into(),
            &expected,
            &target,
            &AtomicBool::new(false),
        );
        server.join().expect("valid test fixture");
        assert_eq!(
            result.is_ok(),
            length == 5 && !wrong_hash,
            "length={length}, wrong_hash={wrong_hash}, result={result:?}"
        );
        fs::remove_dir_all(root).expect("valid test fixture");
    }
}

#[test]
fn extracted_total_and_compressed_length_must_match_the_signed_sizes() {
    let root = qa_root();
    fs::create_dir_all(&root).expect("valid test fixture");
    let raw=serde_json::to_vec(&serde_json::json!({"schema":1,"product":"vantare-native","candidate":true,"architecture":"windows-x64","version":"0.0.990","channel":"beta","data_schema":"opaque-v1","source_sha":"a".repeat(40),"source_dirty":false,"build_profile":"Debug","engine":2,"files":[{"path":"assets/test.txt","size":5,"sha256":"a".repeat(64)}]})).expect("valid test fixture");
    fs::write(root.join("manifest.json"), &raw).expect("write test manifest");
    let manifest = Manifest::read(&root.join("manifest.json")).expect("read test manifest");
    let mut expected = offer();
    expected.expanded_bytes = u64::try_from(raw.len()).expect("valid test fixture") + 5;
    expected
        .verify_expanded(&root, &manifest)
        .expect("valid test fixture");
    expected.expanded_bytes += 1;
    assert!(expected.verify_expanded(&root, &manifest).is_err());
    let archive = root.join("archive.zip");
    fs::write(&archive, b"small").expect("valid test fixture");
    expected.compressed_bytes = 5;
    expected
        .verify_archive_length(&archive)
        .expect("valid test fixture");
    expected.compressed_bytes = 6;
    assert!(expected.verify_archive_length(&archive).is_err());
    fs::remove_dir_all(root).expect("valid test fixture");
}

#[cfg(not(feature = "hub-update-qa"))]
#[test]
fn production_transport_rejects_cleartext_without_a_connection() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("listener");
    listener.set_nonblocking(true).expect("nonblocking probe");
    let url = format!("http://{}", listener.local_addr().expect("address"));
    assert!(agent(QUERY_TIMEOUT).get(&url).call().is_err());
    assert_eq!(
        listener
            .accept()
            .expect_err("no cleartext connection")
            .kind(),
        io::ErrorKind::WouldBlock
    );
}

#[test]
fn package_budget_allows_256_mib_at_64_kib_per_second() {
    let transfer_seconds = ZIP_LIMIT / (64 * 1024);
    assert!(PACKAGE_TIMEOUT >= Duration::from_secs(transfer_seconds));
    assert!(QUERY_TIMEOUT <= Duration::from_secs(30));
}

#[cfg(feature = "hub-update-qa")]
#[test]
fn oversized_offer_from_another_tag_does_not_block_the_next_valid_release() {
    let mut unrelated = offer();
    unrelated.version = "0.0.995".into();
    unrelated.url = unrelated.url.replace("0.0.990", "0.0.995");
    unrelated.compressed_bytes = ZIP_LIMIT + 1;
    let mut valid = offer();
    valid.compressed_bytes = 5;
    valid.sha256 = format!("{:x}", sha2::Sha256::digest(b"hello"));
    let root = qa_root();
    let downloads = Cell::new(0);
    let result = check_with("0.0.989", &root, &AtomicBool::new(false), None,
        |url, _| {
            if url.contains("api.github.com") {
                Ok(br#"[{"draft":false,"tag_name":"hub-beta-v0.0.991"},{"draft":false,"tag_name":"hub-beta-v0.0.990"}]"#.to_vec())
            } else if url.contains("hub-beta-v0.0.991") { Ok(signed(&unrelated)) }
            else { Ok(signed(&valid)) }
        },
        |candidate, target, _| {
            assert_eq!(candidate.version, "0.0.990");
            downloads.set(downloads.get() + 1);
            fs::write(target, b"hello")
        }).expect("unrelated oversized offer must be skipped").expect("valid release");
    assert_eq!(result.offer.version, "0.0.990");
    assert_eq!(downloads.get(), 1);
    fs::remove_dir_all(root).expect("cleanup");
}

/// Transporte QA real contra un servidor de `127.0.0.1` (#2771, PR B).
#[cfg(feature = "hub-update-qa")]
mod qa_transport {
    use super::*;
    use std::{
        net::TcpListener,
        sync::{Arc, Mutex},
        thread::JoinHandle,
        time::Instant,
    };

    /// Sirve respuestas HTTP completas por ruta y anota cada ruta pedida; 404 si no la conoce.
    pub(super) struct Server {
        pub(super) port: u16,
        stop: Arc<AtomicBool>,
        seen: Arc<Mutex<Vec<String>>>,
        thread: Option<JoinHandle<()>>,
    }
    impl Server {
        pub(super) fn start(routes: Vec<(String, Vec<u8>)>) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").expect("listener");
            listener
                .set_nonblocking(true)
                .expect("nonblocking listener");
            let port = listener.local_addr().expect("address").port();
            let stop = Arc::new(AtomicBool::new(false));
            let seen = Arc::new(Mutex::new(Vec::new()));
            let (halt, log) = (Arc::clone(&stop), Arc::clone(&seen));
            let thread = std::thread::spawn(move || {
                // Watchdog acotado: el servidor sale aunque el test no lo pare.
                let until = Instant::now() + Duration::from_secs(20);
                while !halt.load(Ordering::Acquire) && Instant::now() < until {
                    let mut stream = match listener.accept() {
                        Ok((stream, _)) => stream,
                        Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                            std::thread::sleep(Duration::from_millis(1));
                            continue;
                        }
                        Err(error) => panic!("{error}"),
                    };
                    stream.set_nonblocking(false).expect("blocking connection");
                    stream
                        .set_read_timeout(Some(Duration::from_secs(3)))
                        .expect("read timeout");
                    // Lee la petición entera antes de responder: en Windows, bytes sin leer
                    // al cerrar pueden resetear la conexión.
                    let mut request = Vec::new();
                    while !request.ends_with(b"\r\n\r\n") {
                        assert!(request.len() < 8192, "bounded test request headers");
                        let mut byte = [0];
                        stream.read_exact(&mut byte).expect("request headers");
                        request.push(byte[0]);
                    }
                    let line = String::from_utf8_lossy(&request);
                    let path = line.split(' ').nth(1).unwrap_or_default().to_owned();
                    let response = routes
                        .iter()
                        .find(|(route, _)| *route == path)
                        .map_or_else(|| reply("404 Not Found", b""), |(_, bytes)| bytes.clone());
                    log.lock().expect("log").push(path);
                    stream.write_all(&response).expect("response");
                }
            });
            Self {
                port,
                stop,
                seen,
                thread: Some(thread),
            }
        }
        /// Para el servidor y devuelve las rutas pedidas, en orden.
        pub(super) fn finish(mut self) -> Vec<String> {
            self.stop.store(true, Ordering::Release);
            self.thread.take().expect("thread").join().expect("server");
            self.seen.lock().expect("log").clone()
        }
    }
    impl Drop for Server {
        // Si un test entra en pánico antes de `finish`, el hilo deja de escuchar ya.
        fn drop(&mut self) {
            self.stop.store(true, Ordering::Release);
        }
    }
    pub(super) fn reply(status: &str, body: &[u8]) -> Vec<u8> {
        let mut bytes = format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        )
        .into_bytes();
        bytes.extend_from_slice(body);
        bytes
    }
    pub(super) const RELEASES: &str = "/api/releases?per_page=100";
    pub(super) fn asset(version: &str, file: &str) -> String {
        format!("/download/hub-beta-v{version}/{file}")
    }
    /// Oferta 0.0.990 de 5 bytes («hello») con su firma TEST y la lista de releases.
    fn feed(package: &[u8]) -> Vec<(String, Vec<u8>)> {
        let mut valid = offer();
        valid.compressed_bytes = 5;
        valid.expanded_bytes = 1;
        valid.sha256 = format!("{:x}", sha2::Sha256::digest(b"hello"));
        vec![
            (
                RELEASES.into(),
                reply(
                    "200 OK",
                    br#"[{"draft":false,"tag_name":"hub-beta-v0.0.990"}]"#,
                ),
            ),
            (
                asset("0.0.990", "vantare-hub-beta.json"),
                reply("200 OK", &signed(&valid)),
            ),
            (
                asset("0.0.990", "vantare-native-amd64-package.zip"),
                reply("200 OK", package),
            ),
        ]
    }

    #[test]
    fn qa_transport_translates_only_the_two_signed_github_prefixes() {
        let releases = format!("https://api.github.com/repos/{REPO}/releases?per_page=100");
        let download = format!("https://github.com/{REPO}/releases/download/");
        assert_eq!(
            qa_url(&releases, 8080).expect("releases"),
            "http://127.0.0.1:8080/api/releases?per_page=100"
        );
        for file in ["vantare-hub-beta.json", "vantare-native-amd64-package.zip"] {
            assert_eq!(
                qa_url(&format!("{download}hub-beta-v0.0.990/{file}"), 8080).expect(file),
                format!("http://127.0.0.1:8080/download/hub-beta-v0.0.990/{file}")
            );
        }
        for url in [
            format!("https://api.github.com/repos/{REPO}/releases?per_page=99"),
            format!("http://api.github.com/repos/{REPO}/releases?per_page=100"),
            format!("https://api.github.com/repos/{REPO}/releases?per_page=100#x"),
            "https://api.github.com/repos/other/Vantare-Downloads/releases?per_page=100".to_owned(),
            format!("{download}native-beta-v0.0.990/vantare-hub-beta.json"),
            format!("{download}hub-beta-v0.0.990/other.zip"),
            format!("{download}hub-beta-v0.0.990/vantare-hub-beta.json/x"),
            format!("{download}hub-beta-v0.0.990/vantare-hub-beta.json?x"),
            format!("{download}hub-beta-v0.0.990../vantare-hub-beta.json"),
            format!("{download}hub-beta-v0.0.990%2F/vantare-hub-beta.json"),
            format!("{download}hub-beta-v0.990/vantare-hub-beta.json"),
            format!("{download}hub-beta-v/vantare-hub-beta.json"),
            download.replace("isaacalbala12", "other") + "hub-beta-v0.0.990/vantare-hub-beta.json",
            download.replace("https://github.com", "https://GitHub.com")
                + "hub-beta-v0.0.990/vantare-hub-beta.json",
            "http://127.0.0.1:8080/api/releases?per_page=100".into(),
        ] {
            assert!(qa_url(&url, 8080).is_err(), "{url}");
        }
    }

    #[test]
    fn qa_port_must_be_a_plain_number_inside_the_guarded_root() {
        let root = qa_root();
        fs::create_dir_all(&root).expect("root");
        assert!(qa_port(&root).is_err(), "missing port file");
        for (text, expected) in [
            ("8080", Some(8080)),
            ("1", Some(1)),
            ("65535", Some(65535)),
            ("", None),
            ("0", None),
            ("65536", None),
            ("123456", None),
            ("80a", None),
            (" 80", None),
            ("80\n", None),
            ("-80", None),
            ("000080", None),
            ("+80", None),
        ] {
            fs::write(root.join(QA_PORT_FILE), text).expect("port file");
            assert_eq!(qa_port(&root).ok(), expected, "{text:?}");
        }
        // Fuera del guard ni se busca el archivo: falla el propio guard.
        let outside = Path::new("D:/VantareServer/fuera-del-guard-qa");
        let guard = vantare_installer::engine::context::qa_path(outside)
            .expect_err("outside the QA guard")
            .to_string();
        assert_eq!(qa_port(outside).expect_err("outside").to_string(), guard);
        assert!(!outside.exists());
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn qa_check_downloads_the_signed_package_from_loopback_only() {
        let server = Server::start(feed(b"hello"));
        let root = qa_root();
        fs::create_dir_all(&root).expect("root");
        fs::write(root.join(QA_PORT_FILE), server.port.to_string()).expect("port");
        let staging = root.join("staging");
        let found = check_qa(&root, "0.0.989", &staging, &AtomicBool::new(false), None)
            .expect("QA check")
            .expect("signed offer");
        assert_eq!(found.offer.version, "0.0.990");
        // La oferta guardada conserva la URL firmada de GitHub; solo la petición se tradujo.
        assert!(found.offer.url.starts_with("https://github.com/"));
        assert_eq!(
            fs::read(staging.join(format!("{}.zip", found.offer.sha256))).expect("package"),
            b"hello"
        );
        assert_eq!(
            server.finish(),
            [
                RELEASES.to_owned(),
                asset("0.0.990", "vantare-hub-beta.json"),
                asset("0.0.990", "vantare-native-amd64-package.zip"),
            ]
        );
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn qa_check_rejects_a_package_one_byte_off_and_leaves_no_download() {
        for package in [&b"hellp"[..], b"hello!", b"hell"] {
            let server = Server::start(feed(package));
            let root = qa_root();
            fs::create_dir_all(&root).expect("root");
            fs::write(root.join(QA_PORT_FILE), server.port.to_string()).expect("port");
            let staging = root.join("staging");
            let result = check_qa(&root, "0.0.989", &staging, &AtomicBool::new(false), None);
            assert!(
                result.is_err(),
                "{package:?}: {:?}",
                result
                    .as_ref()
                    .map(|found| found.as_ref().map(|download| &download.offer))
            );
            assert_eq!(server.finish().len(), 3);
            assert_eq!(fs::read_dir(&staging).expect("staging").count(), 0);
            fs::remove_dir_all(root).expect("cleanup");
        }
    }

    const PROXY_PROBE: &str =
        "hub_update_feed::tests::qa_transport::qa_check_probe_behind_a_dead_proxy";

    /// Hijo de `qa_check_ignores_the_proxy_environment`: solo corre con un proxy muerto en
    /// el entorno. Si el agente QA usara ese proxy, la consulta no llegaría al servidor.
    #[test]
    #[ignore = "lo lanza qa_check_ignores_the_proxy_environment con un proxy muerto inyectado"]
    fn qa_check_probe_behind_a_dead_proxy() {
        let server = Server::start(feed(b"hello"));
        let root = qa_root();
        fs::create_dir_all(&root).expect("root");
        fs::write(root.join(QA_PORT_FILE), server.port.to_string()).expect("port");
        let found = check_qa(
            &root,
            "0.0.989",
            &root.join("staging"),
            &AtomicBool::new(false),
            None,
        );
        assert!(
            matches!(found, Ok(Some(_))),
            "{:?}",
            found
                .as_ref()
                .map(|found| found.as_ref().map(|download| &download.offer))
        );
        assert_eq!(server.finish().len(), 3);
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn qa_check_ignores_the_proxy_environment() {
        // Un proceso hijo con el proxy en su entorno: este proceso no se toca (`set_var`
        // es `unsafe` y `cargo test` comparte proceso entre tests).
        let dead = TcpListener::bind("127.0.0.1:0")
            .and_then(|listener| listener.local_addr())
            .expect("dead port")
            .port();
        let proxy = format!("http://127.0.0.1:{dead}");
        let mut child = std::process::Command::new(std::env::current_exe().expect("test binary"));
        child.args(["--exact", PROXY_PROBE, "--ignored", "--nocapture"]);
        for name in ["NO_PROXY", "no_proxy"] {
            child.env_remove(name);
        }
        for name in [
            "HTTP_PROXY",
            "http_proxy",
            "HTTPS_PROXY",
            "https_proxy",
            "ALL_PROXY",
            "all_proxy",
        ] {
            child.env(name, &proxy);
        }
        let output = child.output().expect("child test process");
        let stdout = String::from_utf8_lossy(&output.stdout);
        assert!(
            output.status.success() && stdout.contains("1 passed"),
            "{stdout}\n{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn qa_check_never_follows_a_redirect() {
        let target = Server::start(feed(b"hello"));
        let moved = format!(
            "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:{}{RELEASES}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
            target.port
        );
        let server = Server::start(vec![(RELEASES.into(), moved.into_bytes())]);
        let root = qa_root();
        fs::create_dir_all(&root).expect("root");
        fs::write(root.join(QA_PORT_FILE), server.port.to_string()).expect("port");
        let result = check_qa(
            &root,
            "0.0.989",
            &root.join("staging"),
            &AtomicBool::new(false),
            None,
        );
        assert!(
            result.is_err(),
            "{:?}",
            result
                .as_ref()
                .map(|found| found.as_ref().map(|download| &download.offer))
        );
        assert_eq!(server.finish(), [RELEASES.to_owned()]);
        assert!(target.finish().is_empty(), "redirect followed");
        assert!(!root.join("staging").exists());
        fs::remove_dir_all(root).expect("cleanup");
    }
}

#[path = "installed_update_tests.rs"]
mod installed_updates;
