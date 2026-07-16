package tts

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// MockProvider synthesizes a deterministic MP3-like byte blob to a temp file.
// The output starts with a valid ID3v2 header (3 bytes "ID3") followed by an
// MP3 frame-sync marker (0xFF 0xFB 0x90 ...). The content is NOT real audio —
// it is a stand-in that satisfies audio decoders' header parsing so the audio
// pipeline can be exercised end-to-end in CI without network access.
//
// MockProvider is concurrency-safe.
type MockProvider struct {
	mu      sync.Mutex
	outDir  string
	callCnt int
}

// NewMockProvider creates a MockProvider that writes outputs to outDir.
func NewMockProvider(outDir string) (*MockProvider, error) {
	if outDir == "" {
		return nil, errors.New("tts: mock provider outDir required")
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return nil, fmt.Errorf("tts: mock outDir: %w", err)
	}
	return &MockProvider{outDir: outDir}, nil
}

// Name returns "mock".
func (m *MockProvider) Name() string { return "mock" }

// Synthesize writes a deterministic blob to <outDir>/<hash>.mp3 where hash is
// derived from the request triple (same algorithm as Cache.Key so the blob
// can be re-cached identically if the cache is wiped).
func (m *MockProvider) Synthesize(req Request) (Result, error) {
	if req.Text == "" {
		return Result{}, errors.New("tts: empty text in mock synthesize")
	}
	m.mu.Lock()
	m.callCnt++
	cnt := m.callCnt
	m.mu.Unlock()

	// Same key algorithm as cache so file naming matches.
	key := requestKey(req)
	dst := filepath.Join(m.outDir, key+".mp3")

	blob := buildMockMP3(req, cnt)
	if err := os.WriteFile(dst, blob, 0o644); err != nil {
		return Result{}, fmt.Errorf("tts: mock write: %w", err)
	}
	return Result{Format: "mp3", Path: dst}, nil
}

// Health always returns nil (mock is always ready).
func (m *MockProvider) Health() error { return nil }

// CallCount returns the number of Synthesize calls so far (for tests).
func (m *MockProvider) CallCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.callCnt
}

// requestKey mirrors Cache.Key — duplicated here to avoid a circular import
// when MockProvider is constructed independently of an Engine.
func requestKey(req Request) string {
	h := sha256.Sum256([]byte(req.Language + "\x00" + req.Voice + "\x00" + req.Text))
	return hex.EncodeToString(h[:])
}

// buildMockMP3 returns ~256 bytes that look enough like an MP3 for a decoder
// to attempt playback. Layout:
//
//	[0..9]    ID3v2 header (ID3 + version 4.0.0 + flags 0 + size 0)
//	[10]      0xFF (sync byte)
//	[11]      0xFB (sync + MPEG1 Layer3 + 128kbps-ish)
//	[12..]    padding bytes derived from request text
//
// NOTE: this is a stub; real audio bytes are replaced by a real provider.
func buildMockMP3(req Request, callCount int) []byte {
	buf := make([]byte, 256)
	copy(buf[0:3], "ID3") // ID3v2 identifier
	buf[3] = 4            // major version
	buf[4] = 0            // revision
	buf[5] = 0            // flags
	// [6..9] size is sync-safe integer (each byte's high bit 0). Use 0.
	copy(buf[10:12], []byte{0xFF, 0xFB})

	// Sprinkle some bytes derived from the request so different requests
	// produce different blobs (helps cache key uniqueness inspection).
	if len(req.Text) > 0 {
		for i := 12; i < len(buf) && i-12 < len(req.Text); i++ {
			buf[i] = req.Text[i-12]
		}
	}
	// Last byte encodes call count so successive identical requests differ
	// at byte level (still hash to the same key).
	buf[len(buf)-1] = byte(callCount)
	return buf
}
