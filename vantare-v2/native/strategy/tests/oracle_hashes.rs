use serde_json::Value;
use sha2::{Digest, Sha256};

#[test]
fn frozen_files_and_manifest_have_their_reviewed_hashes() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("testdata/oracle");
    let bytes = std::fs::read(root.join("manifest.json")).expect("mandatory manifest");
    assert_eq!(
        format!("{:x}", Sha256::digest(&bytes)),
        "e0eb39f4a0c69d213a35ad7441bca66eccf9d74cec8162cacbf789b122e59b8d"
    );
    let manifest: Value = serde_json::from_slice(&bytes).expect("manifest");
    let files = manifest["files"].as_object().expect("files");
    assert_eq!(
        files.len(),
        10,
        "Go document, projection, repository, and solver fixtures"
    );
    for (name, expected) in files {
        let bytes = std::fs::read(root.join(name)).expect("mandatory fixture");
        assert_eq!(
            format!("{:x}", Sha256::digest(bytes)),
            expected.as_str().expect("SHA256"),
            "{name}"
        );
    }
}
