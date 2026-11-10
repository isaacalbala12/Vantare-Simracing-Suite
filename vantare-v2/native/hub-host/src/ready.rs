use std::{
    io,
    io::Write,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
pub fn generation(executable: &Path) -> Option<&Path> {
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
    .then_some(generation)
}
pub fn redirect_if_needed(executable: &Path) -> io::Result<bool> {
    let Some(generation) = generation(executable) else {
        return Ok(false);
    };
    let expected = std::fs::canonicalize(generation.join("data"))?;
    let supplied =
        std::env::var_os("VANTARE_NATIVE_DATA_ROOT").and_then(|p| std::fs::canonicalize(p).ok());
    if supplied.as_ref() == Some(&expected) {
        return Ok(false);
    }
    if std::env::var("VANTARE_HUB_REDIRECTED").as_deref() == Ok("1") {
        return Err(io::ErrorKind::PermissionDenied.into());
    }
    let root = generation
        .ancestors()
        .nth(2)
        .ok_or(io::ErrorKind::InvalidInput)?;
    std::process::Command::new(root.join("Vantare.exe"))
        .args(["--root", "-Root"])
        .arg(root)
        .current_dir(root)
        .env_remove("VANTARE_NATIVE_DATA_ROOT")
        .env_remove("VANTARE_BOOT_TOKEN")
        .env_remove("VANTARE_BETA_ROOT")
        .env_remove("VANTARE_APPEARANCE_FILE")
        .env_remove("VANTARE_BACKGROUND_STARTUP")
        .env_remove("VANTARE_INTERACTIVE_STARTUP")
        .env("VANTARE_HUB_REDIRECTED", "1")
        .spawn()?;
    Ok(true)
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
        let token =
            std::env::var("VANTARE_BOOT_TOKEN").map_err(|_| io::ErrorKind::PermissionDenied)?;
        if token.len() != 32
            || !token
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err(io::ErrorKind::PermissionDenied.into());
        }
        Ok(Some(Self {
            root,
            token,
            published: None,
        }))
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
        if self
            .published
            .is_some_and(|time| time.elapsed() > Duration::from_mins(1))
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
    #[test]
    fn only_the_installed_image_layout_can_publish_ready() {
        assert!(
            generation(Path::new(
                "root/generations/0123456789abcdef0123456789abcdef/bin/vantare-hub.exe"
            ))
            .is_some()
        );
        assert!(
            generation(Path::new(
                "root/generations/0123456789ABCDEF0123456789ABCDEF/bin/vantare-hub.exe"
            ))
            .is_none()
        );
        assert!(generation(Path::new("root/vantare-hub.exe")).is_none());
    }
}
