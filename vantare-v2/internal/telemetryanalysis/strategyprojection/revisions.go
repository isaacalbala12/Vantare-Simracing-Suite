package strategyprojection

import (
	"strings"
	"unicode/utf8"
)

// AnalysisRevisionRef pins the complete Analysis base and scalar correction
// revision used by a projection. BaseDigest includes content and interpretation
// versions. These identifiers describe provenance; they never authorize I/O.
// Analysis must bind them to the actual derivations before publishing.
type AnalysisRevisionRef struct {
	SessionID  string `json:"sessionId"`
	BaseDigest string `json:"baseDigest"`
	RevisionID string `json:"revisionId"`
	SnapshotID string `json:"snapshotId"`
}

// ValidateSourceRevisions permits nil only for legacy unversioned projections.
// Once references are supplied, the entire selection must be pinned. The
// recorded editor must additionally require references before saving a plan.
func ValidateSourceRevisions(sessions []string, refs []AnalysisRevisionRef) error {
	if refs == nil {
		return nil
	}
	invalid := func() error {
		return contractError("invalid_document", "sourceRevisions", "requires one valid exact revision per selected session")
	}
	if len(refs) == 0 || len(refs) != len(sessions) {
		return invalid()
	}
	remaining := make(map[string]bool, len(sessions))
	for _, id := range sessions {
		if strings.TrimSpace(id) == "" || len(id) > 256 || !utf8.ValidString(id) || remaining[id] {
			return invalid()
		}
		remaining[id] = true
	}
	for _, ref := range refs {
		if !remaining[ref.SessionID] || !revisionDigest(ref.BaseDigest) || !revisionDigest(ref.RevisionID) || !revisionDigest(ref.SnapshotID) {
			return invalid()
		}
		delete(remaining, ref.SessionID)
	}
	return nil
}

func revisionDigest(value string) bool {
	if len(value) != 64 {
		return false
	}
	for _, c := range value {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return false
		}
	}
	return true
}
