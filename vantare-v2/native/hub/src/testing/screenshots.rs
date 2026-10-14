//! Assets locales de las miniaturas; no cambia el documento ni el consentimiento.
use std::sync::Arc;

use base64::{Engine, engine::general_purpose::STANDARD};
use gpui::{Image, ImageFormat};

use crate::services::protocol::report_document::ScreenshotPreview;

pub(super) struct Screenshot {
    pub preview: ScreenshotPreview,
    image: Option<Arc<Image>>,
}

impl Screenshot {
    pub fn new(preview: ScreenshotPreview) -> Self {
        let image = STANDARD
            .decode(&preview.jpeg)
            .ok()
            .map(|bytes| Arc::new(Image::from_bytes(ImageFormat::Jpeg, bytes)));
        Self { preview, image }
    }

    pub fn image(&self) -> Option<Arc<Image>> {
        self.image.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn preview(jpeg: String) -> ScreenshotPreview {
        ScreenshotPreview {
            id: "local-test".into(),
            jpeg,
            width: 640,
            height: 360,
            byte_size: 24 * 1024,
        }
    }

    #[test]
    fn repaint_reuses_the_same_screenshot_asset() {
        let screenshot = Screenshot::new(preview(STANDARD.encode([1, 2, 3])));
        let first = screenshot.image().expect("base64 válido");
        let second = screenshot.image().expect("misma captura");
        assert!(
            Arc::ptr_eq(&first, &second),
            "redibujar no debe reconstruir el asset JPEG"
        );
    }

    #[test]
    fn replaced_content_and_invalid_base64_do_not_reuse_an_old_asset() {
        let first = Screenshot::new(preview(STANDARD.encode([1, 2, 3])));
        let replaced = Screenshot::new(preview(STANDARD.encode([4, 5, 6])));
        assert!(!Arc::ptr_eq(
            &first.image().expect("primera"),
            &replaced.image().expect("nueva")
        ));
        assert!(Screenshot::new(preview("%%%".into())).image().is_none());
    }

    #[test]
    #[ignore = "Banco Release exclusivo #1607; requiere pc-medicion.lock"]
    fn measure_screenshot_assets() {
        let screenshot = Screenshot::new(preview(STANDARD.encode(vec![0x55; 24 * 1024])));
        for run in 1..=3 {
            let start = std::time::Instant::now();
            for _ in 0..3_000 {
                std::hint::black_box(screenshot.image());
            }
            println!(
                "ISA1607 screenshot run={run} iterations=3000 bytes=24576 elapsed_us={}",
                start.elapsed().as_micros()
            );
        }
    }
}
