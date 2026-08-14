package catalog

const (
	BundleVersionV1  = "strategy.official-catalog.bundle.v1"
	PayloadVersionV1 = "strategy.official-catalog.payload.v1"
	TrustVersionV1   = "strategy.official-catalog.trust.v1"
	SignatureDomain  = "vantare.strategy.official-catalog.v1"

	// MaxDecodedPackagesBytes is the aggregate budget after JSON base64
	// decoding. MaxDecodedPackageBytes aliases the packaging contract in
	// verify.go so both layers retain the same individual 4 MiB boundary.
	MaxDecodedPackagesBytes = 16 << 20
	MaxManifestBytes        = 64 << 10
	MaxEntries              = 128
	MaxJSONSafeInteger      = uint64(1<<53 - 1)

	// A JSON string byte can expand to six ASCII bytes (for example, a control
	// character encoded as \u00XX). Package []byte fields use padded base64;
	// separately encoded entries can each add at most one four-byte quantum.
	maxJSONStringExpansion = 6
	maxEntryIDBytes        = 128
	maxEntryTextBytes      = 160 + 1024 + 4*128
	maxEncodedPackageBytes = ((MaxDecodedPackagesBytes+2)/3)*4 + 4*(MaxEntries-1)

	maxSerializedEntryFixedBytes    = len(`{"id":"","title":"","summary":"","compatibility":{"simulator":"","circuit":"","car":"","event":""},"package":""}`)
	maxSerializedPayloadFixedBytes  = len(`{"payloadVersion":"","entries":[]}`) + len(PayloadVersionV1)
	maxSerializedEnvelopeFixedBytes = len(`{"bundleVersion":"","manifest":"","payload":"","signature":""}`) +
		len(BundleVersionV1) + 86 // unpadded base64url for one Ed25519 signature

	MaxSerializedPayloadBytes = maxSerializedPayloadFixedBytes +
		MaxEntries*(maxSerializedEntryFixedBytes+maxEntryIDBytes+maxJSONStringExpansion*maxEntryTextBytes) +
		(MaxEntries - 1) + maxEncodedPackageBytes
	MaxSerializedBundleBytes = maxSerializedEnvelopeFixedBytes +
		((MaxManifestBytes+2)/3)*4 +
		((MaxSerializedPayloadBytes+2)/3)*4
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
