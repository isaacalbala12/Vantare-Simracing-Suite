//! The Hub announces its window; the root launcher owns confirmation and
//! rollback. No Register child or PowerShell runs during a normal boot.
use std::{
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
        let executable = std::env::current_exe().map_err(|error| error.to_string())?;
        installed_hub(&executable, root)?;
        std::fs::write(root.join("hub-ready"), std::process::id().to_string())
            .map_err(|error| format!("confirmar arranque: {error}"))?;
        Ok(Self {
            root: root.into(),
            deadline: Instant::now() + Duration::from_secs(10),
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

fn installed_hub(executable: &Path, root: &Path) -> Result<(), String> {
    let bin = executable.parent().ok_or("falta la carpeta bin")?;
    let generation = bin.parent().ok_or("falta la generación")?;
    let generations = generation.parent().ok_or("faltan las generaciones")?;
    let id = generation.file_name().and_then(|name| name.to_str());
    if executable.file_name().and_then(|name| name.to_str()) != Some("vantare-hub.exe")
        || bin.file_name().and_then(|name| name.to_str()) != Some("bin")
        || generations != root.join("generations")
        || !id.is_some_and(|id| {
            id.len() == 32
                && id
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        })
    {
        return Err("el Hub no pertenece a esta instalación".into());
    }
    Ok(())
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
    fn marker_ack_has_one_injected_deadline_and_no_register_child() {
        let root = std::path::PathBuf::from(
            std::env::var_os("VANTARE_NATIVE_DATA_ROOT").expect("QA root"),
        )
        .join(format!("boot-confirmation-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("boot-pending.json"), b"{}").unwrap();
        let now = Instant::now();
        let confirmation = BootConfirmation {
            root: root.clone(),
            deadline: now + Duration::from_secs(10),
        };
        assert_eq!(confirmation.poll_at(now).unwrap(), false);
        assert!(confirmation.poll_at(now + Duration::from_secs(10)).is_err());
        std::fs::remove_file(root.join("boot-pending.json")).unwrap();
        assert_eq!(confirmation.poll_at(now).unwrap(), true);
        std::fs::remove_dir(root).unwrap();
    }
}
