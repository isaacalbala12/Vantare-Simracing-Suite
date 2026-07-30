// Package recording owns versioned historical telemetry contracts and the
// neutral, non-blocking recording coordinator. Database adapters live below
// this package and never leak their implementation into Telemetry Core.
package recording

type Version uint16

const RecordingVersionV1 Version = 1
