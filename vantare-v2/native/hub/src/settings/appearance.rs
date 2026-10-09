//! Configuración local de apariencia; escritura atómica con detección de conflictos.
use super::{Hub, State};
use crate::orbit::theme::{self, AppearanceSettings, InterfaceFont, MonoFont};
use gpui::{Context, Window};
use std::path::PathBuf;

/// Versión de las claves: Vantare = grafito, Classic = carmín desde el feedback 7.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredAppearance {
    palette_version: u8,
    #[serde(flatten)]
    settings: AppearanceSettings,
}

fn read_settings(bytes: &[u8]) -> Result<AppearanceSettings, String> {
    let value: serde_json::Value =
        serde_json::from_slice(bytes).map_err(|error| format!("leer apariencia: {error}"))?;
    let legacy = match value.get("paletteVersion") {
        None => true,
        Some(version) if version.as_u64() == Some(1) => false,
        Some(_) => return Err("Versión de paleta no compatible".into()),
    };
    let explicit = value.get("palette").is_some();
    let mut settings: AppearanceSettings =
        serde_json::from_value(value).map_err(|error| format!("leer apariencia: {error}"))?;
    if legacy && explicit {
        settings.palette = match settings.palette {
            theme::Palette::Vantare => theme::Palette::Classic,
            theme::Palette::Classic => theme::Palette::Vantare,
            other => other,
        };
    }
    Ok(settings)
}

