//! Perfil privado local primero, almacenado con las mismas garantías que cuenta.
pub use crate::protocol::pilot_document::{PilotPhoto, PilotProfile, PilotState};
use crate::{Error, Result, storage::Store};
use base64::{Engine, engine::general_purpose::STANDARD};
use image::{ImageFormat, ImageReader, Limits, codecs::jpeg::JpegEncoder};
use std::path::Path;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Crop {
    pub x: f32,
    pub y: f32,
    pub size: f32,
}
impl Default for Crop {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            size: 1.0,
        }
    }
}

/// La imagen original nunca sale del PC. Coordenadas normalizadas sobre la imagen original.
// Las dimensiones están acotadas a 4096 y las coordenadas se validan antes
// de convertir píxeles positivos; todos los enteros son exactos en f32.
#[allow(clippy::cast_precision_loss, clippy::cast_possible_truncation, clippy::cast_sign_loss)]
pub fn crop_photo(bytes: &[u8], crop: Crop) -> Result<PilotPhoto> {
    let image = decode_source(bytes)?;
    let side = image.width().min(image.height());
    if ![crop.x, crop.y, crop.size].iter().all(|v| v.is_finite())
        || crop.x < 0.0
        || crop.y < 0.0
        || crop.size <= 0.0
        || crop.size > 1.0
        || crop.x * image.width() as f32 + crop.size * side as f32 > image.width() as f32 + 0.001
        || crop.y * image.height() as f32 + crop.size * side as f32 > image.height() as f32 + 0.001
    {
        return Err(Error::Protocol);
    }
    let side = image.width().min(image.height());
    let length = ((side as f32 * crop.size).round() as u32).clamp(1, side);
    let x = (image.width() as f32 * crop.x).round() as u32;
    let y = (image.height() as f32 * crop.y).round() as u32;
    let small = image
        .crop_imm(
            x.min(image.width() - length),
            y.min(image.height() - length),
            length,
            length,
        )
        .resize_exact(256, 256, image::imageops::FilterType::Lanczos3)
        .to_rgb8();
    let mut jpeg = Vec::new();
    for quality in [80, 65, 50, 35, 20] {
        jpeg.clear();
        JpegEncoder::new_with_quality(&mut jpeg, quality)
            .encode_image(&small)
            .map_err(|_| Error::Protocol)?;
        if jpeg.len() <= crate::protocol::pilot_document::MAX_PHOTO_BYTES {
            return Ok(PilotPhoto { jpeg: STANDARD.encode(jpeg) });
        }
    }
    Err(Error::TooLarge)
}

fn decode_source(bytes: &[u8]) -> Result<image::DynamicImage> {
    if bytes.is_empty() || bytes.len() > 5 * 1024 * 1024 {
        return Err(Error::TooLarge);
    }
    let format = image::guess_format(bytes).map_err(|_| Error::Protocol)?;
    if !matches!(format, ImageFormat::Jpeg | ImageFormat::Png) {
        return Err(Error::Protocol);
    }
    let mut reader = ImageReader::with_format(std::io::Cursor::new(bytes), format);
    let mut limits = Limits::default();
    limits.max_image_width = Some(4096);
    limits.max_image_height = Some(4096);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    reader.decode().map_err(|_| Error::Protocol)
}
/// Valida tamaño, formato y memoria antes de presentar el recorte.
pub fn photo_dimensions(bytes: &[u8]) -> Result<(u32, u32)> {
    let image = decode_source(bytes)?;
    Ok((image.width(), image.height()))
}

pub fn validate(profile: &PilotProfile) -> Result<()> {
    if !profile.validate() {
        return Err(Error::Protocol);
    }
    if let Some(photo) = &profile.photo {
        let jpeg = STANDARD.decode(&photo.jpeg).map_err(|_| Error::Protocol)?;
        if jpeg.len() > crate::protocol::pilot_document::MAX_PHOTO_BYTES
            || image::guess_format(&jpeg).ok() != Some(ImageFormat::Jpeg)
        {
            return Err(Error::Protocol);
        }
        let mut reader = ImageReader::with_format(std::io::Cursor::new(jpeg), ImageFormat::Jpeg);
        let mut limits = Limits::default();
        limits.max_image_width = Some(256);
        limits.max_image_height = Some(256);
        limits.max_alloc = Some(1024 * 1024);
        reader.limits(limits);
        let image = reader.decode().map_err(|_| Error::Protocol)?;
        if image.width() != 256 || image.height() != 256 {
            return Err(Error::Protocol);
        }
    }
    Ok(())
}

