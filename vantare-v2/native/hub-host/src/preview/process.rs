//! A single bounded CLI invocation inside the existing kill-on-close Job.
use super::{PreviewError, PreviewImage, PreviewScale, TIMEOUT_MS};
use crate::{
    protocol::{CoreStatus, HostError},
    studio::WidgetKind,
};
use std::os::windows::fs::MetadataExt as _;
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
    time::{Duration, Instant},
};
use vantare_ipc::control::CatalogAccess;
const STDERR_LIMIT: u64 = 64 * 1024;
impl From<PreviewError> for HostError {
    fn from(reason: PreviewError) -> Self {
        Self::PreviewFailed { reason }
    }
}
struct Scratch(PathBuf);
impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
struct Running {
    child: crate::job::Child,
    scratch: Scratch,
    id: u32,
    generation: String,
    kind: WidgetKind,
    started: Instant,
}
impl Drop for Running {
    fn drop(&mut self) {
        if self.child.kill().is_ok() {
            let _ = self.child.wait();
        }
        // Child/Job fields drop before Scratch, including on error/unwind.
    }
}
pub(crate) struct State {
    root: PathBuf,
    active: Option<Running>,
    cleaned: bool,
}
impl State {
    pub(crate) fn new(root: PathBuf) -> Self {
        Self {
            root,
            active: None,
            cleaned: false,
        }
    }
    pub(crate) fn busy(&self) -> bool {
        self.active.is_some()
    }
    pub(crate) fn start(
        &mut self,
        id: u32,
        settings: &(WidgetKind, Vec<u8>),
        snapshot: Option<Vec<u8>>,
        scale: PreviewScale,
        generation: String,
        now: Instant,
    ) -> Result<(), HostError> {
        if self.busy() {
            return Err(HostError::Busy);
        }
        let host = std::env::current_exe().map_err(|_| PreviewError::Unavailable)?;
        let executable = sibling(&host)?;
        let kind = settings.0;
        let has_snapshot = snapshot.is_some();
        self.start_with(id, settings, snapshot, generation, now, |root| {
            capture_command(&executable, root, kind, scale, has_snapshot)
        })
    }
    fn start_with(
        &mut self,
        id: u32,
        settings: &(WidgetKind, Vec<u8>),
        snapshot: Option<Vec<u8>>,
        generation: String,
        now: Instant,
        command: impl FnOnce(&Path) -> Command,
    ) -> Result<(), HostError> {
        if self.busy() {
            return Err(HostError::Busy);
        }
        if !self.cleaned {
            fs::create_dir_all(&self.root).map_err(|_| HostError::Io)?;
            let metadata = fs::symlink_metadata(&self.root).map_err(|_| HostError::Io)?;
            if !metadata.is_dir() || metadata.file_attributes() & 0x400 != 0 {
                return Err(HostError::Io);
            }
            vantare_services::storage::private_acl(&self.root).map_err(|_| HostError::Io)?;
            sweep(&self.root).map_err(|_| HostError::Io)?;
            self.cleaned = true;
        }
        let path = self
            .root
            .join(vantare_services::random_id().map_err(|_| HostError::Io)?);
        fs::create_dir(&path).map_err(|_| HostError::Io)?;
        let scratch = Scratch(path);
        let input = scratch.0.join("settings.json");
        OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&input)
            .and_then(|mut file| file.write_all(&settings.1))
            .map_err(|_| HostError::Io)?;
        if let Some(bytes) = snapshot {
            OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(scratch.0.join("snapshot.json"))
                .and_then(|mut file| file.write_all(&bytes))
                .map_err(|_| HostError::Io)?;
        }
        let stderr = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(scratch.0.join("stderr"))
            .map_err(|_| HostError::Io)?;
        let mut command = command(&scratch.0);
        command.env("TEMP", &scratch.0).env("TMP", &scratch.0);
        let child = crate::job::spawn(&command, &stderr).map_err(|_| PreviewError::Unavailable)?;
        self.active = Some(Running {
            child,
            scratch,
            id,
            generation,
            kind: settings.0,
            started: now,
        });
        Ok(())
    }
    pub(crate) fn poll(
        &mut self,
        now: Instant,
        current: &CoreStatus,
        access: Option<CatalogAccess>,
        closing: bool,
    ) -> Option<(u32, Result<PreviewImage, HostError>)> {
        let run = self.active.as_mut()?;
        let result = if closing
            || current.live
            || !current.access.verified
            || current.access.blocked
            || current.account_generation.as_deref() != Some(run.generation.as_str())
            || !run.kind.info(access).allowed
        {
            Err(HostError::Denied)
        } else if !fs::metadata(run.scratch.0.join("stderr"))
            .is_ok_and(|metadata| metadata.len() <= STDERR_LIMIT)
        {
            Err(PreviewError::CaptureFailed.into())
        } else if now.saturating_duration_since(run.started)
            >= Duration::from_millis(u64::from(TIMEOUT_MS))
        {
            Err(PreviewError::Timeout.into())
        } else {
            match run.child.try_wait() {
                Ok(None) => return None,
                Err(_) => Err(PreviewError::CaptureFailed.into()),
                Ok(Some(status)) => {
                    complete(&run.scratch.0, status.code()).map_err(HostError::from)
                }
            }
        };
        let id = run.id;
        self.active = None; // Terminate/reap and remove private files before publishing.
        Some((id, result))
    }
}
// Only this host-owned namespace is swept, once before its first capture.
// Refuse a redirected root; unlink descendant reparse points without traversing them.
fn sweep(root: &Path) -> std::io::Result<()> {
    const REPARSE: u32 = 0x400;
    const DIRECTORY: u32 = 0x10;
    let metadata = fs::symlink_metadata(root)?;
    if !metadata.is_dir() || metadata.file_attributes() & REPARSE != 0 {
        return Err(std::io::ErrorKind::InvalidInput.into());
    }
    for entry in fs::read_dir(root)? {
        let path = entry?.path();
        let metadata = fs::symlink_metadata(&path)?;
        if metadata.file_attributes() & REPARSE != 0 {
            if metadata.file_attributes() & DIRECTORY != 0 {
                fs::remove_dir(path)?;
            } else {
                fs::remove_file(path)?;
            }
        } else if metadata.is_dir() {
            sweep(&path)?;
            fs::remove_dir(path)?;
        } else {
            fs::remove_file(path)?;
        }
    }
    Ok(())
}
fn capture_command(
    executable: &Path,
    root: &Path,
    kind: WidgetKind,
    scale: PreviewScale,
    has_snapshot: bool,
) -> Command {
    let mut command = Command::new(executable);
    environment(&mut command);
    command.current_dir(executable.parent().expect("sibling parent"));
    command
        .args(["--capture-scene", "--widget", kind.id(), "--settings"])
        .arg(root.join("settings.json"))
        .arg("--scale")
        .arg(scale.argument())
        .arg("--output")
        .arg(root.join("image.png"));
    if has_snapshot {
        command.arg("--snapshot").arg(root.join("snapshot.json"));
    }
    command
}
fn sibling(host: &Path) -> Result<PathBuf, PreviewError> {
    let executable = host
        .parent()
        .ok_or(PreviewError::Unavailable)?
        .join("vantare-overlays-rune.exe");
    if !executable.is_file() {
        return Err(PreviewError::Unavailable);
    }
    Ok(executable)
}
fn complete(root: &Path, code: Option<i32>) -> Result<PreviewImage, PreviewError> {
    let mut stderr = Vec::new();
    File::open(root.join("stderr"))
        .and_then(|file| file.take(1024).read_to_end(&mut stderr))
        .map_err(|_| PreviewError::CaptureFailed)?;
    super::exit_error(code, &stderr)?;
    let mut bytes = Vec::new();
    File::open(root.join("image.png"))
        .and_then(|file| {
            file.take((super::PNG_LIMIT + 1) as u64)
                .read_to_end(&mut bytes)
        })
        .map_err(|_| PreviewError::CaptureFailed)?;
    super::image(&bytes)
}
fn environment(command: &mut Command) {
    command.env_clear();
    for name in [
        "SystemRoot",
        "SystemDrive",
        "WINDIR",
        "LOCALAPPDATA",
        "APPDATA",
        "USERPROFILE",
        "VANTARE_SIN_GRAFICOS",
    ] {
        if let Some(value) = std::env::var_os(name) {
            command.env(name, value);
        }
    }
    // The executable path is absolute; no PATH lookup or inherited Hub authentication.
}
#[cfg(test)]
#[path = "process_tests.rs"]
mod tests;
