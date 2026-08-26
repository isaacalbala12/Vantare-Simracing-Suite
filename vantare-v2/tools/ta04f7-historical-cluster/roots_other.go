//go:build !windows

package main

import "fmt"

func resolveLMUInstallPlatform() (string, error) { return "", fmt.Errorf("unsupported") }
