//! SVG extraídos del sprite productivo; embebidos para no depender del cwd.
use gpui::{AssetSource, SharedString};
use std::borrow::Cow;

pub struct Icons;

const ASSETS: &[(&str, &[u8])] = &[
    (
        "icons/i-vantare.svg",
        include_bytes!("../../assets/icons/i-vantare.svg"),
    ),
    (
        "icons/i-inicio.svg",
        include_bytes!("../../assets/icons/i-inicio.svg"),
    ),
    (
        "icons/i-studio.svg",
        include_bytes!("../../assets/icons/i-studio.svg"),
    ),
    (
        "icons/i-launcher.svg",
        include_bytes!("../../assets/icons/i-launcher.svg"),
    ),
    (
        "icons/i-carreras.svg",
        include_bytes!("../../assets/icons/i-carreras.svg"),
    ),
    (
        "icons/i-estrategia.svg",
        include_bytes!("../../assets/icons/i-estrategia.svg"),
    ),
    (
        "icons/i-ingeniero.svg",
        include_bytes!("../../assets/icons/i-ingeniero.svg"),
    ),
    (
        "icons/i-telemetria.svg",
        include_bytes!("../../assets/icons/i-telemetria.svg"),
    ),
    (
        "icons/i-roadmap.svg",
        include_bytes!("../../assets/icons/i-roadmap.svg"),
    ),
    (
        "icons/i-ajustes.svg",
        include_bytes!("../../assets/icons/i-ajustes.svg"),
    ),
    (
        "icons/i-cuenta.svg",
        include_bytes!("../../assets/icons/i-cuenta.svg"),
    ),
    (
        "icons/i-comando.svg",
        include_bytes!("../../assets/icons/i-comando.svg"),
    ),
    (
        "icons/i-panel.svg",
        include_bytes!("../../assets/icons/i-panel.svg"),
    ),
    (
        "icons/i-flask.svg",
        include_bytes!("../../assets/icons/i-flask.svg"),
    ),
    (
        "icons/i-lock.svg",
        include_bytes!("../../assets/icons/i-lock.svg"),
    ),
    (
        "icons/i-campana.svg",
        include_bytes!("../../assets/icons/i-campana.svg"),
    ),
    (
        "icons/i-chevron.svg",
        include_bytes!("../../assets/icons/i-chevron.svg"),
    ),
];

impl AssetSource for Icons {
    fn load(&self, path: &str) -> gpui::Result<Option<Cow<'static, [u8]>>> {
        Ok(ASSETS
            .iter()
            .find(|(name, _)| *name == path)
            .map(|(_, data)| Cow::Borrowed(*data)))
    }
    fn list(&self, path: &str) -> gpui::Result<Vec<SharedString>> {
        Ok(ASSETS
            .iter()
            .filter(|(name, _)| name.starts_with(path))
            .map(|(name, _)| (*name).into())
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn all_shell_icons_are_embedded_and_unknown_paths_are_rejected() {
        for section in crate::Section::ALL {
            let path = format!("icons/{}.svg", super::super::navigation::icon(*section));
            assert!(Icons.load(&path).expect("asset").is_some());
        }
        assert!(Icons.load("../secret.svg").expect("asset").is_none());
        assert_eq!(Icons.list("icons/").expect("list").len(), 17);
    }
}
