use crate::{Error, Result};
use image::{DynamicImage, RgbImage};
use std::ptr::null_mut;
use windows_sys::Win32::Graphics::Gdi::{self, BITMAPINFO, BITMAPINFOHEADER, HBITMAP, HDC};

#[derive(Default)]
struct Resources {
    screen: HDC,
    memory: HDC,
    bitmap: HBITMAP,
}
impl Drop for Resources {
    fn drop(&mut self) {
        // SAFETY: handles creados aquí; destruir primero el DC deselecciona el bitmap.
        unsafe {
            if !self.memory.is_null() {
                Gdi::DeleteDC(self.memory);
            }
            if !self.bitmap.is_null() {
                Gdi::DeleteObject(self.bitmap);
            }
            if !self.screen.is_null() {
                Gdi::ReleaseDC(null_mut(), self.screen);
            }
        }
    }
}

/// Solo monitor principal, tras una acción explícita del usuario.
pub fn screen() -> Result<DynamicImage> {
    let mut resources = Resources::default();
    // SAFETY: DC del escritorio comprobado; RAII lo libera incluso si falla la consulta.
    // DESKTOP*RES obtiene píxeles físicos, sin virtualización de GetSystemMetrics por DPI.
    let (width, height) = unsafe {
        resources.screen = Gdi::GetDC(null_mut());
        if resources.screen.is_null() {
            return Err(Error::Unsupported);
        }
        (
            Gdi::GetDeviceCaps(
                resources.screen,
                i32::try_from(Gdi::DESKTOPHORZRES).map_err(|_| Error::Unsupported)?,
            ),
            Gdi::GetDeviceCaps(
                resources.screen,
                i32::try_from(Gdi::DESKTOPVERTRES).map_err(|_| Error::Unsupported)?,
            ),
        )
    };
    if width <= 0 || height <= 0 || i64::from(width) * i64::from(height) > 40_000_000 {
        return Err(Error::TooLarge);
    }
    let width_u32 = u32::try_from(width).map_err(|_| Error::TooLarge)?;
    let height_u32 = u32::try_from(height).map_err(|_| Error::TooLarge)?;
    let byte_count =
        usize::try_from(i64::from(width) * i64::from(height) * 4).map_err(|_| Error::TooLarge)?;
    let mut pixels = vec![0_u8; byte_count];
    let mut info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: u32::try_from(std::mem::size_of::<BITMAPINFOHEADER>())
                .map_err(|_| Error::Unsupported)?,
            biWidth: width,
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            ..Default::default()
        },
        ..Default::default()
    };
    // SAFETY: handles comprobados y RAII; buffer w*h*4 acotado para DIB top-down
    // de 32 bits, deseleccionado antes de GetDIBits, punteros vivos durante llamadas.
    unsafe {
        resources.memory = Gdi::CreateCompatibleDC(resources.screen);
        if resources.memory.is_null() {
            return Err(Error::Unsupported);
        }
        resources.bitmap = Gdi::CreateCompatibleBitmap(resources.screen, width, height);
        if resources.bitmap.is_null() {
            return Err(Error::Unsupported);
        }
        let previous = Gdi::SelectObject(resources.memory, resources.bitmap);
        if previous.is_null() || previous as isize == -1 {
            return Err(Error::Unsupported);
        }
        if Gdi::BitBlt(
            resources.memory,
            0,
            0,
            width,
            height,
            resources.screen,
            0,
            0,
            Gdi::SRCCOPY | Gdi::CAPTUREBLT,
        ) == 0
        {
            return Err(Error::Unsupported);
        }
        let restored = Gdi::SelectObject(resources.memory, previous);
        if restored.is_null() || restored as isize == -1 {
            return Err(Error::Unsupported);
        }
        if Gdi::GetDIBits(
            resources.screen,
            resources.bitmap,
            0,
            height_u32,
            pixels.as_mut_ptr().cast(),
            &raw mut info,
            Gdi::DIB_RGB_COLORS,
        ) != height
        {
            return Err(Error::Unsupported);
        }
    }
    let rgb = pixels
        .chunks_exact(4)
        .flat_map(|p| [p[2], p[1], p[0]])
        .collect();
    Ok(DynamicImage::ImageRgb8(
        RgbImage::from_raw(width_u32, height_u32, rgb).ok_or(Error::Protocol)?,
    ))
}
