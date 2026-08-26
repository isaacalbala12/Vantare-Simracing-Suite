//go:build !windows

package main

func resolveLMUInstallPlatformV1() (string, error) { return "", invalid() }
