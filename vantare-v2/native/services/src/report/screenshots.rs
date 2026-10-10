//! JPEG locales y subida con las RPC de evidencia existentes.
use super::{Draft, Error, Result, hex_id, load_draft};
use crate::{bridge::DataRequest, protocol::report_document::ScreenshotPreview, storage::Store};
use base64::{Engine, engine::general_purpose::STANDARD};
use image::{DynamicImage, codecs::jpeg::JpegEncoder};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const MAX_BYTES: usize = 400 * 1024;
const MAX_COUNT: usize = 3;

#[cfg(windows)]
#[allow(unsafe_code)]
mod windows;

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Screenshot {
    pub preview: ScreenshotPreview,
    data: String,
}

impl Screenshot {
    pub fn encode(image: &DynamicImage) -> Result<Self> {
        if image.width() == 0 || image.height() == 0 {
            return Err(Error::Protocol);
        }
        let side = image.width().max(image.height()).min(1920);
        let mut resized = image.thumbnail(side, side).to_rgb8();
        let mut bytes = Vec::new();
        // Se conserva calidad 75; si una escena tiene mucho ruido, baja resolución.
        for _ in 0..8 {
            bytes.clear();
            JpegEncoder::new_with_quality(&mut bytes, 75)
                .encode_image(&resized)
                .map_err(|_| Error::Protocol)?;
            if bytes.len() <= MAX_BYTES {
                break;
            }
            resized = image::imageops::resize(
                &resized,
                (resized.width() * 3 / 4).max(1),
                (resized.height() * 3 / 4).max(1),
                image::imageops::FilterType::Triangle,
            );
        }
        if bytes.len() > MAX_BYTES {
            return Err(Error::TooLarge);
        }
        let mut thumbnail = DynamicImage::ImageRgb8(resized.clone())
            .thumbnail(240, 160)
            .to_rgb8();
        let mut small = Vec::new();
        for _ in 0..4 {
            small.clear();
            JpegEncoder::new_with_quality(&mut small, 45)
                .encode_image(&thumbnail)
                .map_err(|_| Error::Protocol)?;
            if small.len() <= 10 * 1024 {
                break;
            }
            thumbnail = image::imageops::resize(
                &thumbnail,
                (thumbnail.width() * 3 / 4).max(1),
                (thumbnail.height() * 3 / 4).max(1),
                image::imageops::FilterType::Triangle,
            );
        }
        if small.len() > 10 * 1024 {
            return Err(Error::TooLarge);
        }
        Ok(Self {
            preview: ScreenshotPreview {
                id: crate::random_id()?,
                jpeg: STANDARD.encode(small),
                width: resized.width(),
                height: resized.height(),
                byte_size: bytes.len(),
            },
            data: STANDARD.encode(bytes),
        })
    }

    fn bytes(&self) -> Result<Vec<u8>> {
        if !hex_id(&format!("image_{}", self.preview.id), "image_")
            || self.data.len() > MAX_BYTES.div_ceil(3) * 4
            || self.preview.width == 0
            || self.preview.width > 1920
            || self.preview.height == 0
            || self.preview.height > 1920
        {
            return Err(Error::TooLarge);
        }
        let bytes = STANDARD.decode(&self.data).map_err(|_| Error::Protocol)?;
        if bytes.len() != self.preview.byte_size || bytes.len() > MAX_BYTES {
            return Err(Error::TooLarge);
        }
        Ok(bytes)
    }

    pub fn digest(&self) -> Result<String> {
        Ok(format!("{:x}", Sha256::digest(self.bytes()?)))
    }
}

pub fn load(store: &Store, draft: &Draft) -> Result<Vec<Screenshot>> {
    if draft.screenshots.is_empty() {
        return Ok(Vec::new());
    }
    let images: Vec<Screenshot> = store.load("report-images")?;
    let selected = draft
        .screenshots
        .iter()
        .map(|preview| {
            images
                .iter()
                .find(|image| image.preview.id == preview.id)
                .cloned()
                .ok_or(Error::Storage)
        })
        .collect::<Result<Vec<_>>>()?;
    validate(&selected)?;
    Ok(selected)
}

