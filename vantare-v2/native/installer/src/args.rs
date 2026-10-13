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
}

impl Args {
    pub fn parse(
        values: impl IntoIterator<Item = OsString>,
        uninstall: bool,
    ) -> Result<Self, String> {
        let mut parsed = Self {
            uninstall,
            ..Self::default()
        };
        for value in values {
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
                    parsed.root = Some(PathBuf::from(&text[3..]));
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
                _ => return Err(format!("Argumento no reconocido: {text}")),
            }
        }
        Ok(parsed)
    }
}
