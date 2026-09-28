//go:build windows

package main

import "testing"

func TestBoolText(t *testing.T) {
	if boolText(true) != "1" || boolText(false) != "0" {
		t.Fatal("unexpected bool encoding")
	}
}
