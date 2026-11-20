//! Resolve the saved choice during session setup, before supervisor I/O.
use std::{
    io::{self, Read},
    path::{Path, PathBuf},
    time::Duration,
};
use vantare_ipc::paths::{Error, HUB_SETTINGS_FILE, RECORDINGS_DIR, Root};

pub(super) fn hub_data(root: &Root, installed: bool) -> PathBuf {
    if installed {
        root.base().join("hub")
    } else {
        root.hub()
    }
}

/// The one place that decides where the recordings live (ADR 0111 §3):
/// installed, a single folder in the installation root, shared by every
/// generation; in development, inside the Hub data, as before.
pub(super) fn directory(installation: Option<&Path>, hub: &Path) -> PathBuf {
    installation.unwrap_or(hub).join(RECORDINGS_DIR)
}

/// What an installed session tells the core and the Hub host, decided once
/// and before either exists (ADR 0111). `adopt` brings the recordings of this
/// generation first; the core records in the single folder and the Hub reads
/// it. A single folder that is a link, a junction or a file is never used:
/// nothing is brought, the core is not told to record (without `--series-dir`
/// it records nowhere) and `note` says so. The Hub still learns the folder,
/// and Analysis shows why there is no recording.
#[cfg(windows)]
pub(super) fn installed(
    installation: &Path,
    data: &Path,
    photo: &str,
    core: Vec<String>,
    adopt: &mut dyn FnMut(),
    note: &mut dyn FnMut(&str),
) -> (Vec<String>, Vec<String>) {
    let (hub, text) = (data.join("hub"), |path: PathBuf| {
        path.to_string_lossy().into_owned()
    });
    let folder = directory(Some(installation), &hub);
    let mut host = vec!["--control-stdin".into(), "--pipe".into(), photo.to_owned()];
    for (flag, document) in [
        ("--data-dir", "hub"),
        ("--layout", "Vantare/native/layout.json"),
        ("--engineer-settings", "Vantare/native/engineer.json"),
        ("--launcher-file", "Vantare/native/launcher.json"),
    ] {
        host.extend([flag.into(), text(data.join(document))]);
    }
    host.extend(["--recordings-dir".into(), text(folder.clone())]);
    // Looked at as itself, never through it. Missing is fine: the core makes it.
    let unusable = std::fs::symlink_metadata(&folder).is_ok_and(|found| {
        use std::os::windows::fs::MetadataExt;
        !found.is_dir() || found.file_attributes() & 0x400 != 0
    });
    if unusable {
        note(UNUSABLE);
        return (core, host);
    }
    adopt();
    (startup_args(core, Ok(hub), Some(installation)), host)
}
#[cfg(windows)]
const UNUSABLE: &str = "Grabaciones: desactivadas. «recordings» es un enlace, una unión o un archivo y Vantare no la usa; para volver a grabar, déjala como una carpeta normal.";

pub(super) fn startup_args(
    mut args: Vec<String>,
    hub: Result<PathBuf, Error>,
    installation: Option<&Path>,
) -> Vec<String> {
    if explicit_or_replay(&args) {
        return args;
    }
    match hub {
        Ok(hub) => configure(&mut args, &hub, &directory(installation, &hub)),
        Err(error) => super::log(format!(
            "grabación desactivada: raíz de datos no disponible ({error})"
        )),
    }
    args
}

fn explicit_or_replay(args: &[String]) -> bool {
    args.iter()
        .any(|arg| arg == "--series-dir" || arg == "--replay")
}

fn configure(args: &mut Vec<String>, hub: &Path, recordings: &Path) {
    if !explicit_or_replay(args) && enabled(hub) {
        args.extend([
            "--series-dir".into(),
            recordings.to_string_lossy().into_owned(),
        ]);
    }
}

fn enabled(hub: &Path) -> bool {
    enabled_with(
        || {
            let file = std::fs::File::open(hub.join(HUB_SETTINGS_FILE))?;
            let mut bytes = Vec::new();
            file.take(32 * 1024 + 1).read_to_end(&mut bytes)?;
            Ok(bytes)
        },
        std::thread::sleep,
    )
}

