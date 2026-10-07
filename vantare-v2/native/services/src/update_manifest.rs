//! Firma del contenido exacto del manifiesto; ninguna clave del feed es autoridad.
use crate::{Error, Result};
use base64::{Engine, engine::general_purpose::STANDARD};
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

// Clave PÚBLICA Ed25519 del actualizador; la privada la custodia Isaac fuera del repo.
// Sin fallback ni clave de prueba en producción.
const PUBLIC_KEY_BASE64: &str = "QcYuRiCPzjsM7JrNs1e/6DoGm+aCVmKItd6Y4nVofSs=";
const LIMIT: usize = 65536;

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct SignedManifest {
    payload: String,
    signature: String,
}

fn verify_with(json: &[u8], public_key: &[u8; 32]) -> Result<Vec<u8>> {
    if json.len() > LIMIT {
        return Err(Error::TooLarge);
    }
    let signed: SignedManifest = serde_json::from_slice(json).map_err(|_| Error::Protocol)?;
    let payload = STANDARD
        .decode(signed.payload)
        .map_err(|_| Error::Protocol)?;
    let signature = STANDARD
        .decode(signed.signature)
        .map_err(|_| Error::Protocol)?;
    let key = VerifyingKey::from_bytes(public_key).map_err(|_| Error::Protocol)?;
    let signature = Signature::from_slice(&signature).map_err(|_| Error::Protocol)?;
    key.verify_strict(&payload, &signature)
        .map_err(|_| Error::Protocol)?;
    Ok(payload)
}

/// Solo la clave pública compilada; el llamador no puede reemplazarla.
pub fn verify(json: &[u8]) -> Result<Vec<u8>> {
    let key: [u8; 32] = STANDARD
        .decode(PUBLIC_KEY_BASE64)
        .map_err(|_| Error::Unconfigured)?
        .try_into()
        .map_err(|_| Error::Unconfigured)?;
    verify_with(json, &key)
}

fn sign(payload: &[u8], key: &SigningKey) -> Result<Vec<u8>> {
    // El sobre base64 y su firma deben caber en el límite del bootstrap.
    if payload.len() > 32768 {
        return Err(Error::TooLarge);
    }
    let signed = SignedManifest {
        payload: STANDARD.encode(payload),
        signature: STANDARD.encode(key.sign(payload).to_bytes()),
    };
    serde_json::to_vec(&signed).map_err(|_| Error::Protocol)
}

/// Herramienta local: semilla Ed25519 de 32 bytes en un archivo elegido por Isaac.
/// Nunca genera ni imprime una clave privada; borra el buffer al salir.
pub fn sign_file(payload: &[u8], path: &std::path::Path) -> Result<Vec<u8>> {
    use std::io::Read;
    let mut seed = Zeroizing::new(Vec::new());
    std::fs::File::open(path)
        .map_err(|_| Error::Storage)?
        .take(33)
        .read_to_end(&mut seed)
        .map_err(|_| Error::Storage)?;
    let seed: Zeroizing<[u8; 32]> =
        Zeroizing::new(seed.as_slice().try_into().map_err(|_| Error::Protocol)?);
    sign(payload, &SigningKey::from_bytes(&seed))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn signature_rejects_unsigned_modified_wrong_key_and_unknown_fields() {
        let mut seed = Zeroizing::new([0_u8; 32]);
        getrandom::fill(seed.as_mut()).expect("test entropy");
        let key = SigningKey::from_bytes(&seed);
        let payload = br#"{"version":"0.1.1","sha256":"test"}"#;
        let signed = sign(payload, &key).expect("sign test");
        assert_eq!(
            verify_with(&signed, &key.verifying_key().to_bytes()).expect("valid"),
            payload
        );
        assert!(verify_with(payload, &key.verifying_key().to_bytes()).is_err());
        let mut changed: SignedManifest = serde_json::from_slice(&signed).expect("envelope");
        changed.payload = STANDARD.encode(br#"{"version":"0.1.2","sha256":"test"}"#);
        assert!(
            verify_with(
                &serde_json::to_vec(&changed).expect("json"),
                &key.verifying_key().to_bytes()
            )
            .is_err()
        );
        getrandom::fill(seed.as_mut()).expect("other test key");
        let other = SigningKey::from_bytes(&seed);
        assert!(verify_with(&signed, &other.verifying_key().to_bytes()).is_err());
        let mut extra: serde_json::Value = serde_json::from_slice(&signed).expect("json");
        extra["public_key"] = STANDARD.encode(other.verifying_key().to_bytes()).into();
        assert!(
            verify_with(
                &serde_json::to_vec(&extra).expect("json"),
                &key.verifying_key().to_bytes()
            )
            .is_err()
        );
        assert!(verify_with(&vec![b' '; LIMIT + 1], &key.verifying_key().to_bytes()).is_err());
        assert!(verify(&signed).is_err());
    }

    #[test]
    fn signing_tool_reads_only_a_test_seed_and_rejects_invalid_length() {
        let path = std::env::temp_dir().join(format!(
            "vantare-test-key-{}",
            crate::random_id().expect("id")
        ));
        let mut seed = Zeroizing::new([0_u8; 32]);
        getrandom::fill(seed.as_mut()).expect("test entropy");
        std::fs::write(&path, seed.as_slice()).expect("test seed");
        let key = SigningKey::from_bytes(&seed);
        let payload = br#"{"version":"0.1.1"}"#;
        let signed = sign_file(payload, &path).expect("sign file");
        assert_eq!(
            verify_with(&signed, &key.verifying_key().to_bytes()).expect("valid"),
            payload
        );
        std::fs::write(&path, b"invalid test seed").expect("invalid");
        assert!(sign_file(payload, &path).is_err());
        std::fs::remove_file(path).expect("cleanup");
    }
}
