//! Geometría del frame común a Studio y pista. El renderer conserva sus coordenadas canónicas.
use serde::{Deserialize, Serialize};

pub const MIN_SIZE: (f32, f32) = (64.0, 32.0);
pub const MAX_SIZE: (f32, f32) = (3840.0, 2160.0);
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Size {
    pub width: f32,
    pub height: f32,
}
impl Size {
    pub fn tuple(self) -> (f32, f32) {
        (self.width, self.height)
    }
    pub fn valid(self) -> bool {
        self.width.is_finite() && self.height.is_finite() && self.width > 0.0 && self.height > 0.0
    }
    #[must_use]
    pub fn bounded(self) -> Self {
        Self {
            width: self.width.clamp(MIN_SIZE.0, MAX_SIZE.0),
            height: self.height.clamp(MIN_SIZE.1, MAX_SIZE.1),
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Geometry {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<Size>,
    #[serde(default = "locked")]
    pub aspect_locked: bool,
}
const fn locked() -> bool {
    true
}
impl Default for Geometry {
    fn default() -> Self {
        Self {
            size: None,
            aspect_locked: true,
        }
    }
}
impl Geometry {
    pub fn is_default(&self) -> bool {
        *self == Self::default()
    }
    pub fn resolved(self, natural: (f32, f32)) -> Size {
        self.size.unwrap_or(Size {
            width: natural.0,
            height: natural.1,
        })
    }
}
/// Esquinas y lados: -1 oeste/norte, 0 fijo, 1 este/sur.
#[derive(Clone, Copy, Debug)]
pub struct Handle(pub i8, pub i8);
pub fn resize(
    start: (f32, f32),
    size: Size,
    handle: Handle,
    delta: (f32, f32),
    locked: bool,
) -> Option<((f32, f32), Size)> {
    if !size.valid() || !delta.0.is_finite() || !delta.1.is_finite() {
        return None;
    }
    let mut next = Size {
        width: size.width + delta.0 * f32::from(handle.0),
        height: size.height + delta.1 * f32::from(handle.1),
    };
    if locked {
        let aspect = size.width / size.height;
        // La esquina sigue el eje con mayor variación proporcional; los lados su propio eje.
        let by_width = handle.1 == 0
            || (handle.0 != 0
                && ((next.width - size.width) / size.width).abs()
                    >= ((next.height - size.height) / size.height).abs());
        let minimum = MIN_SIZE.0.max(MIN_SIZE.1 * aspect);
        let maximum = MAX_SIZE.0.min(MAX_SIZE.1 * aspect);
        if minimum > maximum {
            return None;
        }
        next.width = (if by_width {
            next.width
        } else {
            next.height * aspect
        })
        .clamp(minimum, maximum);
        next.height = next.width / aspect;
    } else {
        next = next.bounded();
    }
    let origin = (
        start.0
            + if handle.0 < 0 {
                size.width - next.width
            } else {
                0.0
            },
        start.1
            + if handle.1 < 0 {
                size.height - next.height
            } else {
                0.0
            },
    );
    Some((origin, next))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn opposite_edges_are_fixed_even_at_limits_for_every_handle() {
        let size = Size {
            width: 338.0,
            height: 364.0,
        };
        for locked in [true, false] {
            for h in [
                Handle(-1, -1),
                Handle(0, -1),
                Handle(1, -1),
                Handle(1, 0),
                Handle(1, 1),
                Handle(0, 1),
                Handle(-1, 1),
                Handle(-1, 0),
            ] {
                for d in [(35.0, 22.0), (-100000.0, -100000.0), (100000.0, 100000.0)] {
                    let (p, n) = resize((48.0, 62.0), size, h, d, locked).expect("resize");
                    assert!(
                        n.width >= 64.0
                            && n.width <= 3840.0
                            && n.height >= 32.0 - 0.001
                            && n.height <= 2160.0 + 0.001
                    );
                    if h.0 < 0 {
                        assert!((p.0 + n.width - 386.0).abs() < 0.001);
                    } else {
                        assert_eq!(p.0, 48.0);
                    }
                    if h.1 < 0 {
                        assert!((p.1 + n.height - 426.0).abs() < 0.001);
                    } else {
                        assert_eq!(p.1, 62.0);
                    }
                    if locked {
                        assert!((n.width / n.height - size.width / size.height).abs() < 0.00001);
                    }
                }
            }
        }
    }
    #[test]
    fn unlock_changes_frame_height_and_invalid_input_is_rejected() {
        let s = Size {
            width: 338.0,
            height: 364.0,
        };
        assert_eq!(
            resize((0.0, 0.0), s, Handle(0, 1), (0.0, 20.0), false)
                .expect("resize")
                .1,
            Size {
                width: 338.0,
                height: 384.0
            }
        );
        assert!(resize((0.0, 0.0), s, Handle(1, 1), (f32::NAN, 0.0), true).is_none());
    }
}
