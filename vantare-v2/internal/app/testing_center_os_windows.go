//go:build windows

package app

import (
	"fmt"

	"golang.org/x/sys/windows"
)

func testingCenterOSVersion(osFamily string) string {
	if osFamily != "windows" {
		return "Unknown"
	}
	version := windows.RtlGetVersion()
	if version == nil {
		return "Windows"
	}
	return fmt.Sprintf(
		"Windows %d.%d.%d",
		version.MajorVersion,
		version.MinorVersion,
		version.BuildNumber,
	)
}
