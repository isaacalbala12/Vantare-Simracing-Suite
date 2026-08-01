package driver

// SourceStatus is a small, simulator-neutral connection summary for shell,
// diagnostics and operational metrics. It never contains telemetry payloads,
// personal data or driver implementation details.
type SourceStatus struct {
	Kind             ID     `json:"kind"`
	Name             string `json:"name"`
	Live             bool   `json:"live"`
	Available        bool   `json:"available"`
	State            string `json:"state"`
	ReconnectAttempt int    `json:"reconnectAttempt"`
}

// UnknownSourceStatus is the fail-closed value used when no live runtime is
// configured or its construction failed.
func UnknownSourceStatus() SourceStatus {
	return SourceStatus{
		Kind:  "unknown",
		Name:  "No source",
		State: StateStopped.String(),
	}
}
