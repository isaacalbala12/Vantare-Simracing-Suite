//! The Hub announces its window; the root launcher owns confirmation and
//! rollback. No Register child or PowerShell runs during a normal boot.
use std::{
    io::Write,
    path::Path,
    time::{Duration, Instant},
};

pub(crate) fn initial_window(minimized: bool, interactive: bool, background: bool) -> (bool, bool) {
    let minimized = minimized && (!interactive || background);
    (minimized, !minimized && !background)
}

pub(crate) struct BootConfirmation {
    root: std::path::PathBuf,
    deadline: Instant,
}

impl BootConfirmation {
    pub(crate) fn start(root: &Path) -> Result<Self, String> {
        let executable = std::env::current_exe()
            .and_then(|path| crate::canonical_executable(&path))
            .map_err(|error| error.to_string())?;
        let generation = crate::installed_generation(&executable)
            .ok_or("el Hub no pertenece a esta instalación")?;
        let expected_root = crate::canonical_executable(root).map_err(|error| error.to_string())?;
        if generation.parent().and_then(Path::parent) != Some(expected_root.as_path()) {
            return Err("el Hub no pertenece a esta instalación".into());
        }
        let token = std::env::var("VANTARE_BOOT_TOKEN")
            .map_err(|_| "falta token de arranque".to_owned())?;
        if token.len() != 32
            || !token
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            return Err("token de arranque inválido".into());
        }
        publish_ready(root, &token).map_err(|error| format!("confirmar arranque: {error}"))?;
        Ok(Self {
            root: root.into(),
            deadline: Instant::now() + Duration::from_mins(1),
        })
    }

    pub(crate) fn poll(&mut self) -> Result<bool, String> {
        self.poll_at(Instant::now())
    }

    fn poll_at(&self, now: Instant) -> Result<bool, String> {
        match self.root.join("boot-pending.json").try_exists() {
            Ok(false) => Ok(true),
            Ok(true) if now < self.deadline => Ok(false),
            Ok(true) => Err("el lanzador no confirmó el arranque dentro del plazo".into()),
            Err(error) => Err(error.to_string()),
        }
    }
}

fn publish_ready(root: &Path, token: &str) -> std::io::Result<()> {
    let temporary = root.join(format!("hub-ready-{token}.tmp"));
    let mut file = std::fs::File::create(&temporary)?;
    file.write_all(token.as_bytes())?;
    file.sync_all()?;
    drop(file);
    let result = std::fs::rename(&temporary, root.join("hub-ready"));
    if result.is_err() {
        let _ = std::fs::remove_file(temporary);
    }
    result
}

pub(crate) fn defer_close(
    confirmation: &std::cell::RefCell<Option<BootConfirmation>>,
    hide: impl FnOnce(),
) -> bool {
    if confirmation.borrow().is_none() {
        return false;
    }
    hide();
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ready_is_published_as_complete_token() {
        let parent = if std::env::var("CI").as_deref() == Ok("true") {
            std::path::PathBuf::from(std::env::var_os("RUNNER_TEMP").expect("CI QA root"))
        } else {
            std::path::PathBuf::from("D:/VantareServer/qa/isa-1840")
        };
        let root = parent.join(format!("hub-ready-{}", std::process::id()));
        vantare_installer::engine::context::qa_path(&root).unwrap();
        std::fs::create_dir_all(&root).unwrap();
        publish_ready(&root, "aabb").unwrap();
        assert_eq!(
            std::fs::read_to_string(root.join("hub-ready")).unwrap(),
            "aabb"
        );
        assert!(!root.join("hub-ready-aabb.tmp").exists());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn failed_ready_rename_removes_temporary_file() {
        let parent = if std::env::var("CI").as_deref() == Ok("true") {
            std::path::PathBuf::from(std::env::var_os("RUNNER_TEMP").expect("CI QA root"))
        } else {
            std::path::PathBuf::from("D:/VantareServer/qa/isa-1840")
        };
        let root = parent.join(format!("hub-ready-fail-{}", std::process::id()));
        vantare_installer::engine::context::qa_path(&root).unwrap();
        std::fs::create_dir_all(root.join("hub-ready")).unwrap();
        assert!(publish_ready(&root, "aabb").is_err());
        assert!(!root.join("hub-ready-aabb.tmp").exists());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn marker_ack_has_one_injected_deadline_and_no_register_child() {
        let parent = if std::env::var("CI").as_deref() == Ok("true") {
            std::path::PathBuf::from(std::env::var_os("RUNNER_TEMP").expect("CI QA root"))
        } else {
            std::path::PathBuf::from("D:/VantareServer/qa/isa-1840")
        };
        let root = parent.join(format!("boot-confirmation-{}", std::process::id()));
        vantare_installer::engine::context::qa_path(&root).unwrap();
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("boot-pending.json"), b"{}").unwrap();
        let now = Instant::now();
        let confirmation = BootConfirmation {
            root: root.clone(),
            deadline: now + Duration::from_mins(1),
        };
        assert!(!confirmation.poll_at(now).unwrap());
        assert!(!confirmation.poll_at(now + Duration::from_secs(10)).unwrap());
        assert!(confirmation.poll_at(now + Duration::from_mins(1)).is_err());
        std::fs::remove_file(root.join("boot-pending.json")).unwrap();
        assert!(confirmation.poll_at(now).unwrap());
        std::fs::remove_dir(root).unwrap();
    }
}
