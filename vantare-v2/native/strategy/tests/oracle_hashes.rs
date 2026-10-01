use serde_json::Value;
use sha2::{Digest, Sha256};

#[test]
fn frozen_files_and_manifest_have_their_reviewed_hashes() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("testdata/oracle");
    let bytes = std::fs::read(root.join("manifest.json")).expect("mandatory manifest");
    assert_eq!(
        format!("{:x}", Sha256::digest(&bytes)),
        "09b40626ed2f027394b0dc616b46db3a23734be65126e5f37e65dd89a248c23e"
    );
    let manifest: Value = serde_json::from_slice(&bytes).expect("manifest");
    let files = manifest["files"].as_object().expect("files");
    assert_eq!(
        files.len(),
        12,
        "Go document, correction, edited-plan, projection, repository, and solver fixtures"
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