pub(crate) struct Store {
    pub settings: AppearanceSettings,
    path: PathBuf,
    observed: Option<Vec<u8>>,
    pub zoom_percent: u16,
    zoom_path: PathBuf,
    zoom_observed: Option<Vec<u8>>,
}
impl Store {
    pub fn load(path: PathBuf) -> Result<Self, String> {
        let observed = match std::fs::metadata(&path) {
            Ok(_) => Some(crate::files::read(&path, 16 * 1024)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(format!("inspeccionar apariencia: {error}")),
        };
        let mut settings: AppearanceSettings = observed
            .as_deref()
            .map_or_else(|| Ok(AppearanceSettings::default()), read_settings)?;
        settings.contrast = settings.contrast.clamp(80, 120);
        settings.glass_opacity = settings.glass_opacity.clamp(50, 100);
        let zoom_path = path.with_file_name("hub-zoom.json");
        let zoom_observed = match std::fs::metadata(&zoom_path) {
            Ok(_) => Some(crate::files::read(&zoom_path, 128)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(format!("inspeccionar zoom: {error}")),
        };
        let zoom_percent = zoom_observed.as_deref().map_or(Ok(100), |bytes| {
            serde_json::from_slice::<u16>(bytes).map_err(|error| format!("leer zoom: {error}"))
        })?;
        if !matches!(zoom_percent, 90 | 100 | 110 | 125) {
            return Err("Tamaño de interfaz no válido".into());
        }
        Ok(Self {
            settings,
            path,
            observed,
            zoom_percent,
            zoom_path,
            zoom_observed,
        })
    }
    pub fn save_zoom(&mut self, percent: u16) -> Result<(), String> {
        if !matches!(percent, 90 | 100 | 110 | 125) {
            return Err("Tamaño de interfaz no válido".into());
        }
        let bytes =
            serde_json::to_vec(&percent).map_err(|error| format!("serializar zoom: {error}"))?;
        crate::files::save(&self.zoom_path, &bytes, self.zoom_observed.as_deref())?;
        self.zoom_observed = Some(bytes);
        self.zoom_percent = percent;
        Ok(())
    }
    pub fn save(&mut self, mut settings: AppearanceSettings) -> Result<(), String> {
        settings.contrast = settings.contrast.clamp(80, 120);
        settings.glass_opacity = settings.glass_opacity.clamp(50, 100);
        let bytes = serde_json::to_vec_pretty(&StoredAppearance {
            palette_version: 1,
            settings,
        })
        .map_err(|error| format!("serializar apariencia: {error}"))?;
        crate::files::save(&self.path, &bytes, self.observed.as_deref())?;
        self.observed = Some(bytes);
        self.settings = settings;
        Ok(())
    }
}

pub(super) fn wire(state: &State, window: &Window, cx: &mut Context<Hub>) {
    cx.subscribe_in(
        &state.quick_theme,
        window,
        |hub, _, event: &crate::orbit::ChoiceChanged, window, cx| {
            hub.settings_palette(event.0, window, cx);
        },
    )
    .detach();
    cx.subscribe_in(
        &state.font,
        window,
        |hub, _, event: &crate::orbit::ChoiceChanged, window, cx| {
            let Some(font) = [
                InterfaceFont::Inter,
                InterfaceFont::Segoe,
                InterfaceFont::Arial,
            ]
            .get(event.0)
            .copied() else {
                return;
            };
            let mut settings = hub.settings.appearance.settings;
            settings.interface_font = font;
            hub.settings_appearance_apply(settings, window, cx);
        },
    )
    .detach();
    cx.subscribe_in(
        &state.mono,
        window,
        |hub, _, event: &crate::orbit::ChoiceChanged, window, cx| {
            let Some(font) = [MonoFont::Cascadia, MonoFont::Consolas, MonoFont::Courier]
                .get(event.0)
                .copied()
            else {
                return;
            };
            let mut settings = hub.settings.appearance.settings;
            settings.mono_font = font;
            hub.settings_appearance_apply(settings, window, cx);
        },
    )
    .detach();
}
impl Hub {
    pub(crate) fn settings_zoom_restore(&mut self, window: &Window) {
        self.settings.status =
            vantare_ui::set_window_zoom(window, self.settings.appearance.zoom_percent).err();
    }
    pub(crate) fn settings_zoom_change(
        &mut self,
        direction: i8,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let percent = zoom_step_limited(
            self.settings.appearance.zoom_percent,
            direction,
            vantare_ui::window_zoom_limit(window).max(90.0),
        );
        if percent == self.settings.appearance.zoom_percent {
            return;
        }
        self.settings.status = match self.settings.appearance.save_zoom(percent) {
            Ok(()) => vantare_ui::set_window_zoom(window, percent).err(),
            Err(error) => Some(error),
        };
        cx.notify();
    }
    pub(super) fn settings_appearance_apply(
        &mut self,
        settings: AppearanceSettings,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.settings.appearance_preview = [None, None];
        match self.settings.appearance.save(settings) {
            Ok(()) => {
                theme::apply(self.settings.appearance.settings, window.appearance(), cx);
                self.settings.status = None;
            }
            Err(error) => self.settings.status = Some(error),
        }
        // Si falla el disco, los selectores vuelven a la configuración aplicada.
        let saved = self.settings.appearance.settings;
        self.settings.quick_theme.update(cx, |choice, cx| {
            choice.state.selected = theme::Palette::ALL
                .iter()
                .position(|palette| *palette == saved.palette);
            cx.notify();
        });
        self.settings.font.update(cx, |choice, cx| {
            choice.state.selected = Some(saved.interface_font as usize);
            cx.notify();
        });
        self.settings.mono.update(cx, |choice, cx| {
            choice.state.selected = Some(saved.mono_font as usize);
            cx.notify();
        });
        cx.notify();
    }
}

impl Hub {
    pub(super) fn settings_scheme(
        &mut self,
        scheme: theme::Scheme,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let mut settings = self.settings.appearance.settings;
        settings.scheme = scheme;
        self.settings_appearance_apply(settings, window, cx);
    }
    pub(super) fn settings_palette(
        &mut self,
        index: usize,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(palette) = theme::Palette::ALL.get(index).copied() else {
            return;
        };
        let mut settings = self.settings.appearance.settings;
        settings.palette = palette;
        self.settings_appearance_apply(settings, window, cx);
    }
    pub(super) fn settings_slider_pointer(
        &mut self,
        index: usize,
        x: gpui::Pixels,
        cx: &mut Context<Self>,
    ) {
        let Some(bounds) = self.settings.appearance_bounds[index] else {
            return;
        };
        let value = slider_pointer_value(index, f32::from(x - bounds.left()));
        if self.settings.appearance_preview[index] != Some(value) {
            self.settings.appearance_preview[index] = Some(value);
            cx.notify();
        }
    }
    pub(super) fn settings_slider_release(
        &mut self,
        index: usize,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.settings.appearance_dragging[index] = false;
        if let Some(value) = self.settings.appearance_preview[index].take() {
            self.settings_slider_value(index, value, window, cx);
            cx.notify();
        }
    }
    pub(super) fn settings_slider_value(
        &mut self,
        index: usize,
        value: u8,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let mut settings = self.settings.appearance.settings;
        if index == 0 {
            settings.contrast = value;
        } else {
            settings.glass_opacity = value;
        }
        if settings != self.settings.appearance.settings {
            self.settings_appearance_apply(settings, window, cx);
        }
    }
}

fn slider_pointer_value(index: usize, offset: f32) -> u8 {
    use crate::orbit::{APPEARANCE_THUMB_SIZE, APPEARANCE_TRACK_WIDTH, APPEARANCE_VALUE_OFFSET};
    let fraction = ((offset - APPEARANCE_VALUE_OFFSET - APPEARANCE_THUMB_SIZE / 2.0)
        / (APPEARANCE_TRACK_WIDTH - APPEARANCE_THUMB_SIZE))
        .clamp(0.0, 1.0);
    let (min, span) = if index == 0 {
        (80.0, 40.0)
    } else {
        (50.0, 50.0)
    };
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    // 50..120, redondeo al entero mas cercano.
    let value = (min + span * fraction).round() as u8;
    value
}

fn zoom_step_limited(percent: u16, direction: i8, limit: f32) -> u16 {
    let values = [90, 100, 110, 125];
    match direction {
        -1 => values
            .into_iter()
            .rev()
            .find(|value| f32::from(*value) < f32::from(percent).min(limit))
            .unwrap_or(90),
        1 => values
            .into_iter()
            .find(|value| *value > percent && f32::from(*value) <= limit + 0.001)
            .unwrap_or(percent),
        _ => 100,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::orbit::theme::Scheme;
    #[test]
    fn legacy_choices_keep_their_visual_palette_and_migrate_only_once() {
        use theme::Palette;
        let dir = directory("palette-migration");
        std::fs::create_dir_all(&dir).expect("directory");
        let path = dir.join("appearance.json");
        for (old_key, expected, base) in [
            ("vantare", Palette::Classic, 0x17_0a0e),
            ("classic", Palette::Vantare, 0x16_1314),
            (
                "ocean",
                Palette::Ocean,
                theme::Theme::resolve(Palette::Ocean, Scheme::Dark, 100, 80)
                    .skin
                    .base,
            ),
        ] {
            for scheme in [Scheme::Dark, Scheme::Light] {
                let legacy = serde_json::json!({
                    "palette": old_key, "scheme": scheme, "contrast": 110,
                    "glassOpacity": 60, "interfaceFont": "arial", "reducedMotion": true
                });
                let bytes = serde_json::to_vec(&legacy).expect("legacy fixture");
                std::fs::write(&path, &bytes).expect("write fixture");
                let mut store = Store::load(path.clone()).expect("migrate");
                assert_eq!(store.settings.palette, expected);
                assert_eq!(store.settings.scheme, scheme);
                assert_eq!(
                    (store.settings.contrast, store.settings.glass_opacity),
                    (110, 60)
                );
                assert_eq!(store.settings.interface_font, InterfaceFont::Arial);
                assert!(store.settings.reduced_motion);
                assert_eq!(
                    std::fs::read(&path).expect("read"),
                    bytes,
                    "load does not write"
                );
                if scheme == Scheme::Dark {
                    assert_eq!(theme::Theme::from_settings(store.settings).skin.base, base);
                }
                let settings = store.settings;
                store.save(settings).expect("save migrated choice");
                let saved: serde_json::Value =
                    serde_json::from_slice(&std::fs::read(&path).expect("read version"))
                        .expect("saved JSON");
                assert_eq!(saved["paletteVersion"], 1);
                assert_eq!(
                    saved["palette"],
                    serde_json::to_value(expected).expect("key")
                );
                assert_eq!(
                    Store::load(path.clone()).expect("restart").settings,
                    settings
                );
            }
        }
        std::fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn no_explicit_palette_gets_graphite_default_without_changing_other_preferences() {
        use theme::Palette;
        let dir = directory("palette-default");
        let path = dir.join("appearance.json");
        assert_eq!(
            Store::load(path.clone())
                .expect("missing file")
                .settings
                .palette,
            Palette::Vantare
        );
        std::fs::create_dir_all(&dir).expect("directory");
        for bytes in [
            b"{}".as_slice(),
            b"{\"scheme\":\"light\",\"interfaceFont\":\"arial\"}",
        ] {
            std::fs::write(&path, bytes).expect("write no choice");
            let store = Store::load(path.clone()).expect("missing palette");
            assert_eq!(store.settings.palette, Palette::Vantare);
            if bytes != b"{}" {
                assert_eq!(store.settings.scheme, Scheme::Light);
                assert_eq!(store.settings.interface_font, InterfaceFont::Arial);
            }
        }
        assert!(read_settings(b"{\"paletteVersion\":2,\"palette\":\"vantare\"}").is_err());
        std::fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn reduced_motion_persists_and_old_files_keep_the_default() {
        let dir = directory("motion");
        let path = dir.join("appearance.json");
        let mut store = Store::load(path.clone()).expect("default");
        assert!(!store.settings.reduced_motion);
        for reduced_motion in [true, false] {
            store
                .save(AppearanceSettings {
                    reduced_motion,
                    ..store.settings
                })
                .expect("save");
            assert_eq!(
                Store::load(path.clone())
                    .expect("reopen")
                    .settings
                    .reduced_motion,
                reduced_motion
            );
        }
        std::fs::remove_dir_all(dir).expect("cleanup");
    }
    #[test]
    fn pointer_reaches_both_limits_at_the_thumb_centres_and_beyond() {
        for (index, min, max) in [(0, 80, 120), (1, 50, 100)] {
            assert_eq!(slider_pointer_value(index, 64.0), min);
            assert_eq!(slider_pointer_value(index, 226.0), max);
            assert_eq!(slider_pointer_value(index, 233.0), max);
            assert_eq!(slider_pointer_value(index, 0.0), min);
        }
        assert_eq!(slider_pointer_value(0, 223.0), 119);
        assert_eq!(slider_pointer_value(0, 225.0), 120);
    }
    fn directory(label: &str) -> PathBuf {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("reloj")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "vantare-appearance-{label}-{}-{nonce}",
            std::process::id()
        ))
    }
    #[test]
    fn zoom_persists_reopens_and_rejects_conflicts_and_invalid_values() {
        let dir = directory("zoom");
        let path = dir.join("appearance.json");
        let mut store = Store::load(path.clone()).expect("default");
        let mut stale = Store::load(path.clone()).expect("other");
        assert_eq!(store.zoom_percent, 100);
        for percent in [90, 100, 110, 125] {
            store.save_zoom(percent).expect("save");
            assert_eq!(
                Store::load(path.clone()).expect("reopen").zoom_percent,
                percent
            );
        }
        assert!(stale.save_zoom(90).is_err());
        assert_eq!(stale.zoom_percent, 100);
        assert!(store.save_zoom(99).is_err());
        std::fs::write(dir.join("hub-zoom.json"), b"99").expect("invalid");
        assert!(Store::load(path).is_err());
        assert_eq!(zoom_step_limited(90, -1, 125.0), 90);
        assert_eq!(zoom_step_limited(125, 1, 125.0), 125);
        assert_eq!(zoom_step_limited(100, 1, 125.0), 110);
        assert_eq!(zoom_step_limited(110, -1, 125.0), 100);
        assert_eq!(zoom_step_limited(125, 0, 125.0), 100);
        assert_eq!(zoom_step_limited(110, 1, 112.5), 110);
        assert_eq!(zoom_step_limited(125, 1, 112.5), 125);
        assert_eq!(zoom_step_limited(125, -1, 112.5), 110);
        assert_eq!(zoom_step_limited(90, 1, 90.0), 90);
        std::fs::remove_dir_all(dir).expect("cleanup");
    }
    #[test]
    fn persists_all_preferences_and_keeps_the_last_applied_values_on_conflict() {
        let dir = directory("persist");
        let path = dir.join("appearance.json");
        let mut first = Store::load(path.clone()).expect("defaults");
        assert_eq!(first.settings.scheme, Scheme::Dark);
        let mut other = Store::load(path.clone()).expect("second reader");
        let settings = AppearanceSettings {
            palette: theme::Palette::DeepSeek,
            scheme: Scheme::System,
            contrast: 115,
            glass_opacity: 65,
            interface_font: InterfaceFont::Arial,
            mono_font: MonoFont::Consolas,
            reduced_motion: true,
        };
        first.save(settings).expect("guardar");
        assert_eq!(Store::load(path).expect("reinicio").settings, settings);
        let previous = other.settings;
        assert!(other.save(settings).is_err());
        assert_eq!(other.settings, previous);
        std::fs::remove_dir_all(dir).expect("limpiar");
    }
    #[test]
    fn every_theme_and_scheme_survives_save_and_restart() {
        let dir = directory("r10-themes");
        let path = dir.join("appearance.json");
        let mut store = Store::load(path.clone()).expect("defaults");
        for palette in theme::Palette::ALL {
            for scheme in [Scheme::System, Scheme::Light, Scheme::Dark] {
                let settings = AppearanceSettings {
                    palette,
                    scheme,
                    ..AppearanceSettings::default()
                };
                store.save(settings).expect("guardar");
                assert_eq!(
                    Store::load(path.clone()).expect("reabrir").settings,
                    settings
                );
            }
        }
        std::fs::remove_dir_all(dir).expect("limpiar QA");
    }

    #[test]
    fn hub_appearance_file_is_read_by_the_overlay_motion_adapter() {
        let dir = directory("overlay-contract");
        let path = dir.join("appearance.json");
        let mut hub = Store::load(path.clone()).expect("Hub");
        assert!(!vantare_ui::MotionPolicy::load(&path).expect("ausente").0);
        for palette in theme::Palette::ALL {
            for reduced_motion in [true, false] {
                let settings = AppearanceSettings {
                    palette,
                    scheme: Scheme::System,
                    contrast: 115,
                    glass_opacity: 65,
                    interface_font: InterfaceFont::Arial,
                    mono_font: MonoFont::Consolas,
                    reduced_motion,
                };
                hub.save(settings).expect("escritor productivo del Hub");
                assert_eq!(
                    vantare_ui::MotionPolicy::load(&path)
                        .expect("lector productivo de overlays")
                        .0,
                    reduced_motion,
                    "{palette:?}"
                );
                assert_eq!(
                    Store::load(path.clone()).expect("reabrir").settings,
                    settings
                );
            }
        }
        std::fs::remove_dir_all(dir).expect("limpiar contrato");
    }

    #[test]
    fn rejects_invalid_or_oversized_data_and_clamps_numeric_preferences() {
        let dir = directory("bounds");
        std::fs::create_dir_all(&dir).expect("directorio");
        let path = dir.join("appearance.json");
        std::fs::write(&path, b"no JSON").expect("corrupt");
        assert!(Store::load(path.clone()).is_err());
        std::fs::write(&path, vec![b' '; 16 * 1024 + 1]).expect("large");
        assert!(Store::load(path.clone()).is_err());
        std::fs::remove_file(&path).expect("remove fixture");
        let mut store = Store::load(path.clone()).expect("defaults");
        store
            .save(AppearanceSettings {
                contrast: 255,
                glass_opacity: 0,
                ..AppearanceSettings::default()
            })
            .expect("clamp");
        let loaded = Store::load(path).expect("reload").settings;
        assert_eq!(loaded.contrast, 120);
        assert_eq!(loaded.glass_opacity, 50);
        std::fs::remove_dir_all(dir).expect("limpiar");
    }
}
