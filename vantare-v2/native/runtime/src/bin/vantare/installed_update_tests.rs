//! CPU-only installed-update regression fixtures; no product executable is launched.
use super::*;
use crate::installed::{ADOPTION_WAITS, adopt_recordings_with, apply, stage_with};
use std::{os::windows::process::CommandExt, path::Path, process::Command};

fn manifest(version: &str) -> Vec<u8> {
    serde_json::to_vec(&serde_json::json!({"schema":1,"product":"vantare-native","candidate":true,"architecture":"windows-x64","version":version,"channel":"beta","data_schema":"opaque-v1","source_sha":"a".repeat(40),"source_dirty":false,"build_profile":"Debug","engine":2,"files":[{"path":"fixture.txt","size":5,"sha256":format!("{:x}", sha2::Sha256::digest(b"hello"))}]})).expect("manifest")
}
fn installed(root: &Path) -> Vec<u8> {
    let generation = "a".repeat(32);
    let directory = root.join("generations").join(&generation);
    fs::create_dir_all(directory.join("data")).expect("data directory");
    fs::write(directory.join("data/opaque.bin"), b"disposable opaque data").expect("data");
    fs::write(directory.join("fixture.txt"), b"hello").expect("installed member");
    let raw = manifest("0.0.989");
    fs::write(directory.join("manifest.json"), &raw).expect("active manifest");
    let state = serde_json::to_vec(&serde_json::json!({"schema":1,"product":"vantare-native","channel":"beta","active":{"generation":generation,"manifest_sha256":format!("{:x}", sha2::Sha256::digest(&raw))},"previous":null})).expect("state");
    fs::write(root.join("state.json"), &state).expect("active state");
    state
}
fn assert_preserved(root: &Path, state: &[u8]) {
    assert_eq!(fs::read(root.join("state.json")).expect("state"), state);
    assert_eq!(
        fs::read(
            root.join("generations")
                .join("a".repeat(32))
                .join("data/opaque.bin")
        )
        .expect("data"),
        b"disposable opaque data"
    );
}
#[test]
fn stage_publishes_only_after_the_extracted_total_matches_the_signed_offer() {
    // Solo el primer caso coincide con lo firmado: sobra un byte o cambia la versión empaquetada.
    for (extra, packaged) in [(0, "0.0.990"), (1, "0.0.990"), (0, "0.0.991")] {
        let accepted = extra == 0 && packaged == "0.0.990";
        let root = qa_root();
        fs::create_dir_all(&root).expect("root");
        let state = installed(&root);
        let source = root.join("package-source");
        fs::create_dir_all(&source).expect("source");
        let raw = manifest(packaged);
        fs::write(source.join("manifest.json"), &raw).expect("manifest");
        fs::write(source.join("fixture.txt"), b"hello").expect("member");
        let archive = root.join("package.zip");
        // The Windows system compression library creates a real tiny ZIP; no new Rust dependency.
        let output = Command::new(vantare_installer::engine::powershell().expect("system PowerShell"))
            .creation_flags(0x0800_0000)
            .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:VANTARE_TEST_ZIP_SOURCE,$env:VANTARE_TEST_ZIP)"])
            .env("VANTARE_TEST_ZIP_SOURCE", &source).env("VANTARE_TEST_ZIP", &archive)
            .output().expect("tiny ZIP fixture");
        assert!(output.status.success(), "{:?}", output.stderr);
        let mut candidate = offer();
        candidate.sha256 = hash_file(&archive).expect("ZIP hash");
        candidate.compressed_bytes = fs::metadata(&archive).expect("ZIP metadata").len();
        candidate.expanded_bytes = u64::try_from(raw.len()).expect("manifest length") + 5 + extra;
        let pending = signed(&candidate);
        let result = stage_with(&root, &AtomicBool::new(false), |current, staging, _, _| {
            assert_eq!(current, "0.0.989");
            fs::create_dir_all(staging)?;
            fs::copy(&archive, staging.join(format!("{}.zip", candidate.sha256)))?;
            Ok(Some(Downloaded {
                signed: pending.clone(),
                offer: candidate.clone(),
            }))
        });
        assert_eq!(
            result.is_ok(),
            accepted,
            "extra={extra}, packaged={packaged}, result={result:?}"
        );
        assert_preserved(&root, &state);
        if accepted {
            assert_eq!(
                fs::read(root.join("staging/pending.json")).expect("pending"),
                pending
            );
            let status: serde_json::Value =
                serde_json::from_slice(&fs::read(root.join("update-status.json")).expect("status"))
                    .expect("status JSON");
            assert_eq!(status["state"], "ready");
        } else {
            assert!(!root.join("staging/pending.json").exists());
            assert!(!root.join("update-status.json").exists());
        }
        assert!(
            !fs::read_dir(root.join("staging"))
                .expect("staging")
                .any(|item| item
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .starts_with("check-"))
        );
        fs::remove_dir_all(root).expect("cleanup");
    }
}

