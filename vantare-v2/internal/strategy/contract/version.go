package contract

type ContractVersion string

const CurrentVersion ContractVersion = "strategy.v1"

// MigrationStep records an applied document migration. Version one has no
// legacy predecessor; the type makes future migrations explicit and auditable.
type MigrationStep struct {
	From ContractVersion `json:"from"`
	To   ContractVersion `json:"to"`
}

// MigrateContractJSON is the single version gate for strategy documents.
// Current documents are returned unchanged. Unknown and future versions fail
// closed instead of being guessed into a shape that may change race strategy.
func MigrateContractJSON(document []byte) ([]byte, []MigrationStep, error) {
	parsed, err := parseCanonicalJSONV1(document)
	if err != nil {
		return nil, nil, err
	}
	object, ok := parsed.(map[string]interface{})
	if !ok {
		return nil, nil, contractError(ErrorInvalidDocument, "", "strategy document must be an object")
	}
	version, ok := object["contractVersion"].(string)
	if !ok || ContractVersion(version) != CurrentVersion {
		return nil, nil, contractError(ErrorUnsupportedVersion, "contractVersion", "unsupported strategy contract version")
	}
	return document, nil, nil
}

// validateDeclaredContractVersion gives an explicitly declared unknown version
// precedence over v1 shape validation. Missing versions still flow into the
// document validator so they retain the stable invalid_document error.
func validateDeclaredContractVersion(value interface{}) error {
	object, ok := value.(map[string]interface{})
	if !ok {
		return nil
	}
	rawVersion, exists := object["contractVersion"]
	if !exists {
		return nil
	}
	version, ok := rawVersion.(string)
	if !ok || ContractVersion(version) != CurrentVersion {
		return contractError(ErrorUnsupportedVersion, "contractVersion", "unsupported strategy contract version")
	}
	return nil
}