pub fn validate(images: &[Screenshot]) -> Result<()> {
    if images.len() > MAX_COUNT {
        return Err(Error::TooLarge);
    }
    for image in images {
        image.bytes()?;
    }
    Ok(())
}

#[cfg(windows)]
pub fn capture(store: &Store) -> Result<Draft> {
    let mut draft = load_draft(store)?.ok_or(Error::NotFound)?;
    let mut images = load(store, &draft)?;
    if images.len() >= MAX_COUNT {
        return Err(Error::TooLarge);
    }
    let image = Screenshot::encode(&windows::screen()?)?;
    draft.screenshots.push(image.preview.clone());
    images.push(image);
    draft.idempotency_key = format!("draft_{}", crate::random_id()?);
    store.save("report-images", &images)?;
    store.save("report-draft", &draft)?;
    Ok(draft)
}

#[cfg(not(windows))]
pub fn capture(_: &Store) -> Result<Draft> {
    Err(Error::Unsupported)
}

pub fn remove(store: &Store, id: &str) -> Result<Draft> {
    let mut draft = load_draft(store)?.ok_or(Error::NotFound)?;
    let mut images = load(store, &draft)?;
    if !images.iter().any(|image| image.preview.id == id) {
        return Err(Error::NotFound);
    }
    images.retain(|image| image.preview.id != id);
    draft.screenshots.retain(|image| image.id != id);
    draft.idempotency_key = format!("draft_{}", crate::random_id()?);
    store.save("report-draft", &draft)?;
    store.save("report-images", &images)?;
    Ok(draft)
}

