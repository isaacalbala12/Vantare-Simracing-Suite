use std::{io, path::PathBuf};
#[derive(Debug)]
pub struct Args {
    pub controlled: bool,
    pub pipe: String,
    pub data: PathBuf,
    pub layout: PathBuf,
    pub launcher: PathBuf,
    pub engineer: PathBuf,
}
impl Args {
    pub fn parse(args: impl IntoIterator<Item = String>) -> io::Result<Self> {
        let root = vantare_ipc::paths::Root::from_env().map_err(io::Error::other)?;
        let mut out = Self {
            controlled: false,
            pipe: vantare_ipc::default_pipe_name()?,
            data: root.hub(),
            layout: root.layout(),
            launcher: root.launcher(),
            engineer: root.engineer(),
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

#[cfg(test)]
mod tests {
    use super::*;
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
