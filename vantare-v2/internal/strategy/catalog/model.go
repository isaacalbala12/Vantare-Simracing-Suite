package catalog

const (
	BundleVersionV1  = "strategy.official-catalog.bundle.v1"
	PayloadVersionV1 = "strategy.official-catalog.payload.v1"
	TrustVersionV1   = "strategy.official-catalog.trust.v1"
	SignatureDomain  = "vantare.strategy.official-catalog.v1"

	MaxBundleBytes            = 16 << 20
	MaxPayloadBytes           = 16 << 20
	MaxManifestBytes          = 64 << 10
	MaxEntries                = 128
	MaxJSONSafeInteger uint64 = 1<<53 - 1
)

type Envelope struct {
	BundleVersion string `json:"bundleVersion"`
	Manifest      []byte `json:"manifest"`
	Payload       []byte `json:"payload"`
	Signature     string `json:"signature"`
}

type Manifest struct {
	BundleVersion       string `json:"bundleVersion"`
	Sequence            uint64 `json:"sequence"`
	PublishedAt         string `json:"publishedAt"`
	KeyID               string `json:"keyId"`
	MinimumTrustVersion uint64 `json:"minimumTrustVersion"`
	PayloadSHA256       string `json:"payloadSHA256"`
	PayloadLength       uint64 `json:"payloadLength"`
}

type Payload struct {
	PayloadVersion string  `json:"payloadVersion"`
	Entries        []Entry `json:"entries"`
}

type Entry struct {
	ID            string        `json:"id"`
	Title         string        `json:"title"`
	Summary       string        `json:"summary"`
	Compatibility Compatibility `json:"compatibility"`
	Package       []byte        `json:"package"`
}

type Compatibility struct {
	Simulator string `json:"simulator"`
	Circuit   string `json:"circuit"`
	Car       string `json:"car"`
	Event     string `json:"event"`
}

// VerifiedCatalog is an immutable read model. All byte slices returned by the
// verifier are fresh copies and never alias caller-owned input.
type VerifiedCatalog struct {
	Sequence     uint64  `json:"sequence"`
	PublishedAt  string  `json:"publishedAt"`
	KeyID        string  `json:"keyId"`
	TrustVersion uint64  `json:"trustVersion"`
	Entries      []Entry `json:"entries"`

	document []byte
}

func cloneEntry(entry Entry) Entry {
	entry.Package = append([]byte(nil), entry.Package...)
	return entry
}

func cloneEntries(entries []Entry) []Entry {
	cloned := make([]Entry, len(entries))
	for index, entry := range entries {
		cloned[index] = cloneEntry(entry)
	}
	return cloned
}

func cloneVerified(value VerifiedCatalog) VerifiedCatalog {
	value.Entries = cloneEntries(value.Entries)
	value.document = append([]byte(nil), value.document...)
	return value
}
