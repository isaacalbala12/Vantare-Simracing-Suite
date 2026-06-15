package frontend

import (
	"embed"
	"io/fs"
)

//go:embed dist
var distFS embed.FS

// DistFS returns the embedded assets rooted at the 'dist' folder.
func DistFS() fs.FS {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic(err)
	}
	return sub
}
