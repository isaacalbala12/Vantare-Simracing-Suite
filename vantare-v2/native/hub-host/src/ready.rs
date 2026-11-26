use std::{
    io,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    time::{Duration, Instant},
};
/// How long the launcher may take to confirm a shown generation (#1995).
const CONFIRMATION: Duration = Duration::from_mins(1);
pub fn canonical_executable(path: &Path) -> io::Result<PathBuf> {
    let canonical = std::fs::canonicalize(path)?;
    if let Some(local) = canonical
        .to_str()
        .and_then(|value| value.strip_prefix(r"\\?\"))
        && matches!(local.as_bytes(), [drive,b':',b'\\',..] if drive.is_ascii_alphabetic())
    {
        return Ok(PathBuf::from(local));
    }
    Ok(canonical)
}
pub fn generation(executable: &Path) -> Option<PathBuf> {
    let executable = canonical_executable(executable).ok()?;
    let bin = executable.parent()?;
    let generation = bin.parent()?;
    let parent = generation.parent()?;
    let id = generation.file_name()?.to_str()?;
    (executable
        .file_name()?
        .to_str()?
        .eq_ignore_ascii_case("vantare-hub.exe")
        && bin.file_name()?.to_str()?.eq_ignore_ascii_case("bin")
        && parent
            .file_name()?
            .to_str()?
            .eq_ignore_ascii_case("generations")
        && id.len() == 32
        && id
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)))
    .then(|| generation.to_owned())
}
pub fn redirect_if_needed(executable: &Path) -> io::Result<bool> {
    let Some(generation) = generation(executable) else {
        return Ok(false);
    };
    let supplied = std::env::var_os("VANTARE_NATIVE_DATA_ROOT").map(PathBuf::from);
    let redirected = std::env::var("VANTARE_HUB_REDIRECTED").as_deref() == Ok("1");
    let Some(mut launcher) = redirection(&generation, supplied.as_deref(), redirected)? else {
        return Ok(false);
    };
    launcher.spawn()?;
    Ok(true)
}
/// The launcher command for an installed host started outside its session,
/// or `None` when the session already named this generation's data.
fn redirection(
    generation: &Path,
    supplied: Option<&Path>,
    redirected: bool,
) -> io::Result<Option<Command>> {
    let expected = std::fs::canonicalize(generation.join("data"))?;
    if supplied
        .and_then(|p| std::fs::canonicalize(p).ok())
        .as_ref()
        == Some(&expected)
    {
        return Ok(None);
    }
    if redirected {
        return Err(io::ErrorKind::PermissionDenied.into());
    }
    let root = generation
        .ancestors()
        .nth(2)
        .ok_or(io::ErrorKind::InvalidInput)?;
    let mut launcher = Command::new(root.join("Vantare.exe"));
    launcher
        .args(["--root", "-Root"])
        .arg(root)
        .current_dir(root)
        .env_remove("VANTARE_NATIVE_DATA_ROOT")
        .env_remove("VANTARE_BOOT_TOKEN")
        .env_remove("VANTARE_BETA_ROOT")
        .env_remove("VANTARE_APPEARANCE_FILE")
        .env_remove("VANTARE_BACKGROUND_STARTUP")
        .env_remove("VANTARE_INTERACTIVE_STARTUP")
        .env("VANTARE_HUB_REDIRECTED", "1");
    Ok(Some(launcher))
}
pub struct Ready {
    root: PathBuf,
    token: String,
    published: Option<Instant>,
}
impl Ready {
    pub fn from_executable(executable: &Path) -> io::Result<Option<Self>> {
        let Some(generation) = generation(executable) else {
            return Ok(None);
        };
        let root = generation
            .ancestors()
            .nth(2)
            .ok_or(io::ErrorKind::InvalidInput)?
            .to_owned();
        Self::new(root, std::env::var("VANTARE_BOOT_TOKEN").ok()).map(Some)
    }
    /// The confirmation of this boot: only the launcher's own token qualifies.
    pub(crate) fn new(root: PathBuf, token: Option<String>) -> io::Result<Self> {
        let token = token.ok_or(io::ErrorKind::PermissionDenied)?;
        if token.len() != 32
            || !token
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err(io::ErrorKind::PermissionDenied.into());
        }
        Ok(Self {
            root,
            token,
            published: None,
        })
    }
    pub fn publish(&mut self) -> io::Result<()> {
        if self.published.is_some() {
            return Ok(());
        }
        let temporary = self.root.join(format!("hub-ready-{}.tmp", self.token));
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(self.token.as_bytes())?;
        file.sync_all()?;
        drop(file);
        std::fs::rename(&temporary, self.root.join("hub-ready"))?;
        self.published = Some(Instant::now());
        Ok(())
    }
    pub fn check_confirmation(&self) -> io::Result<()> {
        self.check_confirmation_at(Instant::now())
    }
    /// Until shown, the launcher alone decides how long to wait. Once shown,
    /// a generation still pending after the launcher's minute stops the host.
    fn check_confirmation_at(&self, now: Instant) -> io::Result<()> {
        if self
            .published
            .is_some_and(|time| now.saturating_duration_since(time) > CONFIRMATION)
            && self.root.join("boot-pending.json").try_exists()?
        {
            return Err(io::ErrorKind::TimedOut.into());
        }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::Root;
    use std::ffi::OsStr;
    const TOKEN: &str = "0123456789abcdef0123456789abcdef";
    fn installed(root: &Root) -> PathBuf {
        let generation = root
            .path
            .join("generations/0123456789abcdef0123456789abcdef");
        std::fs::create_dir_all(generation.join("data")).expect("QA data");
        generation
    }
    #[test]
    fn an_installed_host_started_by_hand_goes_through_the_launcher_from_its_root() {
        let owned = Root::new();
        let generation = installed(&owned);
        let other = owned.path.join("other-data");
        std::fs::create_dir_all(&other).expect("other data");
        // Started by the session for this generation's data: no redirection,
        // even spelled another way.
        let spelled = generation.join("bin/../data");
        for supplied in [generation.join("data"), spelled] {
            let started =
                redirection(&generation, Some(supplied.as_path()), false).expect("session");
            assert!(started.is_none(), "{supplied:?}");
        }
        for supplied in [None, Some(other.as_path())] {
            let launcher = redirection(&generation, supplied, false)
                .expect("by hand")
                .expect("redirected");
            let root = generation.ancestors().nth(2).expect("root");
            assert_eq!(launcher.get_program(), root.join("Vantare.exe"));
            let args: Vec<_> = launcher.get_args().collect();
            assert_eq!(
                args,
                [OsStr::new("--root"), OsStr::new("-Root"), root.as_os_str()]
            );
            // Nothing may depend on the folder it was started from (a checkout).
            assert_eq!(launcher.get_current_dir(), Some(root));
            let envs: std::collections::BTreeMap<_, _> = launcher.get_envs().collect();
            for name in [
                "VANTARE_NATIVE_DATA_ROOT",
                "VANTARE_BOOT_TOKEN",
                "VANTARE_BETA_ROOT",
                "VANTARE_APPEARANCE_FILE",
                "VANTARE_BACKGROUND_STARTUP",
                "VANTARE_INTERACTIVE_STARTUP",
            ] {
                assert_eq!(envs.get(OsStr::new(name)), Some(&None), "{name}");
            }
            assert_eq!(
                envs.get(OsStr::new("VANTARE_HUB_REDIRECTED")),
                Some(&Some(OsStr::new("1")))
            );
        }
        // A second redirection would loop between launcher and host.
        let looped = redirection(&generation, Some(&other), true).map(|_| ());
        assert!(matches!(looped, Err(error) if error.kind() == io::ErrorKind::PermissionDenied));
    }
    #[test]
    fn only_this_boot_token_can_confirm() {
        let owned = Root::new();
        for token in [
            None,
            Some(String::new()),
            Some(TOKEN[1..].to_owned()),
            Some(format!("{TOKEN}0")),
            Some(TOKEN.to_uppercase()),
            Some(TOKEN.replace('0', "g")),
        ] {
            let refused = Ready::new(owned.path.clone(), token.clone()).map(|_| ());
            assert!(
                matches!(refused, Err(error) if error.kind() == io::ErrorKind::PermissionDenied),
                "{token:?}"
            );
        }
        assert!(Ready::new(owned.path.clone(), Some(TOKEN.to_owned())).is_ok());
    }
    #[test]
    fn ready_is_published_atomically_once_with_this_token() {
        let owned = Root::new();
        let mut ready = Ready::new(owned.path.clone(), Some(TOKEN.to_owned())).expect("token");
        let marker = owned.path.join("hub-ready");
        ready.publish().expect("publish");
        assert_eq!(std::fs::read_to_string(&marker).expect("marker"), TOKEN);
        let names: Vec<_> = std::fs::read_dir(&owned.path)
            .expect("root")
            .map(|entry| entry.expect("entry").file_name())
            .collect();
        assert_eq!(names, ["hub-ready"], "no temporary file remains");
        // The launcher consumed it: a later window event does not confirm again.
        std::fs::remove_file(&marker).expect("consumed");
        ready.publish().expect("once");
        assert!(!marker.exists());
    }
    #[test]
    fn a_shown_generation_left_pending_past_the_minute_stops_the_host() {
        let owned = Root::new();
        let pending = owned.path.join("boot-pending.json");
        std::fs::write(&pending, "{}").expect("pending");
        let mut ready = Ready::new(owned.path.clone(), Some(TOKEN.to_owned())).expect("token");
        let start = Instant::now();
        // A late Ready: before showing, the host never gives up by itself.
        let much_later = start + Duration::from_hours(1);
        assert!(ready.check_confirmation_at(much_later).is_ok());
        ready.publish().expect("publish");
        let shown = ready.published.expect("shown");
        assert!(ready.check_confirmation_at(shown + CONFIRMATION).is_ok());
        let late = shown + CONFIRMATION + Duration::from_millis(1);
        let stopped = ready.check_confirmation_at(late);
        assert!(matches!(stopped, Err(error) if error.kind() == io::ErrorKind::TimedOut));
        // Confirmed (marker retired): the host keeps running.
        std::fs::remove_file(&pending).expect("confirmed");
        assert!(ready.check_confirmation_at(late).is_ok());
    }
    #[test]
    fn only_the_canonical_installed_image_layout_can_publish_ready() {
        let root = std::env::temp_dir().join(format!(
            "vantare-hub-ready-{}",
            vantare_services::random_id().expect("QA id")
        ));
        let lower = root.join("lower/generations/0123456789abcdef0123456789abcdef/bin");
        let upper = root.join("upper/generations/0123456789ABCDEF0123456789ABCDEF/bin");
        for bin in [&lower, &upper] {
            std::fs::create_dir_all(bin).expect("QA bin");
            std::fs::write(bin.join("vantare-hub.exe"), b"inert fixture").expect("fixture");
        }
        let expected = canonical_executable(&lower)
            .expect("canonical bin")
            .parent()
            .expect("generation")
            .to_owned();
        assert_eq!(
            generation(&lower.join("../bin/vantare-hub.exe")),
            Some(expected)
        );
        assert!(generation(&upper.join("vantare-hub.exe")).is_none());
        std::fs::write(root.join("vantare-hub.exe"), b"inert fixture").expect("standalone");
        assert!(generation(&root.join("vantare-hub.exe")).is_none());
        let resolved = root.canonicalize().expect("owned QA");
        let namespace = std::env::temp_dir().canonicalize().expect("temp namespace");
        assert!(resolved.starts_with(&namespace) && resolved != namespace);
        std::fs::remove_dir_all(resolved).expect("remove own fixtures");
    }
}
