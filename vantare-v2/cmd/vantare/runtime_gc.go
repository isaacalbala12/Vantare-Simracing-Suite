package main

// ISA-996: six live widgets measured less CPU with GOGC=300, for roughly
// twenty extra MiB over the socket-only control. GC stays enabled; an explicit
// GOGC or GOMEMLIMIT remains owned by the user/runtime. See ADR 0094.
// The small injection seam keeps tests from changing process-global GC state.
func configureRuntimeGC(lookupEnv func(string) (string, bool), setGCPercent func(int) int) {
	if _, configured := lookupEnv("GOGC"); !configured {
		setGCPercent(300)
	}
}
