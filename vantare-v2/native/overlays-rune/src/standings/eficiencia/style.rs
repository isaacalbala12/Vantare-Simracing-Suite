//! Valores de Standings: compilados en producto, editables solo en Workshop.
use std::sync::Arc;

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Style {
    pub colors: Colors,
    pub geometry: Geometry,
    pub fonts: Fonts,
    pub shadow: Shadow,
    pub opacity: Opacity,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Colors {
    pub ink: Color,
    pub muted: Color,
    pub panel: Color,
    pub loss: Color,
    pub white: Color,
    pub black: Color,
    pub flag_unknown: Color,
    pub flag_green: Color,
    pub flag_yellow: Color,
    pub flag_blue: Color,
    pub flag_red: Color,
    pub flag_black: Color,
    pub flag_checkered: Color,
    pub broadcast_accent: Color,
    pub hypercar: Color,
    pub lmp: Color,
    pub gold: Color,
    pub session: Color,
    pub class_start: Color,
    pub class_end: Color,
    pub column_label: Color,
    pub player: Color,
    pub gain: Color,
    pub player_marker: Color,
    pub position: Color,
    pub number: Color,
    pub pace_gap: Color,
    pub unit: Color,
    pub lap: Color,
    pub best_lap: Color,
    pub best_sweep: Color,
    pub best_marker: Color,
    pub footer_label: Color,
    pub footer_value: Color,
    pub pit_ink: Color,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Geometry {
    pub row_height: f32,
    pub session_header_height: f32,
    pub column_header_height: f32,
    pub footer_height: f32,
    pub brand_band_height: f32,
    pub pit_rail_width: f32,
    pub broadcast_header_height: f32,
    pub broadcast_column_height: f32,
    pub class_band_height: f32,
    pub radius: f32,
    pub chip_radius: f32,
    pub chip_cut_radius: f32,
    pub pit_radius: f32,
    pub cell_padding: f32,
    pub broadcast_name_padding: f32,
    pub position_padding: f32,
    pub footer_pair_gap: f32,
    pub footer_gap: f32,
    pub logo_size: f32,
    pub brand_logo_size: f32,
    pub player_marker_width: f32,
    pub player_marker_height: f32,
    pub pit_badge_height: f32,
    pub pit_glow_blur: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Fonts {
    pub marker_size: f32,
    pub session_label_size: f32,
    pub column_label_size: f32,
    pub badge_size: f32,
    pub footer_value_size: f32,
    pub number_size: f32,
    pub brand_size: f32,
    pub body_size: f32,
    pub clock_size: f32,
    pub plain_clock_size: f32,
    pub regular_weight: f32,
    pub medium_weight: f32,
    pub semibold_weight: f32,
    pub metric_weight: f32,
    pub bold_weight: f32,
    pub heavy_weight: f32,
    pub tracking_scale: f32,
    pub family: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Shadow {
    pub sigma: f32,
    pub spread: f32,
    pub offset_y: f32,
    pub alpha: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Opacity {
    pub panel: f32,
    pub frame: f32,
    pub top_frame: f32,
    pub player: f32,
    pub broadcast_player: f32,
    pub footer: f32,
    pub pit_glow: f32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Color(pub u32);

impl Default for Style {
    fn default() -> Self {
        Self {
            colors: Colors {
                ink: Color(crate::eficiencia::INK),
                muted: Color(crate::eficiencia::MUTED),
                panel: Color(crate::eficiencia::PANEL),
                loss: Color(crate::eficiencia::LOSS),
                white: Color(0xffffff),
                black: Color(0x000000),
                flag_unknown: Color(0xb1b4bc),
                flag_green: Color(0x29c36f),
                flag_yellow: Color(0xffd03d),
                flag_blue: Color(0x4391ff),
                flag_red: Color(0xef303e),
                flag_black: Color(0x0c0c0e),
                flag_checkered: Color(0xd1d1d6),
                broadcast_accent: Color(0xc1121f),
                hypercar: Color(0xe63946),
                lmp: Color(0x5b8bd6),
                gold: Color(0xe2c568),
                session: Color(0xb8bac0),
                class_start: Color(0xe32530),
                class_end: Color(0xba0f1b),
                column_label: Color(0xbdbfc4),
                player: Color(0xbfc2ca),
                gain: Color(0x7fb686),
                player_marker: Color(0xed2431),
                position: Color(0xb9bbc1),
                number: Color(0xa5a5ab),
                pace_gap: Color(0xbdbdc2),
                unit: Color(0xaaa9af),
                lap: Color(0xe6e5e9),
                best_lap: Color(0xc9b1e9),
                best_sweep: Color(0xb990e8),
                best_marker: Color(0xbd9be8),
                footer_label: Color(0xa7a9b0),
                footer_value: Color(0xe8e8ed),
                pit_ink: Color(0x151517),
            },
            geometry: Geometry {
                row_height: super::model::ROW_HEIGHT,
                session_header_height: 42.0,
                column_header_height: 28.0,
                footer_height: 22.0,
                brand_band_height: 22.0,
                pit_rail_width: super::model::PIT_RAIL_WIDTH,
                broadcast_header_height: 46.0,
                broadcast_column_height: 24.0,
                class_band_height: 28.0,
                radius: crate::eficiencia::RADIUS,
                chip_radius: 4.0,
                chip_cut_radius: 1.0,
                pit_radius: 3.0,
                cell_padding: 8.0,
                broadcast_name_padding: 24.0,
                position_padding: 4.0,
                footer_pair_gap: 5.0,
                footer_gap: 16.0,
                logo_size: 24.0,
                brand_logo_size: 18.0,
                player_marker_width: 2.0,
                player_marker_height: 20.0,
                pit_badge_height: 26.0,
                pit_glow_blur: 4.0,
            },
            fonts: Fonts {
                marker_size: 6.0,
                session_label_size: 7.0,
                column_label_size: 8.0,
                badge_size: 9.0,
                footer_value_size: 10.0,
                number_size: 11.0,
                brand_size: 12.0,
                body_size: 14.0,
                clock_size: 15.0,
                plain_clock_size: 17.0,
                regular_weight: 400.0,
                medium_weight: 500.0,
                semibold_weight: 600.0,
                metric_weight: 650.0,
                bold_weight: 700.0,
                heavy_weight: 800.0,
                tracking_scale: 1.0,
                family: None,
            },
            shadow: Shadow {
                sigma: 12.5,
                spread: -12.0,
                offset_y: 14.0,
                alpha: 0.48,
            },
            opacity: Opacity {
                panel: 0.87,
                frame: 0.12,
                top_frame: 0.136,
                player: 0.17,
                broadcast_player: 0.23,
                footer: 0.15,
                pit_glow: 0.22,
            },
        }
    }
}
impl Style {
    pub fn compiled() -> Arc<Self> {
        Arc::new(Self::default())
    }
}
