package producta

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

const historicalImportPath = "github.com/vantare/overlays/v2/internal/strategy/producta"

const maxModuleRootParents = 16

var rescuedProductAFiles = map[string]string{
	"canonical_fixture_test.go": "bd98afd918b35d48f969430b153feb5fdd9eb152",
	"compare.go":                "200e3be1697593b3eab09f578d803ba00323aea8",
	"compare_test.go":           "c974b97525716b6846fd1f19d55bd7e8e5e1152e",
	"model.go":                  "4d7fbc76da63cc86671bcfab9be8470b545508a4",
	"model_test.go":             "d3a0dc8a2ffbaa38c2f73dc05bcf9abda1eba25c",
	"pit.go":                    "49aa5b86d96bcf23635ccb02c309cda27845250a",
	"pit_test.go":               "cfad7baebc58040d4c36bcde38ab7780c1e91653",
	"race.go":                   "6f28954cccafbb162b54c133cbb6e9ccf46782ca",
	"race_test.go":              "2e739822dce3c858e241ecbbcc53fb154f93c186",
	"resource.go":               "85f3da177fde9967338352e752cad181c02582dd",
	"resource_test.go":          "f2e87fd5b585c20b5615402047bea8959391461c",
	"sensitivity.go":            "332700a35d0ca49fd613e649a122c285e19c2e73",
	"sensitivity_test.go":       "59c3a476dbddb814ac0c2f36522eb6e68a977561",
	"solver.go":                 "fa09cf2eccdf4e67423cd9339315d895a48cf419",
	"solver_bench_test.go":      "23a80edd1fc06d4981d6fc0d74c8d02c54b897e3",
	"solver_test.go":            "af66cf2361f0965547af998962c6c72316f43985",
	"stint.go":                  "14487129bc1fe4d39c0cd7f03c12968b65f4a5b8",
	"stint_test.go":             "e36c1f0dec21e9095698f47936494150c1f992b7",
	filepath.Join("testdata", "canonical-cases.json"): "1cf926e9d700d368c354d9997698bd5839c24116",
	"tyre.go":          "e717e6c58cc4cd6704997bbf3b80b9a10760fffb",
	"tyre_test.go":     "817fde147e5c0648a9e57c44a016df09a27964c6",
	"units.go":         "bf66da12839298136831ea2bee827f7afcbecb45",
	"units_test.go":    "ba7435d7662afba2184b72a639d16c30b6508724",
	"validate.go":      "1a0b11c6b85d9c41ad6228496e78f4f93acb796d",
	"validate_test.go": "95c8d058b106bf4983c8f903a27691515f916076",
}

func TestRescuedProductAFilesMatchApprovedSource(t *testing.T) {
	names := make([]string, 0, len(rescuedProductAFiles))
	for name := range rescuedProductAFiles {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		name, want := name, rescuedProductAFiles[name]
		t.Run(filepath.ToSlash(name), func(t *testing.T) {
			content, err := os.ReadFile(name)
			if err != nil {
				t.Fatalf("read rescued file: %v", err)
			}
			if filepath.Ext(name) == ".go" {
				content = []byte(strings.Replace(string(content), "package producta", "package strategy", 1))
			}
			if got := gitBlobSHA(content); got != want {
				t.Fatalf("source blob = %s, want %s", got, want)
			}
		})
	}
}

func TestProductACharacterizationHasNoProductionConsumers(t *testing.T) {
	moduleRoot, err := findModuleRootFromWorkingDirectory()
	if err != nil {
		t.Fatal(err)
	}
	historicalRoot := filepath.Join(moduleRoot, "internal", "strategy", "producta")
	err = filepath.WalkDir(moduleRoot, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			if entry.Name() == "node_modules" || entry.Name() == "dist" {
				return filepath.SkipDir
			}
			return nil
		}
		if filepath.Ext(path) != ".go" || strings.HasSuffix(path, "_test.go") || strings.HasPrefix(path, historicalRoot+string(os.PathSeparator)) {
			return nil
		}
		parsed, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ImportsOnly)
		if err != nil {
			return fmt.Errorf("parse %s: %w", path, err)
		}
		for _, imported := range parsed.Imports {
			value, err := strconv.Unquote(imported.Path.Value)
			if err != nil {
				return fmt.Errorf("parse import in %s: %w", path, err)
			}
			if value == historicalImportPath {
				t.Errorf("production file %s imports historical Product A", path)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestFindModuleRootFromNestedDirectory(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "go.mod"), []byte("module example.test\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	nested := filepath.Join(root, "internal", "strategy", "producta")
	if err := os.MkdirAll(nested, 0o700); err != nil {
		t.Fatal(err)
	}
	got, err := findModuleRoot(nested)
	if err != nil {
		t.Fatal(err)
	}
	want, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("module root = %q, want %q", got, want)
	}
}

func TestFindModuleRootResolvesSymlinkWhenSupported(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "go.mod"), []byte("module example.test\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(t.TempDir(), "module-link")
	if err := os.Symlink(root, link); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	got, err := findModuleRoot(link)
	if err != nil {
		t.Fatal(err)
	}
	want, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("module root = %q, want %q", got, want)
	}
}

func TestFindModuleRootFailsWithoutGoMod(t *testing.T) {
	_, err := findModuleRoot(t.TempDir())
	if err == nil {
		t.Fatal("expected missing go.mod to fail")
	}
}

func findModuleRootFromWorkingDirectory() (string, error) {
	workingDirectory, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("get working directory: %w", err)
	}
	return findModuleRoot(workingDirectory)
}

func findModuleRoot(start string) (string, error) {
	absolute, err := filepath.Abs(start)
	if err != nil {
		return "", fmt.Errorf("make module search path absolute: %w", err)
	}
	resolved, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return "", fmt.Errorf("resolve module search path %q: %w", absolute, err)
	}

	directory := filepath.Clean(resolved)
	for depth := 0; depth < maxModuleRootParents; depth++ {
		info, statErr := os.Stat(filepath.Join(directory, "go.mod"))
		switch {
		case statErr == nil && info.Mode().IsRegular():
			return directory, nil
		case statErr == nil:
			return "", fmt.Errorf("go.mod at %q is not a regular file", directory)
		case !os.IsNotExist(statErr):
			return "", fmt.Errorf("inspect go.mod at %q: %w", directory, statErr)
		}

		parent := filepath.Dir(directory)
		if parent == directory {
			break
		}
		directory = parent
	}
	return "", fmt.Errorf("go.mod not found within %d parents of %q", maxModuleRootParents, resolved)
}

func TestRescueManifestIsExhaustive(t *testing.T) {
	var got []string
	err := filepath.WalkDir(".", func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		name := filepath.Clean(strings.TrimPrefix(path, "."+string(os.PathSeparator)))
		if name == "rescue_guard_test.go" || name == "deny_copy_guard_test.go" || name == "str01_scope_integration_test.go" || name == "doc.go" {
			return nil
		}
		got = append(got, name)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(got)
	want := make([]string, 0, len(rescuedProductAFiles))
	for name := range rescuedProductAFiles {
		want = append(want, name)
	}
	sort.Strings(want)
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Fatalf("rescued files differ\ngot:\n%s\nwant:\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
	}
}

func gitBlobSHA(content []byte) string {
	prefix := []byte(fmt.Sprintf("blob %d\x00", len(content)))
	payload := make([]byte, 0, len(prefix)+len(content))
	payload = append(payload, prefix...)
	payload = append(payload, content...)
	hash := sha1.Sum(payload) // Git SHA-1 object identity, not a security decision.
	return hex.EncodeToString(hash[:])
}
