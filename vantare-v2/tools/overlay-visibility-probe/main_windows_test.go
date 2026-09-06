package main

import "testing"

func TestScreenIntersection(t *testing.T) {
	screen := rect{0, 0, 1920, 1080}
	for _, tt := range []struct {
		r    rect
		want bool
	}{
		{rect{0, 0, 1920, 1080}, true}, {rect{2000, 0, 2100, 100}, false},
		{rect{0, 0, 0, 100}, false}, {rect{-100, 0, 100, 100}, true},
	} {
		if got := onScreen(tt.r, screen); got != tt.want {
			t.Errorf("%v: got %v", tt.r, got)
		}
	}
}
