use crate::{Error, Result, storage::Store};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signer, SigningKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

pub struct Installation {
    key: SigningKey,
}

#[cfg(windows)]
#[allow(unsafe_code)]
mod windows;

pub fn legacy_fingerprint() -> Result<String> {
    #[cfg(windows)]
    {
        windows::fingerprint()
    }
    #[cfg(not(windows))]
    {
        unsupported_legacy_binding()
    }
}

#[cfg(any(not(windows), test))]
fn unsupported_legacy_binding() -> Result<String> {
    // HOME|GOOS colisiona entre máquinas. No acuñar otra huella sin migración.
    Err(Error::Unsupported)
}

#[cfg(test)]
#[test]
fn regression_1542_unix_legacy_binding_is_unsupported() {
    assert_eq!(unsupported_legacy_binding(), Err(Error::Unsupported));
}
#[derive(Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
#[serde(deny_unknown_fields)]
struct Saved {
    version: u8,
    seed: [u8; 32],
}

impl Installation {
    pub fn load_or_create(store: &Store) -> Result<Self> {
        let seed = match store.load::<Saved>("installation") {
            Ok(saved) if saved.version == 1 => Zeroizing::new(saved.seed),
            Err(Error::NotFound) => {
                let mut seed = Zeroizing::new([0; 32]);
                getrandom::fill(seed.as_mut()).map_err(|_| Error::Storage)?;
                store.save(
                    "installation",
                    &Saved {
                        version: 1,
                        seed: *seed,
                    },
                )?;
                seed
            }
            _ => return Err(Error::Storage),
        };
        Ok(Self {
            key: SigningKey::from_bytes(&seed),
        })
    }

    pub fn public_key(&self) -> String {
        URL_SAFE_NO_PAD.encode(self.key.verifying_key().as_bytes())
    }
    pub fn key_id(&self) -> String {
        let jwk = format!(
            "{{\"crv\":\"Ed25519\",\"kty\":\"OKP\",\"x\":\"{}\"}}",
            self.public_key()
        );
        URL_SAFE_NO_PAD.encode(Sha256::digest(jwk.as_bytes()))
    }

    /// Only the enrollment challenge domain; not an arbitrary signing oracle.
    pub fn enrollment_proof(&self, challenge: &[u8]) -> Result<String> {
        if !(32..=256).contains(&challenge.len()) {
            return Err(Error::Protocol);
        }
        let mut payload = b"vantare.installation.enroll.v1\0".to_vec();
        payload.extend_from_slice(challenge);
        Ok(URL_SAFE_NO_PAD.encode(self.key.sign(&payload).to_bytes()))
    }
}
