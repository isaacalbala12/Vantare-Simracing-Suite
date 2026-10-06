use std::io;

pub(super) fn invalid(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message.into())
}

pub(super) fn i32_at(bytes: &[u8], offset: usize) -> i32 {
    let b = &bytes[offset..offset + 4];
    i32::from_le_bytes([b[0], b[1], b[2], b[3]])
}

pub(super) fn f32_at(bytes: &[u8], offset: usize) -> f64 {
    let b = &bytes[offset..offset + 4];
    f64::from(f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
}

pub(super) fn wide_at(bytes: &[u8], offset: usize, size: usize) -> String {
    let units: Vec<_> = bytes[offset..offset + size]
        .chunks_exact(2)
        .map(|b| u16::from_le_bytes([b[0], b[1]]))
        .take_while(|u| *u != 0)
        .collect();
    // Los nombres llegan del simulador y en multijugador los elige otro
    // usuario: se quitan las marcas bidireccionales y de anchura cero antes de
    // que lleguen a pintarse.
    vantare_domain::text::sanitize_display(&String::from_utf16_lossy(&units))
}

/// Cursor acotado del protocolo: cada lectura valida su longitud antes de avanzar.
pub(super) struct Reader<'a>(pub(super) &'a [u8]);

impl Reader<'_> {
    pub(super) fn take(&mut self, n: usize) -> io::Result<&[u8]> {
        let bytes = self
            .0
            .get(..n)
            .ok_or_else(|| invalid("datagrama truncado"))?;
        self.0 = &self.0[n..];
        Ok(bytes)
    }

    pub(super) fn u8(&mut self) -> io::Result<u8> {
        Ok(self.take(1)?[0])
    }

    pub(super) fn u16(&mut self) -> io::Result<u16> {
        let b = self.take(2)?;
        Ok(u16::from_le_bytes([b[0], b[1]]))
    }

    pub(super) fn i32(&mut self) -> io::Result<i32> {
        Ok(i32_at(self.take(4)?, 0))
    }

    pub(super) fn f32(&mut self) -> io::Result<f64> {
        Ok(f32_at(self.take(4)?, 0))
    }

    pub(super) fn text(&mut self) -> io::Result<String> {
        let n = usize::from(self.u16()?);
        Ok(String::from_utf8_lossy(self.take(n)?).into_owned())
    }
}
