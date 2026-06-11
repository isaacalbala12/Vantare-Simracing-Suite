package normalizer_test

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/lmu"
	"github.com/vantare/overlays/v2/internal/telemetry/normalizer"
)

func TestFromBufferTooShort(t *testing.T) {
	n := normalizer.New()
	out := n.FromBuffer([]byte{1, 2, 3})
	if out == nil {
		t.Fatal("expected non-nil disconnected snapshot")
	}
	if out.Connected {
		t.Fatal("expected Connected=false for short buffer")
	}
}

func TestFromBufferSynthetic(t *testing.T) {
	n := normalizer.New()
	buf := lmu.BuildSyntheticBuffer()
	out := n.FromBuffer(buf)

	if !out.Connected {
		t.Fatal("expected connected")
	}
	if out.Session == nil || out.Session.TrackName != "Spa" {
		t.Fatalf("track: got %v", out.Session)
	}
	if out.Player == nil {
		t.Fatal("expected player")
	}
	if math.Abs(out.Player.Speed-15) > 0.01 {
		t.Fatalf("speed: got %v", out.Player.Speed)
	}
	if out.Player.Gear != 4 {
		t.Fatalf("gear: got %d", out.Player.Gear)
	}
}

func TestFromBufferFixture(t *testing.T) {
	binPath := filepath.Join("..", "..", "..", "testdata", "lmu-fixture.bin")
	jsonPath := filepath.Join("..", "..", "..", "testdata", "lmu-fixture.json")
	if _, err := os.Stat(binPath); err != nil {
		t.Skip("fixture bin missing")
	}

	buf, err := os.ReadFile(binPath)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(jsonPath)
	if err != nil {
		t.Fatal(err)
	}
	var sidecar struct {
		Session struct {
			TrackName string `json:"trackName"`
		} `json:"session"`
	}
	if err := json.Unmarshal(raw, &sidecar); err != nil {
		t.Fatal(err)
	}

	n := normalizer.New()
	out := n.FromBuffer(buf)
	if !out.Connected || out.Session == nil {
		t.Fatal("expected connected session")
	}
	if out.Session.TrackName != sidecar.Session.TrackName {
		t.Fatalf("track: got %q want %q", out.Session.TrackName, sidecar.Session.TrackName)
	}
	if out.Player == nil {
		t.Fatal("expected player from fixture")
	}
}
