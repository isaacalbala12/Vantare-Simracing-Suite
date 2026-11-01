//! Test fixture only: never included in a product package. Fixed public TEST seed.
use base64::{Engine, engine::general_purpose::STANDARD};
use ed25519_dalek::{Signature, Signer, SigningKey};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    payload: String,
    signature: String,
}

fn run() -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut input = Vec::new();
    std::io::stdin().take(65537).read_to_end(&mut input)?;
    if input.len() > 65536 {
        return Err("fixture input too large".into());
    }
    let key = SigningKey::from_bytes(&[42; 32]);
    match std::env::args().nth(1).as_deref() {
        Some("--matrix-sign") => Ok(serde_json::to_vec(&Envelope {
            payload: STANDARD.encode(&input),
            signature: STANDARD.encode(key.sign(&input).to_bytes()),
        })?),
        Some("--verify-update") => {
            let envelope: Envelope = serde_json::from_slice(&input)?;
            let payload = STANDARD.decode(envelope.payload)?;
            let signature = Signature::from_slice(&STANDARD.decode(envelope.signature)?)?;
            key.verifying_key().verify_strict(&payload, &signature)?;
            Ok(payload)
        }
        _ => Err("fixture operation required".into()),
    }
}

fn main() {
    match run() {
        Ok(output) => {
            if std::io::stdout().write_all(&output).is_err() {
                std::process::exit(1);
            }
        }
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
