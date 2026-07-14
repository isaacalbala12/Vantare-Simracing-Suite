package replay

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

type Source struct {
	mu       sync.Mutex
	frames   []*telemetry.Frame
	index    int
	filename string
}

// NewSource creates a new replay source that loads all frames from the file.
func NewSource(path string) (*Source, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("opening %q: %w", path, err)
	}
	defer file.Close()

	reader := NewReader(file)
	var frames []*telemetry.Frame
	for {
		frame, next, err := reader.Next()
		if err != nil {
			return nil, fmt.Errorf("reading %q: %w", path, err)
		}
		if !next {
			break
		}
		frames = append(frames, frame)
	}

	return &Source{
		frames:   frames,
		filename: filepath.Base(path),
	}, nil
}

func (s *Source) ReadFrame() *telemetry.Frame {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(s.frames) == 0 {
		return nil
	}

	if s.index < len(s.frames) {
		frame := s.frames[s.index]
		s.index++
		return frame
	}

	// after EOF keep returning the last frame
	return s.frames[len(s.frames)-1]
}

func (s *Source) Info() telemetry.SourceInfo {
	return telemetry.SourceInfo{
		Kind:      telemetry.KindReplay,
		Name:      s.filename,
		Live:      false,
		Available: true,
	}
}

func (s *Source) Close() error {
	return nil
}
