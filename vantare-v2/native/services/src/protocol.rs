//! DTO públicos sin secretos; también se compilan en el Hub sin dependencia HTTP.
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::io::{self, Read, Write};

pub const VERSION: u32 = 1;
pub const MAX_FRAME: usize = 64 * 1024;

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(tag = "command", deny_unknown_fields)]
pub enum Command {
    Status,
    AccountBegin,
    AccountPoll,
    AccountRenew,
    Logout,
    Shutdown,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub version: u32,
    pub sequence: u64,
    pub nonce: String,
    pub command: Command,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "result", deny_unknown_fields)]
pub enum Reply {
    Status {
        account_configured: bool,
        message: String,
    },
    Closed,
    Account {
        signed_in: bool,
        expires_at: Option<u64>,
        pending: bool,
        message: String,
    },
    Error {
        message: String,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Response {
    pub version: u32,
    pub sequence: u64,
    pub reply: Reply,
}

pub fn read<T: DeserializeOwned>(reader: &mut impl Read) -> io::Result<T> {
    let mut prefix = [0_u8; 4];
    reader.read_exact(&mut prefix)?;
    let len =
        usize::try_from(u32::from_le_bytes(prefix)).map_err(|_| io::ErrorKind::InvalidData)?;
    if len == 0 || len > MAX_FRAME {
        return Err(io::ErrorKind::InvalidData.into());
    }
    let mut bytes = vec![0; len];
    reader.read_exact(&mut bytes)?;
    serde_json::from_slice(&bytes).map_err(|_| io::ErrorKind::InvalidData.into())
}

pub fn write(writer: &mut impl Write, value: &impl Serialize) -> io::Result<()> {
    let bytes = serde_json::to_vec(value).map_err(|_| io::ErrorKind::InvalidData)?;
    if bytes.len() > MAX_FRAME {
        return Err(io::ErrorKind::InvalidData.into());
    }
    let len = u32::try_from(bytes.len()).map_err(|_| io::ErrorKind::InvalidData)?;
    writer.write_all(&len.to_le_bytes())?;
    writer.write_all(&bytes)?;
    writer.flush()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn protocol_rejects_oversized_truncated_and_unknown_commands() {
        for bytes in [
            u32::MAX.to_le_bytes().to_vec(),
            vec![2, 0, 0, 0, b'{'],
            vec![0, 0, 0, 0],
        ] {
            assert!(read::<Request>(&mut bytes.as_slice()).is_err());
        }
        let mut wire = Vec::new();
        write(
            &mut wire,
            &Request {
                version: VERSION,
                sequence: 1,
                nonce: "bootstrap".into(),
                command: Command::Status,
            },
        )
        .expect("marco");
        assert!(matches!(
            read::<Request>(&mut wire.as_slice()).expect("DTO").command,
            Command::Status
        ));
        assert!(serde_json::from_str::<Command>("{\"command\":\"SetEntitlements\"}").is_err());
    }
}
