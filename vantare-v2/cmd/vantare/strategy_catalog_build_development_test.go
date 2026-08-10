//go:build !production

package main

import "testing"

func TestStrategyCatalogDevelopmentOverrideIsEnabledForLocalBuilds(t *testing.T) {
	if !strategyCatalogDevelopmentOverrideAllowed {
		t.Fatal("local build disabled the explicit Strategy catalog development override")
	}
}
