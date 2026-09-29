//! Configuración y mensajes salientes; jamás se imprimen las contraseñas.
use std::io;

use serde_json::Value;

use super::bytes::invalid;

pub(super) struct Config {
    pub(super) port: u16,
    pub(super) password: String,
}

pub(super) fn config(bytes: &[u8]) -> io::Result<Config> {
    let utf16 = bytes.starts_with(&[0xff, 0xfe]) || bytes.get(1) == Some(&0);
    let text = if utf16 {
        if !bytes.len().is_multiple_of(2) {
            return Err(invalid("configuración UTF-16 truncada"));
        }
        let units: Vec<_> = bytes
            .chunks_exact(2)
            .map(|b| u16::from_le_bytes([b[0], b[1]]))
            .collect();
        String::from_utf16(&units).map_err(|_| invalid("configuración UTF-16 inválida"))?
    } else {
        String::from_utf8(bytes.to_vec()).map_err(|_| invalid("configuración UTF-8 inválida"))?
    };
    let value: Value = serde_json::from_str(text.trim_start_matches('\u{feff}'))
        .map_err(|_| invalid("broadcasting.json inválido"))?;
    let port = ["udpListenerPort", "updListenerPort"]
        .iter()
        .find_map(|key| value[*key].as_u64())
        .and_then(|v| u16::try_from(v).ok())
        .filter(|v| *v > 0)
        .ok_or_else(|| invalid("puerto broadcasting ausente"))?;
    Ok(Config {
        port,
        password: value["connectionPassword"]
            .as_str()
            .unwrap_or_default()
            .to_owned(),
    })
}

pub(super) fn registration(c: &Config) -> io::Result<Vec<u8>> {
    let mut out = vec![1, 4];
    for text in ["vantare-core", c.password.as_str()] {
        let n =
            u16::try_from(text.len()).map_err(|_| invalid("cadena de registro demasiado larga"))?;
        out.extend_from_slice(&n.to_le_bytes());
        out.extend_from_slice(text.as_bytes());
    }
    out.extend_from_slice(&100_i32.to_le_bytes());
    out.extend_from_slice(&0_u16.to_le_bytes()); // sin commandPassword: solo lectura.
    Ok(out)
}

pub(super) fn request(kind: u8, id: i32) -> Vec<u8> {
    let mut out = vec![kind];
    out.extend_from_slice(&id.to_le_bytes());
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_utf16_and_readonly_registration_v4() {
        for key in ["udpListenerPort", "updListenerPort"] {
            let text = format!("{{\"{key}\":9000,\"connectionPassword\":\"test\"}}");
            for prefix in ["", "\u{feff}"] {
                let bytes: Vec<_> = format!("{prefix}{text}")
                    .encode_utf16()
                    .flat_map(u16::to_le_bytes)
                    .collect();
                let c = config(&bytes).expect("config ACC");
                assert_eq!(c.port, 9000);
                let message = registration(&c).expect("registro");
                assert_eq!(&message[..2], &[1, 4]);
                assert_eq!(&message[2..4], &12_u16.to_le_bytes());
                assert_eq!(&message[4..16], b"vantare-core");
                assert_eq!(
                    &message[16..],
                    &[4, 0, b't', b'e', b's', b't', 100, 0, 0, 0, 0, 0]
                );
            }
            assert_eq!(config(text.as_bytes()).expect("UTF-8").port, 9000);
        }
        assert!(config(&[b'{', 0, b'}']).is_err());
        assert!(config(b"{invalid}").is_err());
        assert!(config(b"{\"udpListenerPort\":0}").is_err());
        assert_eq!(request(10, 16), vec![10, 16, 0, 0, 0]);
    }
}