pub struct Local {
    store: Store,
    state: PilotState,
}
impl Local {
    /// issuer/subject vienen exclusivamente de la cuenta restaurada, nunca del formulario.
    pub fn open(root: &Path, issuer: Option<&str>, subject: Option<&str>) -> Result<Self> {
        let context = match (issuer, subject) {
            (Some(issuer), Some(subject)) if !issuer.is_empty() && !subject.is_empty() => format!(
                "pilot-v1|{}",
                crate::content_hash(
                    &serde_json::to_vec(&(issuer, subject)).map_err(|_| Error::Protocol)?
                )
            ),
            (None, None) => "pilot-v1|local".into(),
            _ => return Err(Error::Authentication),
        };
        let store = Store::open(root, &context)?;
        let state = match store.load::<PilotState>("pilot-profile") {
            Ok(state) => {
                validate(&state.profile)?;
                state
            }
            Err(Error::NotFound) => PilotState::default(),
            Err(error) => return Err(error),
        };
        Ok(Self { store, state })
    }
    pub fn state(&self) -> &PilotState {
        &self.state
    }
    pub fn save(&mut self, profile: PilotProfile, expected_revision: u64) -> Result<()> {
        validate(&profile)?;
        if self.state.revision != expected_revision {
            return Err(Error::Conflict);
        }
        let state = PilotState {
            profile,
            revision: expected_revision.checked_add(1).ok_or(Error::Conflict)?,
            pending: true,
            ..self.state.clone()
        };
        self.store.save("pilot-profile", &state)?;
        self.state = state;
        Ok(())
    }
    pub fn accept_remote(&mut self, profile: PilotProfile, remote_revision: u64) -> Result<()> {
        validate(&profile)?;
        let state = PilotState {
            profile,
            revision: self.state.revision.checked_add(1).ok_or(Error::Conflict)?,
            remote_revision,
            pending: false,
        };
        self.store.save("pilot-profile", &state)?;
        self.state = state;
        Ok(())
    }
}

#[cfg(feature = "network")]
pub mod sync;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn valid_detailed_photo_fits_storage_budget() {
        let mut image = image::RgbImage::new(256, 256);
        let mut seed = 1_u32;
        for pixel in image.pixels_mut() {
            let mut color = [0; 3];
            for value in &mut color {
                seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                *value = seed.to_be_bytes()[0];
            }
            *pixel = image::Rgb(color);
        }
        let mut bytes = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgb8(image)
            .write_to(&mut bytes, ImageFormat::Png)
            .expect("PNG válido");
        let photo = crop_photo(bytes.get_ref(), Crop::default())
            .expect("foto admitida dentro del presupuesto");
        assert!(
            STANDARD.decode(photo.jpeg).expect("JPEG").len()
                <= crate::protocol::pilot_document::MAX_PHOTO_BYTES
        );
    }
    #[test]
    fn rectangular_crop_uses_original_image_coordinates() {
        let mut image = image::RgbImage::new(600, 300);
        for (x, _, pixel) in image.enumerate_pixels_mut() {
            *pixel = if x < 300 {
                image::Rgb([255, 0, 0])
            } else {
                image::Rgb([0, 0, 255])
            };
        }
        let mut bytes = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgb8(image)
            .write_to(&mut bytes, ImageFormat::Png)
            .expect("fixture válida");
        let photo = crop_photo(
            bytes.get_ref(),
            Crop {
                x: 0.5,
                y: 0.0,
                size: 1.0,
            },
        )
        .expect("fixture válida");
        let decoded = image::load_from_memory(&STANDARD.decode(photo.jpeg).expect("fixture válida"))
            .expect("fixture válida")
            .to_rgb8();
        let pixel = decoded.get_pixel(128, 128);
        assert!(pixel[2] > 240 && pixel[0] < 15);
    }
    #[test]
    fn local_restart_account_isolation_stale_edit_and_unavailable_backend() {
        let root = std::env::temp_dir().join(crate::random_id().expect("fixture válida"));
        let mut local = Local::open(&root, None, None).expect("fixture válida");
        let profile = PilotProfile {
            public_name: "Local".into(),
            country: Some("ES".into()),
            ..Default::default()
        };
        local.save(profile.clone(), 0).expect("fixture válida");
        assert_eq!(local.save(PilotProfile::default(), 0), Err(Error::Conflict));
        drop(local);
        let local = Local::open(&root, None, None).expect("fixture válida");
        assert_eq!(local.state().profile, profile);
        assert!(local.state().pending);
        drop(local);
        let mut account =
            Local::open(&root, Some("https://fixture.invalid"), Some("user_a")).expect("fixture válida");
        assert_eq!(account.state(), &PilotState::default());
        account
            .save(
                PilotProfile {
                    public_name: "Account A".into(),
                    ..Default::default()
                },
                0,
            )
            .expect("fixture válida");
        drop(account);
        let other = Local::open(&root, Some("https://fixture.invalid"), Some("user_b")).expect("fixture válida");
        assert_eq!(other.state(), &PilotState::default());
        drop(other);
        let issuer = Local::open(&root, Some("https://other.invalid"), Some("user_a")).expect("fixture válida");
        assert_eq!(issuer.state(), &PilotState::default());
        drop(issuer);
        std::fs::remove_dir_all(root).expect("fixture válida");
    }
    #[test]
    fn photo_is_square_bounded_and_crop_rejects_invalid_formats_and_coordinates() {
        let mut bytes = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgb8(512, 300)
            .write_to(&mut bytes, ImageFormat::Png)
            .expect("fixture válida");
        let photo = crop_photo(bytes.get_ref(), Crop::default()).expect("fixture válida");
        validate(&PilotProfile {
            photo: Some(photo),
            ..Default::default()
        })
        .expect("fixture válida");
        for crop in [
            Crop {
                x: f32::NAN,
                ..Default::default()
            },
            Crop {
                x: 0.9,
                ..Default::default()
            },
            Crop {
                size: 0.0,
                ..Default::default()
            },
        ] {
            assert!(crop_photo(bytes.get_ref(), crop).is_err());
        }
        assert!(crop_photo(b"GIF89a", Crop::default()).is_err());
        assert!(crop_photo(&vec![0; 5 * 1024 * 1024 + 1], Crop::default()).is_err());
    }
}
