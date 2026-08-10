//go:build production

package main

import "testing"

func TestStrategyCatalogDevelopmentOverrideIsDisabledForProductionBuilds(t *testing.T) {
	if strategyCatalogDevelopmentOverrideAllowed {
		t.Fatal("production build allowed Strategy catalog trust from process environment")
	}
}
