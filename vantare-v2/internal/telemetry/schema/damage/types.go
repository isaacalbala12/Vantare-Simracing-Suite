// Package damage contains canonical damage values observed from LMU shared memory.
package damage

// Severity represents dent severity at one of eight locations (0=none).
type Severity uint8

// State carries the observed damage for a single vehicle. All fields are
// observed directly from the LMU shared memory and never derived.
type State struct {
	Dents              [8]Severity
	Overheating        bool
	Detached           bool
	WheelDetachedCount uint8 // 0..4
}

// Valid reports whether the state is structurally plausible. Dents are bytes
// and always in range; the only checks are wheel count bounds.
func (s State) Valid() bool {
	return s.WheelDetachedCount <= 4
}
