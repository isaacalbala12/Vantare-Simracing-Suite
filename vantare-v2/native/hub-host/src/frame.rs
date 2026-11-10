use serde::{Serialize, de::DeserializeOwned};
use std::io::{self, Read, Write};
pub const LIMIT: usize = 1024 * 1024;
#[derive(Default)]
pub struct Reader {
    pending: Vec<u8>,
}
impl Reader {
    pub fn next<T: DeserializeOwned>(&mut self, input: &mut impl Read) -> io::Result<Option<T>> {
        if let Some(value) = self.decode()? {
            return Ok(Some(value));
        }
        let mut bytes = [0; 16 * 1024];
        match input.read(&mut bytes) {
            Ok(0) => return Err(io::ErrorKind::UnexpectedEof.into()),
            Ok(count) => self.pending.extend_from_slice(&bytes[..count]),
            Err(error)
                if matches!(
                    error.kind(),
                    io::ErrorKind::TimedOut | io::ErrorKind::WouldBlock
                ) =>
            {
                return Ok(None);
            }
            Err(error) => return Err(error),
        }
        self.decode()
    }
    fn decode<T: DeserializeOwned>(&mut self) -> io::Result<Option<T>> {
        let Some(header) = self.pending.get(..4) else {
            return Ok(None);
        };
        let length =
            u32::from_le_bytes(header.try_into().map_err(|_| io::ErrorKind::InvalidData)?) as usize;
        if length == 0 || length > LIMIT {
            return Err(io::ErrorKind::InvalidData.into());
        }
        if self.pending.len() < length + 4 {
            return Ok(None);
        }
        let value = serde_json::from_slice(&self.pending[4..length + 4])
            .map_err(|_| io::ErrorKind::InvalidData)?;
        self.pending.drain(..length + 4);
        Ok(Some(value))
    }
}
pub fn write(output: &mut impl Write, value: &impl Serialize) -> io::Result<()> {
    let bytes = serde_json::to_vec(value).map_err(|_| io::ErrorKind::InvalidData)?;
    if bytes.is_empty() || bytes.len() > LIMIT {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    let length = u32::try_from(bytes.len()).map_err(|_| io::ErrorKind::InvalidInput)?;
    output.write_all(&length.to_le_bytes())?;
    output.write_all(&bytes)?;
    output.flush()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn partial_frames_survive_timeouts_and_multiple_frames() {
        struct Chunks {
            parts: std::collections::VecDeque<io::Result<Vec<u8>>>,
        }
        impl Read for Chunks {
            fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
                let bytes = self.parts.pop_front().expect("chunk")?;
                out[..bytes.len()].copy_from_slice(&bytes);
                Ok(bytes.len())
            }
        }
        let mut bytes = Vec::new();
        write(&mut bytes, &"hello").expect("frame");
        let mut input = Chunks {
            parts: [
                Ok(bytes[..2].to_vec()),
                Err(io::ErrorKind::TimedOut.into()),
                Ok(bytes[2..].to_vec()),
            ]
            .into(),
        };
        let mut reader = Reader::default();
        assert_eq!(reader.next::<String>(&mut input).expect("partial"), None);
        assert_eq!(reader.next::<String>(&mut input).expect("timeout"), None);
        assert_eq!(
            reader.next::<String>(&mut input).expect("complete"),
            Some("hello".into())
        );
    }
    #[test]
    fn rejects_oversized_header_before_allocating_payload() {
        let header = u32::try_from(LIMIT + 1).expect("limit").to_le_bytes();
        let mut input = header.as_slice();
        let error = Reader::default()
            .next::<String>(&mut input)
            .expect_err("oversized");
        assert_eq!(error.kind(), io::ErrorKind::InvalidData);
    }
}