#[test]
fn apply_honours_a_qa_signed_pending_only_in_the_isolated_qa_build() {
    let root = qa_root();
    fs::create_dir_all(root.join("staging")).expect("staging");
    let state = installed(&root);
    // Oferta de la versión ya instalada: quien acepta su firma la retira; quien no, la conserva.
    let mut current = offer();
    current.version = "0.0.989".into();
    current.url = current.url.replace("0.0.990", "0.0.989");
    let pending = root.join("staging/pending.json");
    fs::write(&pending, signed(&current)).expect("pending");
    let qa = cfg!(feature = "hub-update-qa");
    assert_eq!(apply(&root).is_ok(), qa);
    assert_eq!(pending.exists(), !qa);
    assert_preserved(&root, &state);
    fs::remove_dir_all(root).expect("cleanup");
}

#[cfg(feature = "hub-update-qa")]
#[test]
fn qa_authority_stops_before_reading_a_root_without_the_isolated_context() {
    use crate::installed::{root as launch, session};
    use vantare_installer::engine::context::{Context, qa_path};
    let arguments = |mode: &str, root: &Path| -> Vec<String> {
        vec![
            mode.into(),
            "-Root".into(),
            root.to_string_lossy().into_owned(),
        ]
    };
    // Los errores esperados salen del propio guard, no de una lectura posterior:
    // compararlos distingue «se negó antes» de «falló después» sin fijar un texto.
    let outside = Path::new("D:/VantareServer/fuera-del-guard-qa");
    let guard = qa_path(outside)
        .expect_err("outside the QA guard")
        .to_string();
    assert_eq!(apply(outside).expect_err("apply").to_string(), guard);
    let staged = stage_with(outside, &AtomicBool::new(false), |_, _, _, _| {
        panic!("feed consulted outside the QA guard")
    });
    assert_eq!(staged.expect_err("stage").to_string(), guard);
    let inside = qa_root();
    let isolation = Context::from_qa_env(&inside)
        .expect_err("this test process carries no injected QA context")
        .to_string();
    for (root, expected) in [(outside, &guard), (inside.as_path(), &isolation)] {
        let launched = launch(&arguments("--root", root));
        assert_eq!(&launched.expect_err("root").to_string(), expected);
        let started = session(&arguments("--session", root));
        assert_eq!(&started.expect_err("session").to_string(), expected);
    }
    assert!(!outside.exists() && !inside.exists());
}

