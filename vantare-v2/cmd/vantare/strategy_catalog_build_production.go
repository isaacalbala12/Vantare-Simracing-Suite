//go:build production

package main

// Production builds never accept process environment values as a catalog
// endpoint or trust root, even when the embedded configuration is absent.
var strategyCatalogDevelopmentOverrideAllowed = false
