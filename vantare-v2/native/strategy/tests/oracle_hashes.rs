use serde_json::Value;
use sha2::{Digest, Sha256};

#[test]
fn frozen_files_and_manifest_have_their_reviewed_hashes() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("testdata/oracle");
    let bytes = std::fs::read(root.join("manifest.json")).expect("mandatory manifest");
    assert_eq!(
        format!("{:x}", Sha256::digest(&bytes)),
        "fc0e01553f33506f5cb031deae6412f8f2fe924cac7c1c4c823ce102575b6f53"
    );
    let manifest: Value = serde_json::from_slice(&bytes).expect("manifest");
    let files = manifest["files"].as_object().expect("files");
    assert_eq!(
        files.len(),
        4,
        "documents, scalar inputs/output, full Go results and source hashes"
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
