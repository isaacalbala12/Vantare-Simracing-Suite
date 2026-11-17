//! The saved choice is read once during session setup, before supervisor I/O.
use std::{
    io::Read,
    path::{Path, PathBuf},
};
use vantare_ipc::paths::{HUB_SETTINGS_FILE, Root};

pub(super) fn hub_data(root: &Root, installed: bool) -> PathBuf {
    if installed {
        root.base().join("hub")
    } else {
        root.hub()
    }
}

pub(super) fn configure(args: &mut Vec<String>, hub: &Path) {
    if enabled(hub) {
        args.extend([
            "--series-dir".into(),
            hub.join("recordings").to_string_lossy().into_owned(),
        ]);
    }
}

fn enabled(hub: &Path) -> bool {
    // Match the settings store's size limit; malformed or inaccessible input enables recording.
    let read = || -> Option<serde_json::Value> {
        let file = std::fs::File::open(hub.join(HUB_SETTINGS_FILE)).ok()?;
        let mut bytes = Vec::new();
        file.take(32 * 1024 + 1).read_to_end(&mut bytes).ok()?;
        if bytes.len() > 32 * 1024 {
            return None;
        }
        serde_json::from_slice(&bytes).ok()
    };
    read()
        .and_then(|value| value.get("general")?.get("grabacion")?.as_bool())
        .unwrap_or(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn only_valid_false_disables_recording_and_startup_reads_once() {
        let root = vantare_ipc::paths::Root::from_env().unwrap();
        let hub = root
            .base()
            .join(format!("g4b-{}", vantare_services::random_id().unwrap()));
        fs::create_dir_all(&hub).unwrap();
        let path = hub.join(vantare_ipc::paths::HUB_SETTINGS_FILE);
        let expected = vec![
            "--live".to_owned(),
            "--series-dir".to_owned(),
            hub.join("recordings").to_string_lossy().into_owned(),
        ];
        let startup = || {
            let mut args = vec!["--live".into()];
            configure(&mut args, &hub);
            args
        };
        assert_eq!(startup(), expected); // Missing file.
        fs::create_dir(&path).unwrap();
        assert_eq!(startup(), expected); // Unreadable as a file.
        fs::remove_dir(&path).unwrap();
        for bytes in [
            "{}",
            "{",
            r#"{"general":{}}"#,
            r#"{"general":{"grabacion":null}}"#,
            r#"{"general":{"grabacion":"false"}}"#,
            r#"{"general":{"grabacion":0}}"#,
            r#"{"general":{"grabacion":true}}"#,
        ] {
            fs::write(&path, bytes).unwrap();
            assert_eq!(startup(), expected, "{bytes}");
        }
        fs::write(&path, r#"{"general":{"grabacion":false}}"#).unwrap();
        let args = startup();
        assert_eq!(args, ["--live"]);
        fs::write(&path, r#"{"general":{"grabacion":true}}"#).unwrap();
        assert_eq!(
            args,
            ["--live"],
            "running program retains its startup arguments"
        );
        assert_eq!(
            startup(),
            expected,
            "next startup observes the saved choice"
        );
        fs::remove_file(path).unwrap();
        fs::remove_dir(hub).unwrap();
    }

    #[test]
    fn hub_data_matches_installed_and_development_hub() {
        let root = vantare_ipc::paths::Root::from_env().unwrap();
        assert_eq!(hub_data(&root, true), root.base().join("hub"));
        assert_eq!(hub_data(&root, false), root.hub());
    }
}
