//go:build !production

package app

import (
	"os"
	"strconv"
)

func diagnosticPerformanceLevel() int {
	level, err := strconv.Atoi(os.Getenv("VANTARE_PERF_LEVEL"))
	if err != nil || level < 1 || level > 5 {
		return 0
	}
	return level
}
