package lmu

import (
	"os"
	"testing"

	engineerlmu "github.com/vantare/overlays/v2/internal/engineer/lmu"
)

func TestPublicAndEngineerParsersAgreeOnOverlappingFixtureFields(t *testing.T) {
	binPath, _ := fixturePaths()
	buf, err := os.ReadFile(binPath)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}

	public := Parse(buf, ParseFull)
	engineer := engineerlmu.ParseEngineerFrame(buf)
	if public == nil || engineer == nil {
		t.Fatal("expected both parsers to accept the audited fixture")
	}
	if public.Session == nil || engineer.Session == nil {
		t.Fatal("expected session from both parsers")
	}
	if public.Session.TrackName != engineer.Session.TrackName ||
		public.Session.SessionType != engineer.Session.SessionType ||
		public.Session.NumVehicles != engineer.Session.NumVehicles ||
		public.Session.GamePhase != engineer.Session.GamePhase {
		t.Fatalf("session mismatch: public=%+v engineer=%+v", public.Session, engineer.Session)
	}
	if public.Player == nil || engineer.Player == nil || public.Player.ID != engineer.Player.ID {
		t.Fatalf("player mismatch: public=%+v engineer=%+v", public.Player, engineer.Player)
	}
	if len(public.Vehicles) != len(engineer.Vehicles) {
		t.Fatalf("vehicle count mismatch: public=%d engineer=%d", len(public.Vehicles), len(engineer.Vehicles))
	}
}
