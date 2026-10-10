use std::{env, path::PathBuf};

#[cfg(windows)]
pub fn default_data_dir() -> Result<PathBuf, &'static str> {
    env::var_os("VANTARE_NATIVE_DATA_ROOT")
        .or_else(|| env::var_os("LOCALAPPDATA"))
        .map(PathBuf::from)
        .ok_or("LOCALAPPDATA no está definido")
}

#[cfg(target_os = "linux")]
pub fn default_data_dir() -> Result<PathBuf, &'static str> {
    env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")))
        .ok_or("XDG_DATA_HOME o HOME no están definidos")
}

#[cfg(target_os = "macos")]
pub fn default_data_dir() -> Result<PathBuf, &'static str> {
    env::var_os("HOME")
        .map(|home| PathBuf::from(home).join("Library/Application Support"))
        .ok_or("HOME no está definido")
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
pub fn default_data_dir() -> Result<PathBuf, &'static str> {
    Err("directorio de datos no disponible en esta plataforma")
}

#[cfg(test)]
mod tests {
    use super::default_data_dir;
    use std::{env, path::PathBuf};

    #[test]
    fn default_data_dir_uses_the_platform_location() {
        let actual = default_data_dir().expect("directorio de datos");

        #[cfg(windows)]
        let expected = PathBuf::from(env::var_os("LOCALAPPDATA").expect("LOCALAPPDATA"));
        #[cfg(target_os = "linux")]
        let expected = env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
            .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")))
            .expect("XDG_DATA_HOME o HOME");
        #[cfg(target_os = "macos")]
        let expected =
            PathBuf::from(env::var_os("HOME").expect("HOME")).join("Library/Application Support");

        assert_eq!(actual, expected);
    }
}
