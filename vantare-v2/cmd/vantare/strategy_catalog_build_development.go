//go:build !production

package main

// Local source builds may opt into public Strategy catalog configuration from
// the process environment. Packaged builds use the production-tagged source.
var strategyCatalogDevelopmentOverrideAllowed = true
