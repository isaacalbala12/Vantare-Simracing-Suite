package strategyprojection

// Presence describe el eje presencia/calidad de cada familia.
// Vocabulario congelado en F1.2 tomando como base el contrato Strategy
// vigente (valid | missing | invalid | stale | unsupported | unknown).
// La ausencia o invalidez no es una procedencia.
type Presence string

const (
	PresenceValid       Presence = "valid"
	PresenceMissing     Presence = "missing"
	PresenceInvalid     Presence = "invalid"
	PresenceStale       Presence = "stale"
	PresenceUnsupported Presence = "unsupported"
	PresenceUnknown     Presence = "unknown"
)

func (p Presence) Valid() bool {
	switch p {
	case PresenceValid, PresenceMissing, PresenceInvalid, PresenceStale, PresenceUnsupported, PresenceUnknown:
		return true
	default:
		return false
	}
}
