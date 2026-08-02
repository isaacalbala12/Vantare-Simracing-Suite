//go:build !windows

package app

func testingCenterOSVersion(string) string {
	return "Unknown"
}
