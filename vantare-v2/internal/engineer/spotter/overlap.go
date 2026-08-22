package spotter

import "github.com/vantare/overlays/v2/internal/spotter/geometry"

type OverlapConfig = geometry.OverlapConfig

type OverlapResult = geometry.OverlapResult

func DefaultOverlapConfig() OverlapConfig {
	return geometry.DefaultOverlapConfig()
}

func ClassifyAlignedOverlap(aligned AlignedOpponent, existingOverlap bool, cfg OverlapConfig) OverlapResult {
	return geometry.ClassifyAlignedOverlap(aligned, existingOverlap, cfg)
}
