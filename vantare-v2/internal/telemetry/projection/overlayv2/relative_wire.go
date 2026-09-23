package overlayv2

import (
	"encoding/json"
	"fmt"
)

// relativeRowJSON avoids invoking RelativeRowV2's wire methods recursively.
type relativeRowJSON RelativeRowV2

// MarshalJSON omits only the declared default authority. Native and estimated
// remain explicit; every quality/value and same-snapshot row field is unchanged.
func (row RelativeRowV2) MarshalJSON() ([]byte, error) {
	authority := row.Authority
	if authority == AuthorityDerived {
		authority = ""
	}
	return json.Marshal(struct {
		relativeRowJSON
		Authority Authority `json:"authority,omitempty"`
	}{relativeRowJSON: relativeRowJSON(row), Authority: authority})
}

// UnmarshalJSON preserves the canonical derived authority across a wire round
// trip while accepting the earlier explicit derived representation.
func (row *RelativeRowV2) UnmarshalJSON(data []byte) error {
	var decoded relativeRowJSON
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	if decoded.Authority == "" {
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(data, &fields); err != nil {
			return err
		}
		if _, explicit := fields["authority"]; explicit {
			return fmt.Errorf("invalid relative authority")
		}
		decoded.Authority = AuthorityDerived
	}
	switch decoded.Authority {
	case AuthorityDerived, AuthorityNative, AuthorityEstimated:
	default:
		return fmt.Errorf("invalid relative authority %q", decoded.Authority)
	}
	*row = RelativeRowV2(decoded)
	return nil
}
