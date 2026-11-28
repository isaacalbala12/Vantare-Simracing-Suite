//! Identidad de producto por canal (#2812). Una tabla cerrada: cada canal
//! instalable tiene sus propios nombres en Windows y nunca usa los de otro.
//! Beta conserva exactamente los nombres publicados; testers y master no se
//! instalan todavía.
use std::path::{Path, PathBuf};

#[derive(Debug, PartialEq, Eq)]
pub struct Product {
    pub channel: &'static str,
    /// Subclave de HKCU con el registro de «Aplicaciones instaladas».
    pub uninstall_key: &'static str,
    pub display_name: &'static str,
    /// Carpeta bajo `%LOCALAPPDATA%\Programs` cuando no hay raíz registrada ni explícita.
    pub root_folder: &'static str,
    /// Carpeta del menú Inicio.
    pub menu_folder: &'static str,
    /// Acceso del menú Inicio y del escritorio.
    pub link: &'static str,
    /// Acceso de la carpeta Inicio de Windows.
    pub startup_link: &'static str,
    pub app_id: &'static str,
    /// Nombres y rutas de las instalaciones anteriores al Setup GPUI. Solo beta
    /// existió entonces: ningún otro producto los lee, migra ni borra.
    pub legacy: bool,
    /// Texto corto del canal en la ventana del Setup.
    pub label: &'static str,
}

pub const BETA: Product = Product {
    channel: "beta",
    uninstall_key: "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\VantareNativeBeta",
    display_name: "Vantare Simracing Suite",
    root_folder: "Vantare",
    menu_folder: "Vantare",
    link: "Vantare Simracing Suite.lnk",
    startup_link: "Vantare.lnk",
    app_id: "Vantare.SimracingSuite",
    legacy: true,
    label: "beta",
};

pub const NIGHTLY: Product = Product {
    channel: "nightly",
    uninstall_key: "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\VantareNativeNightly",
    display_name: "Vantare Simracing Suite (Nightly)",
    root_folder: "Vantare Nightly",
    menu_folder: "Vantare Nightly",
    link: "Vantare Nightly.lnk",
    startup_link: "Vantare Nightly.lnk",
    app_id: "Vantare.SimracingSuite.Nightly",
    legacy: false,
    label: "nightly",
};

/// Todos los productos instalables.
pub const ALL: [&Product; 2] = [&BETA, &NIGHTLY];

/// Producto del canal de un paquete o de una instalación; `None` si ese canal
/// no tiene instalador (testers, master o una build sin canal).
pub fn for_channel(channel: &str) -> Option<&'static Product> {
    match channel {
        "beta" => Some(&BETA),
        "nightly" => Some(&NIGHTLY),
        _ => None,
    }
}

/// Canal de los documentos escritos antes de #2812, que no lo declaran: solo
/// beta existía entonces.
pub const UNDECLARED_CHANNEL: &str = "beta";

/// Raíz por defecto del producto: `%LOCALAPPDATA%\Programs\<carpeta>`.
pub fn default_root(local_app_data: &Path, product: &Product) -> PathBuf {
    local_app_data.join("Programs").join(product.root_folder)
}

/// Raíz que muestra el Setup cuando su sonda falla: la explícita o la del
/// producto de su canal. Sin producto queda vacía y «Reintentar» falla cerrado;
/// nunca se propone la carpeta de otro producto.
pub fn fallback_root(
    explicit: Option<PathBuf>,
    local_app_data: Option<&Path>,
    channel: &str,
) -> PathBuf {
    explicit
        .or_else(|| Some(default_root(local_app_data?, for_channel(channel)?)))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_fallback_root_belongs_to_the_setup_channel() {
        let local = PathBuf::from("C:/Users/qa/AppData/Local");
        assert_eq!(
            fallback_root(None, Some(local.as_path()), "nightly"),
            local.join("Programs/Vantare Nightly")
        );
        assert_eq!(
            fallback_root(None, Some(local.as_path()), "beta"),
            local.join("Programs/Vantare")
        );
        for channel in ["", "testers", "master"] {
            assert_eq!(
                fallback_root(None, Some(local.as_path()), channel),
                PathBuf::new()
            );
        }
        assert_eq!(fallback_root(None, None, "nightly"), PathBuf::new());
        let explicit = PathBuf::from("D:/Juegos/Vantare");
        assert_eq!(
            fallback_root(Some(explicit.clone()), Some(&local), "nightly"),
            explicit
        );
    }

    #[test]
    fn beta_keeps_every_published_name() {
        let beta = for_channel("beta").unwrap();
        assert_eq!(
            beta.uninstall_key,
            "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\VantareNativeBeta"
        );
        assert_eq!(beta.display_name, "Vantare Simracing Suite");
        assert_eq!((beta.root_folder, beta.menu_folder), ("Vantare", "Vantare"));
        assert_eq!(
            (beta.link, beta.startup_link),
            ("Vantare Simracing Suite.lnk", "Vantare.lnk")
        );
        assert_eq!(beta.app_id, "Vantare.SimracingSuite");
        assert!(beta.legacy);
    }

    #[test]
    fn nightly_shares_no_windows_name_with_beta() {
        let (beta, nightly) = (
            for_channel("beta").unwrap(),
            for_channel("nightly").unwrap(),
        );
        assert_eq!(nightly.channel, "nightly");
        assert!(!nightly.legacy);
        for (own, other) in [
            (nightly.uninstall_key, beta.uninstall_key),
            (nightly.display_name, beta.display_name),
            (nightly.root_folder, beta.root_folder),
            (nightly.menu_folder, beta.menu_folder),
            (nightly.link, beta.link),
            (nightly.startup_link, beta.startup_link),
            (nightly.app_id, beta.app_id),
        ] {
            assert!(!own.eq_ignore_ascii_case(other), "{own}");
        }
        // Ni los nombres heredados de beta.
        for legacy in [
            "Vantare Native Beta",
            "Vantare Native Beta.lnk",
            "Vantare.lnk",
        ] {
            assert!(!nightly.root_folder.eq_ignore_ascii_case(legacy));
            assert!(!nightly.link.eq_ignore_ascii_case(legacy));
            assert!(!nightly.startup_link.eq_ignore_ascii_case(legacy));
        }
    }

    #[test]
    fn channels_without_an_installer_have_no_product() {
        for channel in ["testers", "master", "", "development", "Beta", "NIGHTLY"] {
            assert!(for_channel(channel).is_none(), "{channel}");
        }
    }
}
