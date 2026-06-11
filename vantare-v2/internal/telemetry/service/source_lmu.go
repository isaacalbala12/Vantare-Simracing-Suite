package service

import (
	"github.com/vantare/overlays/v2/internal/telemetry/lmu"
)

// LMUSource reads live shared memory from Le Mans Ultimate (Windows).
type LMUSource struct {
	reader *lmu.Reader
}

// OpenLMUSource attaches to LMU_Data. Returns error if LMU is not running or platform unsupported.
func OpenLMUSource() (*LMUSource, error) {
	r, err := lmu.Open()
	if err != nil {
		return nil, err
	}
	return &LMUSource{reader: r}, nil
}

func (s *LMUSource) Read() []byte {
	if s == nil || s.reader == nil {
		return nil
	}
	return s.reader.Bytes()
}

func (s *LMUSource) Close() error {
	if s == nil || s.reader == nil {
		return nil
	}
	return s.reader.Close()
}
