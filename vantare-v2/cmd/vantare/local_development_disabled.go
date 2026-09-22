//go:build !vantare_localdev || production

package main

import "github.com/vantare/overlays/v2/internal/license"

func localDevelopmentResult() *license.Result { return nil }
