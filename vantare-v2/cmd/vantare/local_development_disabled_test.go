//go:build !vantare_localdev || production

package main

import "testing"

func TestLocalDevelopmentBuildProfileDisabled(t *testing.T) {
	if localDevelopmentResult() != nil {
		t.Fatal("default and production builds must keep the normal license path")
	}
	if hubWindowOptions("test").Title != "Vantare Hub" {
		t.Fatal("normal build window title changed")
	}
}
