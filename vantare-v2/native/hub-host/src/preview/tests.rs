use super::*;
use base64::Engine as _;
pub(super) fn png() -> Vec<u8> {
    base64::engine::general_purpose::STANDARD
        .decode(crate::protocol::modules::preview::bindings::PNG)
        .expect("PNG fixture")
}
#[test]
fn codes_require_their_stable_token_and_do_not_expose_details() {
    for (code, token, error) in [
        (2, "INVALID_INPUT", PreviewError::InvalidInput),
        (3, "NO_DEMO", PreviewError::NoDemo),
        (4, "GPU_UNAVAILABLE", PreviewError::GpuUnavailable),
        (5, "CAPTURE_FAILED", PreviewError::CaptureFailed),
        (6, "GRAPHICS_DISABLED", PreviewError::GraphicsDisabled),
    ] {
        assert_eq!(
            exit_error(
                Some(code),
                format!("{token} private details C:/private").as_bytes()
            ),
            Err(error)
        );
        assert_eq!(
            exit_error(Some(code), b"unknown private text"),
            Err(PreviewError::CaptureFailed)
        );
    }
    assert_eq!(exit_error(Some(0), b"OK\n"), Ok(()));
    for code in [None, Some(0), Some(1), Some(99)] {
        assert_eq!(
            exit_error(code, b"NO_DEMO"),
            Err(PreviewError::CaptureFailed)
        );
    }
}
#[test]
fn transparent_png_is_accepted_and_size_and_envelope_are_bounded() {
    let png = png();
    let value = image(&png).expect("transparent image");
    assert_eq!((value.width, value.height), (1, 1));
    assert_eq!(
        base64::engine::general_purpose::STANDARD
            .decode(value.png_base64)
            .expect("base64"),
        png
    );
    for bytes in [&b"not a PNG"[..], &png[..png.len() - 1]] {
        assert_eq!(image(bytes), Err(PreviewError::CaptureFailed));
    }
    let mut bounded = png.clone();
    bounded.splice(33..33, std::iter::repeat_n(0, PNG_LIMIT - png.len()));
    assert!(image(&bounded).is_ok());
    bounded.insert(33, 0);
    assert_eq!(image(&bounded), Err(PreviewError::TooLarge));
    for size in [0, AXIS_LIMIT + 1, u32::MAX] {
        let mut invalid = png.clone();
        invalid[16..20].copy_from_slice(&size.to_be_bytes());
        assert_eq!(image(&invalid), Err(PreviewError::CaptureFailed));
    }
}
#[test]
fn destinations_are_references_only_and_catalog_is_enforced() {
    assert!(
        PreviewTarget::Catalog {
            widget: crate::studio::WidgetKind::Relative
        }
        .valid()
    );
    assert!(
        !PreviewTarget::Catalog {
            widget: crate::studio::WidgetKind::CarDamageNumbers
        }
        .valid()
    );
    for id in ["", "bad\0id"] {
        assert!(
            !PreviewTarget::Instance {
                id: id.into(),
                base_revision: "a".repeat(64)
            }
            .valid()
        );
    }
    for revision in ["", "old", &"z".repeat(64)] {
        assert!(
            !PreviewTarget::Instance {
                id: "widget-1".into(),
                base_revision: revision.into()
            }
            .valid()
        );
    }
    for extra in [
        r#", "path":"C:/private""#,
        r#", "snapshot":{}"#,
        r#", "arguments":[]"#,
    ] {
        let text = format!(
            r#"{{"method":"preview.render","target":{{"kind":"catalog","widget":"relative"}},"scene":"demo","scale":"1"{extra}}}"#
        );
        assert!(serde_json::from_str::<crate::protocol::Request>(&text).is_err());
    }
}