fn enabled_with(
    mut read: impl FnMut() -> io::Result<Vec<u8>>,
    mut wait: impl FnMut(Duration),
) -> bool {
    let mut retries = 0;
    let bytes = loop {
        match read() {
            Ok(bytes) => break bytes,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return true,
            Err(_) if retries < 3 => {
                retries += 1;
                wait(Duration::from_millis(20));
            }
            Err(_) => return true,
        }
    };
    // Match the store's byte limit, including any UTF-8 BOM.
    if bytes.len() > 32 * 1024 {
        return true;
    }
    let bytes = bytes.strip_prefix(b"\xef\xbb\xbf").unwrap_or(&bytes);
    serde_json::from_slice::<serde_json::Value>(bytes)
        .ok()
        .and_then(|value| value.get("general")?.get("grabacion")?.as_bool())
        .unwrap_or(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, io, time::Duration};

    struct TempDir(PathBuf);
    impl TempDir {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "vantare-recording-{}-{}",
                std::process::id(),
                vantare_services::random_id().unwrap()
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
        fn save(&self, bytes: impl AsRef<[u8]>) {
            fs::write(self.0.join(HUB_SETTINGS_FILE), bytes).unwrap();
        }
        fn startup(&self, args: Vec<String>) -> Vec<String> {
            startup_args(args, Ok(self.0.clone()), None)
        }
        fn expected(&self) -> Vec<String> {
            vec![
                "--live".into(),
                "--series-dir".into(),
                self.0.join("recordings").to_string_lossy().into_owned(),
            ]
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let target = self.0.canonicalize().unwrap();
            let parent = self.0.parent().unwrap().canonicalize().unwrap();
            assert!(target.starts_with(&parent) && target != parent);
            fs::remove_dir_all(target).unwrap();
        }
    }

    #[test]
    fn startup_defaults_on_for_missing_invalid_and_unreadable_settings() {
        let hub = TempDir::new();
        let startup = || hub.startup(vec!["--live".into()]);
        assert_eq!(startup(), hub.expected());
        let path = hub.0.join(HUB_SETTINGS_FILE);
        fs::create_dir(&path).unwrap();
        // Exercises the real bounded I/O retries at startup, not a test synchronization wait.
        assert_eq!(startup(), hub.expected());
        fs::remove_dir(path).unwrap();
        for bytes in [
            "{}",
            "{",
            r#"{"general":{}}"#,
            r#"{"general":{"grabacion":null}}"#,
            r#"{"general":{"grabacion":"false"}}"#,
            r#"{"general":{"grabacion":0}}"#,
            r#"{"general":{"grabacion":true}}"#,
        ] {
            hub.save(bytes);
            assert_eq!(startup(), hub.expected(), "{bytes}");
        }
    }

    #[test]
    fn real_startup_function_observes_the_choice_at_each_new_startup() {
        let hub = TempDir::new();
        hub.save(r#"{"general":{"grabacion":false}}"#);
        assert_eq!(hub.startup(vec!["--live".into()]), ["--live"]);
        hub.save(r#"{"general":{"grabacion":true}}"#);
        assert_eq!(hub.startup(vec!["--live".into()]), hub.expected());
    }

    #[test]
    fn explicit_directory_wins_even_when_recording_is_disabled() {
        let hub = TempDir::new();
        for enabled in [false, true] {
            hub.save(format!(r#"{{"general":{{"grabacion":{enabled}}}}}"#));
            let args = vec!["--series-dir".into(), "my development recordings".into()];
            let mut configured = args.clone();
            configure(&mut configured, &hub.0, &hub.0.join("recordings"));
            assert_eq!(configured, args);
            assert_eq!(hub.startup(args.clone()), args);
        }
    }

    #[test]
    fn replay_keeps_its_arguments_without_automatic_recording() {
        let hub = TempDir::new();
        hub.save(r#"{"general":{"grabacion":true}}"#);
        for args in [
            vec!["--replay".into(), "session.lmu.gz".into()],
            vec![
                "--replay".into(),
                "session.lmu.gz".into(),
                "--series-dir".into(),
                "explicit".into(),
            ],
        ] {
            let mut configured = args.clone();
            configure(&mut configured, &hub.0, &hub.0.join("recordings"));
            assert_eq!(configured, args);
            assert_eq!(hub.startup(args.clone()), args);
        }
    }

    #[test]
    fn byte_limit_is_inclusive_and_a_leading_utf8_bom_is_accepted() {
        let hub = TempDir::new();
        let mut bytes = br#"{"general":{"grabacion":false}}"#.to_vec();
        bytes.resize(32 * 1024, b' ');
        hub.save(&bytes);
        assert_eq!(hub.startup(vec!["--live".into()]), ["--live"]);
        bytes.push(b' ');
        hub.save(bytes);
        assert_eq!(hub.startup(vec!["--live".into()]), hub.expected());
        hub.save(b"\xef\xbb\xbf{\"general\":{\"grabacion\":false}}");
        assert_eq!(hub.startup(vec!["--live".into()]), ["--live"]);
    }

    #[test]
    fn unavailable_root_does_not_abort_startup_or_modify_explicit_arguments() {
        for args in [
            vec!["--live".into()],
            vec!["--series-dir".into(), "explicit".into()],
            vec!["--replay".into(), "session.lmu.gz".into()],
        ] {
            let missing = Err(vantare_ipc::paths::Error::MissingBase);
            let installation = Path::new("C:/Programs/Vantare");
            assert_eq!(
                startup_args(args.clone(), missing, Some(installation)),
                args
            );
        }
    }

    #[test]
    fn missing_file_returns_immediately_without_retrying() {
        let mut calls = 0;
        assert!(enabled_with(
            || {
                calls += 1;
                Err(io::Error::from(io::ErrorKind::NotFound))
            },
            |_| panic!("missing file must not wait"),
        ));
        assert_eq!(calls, 1);
    }

    #[test]
    fn transient_io_failures_retry_three_times_and_can_recover_false() {
        for failures in 1..=3 {
            let mut calls = 0;
            let mut delays = Vec::new();
            assert!(!enabled_with(
                || {
                    calls += 1;
                    if calls <= failures {
                        Err(io::Error::from(io::ErrorKind::PermissionDenied))
                    } else {
                        Ok(br#"{"general":{"grabacion":false}}"#.to_vec())
                    }
                },
                |duration| delays.push(duration),
            ));
            assert_eq!(calls, failures + 1);
            assert_eq!(delays, vec![Duration::from_millis(20); failures]);
        }
    }

    #[test]
    fn persistent_io_failure_defaults_on_after_three_retries() {
        let mut calls = 0;
        let mut delays = Vec::new();
        assert!(enabled_with(
            || {
                calls += 1;
                Err(io::Error::from(io::ErrorKind::PermissionDenied))
            },
            |duration| delays.push(duration),
        ));
        assert_eq!(calls, 4);
        assert_eq!(delays, vec![Duration::from_millis(20); 3]);
    }

    #[test]
    fn invalid_json_does_not_retry_successful_io() {
        let mut calls = 0;
        assert!(enabled_with(
            || {
                calls += 1;
                Ok(b"{".to_vec())
            },
            |_| panic!("successful read must not wait"),
        ));
        assert_eq!(calls, 1);
    }

    /// ADR 0111 §6: if the core and the Hub saw different folders, the Hub
    /// would show no recordings while the core kept recording.
    #[cfg(windows)]
    #[test]
    fn an_installed_session_tells_both_children_and_never_uses_a_folder_that_is_not_one() {
        let base = TempDir::new();
        let (installation, data) = (base.0.join("Vantare"), base.0.join("datos"));
        let settings = data.join("hub").join(HUB_SETTINGS_FILE);
        for folder in [&installation, &data.join("hub"), &base.0.join("fuera")] {
            fs::create_dir_all(folder).unwrap();
        }
        let told = || {
            let (mut adopted, mut notes) = (0, Vec::new());
            let core = vec!["--live".to_owned()];
            let (mut adopt, mut note) = (|| adopted += 1, |text: &str| notes.push(text.to_owned()));
            let (core, host) = installed(&installation, &data, "foto", core, &mut adopt, &mut note);
            (core, host, adopted, notes.len())
        };
        let single = installation.join("recordings");
        let folder = single.to_string_lossy().into_owned();
        let (core, host, adopted, notes) = told();
        assert_eq!(core, ["--live", "--series-dir", folder.as_str()]);
        assert_eq!(host[..3], ["--control-stdin", "--pipe", "foto"]);
        let hub = data.join("hub").to_string_lossy().into_owned();
        assert_eq!(host[3..5], ["--data-dir", hub.as_str()]);
        assert_eq!(host[11..], ["--recordings-dir", folder.as_str()]);
        assert_eq!((adopted, notes), (1, 0), "brought before either is told");
        // Not recording changes what the core does: never what is brought, nor
        // where the Hub reads.
        fs::write(&settings, r#"{"general":{"grabacion":false}}"#).unwrap();
        assert_eq!(told(), (vec!["--live".to_owned()], host.clone(), 1, 0));
        fs::remove_file(&settings).unwrap();
        // A link, a file: nothing is brought, the core is not told to record
        // and says why once; the Hub still learns the folder to show the warning.
        for kind in ["link", "file"] {
            if kind == "link" {
                std::os::windows::fs::symlink_dir(base.0.join("fuera"), &single).unwrap();
            } else {
                fs::write(&single, b"not a folder").unwrap();
            }
            assert_eq!(
                told(),
                (vec!["--live".to_owned()], host.clone(), 0, 1),
                "{kind}"
            );
            if kind == "link" {
                fs::remove_dir(&single).unwrap();
            }
        }
        // In development nothing moves: the folder inside the Hub data, which is
        // also where a host without the argument reads.
        assert_eq!(directory(None, &base.0), base.0.join("recordings"));
    }

    #[test]
    fn hub_data_matches_installed_and_development_hub() {
        let root = vantare_ipc::paths::Root::from_env().unwrap();
        assert_eq!(hub_data(&root, true), root.base().join("hub"));
        assert_eq!(hub_data(&root, false), root.hub());
    }
}
