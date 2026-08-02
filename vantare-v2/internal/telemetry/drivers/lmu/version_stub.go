//go:build !windows

package lmu

func readLMUBuildEvidence() (BuildEvidence, error) { return BuildEvidence{}, nil }
