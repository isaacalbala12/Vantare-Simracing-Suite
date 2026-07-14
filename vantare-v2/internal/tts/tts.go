// Package tts provides text-to-speech synthesis with disk caching.
//
// Status: skeleton — only MockProvider and Engine are implemented.
// Edge, Kokoro and Gemini providers are aspirational; see docs/engineer/architecture/tts.md.
//
// The public API is stable enough to wire callers (audio resolver in service
// layer, verify-prealpha.ps1 script). Adding a real provider is a matter of
// implementing Provider and registering it in Engine.
package tts

// Request is the input for a synthesis call.
type Request struct {
	Language string // e.g. "es", "en"
	Voice    string // e.g. "es-ES-ElviraNeural", "en-US-JennyNeural"
	Text     string // the text to synthesize
}

// Result is the output of a synthesis call.
type Result struct {
	Format string // "mp3" — only MP3 is supported in prealpha
	Path   string // absolute path to the synthesized (or cached) file
}

// Provider synthesizes speech audio for a given Request.
// Implementations must be safe for concurrent use.
type Provider interface {
	// Name returns a stable identifier (e.g. "edge", "kokoro", "mock").
	Name() string
	// Synthesize produces audio for the request and returns the path of the
	// output file. The file MUST exist on disk when Synthesize returns nil.
	Synthesize(req Request) (Result, error)
	// Health returns nil if the provider is ready to serve requests.
	Health() error
}
