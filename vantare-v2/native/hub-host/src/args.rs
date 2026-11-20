use std::{
    io,
    path::{Path, PathBuf},
};
#[derive(Debug)]
pub struct Args {
    pub controlled: bool,
    pub pipe: String,
    pub data: PathBuf,
    pub layout: PathBuf,
    pub launcher: PathBuf,
    pub engineer: PathBuf,
    /// The single folder of the installation, when the session names it.
    pub recordings: Option<PathBuf>,
}
impl Args {
    pub fn parse(args: impl IntoIterator<Item = String>) -> io::Result<Self> {
        Self::parse_in(args, installation().as_deref())
    }
    /// Where Analysis reads: the single folder the session names or, without
    /// it (development, or a launcher that does not know it), inside the data.
    pub fn recordings(&self) -> PathBuf {
        let inside_data = || self.data.join("recordings");
        self.recordings.clone().unwrap_or_else(inside_data)
    }
    /// `installation` is the root this host runs from, when it is installed.
    fn parse_in(
        args: impl IntoIterator<Item = String>,
        installation: Option<&Path>,
    ) -> io::Result<Self> {
        let root = vantare_ipc::paths::Root::from_env().map_err(io::Error::other)?;
        let mut out = Self {
            controlled: false,
            pipe: vantare_ipc::default_pipe_name()?,
            data: root.hub(),
            layout: root.layout(),
            launcher: root.launcher(),
            engineer: root.engineer(),
            recordings: None,
        };
        let mut seen = std::collections::BTreeSet::new();
        let mut args = args.into_iter();
        while let Some(flag) = args.next() {
            if !seen.insert(flag.clone()) {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "duplicate argument",
                ));
            }
            if flag == "--control-stdin" {
                out.controlled = true;
                continue;
            }
            let value = args.next().ok_or_else(|| {
                io::Error::new(io::ErrorKind::InvalidInput, "missing argument value")
            })?;
            match flag.as_str() {
                "--pipe" if !value.trim().is_empty() => out.pipe = value,
                "--data-dir" => out.data = value.into(),
                "--layout" => out.layout = value.into(),
                "--launcher-file" => out.launcher = value.into(),
                "--engineer-settings" => out.engineer = value.into(),
                "--recordings-dir" => out.recordings = Some(single_folder(value, installation)?),
                _ => {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidInput,
                        "unknown argument",
                    ));
                }
            }
        }
        if [&out.data, &out.layout, &out.launcher, &out.engineer]
            .iter()
            .any(|path| !path.is_absolute())
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "absolute paths required",
            ));
        }
        Ok(out)
    }
}
/// The installation this executable belongs to: `<root>/generations/<id>/bin`.
fn installation() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        let generation = crate::ready::generation(&std::env::current_exe().ok()?)?;
        generation.ancestors().nth(2).map(Path::to_path_buf)
    }
    #[cfg(not(windows))]
    None
}
/// ADR 0111 §3: only a folder of a local disk, strictly inside the installation
/// and spelled without `..` or links; never a network path. The session builds
/// it from the root it runs from: anything else is not its argument.
fn single_folder(value: String, installation: Option<&Path>) -> io::Result<PathBuf> {
    use std::path::{Component, Prefix};
    let path = PathBuf::from(value);
    let mut parts = path.components();
    let disk = |part| matches!(part, Component::Prefix(prefix) if matches!(prefix.kind(), Prefix::Disk(_)));
    let local = parts.next().is_some_and(disk)
        && parts.next() == Some(Component::RootDir)
        && parts.all(|part| matches!(part, Component::Normal(_)));
    if local && installation.is_some_and(|root| inside(root, &path)) {
        return Ok(path);
    }
    Err(io::Error::new(
        io::ErrorKind::InvalidInput,
        "recordings folder outside the installation",
    ))
}
/// From the folder up to the root nothing may be a link; what does not exist
/// yet cannot be one. Both are compared as the disk names them.
fn inside(root: &Path, path: &Path) -> bool {
    let Ok(root) = root.canonicalize() else {
        return false;
    };
    for ancestor in path.ancestors() {
        if std::fs::symlink_metadata(ancestor).is_ok_and(|found| crate::analysis::reparse(&found)) {
            return false;
        }
        if ancestor != path && ancestor.canonicalize().is_ok_and(|found| found == root) {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    fn the_recordings_folder_must_be_local_and_inside_the_installation() {
        use std::os::windows::fs::symlink_dir;
        let name = format!("vantare-host-recordings-{}", std::process::id());
        let base = std::env::temp_dir().join(name);
        let (root, outside) = (base.join("Vantare"), base.join("fuera"));
        for folder in [&root, &outside] {
            std::fs::create_dir_all(folder).expect("fixture");
        }
        let parse = |value: &Path, installation| {
            let value = value.to_string_lossy().into_owned();
            Args::parse_in(["--recordings-dir".to_owned(), value], installation)
        };
        // Not created yet, already there, and spelled in another case.
        let single = root.join("recordings");
        let named = parse(&single, Some(&root)).expect("not created yet");
        assert_eq!(named.recordings(), single);
        std::fs::create_dir(&single).expect("fixture");
        let shouted = PathBuf::from(single.to_string_lossy().to_uppercase());
        for spelling in [&single, &shouted] {
            assert!(parse(spelling, Some(&root)).is_ok(), "{spelling:?}");
        }
        // A link is not a reason to stop the whole Hub: the argument is taken
        // and Analysis alone refuses the folder, every time it reads it.
        let (link, back) = (root.join("enlace"), root.join("vuelta"));
        symlink_dir(&outside, &link).expect("link to the outside");
        symlink_dir(&root, &back).expect("link back to the root");
        for linked in [
            link.clone(),
            link.join("recordings"),
            back.join("recordings"),
        ] {
            let named = parse(&linked, Some(&root)).expect("links are left to the reading");
            let read = crate::analysis::recordings(&named.recordings());
            let refused = read.map_err(|error| error.code);
            assert_eq!(
                refused,
                Err(crate::analysis::ErrorCode::Unreadable),
                "{linked:?}"
            );
        }
        for (value, why) in [
            (root.clone(), "the root itself"),
            (outside.join("recordings"), "outside"),
            (
                base.join("Vantare2/recordings"),
                "a neighbour with the same start",
            ),
            (single.join("../../fuera"), "dots"),
            (r"\\servidor\recurso\recordings".into(), "a network path"),
            (
                format!(r"\\?\{}", single.display()).into(),
                "a verbatim path",
            ),
            ("recordings".into(), "relative"),
            ("C:recordings".into(), "relative to a drive"),
        ] {
            assert!(parse(&value, Some(&root)).is_err(), "{why}: {value:?}");
        }
        // A host outside an installation has no single folder to be given.
        assert!(parse(&single, None).is_err());
        // Without the argument nothing changes: the folder inside the data.
        let data = [
            "--data-dir".to_owned(),
            outside.to_string_lossy().into_owned(),
        ];
        let unnamed = Args::parse_in(data, Some(&root)).expect("as before");
        assert_eq!(unnamed.recordings(), outside.join("recordings"));
        std::fs::remove_dir_all(base).expect("cleanup");
    }
    #[test]
    fn supervisor_arguments_and_absolute_paths_are_preserved() {
        let root = std::env::temp_dir().join("vantare-host-args");
        let args = Args::parse([
            "--control-stdin".into(),
            "--pipe".into(),
            "qa-photo".into(),
            "--data-dir".into(),
            root.to_string_lossy().into_owned(),
        ])
        .expect("supervisor args");
        assert!(args.controlled);
        assert_eq!(args.pipe, "qa-photo");
        assert_eq!(args.data, root);
    }
    #[test]
    fn duplicate_unknown_and_relative_arguments_fail_closed() {
        for args in [
            vec!["--control-stdin", "--control-stdin"],
            vec!["--unknown", "value"],
            vec!["--data-dir", "relative"],
            vec!["--pipe"],
        ] {
            assert!(Args::parse(args.into_iter().map(str::to_owned)).is_err());
        }
    }
}
