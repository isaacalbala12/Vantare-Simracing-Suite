package app

// EventEmitter is the minimal UI event boundary shared by Wails bridges and
// tests. It is transport-neutral and does not imply a telemetry contract.
type EventEmitter interface {
	Emit(name string, data any)
}
