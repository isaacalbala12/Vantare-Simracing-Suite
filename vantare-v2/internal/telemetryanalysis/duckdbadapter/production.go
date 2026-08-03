package duckdbadapter

import "path/filepath"

const runtimeVersionDirectory = "duckdb-v1"

// ProductionTrust anchors the installed runtime in a manifest digest compiled
// into Vantare. The build script refuses a bundle that does not match it.
func ProductionTrust(applicationDirectory string) TrustedRuntime {
	return TrustedRuntime{
		Directory:      filepath.Join(applicationDirectory, "runtime", "telemetry", runtimeVersionDirectory),
		ManifestSHA256: productionManifestSHA256,
	}
}
