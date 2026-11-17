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

pub(super) fn startup_args(mut args: Vec<String>, hub: Result<PathBuf, Error>) -> Vec<String> {
    if explicit_or_replay(&args) {
        return args;
    }
    match hub {
        Ok(hub) => configure(&mut args, &hub),
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

fn configure(args: &mut Vec<String>, hub: &Path) {
    if !explicit_or_replay(args) && enabled(hub) {
        args.extend([
            "--series-dir".into(),
            hub.join(RECORDINGS_DIR).to_string_lossy().into_owned(),
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
            startup_args(args, Ok(self.0.clone()))
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
            configure(&mut configured, &hub.0);
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
            configure(&mut configured, &hub.0);
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
            assert_eq!(
                startup_args(args.clone(), Err(vantare_ipc::paths::Error::MissingBase)),
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

    #[test]
    fn hub_data_matches_installed_and_development_hub() {
        let root = vantare_ipc::paths::Root::from_env().unwrap();
        assert_eq!(hub_data(&root, true), root.base().join("hub"));
        assert_eq!(hub_data(&root, false), root.hub());
    }
}
