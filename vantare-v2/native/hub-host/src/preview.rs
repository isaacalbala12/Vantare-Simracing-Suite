//! One requested Rune image; no cache, live feed or renderer-supplied files.
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;

pub const PNG_LIMIT: usize = 512 * 1024;
pub const AXIS_LIMIT: u32 = 4096;
pub const TIMEOUT_MS: u32 = 15_000;
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum PreviewTarget {
    Instance {
        id: String,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    Catalog {
        widget: crate::studio::WidgetKind,
    },
    Scene {
        widget: crate::studio::WidgetKind,
        #[serde(rename = "sceneId")]
        scene_id: String,
        frame: u32,
    },
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum PreviewScene {
    Demo,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
pub enum PreviewScale {
    #[serde(rename = "1")]
    One,
    #[serde(rename = "1.25")]
    Quarter,
    #[serde(rename = "1.5")]
    Half,
}
impl PreviewScale {
    pub const fn argument(self) -> &'static str {
        match self {
            Self::One => "1",
            Self::Quarter => "1.25",
            Self::Half => "1.5",
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum PreviewError {
    InvalidInput,
    NoDemo,
    GpuUnavailable,
    CaptureFailed,
    GraphicsDisabled,
    Timeout,
    TooLarge,
    Unavailable,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreviewImage {
    pub width: u32,
    pub height: u32,
    pub png_base64: String,
}
impl PreviewTarget {
    pub fn valid(&self) -> bool {
        match self {
            Self::Catalog { widget } => crate::studio::WidgetKind::CATALOG.contains(widget),
            Self::Scene {
                scene_id, frame, ..
            } => {
                crate::workshop::valid_scene_id(scene_id)
                    && (*frame as usize) < crate::workshop::FRAME_LIMIT
            }
            Self::Instance { id, base_revision } => {
                !id.is_empty()
                    && id.len() <= crate::studio::ID_LIMIT
                    && !id.contains('\0')
                    && base_revision.len() == 64
                    && base_revision
                        .bytes()
                        .all(|v| v.is_ascii_hexdigit() && !v.is_ascii_uppercase())
            }
        }
    }
}
#[cfg(any(windows, test))]
fn exit_error(code: Option<i32>, stderr: &[u8]) -> Result<(), PreviewError> {
    let token = stderr
        .split(u8::is_ascii_whitespace)
        .next()
        .unwrap_or_default();
    match (code, token) {
        (Some(0), b"OK") => Ok(()),
        (Some(2), b"INVALID_INPUT") => Err(PreviewError::InvalidInput),
        (Some(3), b"NO_DEMO") => Err(PreviewError::NoDemo),
        (Some(4), b"GPU_UNAVAILABLE") => Err(PreviewError::GpuUnavailable),
        (Some(6), b"GRAPHICS_DISABLED") => Err(PreviewError::GraphicsDisabled),
        _ => Err(PreviewError::CaptureFailed),
    }
}
#[cfg(any(windows, test))]
fn image(bytes: &[u8]) -> Result<PreviewImage, PreviewError> {
    use base64::Engine as _;
    if bytes.len() > PNG_LIMIT {
        return Err(PreviewError::TooLarge);
    }
    // The trusted sibling is the only writer. Check its PNG envelope and size;
    // do not decode/repaint pixels or reject valid transparent/flat images.
    if bytes.len() < 57
        || bytes.get(..16) != Some(b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR")
        || !bytes.ends_with(b"\0\0\0\0IEND\xaeB`\x82")
    {
        return Err(PreviewError::CaptureFailed);
    }
    let dimension = |range: std::ops::Range<usize>| {
        u32::from_be_bytes(bytes[range].try_into().expect("bounded PNG header"))
    };
    let width = dimension(16..20);
    let height = dimension(20..24);
    if !(1..=AXIS_LIMIT).contains(&width) || !(1..=AXIS_LIMIT).contains(&height) {
        return Err(PreviewError::CaptureFailed);
    }
    Ok(PreviewImage {
        width,
        height,
        png_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
    })
}
#[cfg(windows)]
#[path = "preview/process.rs"]
mod process;
#[cfg(windows)]
pub(crate) use process::State;
#[cfg(all(not(windows), test))]
#[derive(Default)]
pub(crate) struct State;
#[cfg(all(not(windows), test))]
impl State {
    pub(crate) fn new(_root: std::path::PathBuf) -> Self {
        Self
    }
}
#[cfg(test)]
#[path = "preview/tests.rs"]
mod tests;
