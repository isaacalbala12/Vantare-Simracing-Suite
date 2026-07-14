package replay

import (
	"bufio"
	"encoding/json"
	"io"

	"github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

func WriteFrame(w io.Writer, frame *telemetry.Frame) error {
	enc := json.NewEncoder(w)
	return enc.Encode(frame)
}

type Reader struct {
	scanner *bufio.Scanner
}

func NewReader(r io.Reader) *Reader {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 64*1024), 4*1024*1024)
	return &Reader{scanner: sc}
}

func (r *Reader) Next() (*telemetry.Frame, bool, error) {
	if !r.scanner.Scan() {
		if err := r.scanner.Err(); err != nil {
			return nil, false, err
		}
		return nil, false, nil
	}
	var frame telemetry.Frame
	if err := json.Unmarshal(r.scanner.Bytes(), &frame); err != nil {
		return nil, false, err
	}
	return &frame, true, nil
}
