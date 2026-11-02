//! Cálculo de rutas, sin E/S ni mudanza de documentos (#1869, paso 3).
use std::{
    env,
    ffi::OsString,
    fmt, io,
    path::{Path, PathBuf},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Error {
    MissingBase,
    RelativePath,
    UnsupportedPlatform,
    QaOverrideRequired,
}

impl Error {
    pub const fn message(self) -> &'static str {
        match self {
            Self::MissingBase => "directorio base de datos no definido",
            Self::RelativePath => "la raíz de datos debe ser absoluta",
            Self::UnsupportedPlatform => "plataforma sin directorio de datos",
            Self::QaOverrideRequired => {
                "los tests requieren VANTARE_NATIVE_DATA_ROOT absoluto bajo QA"
            }
        }
    }
}
impl fmt::Display for Error {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.message())
    }
}
impl std::error::Error for Error {}
impl From<Error> for io::Error {
    fn from(error: Error) -> Self {
        let kind = match error {
            Error::MissingBase => io::ErrorKind::NotFound,
            Error::RelativePath | Error::QaOverrideRequired => io::ErrorKind::InvalidInput,
            Error::UnsupportedPlatform => io::ErrorKind::Unsupported,
        };
        Self::new(kind, error)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Root(PathBuf);

impl Root {
    /// Resuelve una base absoluta; un override vacío equivale a ausencia.
    ///
    /// # Errors
    /// Falla ante rutas relativas, base ausente, plataforma no soportada o falta de override QA en tests.
    pub fn from_env() -> Result<Self, Error> {
        // cfg(test) no llega a dependencias: los consumidores activan la feature existente.
        #[cfg(any(test, feature = "test-support"))]
        if !env::var_os("VANTARE_NATIVE_DATA_ROOT")
            .is_some_and(|value| PathBuf::from(value).is_absolute())
        {
            return Err(Error::QaOverrideRequired);
        }
        Self::resolve(env::consts::OS, |name| env::var_os(name))
    }

    fn resolve(os: &str, get: impl Fn(&str) -> Option<OsString>) -> Result<Self, Error> {
        let value = |name| {
            get(name)
                .filter(|value| !value.is_empty())
                .map(PathBuf::from)
        };
        if let Some(base) = value("VANTARE_NATIVE_DATA_ROOT") {
            return Self::absolute(base);
        }
        let home = || value("HOME").ok_or(Error::MissingBase);
        let base = match os {
            "windows" => value("LOCALAPPDATA").ok_or(Error::MissingBase)?,
            "linux" => match value("XDG_DATA_HOME") {
                Some(base) => base,
                None => home()?.join(".local/share"),
            },
            "macos" => home()?.join("Library/Application Support"),
            _ => return Err(Error::UnsupportedPlatform),
        };
        Self::absolute(base)
    }

    /// Politica pura para fixtures de plataforma, sin consultar el entorno ni abrir archivos.
    #[cfg(feature = "test-support")]
    pub fn resolve_fixture(
        os: &str,
        get: impl Fn(&str) -> Option<OsString>,
    ) -> Result<Self, Error> {
        Self::resolve(os, get)
    }

    fn absolute(base: PathBuf) -> Result<Self, Error> {
        if !base.is_absolute() {
            return Err(Error::RelativePath);
        }
        Ok(Self(base))
    }

    pub fn base(&self) -> &Path {
        &self.0
    }
    pub fn native(&self) -> PathBuf {
        self.0.join("Vantare/native")
    }
    /// Valor por defecto de desarrollo; --data-dir sigue teniendo prioridad.
    pub fn hub(&self) -> PathBuf {
        self.0.join("VantareNative/hub")
    }
    pub fn layout(&self) -> PathBuf {
        self.native().join("layout.json")
    }
    pub fn engineer(&self) -> PathBuf {
        self.native().join("engineer.json")
    }
    pub fn launcher(&self) -> PathBuf {
        self.native().join("launcher.json")
    }
    pub fn services(&self) -> PathBuf {
        self.native().join("services")
    }
    pub fn rights(&self) -> PathBuf {
        self.native().join("rights")
    }
    pub fn logs(&self) -> PathBuf {
        self.native().join("logs")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn resolve(os: &str, values: &[(&str, &Path)]) -> Result<Root, Error> {
        Root::resolve(os, |key| {
            values
                .iter()
                .find(|(name, _)| *name == key)
                .map(|(_, path)| path.as_os_str().to_owned())
        })
    }
    fn qa() -> PathBuf {
        env::temp_dir().join("vantare-1869-root-fixture")
    }

    #[test]
    fn absolute_override_wins_on_every_platform_without_reading_other_locations() {
        let base = qa();
        for os in ["windows", "linux", "macos", "other"] {
            let root = resolve(
                os,
                &[
                    ("VANTARE_NATIVE_DATA_ROOT", &base),
                    ("LOCALAPPDATA", Path::new("relative")),
                ],
            )
            .expect("override");
            assert_eq!(root.base(), base);
        }
    }

    #[test]
    fn platform_defaults_and_empty_overrides_preserve_windows_and_use_one_unix_base() {
        let base = qa();
        let home = base.join("home");
        let empty = Path::new("");
        assert_eq!(
            resolve(
                "windows",
                &[("VANTARE_NATIVE_DATA_ROOT", empty), ("LOCALAPPDATA", &base)]
            )
            .expect("Windows")
            .base(),
            base
        );
        assert_eq!(
            resolve(
                "linux",
                &[
                    ("VANTARE_NATIVE_DATA_ROOT", empty),
                    ("XDG_DATA_HOME", &base),
                    ("XDG_CONFIG_HOME", &home)
                ]
            )
            .expect("XDG data")
            .base(),
            base
        );
        assert_eq!(
            resolve("linux", &[("HOME", &home)])
                .expect("Linux home")
                .base(),
            home.join(".local/share")
        );
        assert_eq!(
            resolve(
                "macos",
                &[("VANTARE_NATIVE_DATA_ROOT", empty), ("HOME", &home)]
            )
            .expect("macOS home")
            .base(),
            home.join("Library/Application Support")
        );
    }

    #[test]
    fn relative_overrides_never_fall_back_to_a_different_store() {
        let base = qa();
        for os in ["windows", "linux", "macos"] {
            assert_eq!(
                resolve(
                    os,
                    &[
                        ("VANTARE_NATIVE_DATA_ROOT", Path::new("relative")),
                        ("LOCALAPPDATA", &base),
                        ("XDG_DATA_HOME", &base),
                        ("HOME", &base)
                    ]
                ),
                Err(Error::RelativePath)
            );
        }
    }

    #[test]
    fn missing_or_relative_platform_bases_fail_explicitly() {
        for os in ["windows", "linux", "macos"] {
            assert_eq!(resolve(os, &[]), Err(Error::MissingBase));
        }
        for (os, name) in [
            ("windows", "LOCALAPPDATA"),
            ("linux", "XDG_DATA_HOME"),
            ("linux", "HOME"),
            ("macos", "HOME"),
        ] {
            assert_eq!(
                resolve(os, &[(name, Path::new("relative"))]),
                Err(Error::RelativePath)
            );
        }
        assert_eq!(resolve("other", &[]), Err(Error::UnsupportedPlatform));
    }

    #[test]
    fn every_document_keeps_its_existing_windows_destination_without_step_ten() {
        let base = qa();
        let root = resolve("windows", &[("LOCALAPPDATA", &base)]).expect("root");
        let native = base.join("Vantare/native");
        assert_eq!(root.native(), native);
        assert_eq!(root.hub(), base.join("VantareNative/hub"));
        assert_eq!(root.layout(), native.join("layout.json"));
        assert_eq!(root.engineer(), native.join("engineer.json"));
        assert_eq!(root.launcher(), native.join("launcher.json"));
        assert_eq!(root.services(), native.join("services"));
        assert_eq!(root.rights(), native.join("rights"));
        assert_eq!(root.logs(), native.join("logs"));
    }

    #[test]
    fn io_errors_preserve_the_typed_reason() {
        for (error, kind) in [
            (Error::MissingBase, io::ErrorKind::NotFound),
            (Error::RelativePath, io::ErrorKind::InvalidInput),
            (Error::UnsupportedPlatform, io::ErrorKind::Unsupported),
            (Error::QaOverrideRequired, io::ErrorKind::InvalidInput),
        ] {
            assert_eq!(io::Error::from(error).kind(), kind);
        }
    }
}