#[derive(Deserialize)]
struct Batch {
    batch_id: String,
    slots: Vec<Slot>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Slot {
    position: usize,
    evidence_id: String,
    object_path: String,
    sha256: String,
    state: String,
}

/// Nunca recibe URLs firmadas/remotas: solo objetos del bucket privado fijado.
pub fn upload(
    request: &DataRequest<'_>,
    images: &[Screenshot],
    channel: &str,
    key: &str,
) -> Result<String> {
    validate(images)?;
    let manifest = images
        .iter()
        .enumerate()
        .map(|(i, image)| {
            Ok(serde_json::json!({"position":i+1,"mediaType":"image/jpeg",
            "byteSize":image.preview.byte_size,"sha256":image.digest()?,
            "width":image.preview.width,"height":image.preview.height}))
        })
        .collect::<Result<Vec<_>>>()?;
    let mut batches: Vec<Batch> = request
        .post(
            "rest/v1/rpc/testing_center_prepare_screenshot_batch",
            &serde_json::json!({"p_contract_version":"testing-center.screenshot-evidence.v1",
            "p_channel":channel,"p_idempotency_key":key,"p_manifest":manifest}),
        )?
        .success()?
        .json()?;
    if batches.len() != 1 {
        return Err(Error::Protocol);
    }
    let batch = batches.pop().ok_or(Error::Protocol)?;
    if !crate::license::uuid(&batch.batch_id) || batch.slots.len() != images.len() {
        return Err(Error::Protocol);
    }
    for (i, (slot, image)) in batch.slots.iter().zip(images).enumerate() {
        let parts = slot.object_path.split('/').collect::<Vec<_>>();
        if slot.position != i + 1
            || !crate::license::uuid(&slot.evidence_id)
            || slot.sha256 != image.digest()?
            || parts.len() != 4
            || parts[0] != "v1"
            || parts[1].len() != 32
            || !parts[1]
                .bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
            || parts[2] != batch.batch_id
            || parts[3] != slot.evidence_id
        {
            return Err(Error::Protocol);
        }
        match slot.state.as_str() {
            "prepared" => {
                let response = request.upload(&slot.object_path, &image.bytes()?)?;
                if response.status == 413 {
                    return Err(Error::TooLarge);
                }
                // INSERT puede haber terminado antes de una pérdida de conexión.
                // No sobrescribir; finalize y el validador comprueban tamaño/hash.
                if response.status != 409 {
                    response.success()?;
                }
            }
            "ready" | "uploaded" | "validating" => continue,
            _ => return Err(Error::Protocol),
        }
        request
            .post(
                "rest/v1/rpc/testing_center_finalize_screenshot",
                &serde_json::json!({"p_batch_id":batch.batch_id,"p_evidence_id":slot.evidence_id}),
            )?
            .success()?;
    }
    Ok(batch.batch_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jpeg_is_bounded_and_has_no_exif_and_max_three() {
        let image = DynamicImage::ImageRgb8(image::RgbImage::from_fn(2400, 1350, |x, y| {
            image::Rgb([
                (x.wrapping_mul(73) ^ y.wrapping_mul(193)).to_le_bytes()[0],
                (x.wrapping_mul(113) ^ y.wrapping_mul(53)).to_le_bytes()[0],
                (x.wrapping_mul(37) ^ y.wrapping_mul(173)).to_le_bytes()[0],
            ])
        }));
        let screenshot = Screenshot::encode(&image).expect("JPEG");
        let bytes = screenshot.bytes().expect("bounded");
        assert!(bytes.len() <= MAX_BYTES);
        assert!(screenshot.preview.width <= 1920 && screenshot.preview.height <= 1920);
        assert!(!bytes.windows(6).any(|bytes| bytes == b"Exif\0\0"));
        let decoded =
            image::load_from_memory_with_format(&bytes, image::ImageFormat::Jpeg).expect("decode");
        assert_eq!(decoded.width(), screenshot.preview.width);
        assert_eq!(decoded.height(), screenshot.preview.height);
        assert!(validate(&vec![screenshot.clone(); 3]).is_ok());
        assert!(matches!(
            validate(&vec![screenshot; 4]),
            Err(Error::TooLarge)
        ));
    }

    #[test]
    fn oversized_capture_is_rejected_before_http() {
        let mut screenshot = Screenshot::encode(&DynamicImage::new_rgb8(64, 48)).expect("JPEG");
        screenshot.data = STANDARD.encode(vec![0; MAX_BYTES + 1]);
        screenshot.preview.byte_size = MAX_BYTES + 1;
        assert!(matches!(screenshot.bytes(), Err(Error::TooLarge)));
    }

    #[cfg(windows)]
    #[test]
    fn removing_a_capture_keeps_text_and_changes_consent_content() {
        let (root, store) = crate::test_store("remove-image");
        let mut draft = super::super::save_draft(
            &store,
            crate::protocol::report_document::Fields {
                module: "hub".into(),
                action_text: "Texto guardado".into(),
                ..Default::default()
            },
        )
        .expect("draft");
        let image = Screenshot::encode(&DynamicImage::new_rgb8(64, 48)).expect("image");
        draft.screenshots.push(image.preview.clone());
        store
            .save("report-images", &vec![image.clone()])
            .expect("images");
        store.save("report-draft", &draft).expect("draft");
        let removed = remove(&store, &image.preview.id).expect("remove");
        assert!(removed.screenshots.is_empty());
        assert_eq!(removed.fields, draft.fields);
        assert_ne!(removed.idempotency_key, draft.idempotency_key);
        assert!(load(&store, &removed).expect("load").is_empty());
        drop(store);
        crate::cleanup_store(&root, "remove-image", &[]);
    }

    #[test]
    fn preview_fixture_for_ui_uses_the_production_encoder() {
        let image = image::load_from_memory(include_bytes!(
            "../../../hub/reference/wails/testing-center-informe.png"
        ))
        .expect("reference PNG");
        let screenshot = Screenshot::encode(&image).expect("JPEG");
        if let Some(path) = std::env::var_os("VANTARE_TESTING_CAPTURE_FIXTURE") {
            std::fs::write(
                path,
                serde_json::to_vec(&screenshot.preview).expect("fixture"),
            )
            .expect("external QA fixture");
        }
        assert!(screenshot.preview.jpeg.len() < 14 * 1024);
    }
}
