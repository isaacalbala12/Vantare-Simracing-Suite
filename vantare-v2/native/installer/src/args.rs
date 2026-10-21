use std::{ffi::OsString, path::PathBuf};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Args {
    pub silent: bool,
    pub uninstall: bool,
    pub root: Option<PathBuf>,
    pub version: bool,
    #[cfg(feature = "parity-capture")]
    pub capture: Option<PathBuf>,
    #[cfg(feature = "parity-capture")]
    pub screen: Option<String>,
    #[cfg(feature = "parity-capture")]
    pub snapshot: Option<PathBuf>,
    #[cfg(feature = "parity-capture")]
    pub capture_batch: Option<PathBuf>,
}

impl Args {
    pub fn from_process(uninstall: bool) -> Result<Self, String> {
        let parsed = Self::parse(std::env::args_os().skip(1), uninstall)?;
        #[cfg(windows)]
        {
            let mut parsed = parsed;
            if parsed.root.is_some()
                && let Some(root) = crate::command_line::unquoted_root()?
            {
                parsed.root = Some(root);
            }
            Ok(parsed)
        }
        #[cfg(not(windows))]
        Ok(parsed)
    }

    pub fn parse(
        values: impl IntoIterator<Item = OsString>,
        uninstall: bool,
    ) -> Result<Self, String> {
        let mut parsed = Self {
            uninstall,
            ..Self::default()
        };
        let mut values = values.into_iter();
        while let Some(value) = values.next() {
            let text = value.to_str().ok_or("Argumento no Unicode")?;
            match text {
                "/S" => parsed.silent = true,
                "--version" => parsed.version = true,
                _ if text.starts_with("/D=") || text.starts_with("_?=") => {
                    if parsed.root.is_some() || text.len() <= 3 {
                        return Err("Ruta duplicada o vacía".into());
                    }
                    if text.starts_with("_?=") && !uninstall {
                        return Err("_? solo corresponde al desinstalador".into());
                    }
                    let mut root = OsString::from(&text[3..]);
                    // NSIS /D (and legacy _?=) consumes the terminal suffix.
                    // Switches must precede it, never become directory names.
                    for tail in values.by_ref() {
                        let text = tail.to_str().ok_or("Argumento no Unicode")?;
                        if text.starts_with('/')
                            || text.starts_with("--")
                            || text.starts_with("_?=")
                        {
                            return Err("La ruta debe ir al final, después de las opciones".into());
                        }
                        root.push(" ");
                        root.push(tail);
                    }
                    parsed.root = Some(PathBuf::from(root));
                }
                #[cfg(feature = "parity-capture")]
                _ if text.starts_with("--capture=") => {
                    parsed.capture = Some(PathBuf::from(&text[10..]));
                }
                #[cfg(feature = "parity-capture")]
                _ if text.starts_with("--screen=") => parsed.screen = Some(text[9..].into()),
                #[cfg(feature = "parity-capture")]
                _ if text.starts_with("--snapshot=") => {
                    parsed.snapshot = Some(PathBuf::from(&text[11..]));
                }
                #[cfg(feature = "parity-capture")]
                _ if text.starts_with("--capture-batch=") => {
                    parsed.capture_batch = Some(PathBuf::from(&text[16..]));
                }
                _ => return Err(format!("Argumento no reconocido: {text}")),
            }
        }
        Ok(parsed)
    }
}
