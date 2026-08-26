package main

import (
	"os"
	"path/filepath"
)

func projectOutputPath(filename string) string {
	dir, err := os.Getwd()
	if err != nil {
		return ""
	}
	for {
		if info, statErr := os.Stat(filepath.Join(dir, "go.mod")); statErr == nil && !info.IsDir() {
			return filepath.Join(dir, "docs", "vantare-program", "research", "telemetry-analysis", filename)
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}