#[test]
fn apply_rejects_legacy_pending_without_mutating_installation_or_data() {
    let root = qa_root();
    fs::create_dir_all(root.join("staging")).expect("staging");
    let state = installed(&root);
    let mut legacy = serde_json::to_value(offer()).expect("legacy fixture");
    legacy["schema"] = 1.into();
    legacy["product"] = "vantare-native".into();
    legacy["url"] = serde_json::json!(offer().url.replace("hub-beta-v", "native-beta-v"));
    let object = legacy.as_object_mut().expect("legacy object");
    object.remove("compressed_bytes");
    object.remove("expanded_bytes");
    let payload = serde_json::to_vec(&legacy).expect("legacy payload");
    let signature = SigningKey::from_bytes(&[42; 32]).sign(&payload);
    let pending = serde_json::to_vec(&serde_json::json!({"payload": STANDARD.encode(&payload), "signature": STANDARD.encode(signature.to_bytes())})).expect("legacy envelope");
    #[cfg(feature = "hub-update-qa")]
    assert_eq!(
        vantare_services::update_manifest::verify_hub_update(&pending)
            .expect("valid isolated TEST signature"),
        payload
    );
    fs::write(root.join("staging/pending.json"), &pending).expect("pending");
    let archive = root.join("staging").join(format!("{}.zip", offer().sha256));
    fs::write(&archive, b"preserve staged archive").expect("archive");
    assert!(apply(&root).is_err());
    assert_eq!(
        fs::read(root.join("staging/pending.json")).expect("preserved pending"),
        pending
    );
    assert_eq!(
        fs::read(root.join("state.json")).expect("preserved state"),
        state
    );
    assert_eq!(
        fs::read(
            root.join("generations")
                .join("a".repeat(32))
                .join("data/opaque.bin")
        )
        .expect("preserved data"),
        b"disposable opaque data"
    );
    assert_eq!(
        fs::read(&archive).expect("preserved archive"),
        b"preserve staged archive"
    );
    assert!(!root.join("update-status.json").exists());
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn the_session_brings_its_recordings_waits_its_turn_and_never_fails() {
    use vantare_installer::engine::write_fs::lock;
    let root = qa_root();
    fs::create_dir_all(&root).expect("root");
    installed(&root);
    fs::write(root.join(".vantare-native"), b"offline-candidate-v1").expect("marker");
    let generation = root.join("generations").join("a".repeat(32));
    let source = generation.join("data/hub/recordings");
    fs::create_dir_all(&source).expect("recordings of the generation");
    // Nothing to bring (the state of the recorder is not a recording): neither
    // the lock nor a walk of the installation, as at every later start.
    fs::write(source.join("recording-status.json"), b"{}").expect("recorder state");
    let busy = lock(&root, ".operation.lock").expect("another operation");
    adopt_recordings_with(&root, &source, &mut |_| panic!("nothing to wait for"));
    drop(busy);
    assert!(!root.join("installer-log.txt").exists());
    let [first, later] = ["series-1-1.duckdb", "series-2-2.duckdb"];
    fs::write(source.join(first), b"recording").expect("recording");
    // Already in the single folder: the session neither compares nor removes.
    let (single, repeated) = (root.join("recordings"), "series-0-0.duckdb");
    fs::create_dir(&single).expect("single folder");
    for folder in [&source, &single] {
        fs::write(folder.join(repeated), b"same").expect("repeated recording");
    }
    let (single, log) = (root.join("recordings"), root.join("installer-log.txt"));
    let lines = || fs::read_to_string(&log).map_or(0, |text| text.lines().count());
    // The launcher renews the registration under the same lock: the session waits its turn.
    let mut held = Some(lock(&root, ".operation.lock").expect("another operation"));
    let mut waits = 0;
    adopt_recordings_with(&root, &source, &mut |_| {
        waits += 1;
        if waits == 3 {
            held.take();
        }
    });
    assert_eq!(waits, 3);
    assert_eq!(fs::read(single.join(first)).expect("adopted"), b"recording");
    assert!(!source.join(first).exists() && source.join(repeated).exists());
    assert_eq!(lines(), 2, "what stays and what arrived");
    // Never released: after its two seconds it starts anyway and says so in the log.
    fs::write(source.join(later), b"later").expect("recording");
    let held = lock(&root, ".operation.lock").expect("another operation");
    let mut waits = 0;
    adopt_recordings_with(&root, &source, &mut |_| {
        waits += 1;
        assert!(waits <= ADOPTION_WAITS, "it must not wait for ever");
    });
    drop(held);
    assert_eq!(waits, ADOPTION_WAITS);
    assert!(source.join(later).exists() && !single.join(later).exists() && lines() == 3);
    // A refusal is not waited for, and is written once however many starts repeat it.
    fs::rename(&single, root.join("apartada")).expect("the single folder, set aside");
    fs::write(&single, b"not a folder").expect("a file in its place");
    for _ in 0..2 {
        adopt_recordings_with(&root, &source, &mut |_| panic!("a refusal is not busy"));
        assert!(source.join(later).exists() && lines() == 4);
    }
    fs::remove_dir_all(root).expect("cleanup");
}

/// Cadena real en CPU (#2771, PR B2): instalación con la estructura del candidato, oferta
/// firmada con la clave TEST servida por `127.0.0.1`, `stage()` y `apply()` reales y la
/// confirmación o la vuelta atrás del instalador. Sin ventanas, sin Electron y sin red.
#[cfg(feature = "hub-update-qa")]
mod qa_chain {
    use super::super::qa_transport::{RELEASES, Server, asset, reply};
    use super::*;
    use crate::installed::stage;
    use std::process::ExitCode;
    use vantare_installer::engine::operations::{self, BootRecovery, Control, Package};

    const INSTALLED: &str = "0.0.989";
    const NEXT: &str = "0.0.990";
    const PACKAGE: &str = "vantare-native-amd64-package.zip";
    /// Copia dentro de este paquete de `installer/fixtures/manifest-full.json`
    /// (SHA-256 3785b55376519a0526557d735ee38a3f2b4e07f39f9db69ddfba9b4846a97e05):
    /// un paquete solo incluye archivos propios. Un test exige que no diverja.
    const CANDIDATE: &str = include_str!("fixtures/candidate-manifest.json");

    #[test]
    fn candidate_fixture_matches_the_installer_inventory() {
        let installer =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../installer/fixtures/manifest-full.json");
        assert!(
            fs::read(&installer).expect("installer inventory") == CANDIDATE.as_bytes(),
            "fixtures/candidate-manifest.json diverge de {installer:?}: cópialo de nuevo"
        );
    }

    /// ZIP con los miembros reales de un candidato (`manifest-full.json` del instalador):
    /// cada EXE es un PE inerte del sistema con su sidecar; el resto, bytes fijos.
    struct Built {
        archive: std::path::PathBuf,
        sha256: String,
        expanded: u64,
    }
    fn build(parent: &Path, version: &str) -> Built {
        let full: serde_json::Value =
            serde_json::from_str(CANDIDATE).expect("full candidate manifest");
        let windows = std::env::var_os("WINDIR").expect("Windows root");
        let mut executable = fs::read(Path::new(&windows).join("System32/cmd.exe")).expect("PE");
        // El sufijo mantiene el PE válido y distingue el lanzador de cada versión.
        executable.extend_from_slice(format!("vantare-{version}").as_bytes());
        let executable_sha = format!("{:x}", sha2::Sha256::digest(&executable));
        let source = parent.join(format!("source-{version}"));
        let mut files = Vec::new();
        for path in full["files"]
            .as_array()
            .expect("files")
            .iter()
            .map(|file| file["path"].as_str().expect("path").to_owned())
        {
            if path == "candidate.ps1" {
                continue;
            }
            let is_exe = Path::new(&path)
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"));
            let bytes = if is_exe {
                executable.clone()
            } else if let Some(exe) = path.strip_suffix(".sha256") {
                let name = Path::new(exe)
                    .file_name()
                    .expect("PE name")
                    .to_string_lossy();
                format!("{executable_sha}  {name}\n").into_bytes()
            } else {
                b"fixture".to_vec()
            };
            let target = source.join(&path);
            fs::create_dir_all(target.parent().expect("member folder")).expect("member folder");
            fs::write(&target, &bytes).expect("member");
            files.push(serde_json::json!({"path":path,"size":bytes.len(),"sha256":format!("{:x}", sha2::Sha256::digest(&bytes))}));
        }
        let manifest = serde_json::to_vec(&serde_json::json!({"schema":1,"product":"vantare-native","candidate":true,"architecture":"windows-x64","data_schema":"opaque-v1","source_sha":"0".repeat(40),"source_dirty":false,"build_profile":"Debug","version":version,"channel":"beta","engine":2,"files":files})).expect("manifest");
        fs::write(source.join("manifest.json"), &manifest).expect("manifest");
        let initial = u64::try_from(manifest.len()).expect("manifest length");
        let expanded = files.iter().fold(initial, |total, file| {
            total + file["size"].as_u64().expect("size")
        });
        // Un nombre por llamada: `ZipFile.Open(…, 'Create')` falla si el ZIP ya existe, y la
        // vuelta atrás vuelve a servir la misma versión.
        let archive = parent.join(format!(
            "package-{version}-{}.zip",
            disk::id().expect("ZIP id")
        ));
        // La compresión del sistema crea un ZIP real, sin dependencia nueva de Rust. Cada
        // entrada lleva su nombre exacto con «/»: `CreateFromDirectory` de .NET Framework
        // escribe «bin\vantare.exe» y el motor solo admite los nombres del manifiesto.
        let script = "Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem; \
            $source = (Get-Item -LiteralPath $env:VANTARE_TEST_ZIP_SOURCE).FullName.TrimEnd('\\'); \
            $zip = [IO.Compression.ZipFile]::Open($env:VANTARE_TEST_ZIP, 'Create'); \
            try { Get-ChildItem -LiteralPath $source -Recurse -File | ForEach-Object { \
                $name = $_.FullName.Substring($source.Length + 1).Replace('\\', '/'); \
                [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $name) } \
            } finally { $zip.Dispose() }";
        let output =
            Command::new(vantare_installer::engine::powershell().expect("system PowerShell"))
                .creation_flags(0x0800_0000)
                .args([
                    "-NoLogo",
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    script,
                ])
                .env("VANTARE_TEST_ZIP_SOURCE", &source)
                .env("VANTARE_TEST_ZIP", &archive)
                .output()
                .expect("candidate ZIP");
        assert!(output.status.success(), "{:?}", output.stderr);
        fs::remove_dir_all(&source).expect("source cleanup");
        Built {
            sha256: hash_file(&archive).expect("ZIP hash"),
            archive,
            expanded,
        }
    }
    /// `apply` pide reiniciar con la salida 10; `ExitCode` solo se compara por su forma.
    fn restarts(code: ExitCode) -> bool {
        format!("{code:?}") == format!("{:?}", ExitCode::from(10))
    }
    /// Raíz QA con `INSTALLED` instalada de verdad por el instalador, sin registro ni accesos.
    struct Installed {
        parent: std::path::PathBuf,
        root: std::path::PathBuf,
    }
    impl Installed {
        fn new() -> Self {
            let parent = qa_root();
            let root = parent.join("instalación");
            fs::create_dir_all(&parent).expect("parent");
            let built = build(&parent, INSTALLED);
            let cancel = AtomicBool::new(false);
            let mut control = Control {
                cancel: &cancel,
                progress: &mut |_| {},
                checkpoint: &mut |_| Ok(()),
                warning: &mut |message| eprintln!("{message}"),
            };
            operations::install(
                &root,
                &Package {
                    archive: &built.archive,
                    sha256: &built.sha256,
                    version: INSTALLED,
                    channel: "beta",
                },
                vantare_installer::model::Mode::Install,
                &mut control,
                |_, _, _| Ok(()),
                || Ok(()),
            )
            .expect("installed candidate");
            Self { parent, root }
        }
        fn version(&self) -> String {
            vantare_installer::engine::Installation::read(&self.root)
                .expect("installation")
                .manifest
                .expect("active manifest")
                .version
        }
        fn status(&self) -> serde_json::Value {
            serde_json::from_slice(&fs::read(self.root.join("update-status.json")).expect("status"))
                .expect("status JSON")
        }
        /// Sirve `NEXT` firmado (con `expanded_delta` de más en el total firmado).
        fn serve(&self, releases: &[&str], expanded_delta: u64) -> Server {
            let built = build(&self.parent, NEXT);
            let mut next = offer();
            next.sha256 = built.sha256.clone();
            next.compressed_bytes = fs::metadata(&built.archive).expect("ZIP").len();
            next.expanded_bytes = built.expanded + expanded_delta;
            let list: Vec<_> = releases
                .iter()
                .map(|version| serde_json::json!({"draft":false,"tag_name":format!("hub-beta-v{version}")}))
                .collect();
            let server = Server::start(vec![
                (
                    RELEASES.into(),
                    reply("200 OK", &serde_json::to_vec(&list).expect("list")),
                ),
                (
                    asset(NEXT, "vantare-hub-beta.json"),
                    reply("200 OK", &signed(&next)),
                ),
                (
                    asset(NEXT, PACKAGE),
                    reply("200 OK", &fs::read(&built.archive).expect("ZIP")),
                ),
            ]);
            fs::write(self.root.join("qa-feed-port"), server.port.to_string()).expect("port");
            server
        }
    }
    impl Drop for Installed {
        fn drop(&mut self) {
            if !std::thread::panicking() {
                let _ = fs::remove_dir_all(&self.parent);
            }
        }
    }
    fn requests(listed: bool, offered: bool) -> Vec<String> {
        let mut expected = vec![RELEASES.to_owned()];
        if listed {
            expected.push(asset(NEXT, "vantare-hub-beta.json"));
        }
        if offered {
            expected.push(asset(NEXT, PACKAGE));
        }
        expected
    }

    #[test]
    fn qa_chain_stages_applies_and_confirms_a_signed_update() {
        let installed = Installed::new();
        let server = installed.serve(&[NEXT], 0);
        stage(&installed.root, &AtomicBool::new(false)).expect("stage");
        assert_eq!(server.finish(), requests(true, true));
        assert_eq!(installed.status()["state"], "ready");
        assert!(installed.root.join("staging/pending.json").exists());
        // `apply` instala la generación nueva y pide reiniciar (salida 10).
        assert!(restarts(apply(&installed.root).expect("apply")));
        assert!(!installed.root.join("staging/pending.json").exists());
        assert_eq!(installed.version(), NEXT);
        assert!(installed.root.join("boot-pending.json").exists());
        operations::confirm(&installed.root).expect("confirm");
        assert!(!installed.root.join("boot-pending.json").exists());
        assert_eq!(installed.version(), NEXT);
        assert_eq!(installed.status()["state"], "current");
    }

    #[test]
    fn qa_chain_rollback_rejects_the_version_and_never_offers_it_again() {
        let installed = Installed::new();
        let server = installed.serve(&[NEXT], 0);
        stage(&installed.root, &AtomicBool::new(false)).expect("stage");
        assert_eq!(server.finish(), requests(true, true));
        assert!(restarts(apply(&installed.root).expect("apply")));
        // Arranque no confirmado: vuelve la generación anterior y la nueva queda rechazada.
        assert_eq!(
            operations::rollback(&installed.root).expect("rollback"),
            BootRecovery::Restored
        );
        assert_eq!(installed.version(), INSTALLED);
        assert_eq!(installed.status()["rejectedVersion"], NEXT);
        // La misma oferta firmada sigue publicada: no se vuelve a pedir ni a descargar.
        let server = installed.serve(&[NEXT], 0);
        stage(&installed.root, &AtomicBool::new(false)).expect("stage after rollback");
        assert_eq!(server.finish(), requests(false, false));
        assert!(!installed.root.join("staging/pending.json").exists());
        assert_eq!(installed.version(), INSTALLED);
    }

    #[test]
    fn qa_chain_offers_nothing_at_or_below_the_installed_version() {
        let installed = Installed::new();
        let server = installed.serve(&[INSTALLED, "0.0.988"], 0);
        stage(&installed.root, &AtomicBool::new(false)).expect("stage");
        assert_eq!(server.finish(), requests(false, false));
        assert!(!installed.root.join("staging/pending.json").exists());
        assert_eq!(installed.status()["state"], "current");
    }

    #[test]
    fn qa_chain_publishes_nothing_when_the_expanded_total_differs() {
        let installed = Installed::new();
        let server = installed.serve(&[NEXT], 1);
        assert!(stage(&installed.root, &AtomicBool::new(false)).is_err());
        assert_eq!(server.finish(), requests(true, true));
        assert!(!installed.root.join("staging/pending.json").exists());
        assert!(!installed.root.join("update-status.json").exists());
        assert_eq!(installed.version(), INSTALLED);
    }
}
