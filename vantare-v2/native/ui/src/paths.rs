use std::{env, path::PathBuf};

#[cfg(windows)]
pub fn default_data_dir() -> Result<PathBuf, &'static str> {
    // Un override vacío o relativo resolvería los layouts desde el CWD de cada
    // proceso (Hub y overlays podrían usar documentos distintos): solo vale
    // una ruta absoluta, igual que XDG_DATA_HOME en Linux.
    env::var_os("VANTARE_NATIVE_DATA_ROOT")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .or_else(|| env::var_os("LOCALAPPDATA").map(PathBuf::from))
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

    #[cfg(windows)]
    #[test]
    fn empty_or_relative_overrides_fall_back_to_the_platform_location() {
        let saved = env::var_os("VANTARE_NATIVE_DATA_ROOT");
        let local = PathBuf::from(env::var_os("LOCALAPPDATA").expect("LOCALAPPDATA"));
        // SAFETY: este es el único test que escribe esta variable y la restaura.
        unsafe {
            env::set_var("VANTARE_NATIVE_DATA_ROOT", "");
            assert_eq!(
                default_data_dir().expect("override vacío"),
                local,
                "un override vacío no debe resolver layouts desde el CWD"
            );
            env::set_var("VANTARE_NATIVE_DATA_ROOT", "relativo\\vantare");
            assert_eq!(
                default_data_dir().expect("override relativo"),
                local,
                "un override relativo no debe resolver layouts desde el CWD"
            );
            let absolute = std::env::temp_dir().join("vantare-override-absoluto");
            env::set_var("VANTARE_NATIVE_DATA_ROOT", &absolute);
            assert_eq!(
                default_data_dir().expect("override absoluto"),
                absolute,
                "un override absoluto válido debe respetarse"
            );
            match saved {
                Some(value) => env::set_var("VANTARE_NATIVE_DATA_ROOT", value),
                None => env::remove_var("VANTARE_NATIVE_DATA_ROOT"),
            }
        }
    }

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
