//go:build windows

package launcher

import (
	"testing"
)

func TestParseLibraryFolders(t *testing.T) {
	vdf := `"libraryfolders"
    {
        "0"
        {
            "path"        "C:\\Program Files (x86)\\Steam"
        }
        "1"
        {
            "path"        "D:\\SteamLibrary"
        }
    }`
	paths := parseLibraryFoldersVDF(vdf)
	if len(paths) != 2 {
		t.Fatalf("expected 2 paths, got %d", len(paths))
	}
	if paths[0] != `C:\Program Files (x86)\Steam` {
		t.Errorf("path 0: got %q", paths[0])
	}
	if paths[1] != `D:\SteamLibrary` {
		t.Errorf("path 1: got %q", paths[1])
	}
}

func TestParseLibraryFoldersEmpty(t *testing.T) {
	paths := parseLibraryFoldersVDF("")
	if len(paths) != 0 {
		t.Errorf("expected 0 paths for empty input, got %d", len(paths))
	}
}

func TestParseLibraryFoldersNoPathKey(t *testing.T) {
	vdf := `"libraryfolders"
    {
        "0"
        {
            "other" "value"
        }
    }`
	paths := parseLibraryFoldersVDF(vdf)
	if len(paths) != 0 {
		t.Errorf("expected 0 paths when no path key present, got %d", len(paths))
	}
}

func TestParseLibraryFoldersBackslashUnescaping(t *testing.T) {
	vdf := `"libraryfolders"
    {
        "0"
        {
            "path"        "D:\\Games\\Steam Library"
        }
    }`
	paths := parseLibraryFoldersVDF(vdf)
	if len(paths) != 1 {
		t.Fatalf("expected 1 path, got %d", len(paths))
	}
	if paths[0] != `D:\Games\Steam Library` {
		t.Errorf("unescaped path: got %q", paths[0])
	}
}

func TestParseLibraryFoldersSkipsEmptyPath(t *testing.T) {
	vdf := `"libraryfolders"
    {
        "0"
        {
            "path"        ""
        }
        "1"
        {
            "path"        "D:\\Valid"
        }
    }`
	paths := parseLibraryFoldersVDF(vdf)
	// The regex captures the empty string between quotes, so we need to
	// verify the implementation filters it out (or not, per explicit design).
	// Here we assert the empty string is NOT included because it would be
	// useless as a library path.
	for _, p := range paths {
		if p == "" {
			t.Errorf("empty path should not be in result")
		}
	}
	if len(paths) == 0 {
		t.Fatal("expected at least one valid path")
	}
}

func TestParseLibraryFoldersTrailingContentIgnored(t *testing.T) {
	vdf := `"libraryfolders"
    {
        "0"
        {
            "path"        "C:\\Steam"
            "label"       "Main"
        }
    }`
	paths := parseLibraryFoldersVDF(vdf)
	if len(paths) != 1 {
		t.Fatalf("expected 1 path, got %d", len(paths))
	}
	if paths[0] != `C:\Steam` {
		t.Errorf("expected C:\\Steam, got %q", paths[0])
	}
}

// Helper to check that readSteamLibraryFolders uses parseLibraryFoldersVDF
// by verifing the public contract: result always includes the primary Steam
// path even if no VDF exists. This is an indirect integration check.
func TestReadSteamLibraryFoldersIncludesPrimary(t *testing.T) {
	// This test is inherently dependent on the build machine Steam install or
	// its absence. We only verify the slice is non-empty (at least primary).
	paths := readSteamLibraryFolders()
	if len(paths) == 0 {
		t.Error("expected at least the primary Steam path")
	}
}
