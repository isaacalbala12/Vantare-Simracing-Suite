package app

import "strings"

const OverlayV1EmitEnvironment = "VANTARE_OVERLAY_V1_EMIT"

// ResolveOverlayV1Emit applies the persisted diagnostic switch and the
// one-process environment override. Only the explicit value "1" can turn the
// override on; absent and malformed values preserve the persisted setting.
func ResolveOverlayV1Emit(persisted bool, lookupEnv func(string) (string, bool)) bool {
	if lookupEnv == nil {
		return persisted
	}
	value, present := lookupEnv(OverlayV1EmitEnvironment)
	return persisted || present && strings.TrimSpace(value) == "1"
}
