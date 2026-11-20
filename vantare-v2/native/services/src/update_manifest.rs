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

/// PS 5.1 may prepend UTF-8 BOM on redirected stdin. The BOM is transport,
/// never part of the signed JSON bytes. Remove exactly one initial BOM.
pub fn without_initial_bom(input: &[u8]) -> &[u8] {
    input.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(input)
}

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

/// Autoridad TEST del feed del Hub; solo existe con `hub-update-qa`.
///
/// Con `#[used]` el compilador emite los dos estáticos enteros y contiguos, y rustc los
/// entrega al enlazador como símbolos vivos de todo binario que enlace esta biblioteca,
/// llame o no al verificador. Con `black_box` y una matriz local, el EXE de Debug no
/// llevaba la clave contigua. La referencia de Rust no promete `#[used]` para el binario
/// final: por eso `packaging/hub-update-qa-exe-tests.ps1` busca esos bytes, los mismos
/// que rechaza `no-qa.ps1`, en el EXE real de Debug y de Release.
#[cfg(feature = "hub-update-qa")]
mod qa_authority {
    #[used]
    static MARKER: [u8; 42] = *b"VANTARE_QA_HUB_UPDATE_NOT_FOR_DISTRIBUTION";
    /// Mitad pública de la semilla pública `[42; 32]` de `examples/matrix-verifier.rs`.
    #[used]
    pub(super) static PUBLIC_KEY: [u8; 32] = [
        0x19, 0x7f, 0x6b, 0x23, 0xe1, 0x6c, 0x85, 0x32, 0xc6, 0xab, 0xc8, 0x38, 0xfa, 0xcd, 0x5e,
        0xa7, 0x89, 0xbe, 0x0c, 0x76, 0xb2, 0x92, 0x03, 0x34, 0x03, 0x9b, 0xfa, 0x8b, 0x3d, 0x36,
        0x8d, 0x61,
    ];
}

/// Hub feed uses the production authority unless the isolated QA build is selected.
/// Legacy `verify()` never accepts the QA authority, even in that build.
pub fn verify_hub_update(json: &[u8]) -> Result<Vec<u8>> {
    #[cfg(feature = "hub-update-qa")]
    {
        verify_with(json, &qa_authority::PUBLIC_KEY)
    }
    #[cfg(not(feature = "hub-update-qa"))]
    {
        verify(json)
    }
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
    fn initial_bom_is_transport_and_never_signed() {
        let key = SigningKey::from_bytes(&[42; 32]);
        let payload = "{\"notes\":\"Actualización rápida para José\"}".as_bytes();
        for input in [
            payload.to_vec(),
            [b"\xEF\xBB\xBF".as_slice(), payload].concat(),
        ] {
            let signed = sign(without_initial_bom(&input), &key).expect("sign JSON");
            assert_eq!(
                verify_with(
                    without_initial_bom(&signed),
                    &key.verifying_key().to_bytes()
                )
                .expect("verify JSON"),
                payload
            );
            let signed_with_bom = [b"\xEF\xBB\xBF".as_slice(), signed.as_slice()].concat();
            assert_eq!(
                verify_with(
                    without_initial_bom(&signed_with_bom),
                    &key.verifying_key().to_bytes()
                )
                .expect("verify envelope with transport BOM"),
                payload
            );
        }
        assert_eq!(
            without_initial_bom(b"\xEF\xBB\xBF\xEF\xBB\xBF{}"),
            b"\xEF\xBB\xBF{}"
        );
    }
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

#[cfg(test)]
mod hub_authority_tests {
    use super::*;
    #[test]
    fn hub_qa_signature_never_changes_the_legacy_authority() {
        let payload = br#"{"schema":2,"product":"vantare-hub"}"#;
        let signed =
            sign(payload, &SigningKey::from_bytes(&[42; 32])).expect("sign test Hub offer");
        assert!(verify(&signed).is_err());
        assert_eq!(
            verify_hub_update(&signed).is_ok(),
            cfg!(feature = "hub-update-qa")
        );
        // No hay rotación ni segunda clave: otra clave o una firma truncada se rechazan
        // en las dos builds y por las dos entradas.
        let mut seed = Zeroizing::new([0_u8; 32]);
        getrandom::fill(seed.as_mut()).expect("test entropy");
        let rotated = sign(payload, &SigningKey::from_bytes(&seed)).expect("sign with another key");
        let mut truncated: SignedManifest = serde_json::from_slice(&signed).expect("envelope");
        truncated.signature.truncate(84);
        let truncated = serde_json::to_vec(&truncated).expect("json");
        for envelope in [rotated, truncated] {
            assert!(verify(&envelope).is_err());
            assert!(verify_hub_update(&envelope).is_err());
        }
    }
}
