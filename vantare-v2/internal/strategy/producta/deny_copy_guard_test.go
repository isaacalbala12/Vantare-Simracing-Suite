package producta

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
)

type denyCopyEntry struct {
	Path         string
	ProductABlob string
}

type deliveryArtifact struct {
	Path string
	Blob string
}

const deniedStrategyStoreContextFixture = "import { createContext } from \"react\";\n" +
	"import type { StrategyStore } from \"./strategy-store\";\n\n" +
	"export const StrategyStoreContext = createContext<StrategyStore | null>(null);\n"

var denyCopyManifest = []denyCopyEntry{
	{Path: "internal/app/settings_service.go", ProductABlob: "f81918231c09221bc1b6f29e88d7d4140a3cdebc"},
	{Path: "internal/app/settings_service_test.go", ProductABlob: "d2260b09c853f6e1e57671af0294794ff889426f"},
	{Path: "internal/app/strategy_bridge.go", ProductABlob: "4bfe5c832a8927b831c55bceee24a2537904215f"},
	{Path: "internal/app/strategy_bridge_test.go", ProductABlob: "0f23674f55739c92f855c093c93ac6e40b78018f"},
	{Path: "internal/app/strategy_export.go", ProductABlob: "2d250048e1483d83eff8c813b928220992a5587a"},
	{Path: "internal/app/strategy_export_test.go", ProductABlob: "386e664023582306d21008b15377adef7a8d3462"},
	{Path: "internal/app/strategy_service.go", ProductABlob: "730ac7a49b3ccc4e5ee4ec5aab60b69d5965f705"},
	{Path: "internal/app/strategy_service_test.go", ProductABlob: "dd877f0c506b573ee6f1b24e98c7ee006efb5f31"},
	{Path: "frontend/src/hub/strategy/StrategyAdvancedTable.tsx", ProductABlob: "a8e133f2541524e0baf82cc381bd4bfee8a6a5b7"},
	{Path: "frontend/src/hub/strategy/StrategyCalendarImport.test.tsx", ProductABlob: "82159aba42295e9a17c721f137a55c63e267933e"},
	{Path: "frontend/src/hub/strategy/StrategyCalendarImport.tsx", ProductABlob: "e088fd67c9f24878fd302670dd636f36cb830f53"},
	{Path: "frontend/src/hub/strategy/StrategyComparison.test.tsx", ProductABlob: "329fb4ccb84b206c216331431a44c19e2cc74893"},
	{Path: "frontend/src/hub/strategy/StrategyComparison.tsx", ProductABlob: "7d035bdf39678702322eac05e558a0b08d239cc8"},
	{Path: "frontend/src/hub/strategy/StrategyExport.test.tsx", ProductABlob: "6b6ae5b1c30e4bb6859539cf8860826211d11d10"},
	{Path: "frontend/src/hub/strategy/StrategyExport.tsx", ProductABlob: "db9606460b4e6995e66f6a565c2551ad35b16d07"},
	{Path: "frontend/src/hub/strategy/StrategyInputs.test.tsx", ProductABlob: "c90addb501a2e2d607a6ae031f618cb601a32dbd"},
	{Path: "frontend/src/hub/strategy/StrategyInputs.tsx", ProductABlob: "e825e61cddb4e2c8c38760aa383f8ea5c3231566"},
	{Path: "frontend/src/hub/strategy/StrategyOnboarding.test.tsx", ProductABlob: "06f0d7e08bb0f76822117c453a61f43130d0441c"},
	{Path: "frontend/src/hub/strategy/StrategyOnboarding.tsx", ProductABlob: "18d30f860c902571e913f9e7e244ff97d4af1f5b"},
	{Path: "frontend/src/hub/strategy/StrategyPlanManager.test.tsx", ProductABlob: "34e647ae064548654554f88fdfc03de5aaa6794b"},
	{Path: "frontend/src/hub/strategy/StrategyPlanManager.tsx", ProductABlob: "618180c45b0451cae7c55d3c0d63006541848000"},
	{Path: "frontend/src/hub/strategy/StrategyPlannerPage.test.tsx", ProductABlob: "6b891e1a92e4889b157556b5b802ac6fbff51458"},
	{Path: "frontend/src/hub/strategy/StrategyPlannerPage.tsx", ProductABlob: "c08c25c4a4a85d89f4f1ee3a512b1393318214f2"},
	{Path: "frontend/src/hub/strategy/StrategyPrintView.test.tsx", ProductABlob: "efb33bbbea90fa9929bed7de77b6d0f1ae33dcff"},
	{Path: "frontend/src/hub/strategy/StrategyPrintView.tsx", ProductABlob: "eb2a7acdb5b2b3380a16711f57a83d95f2262452"},
	{Path: "frontend/src/hub/strategy/StrategyTimeline.test.tsx", ProductABlob: "6cce391577839540b7ea7abb1cc2cdfbff050ece"},
	{Path: "frontend/src/hub/strategy/StrategyTimeline.tsx", ProductABlob: "a7c618e1e6328044bff9f85f8f31a591ff9b432a"},
	{Path: "frontend/src/hub/strategy/StrategyTyreInventory.test.tsx", ProductABlob: "cf8bafc727623b47514f87f91aecf5861129c727"},
	{Path: "frontend/src/hub/strategy/StrategyTyreInventory.tsx", ProductABlob: "005df98d284d5d0e13fbe3c42b1b169a2ff54b53"},
	{Path: "frontend/src/hub/strategy/StrategyWarnings.test.tsx", ProductABlob: "975d161ba73c2c17488ab450c8b3775c207f838a"},
	{Path: "frontend/src/hub/strategy/StrategyWarnings.tsx", ProductABlob: "36b4e090d0725f0733ee8ed15c64b2d2879c3ed9"},
	{Path: "frontend/src/hub/strategy/strategy-bridge.ts", ProductABlob: "b45764d902da096b8aab8ddb4e1ea12cac5b2a0e"},
	{Path: "frontend/src/hub/strategy/strategy-calendar-import.test.ts", ProductABlob: "d73dea359bafcb8642019e29071acf581401ef07"},
	{Path: "frontend/src/hub/strategy/strategy-calendar-import.ts", ProductABlob: "7f57f3d24247163d958b868a581caea35dbb358f"},
	{Path: "frontend/src/hub/strategy/strategy-contract.ts", ProductABlob: "a97761699306bc4057710ef3aedeb08a966729dc"},
	{Path: "frontend/src/hub/strategy/strategy-store-context.ts", ProductABlob: "61ed65006fde1ee80946a621b301f760b11442bb"},
	{Path: "frontend/src/hub/strategy/strategy-store-hooks.ts", ProductABlob: "d96ef775d3d81dccf5704a778ffe6f6a1817e8e6"},
	{Path: "frontend/src/hub/strategy/strategy-store-provider.tsx", ProductABlob: "19703a6e7ad764e21f82b43397e5743209e13d2f"},
	{Path: "frontend/src/hub/strategy/strategy-store.test.ts", ProductABlob: "30e3550276609ba7c156d8928e4e89472e06c940"},
	{Path: "frontend/src/hub/strategy/strategy-store.ts", ProductABlob: "ecec650310c70a232ccbb61603510a0d89f2050a"},
	{Path: "frontend/scripts/strategy-planner-smoke.mjs", ProductABlob: "a458f4f5b6b69a19566af167a96df113611e99b0"},
	{Path: "frontend/src/lib/wails-runtime-strategy-mock.ts", ProductABlob: "021749a2a5d65f0891e57fc06bdf2f54ef32e8a0"},
	{Path: "frontend/src/strategy-planner-harness.tsx", ProductABlob: "cfc7232ab270b867a359ad6ef984a114e2f2ca30"},
	{Path: "frontend/strategy-planner-harness.html", ProductABlob: "99cdc8719e18de854a6882e3d5b3c5b73eb2c3c5"},
	{Path: "docs/analysis/strategy-bridge-decision.md", ProductABlob: "dfad4b0056cc9c276494cf027e7370dd28e5d3f9"},
	{Path: "docs/current-plan.md", ProductABlob: "9b9b9115e1641dbf4a09d5ba8e3077a97df6f876"},
	{Path: "docs/research/strategy-planner-tinypedal-analysis.md", ProductABlob: "864b53e6eb2398e18e25fa31d7d498d704519e2b"},
	{Path: "docs/strategy-planner-architecture.md", ProductABlob: "a94c059be2fad7416f2bf020a7ad848acc104896"},
	{Path: "docs/strategy-planner-manual.md", ProductABlob: "ff7b8fcd6c48655c3618373d3226c621fb26efa3"},
	{Path: "docs/superpowers/plans/2026-07-11-strategy-product-a-manual-calculator.md", ProductABlob: "d809d776d5d8af887aaf36f8a5d4eb85e4c0c283"},
	{Path: "docs/superpowers/plans/2026-07-11-strategy-product-b-telemetry-guide.md", ProductABlob: "9a94c9892db148d48c7298ea4e1cfc4aa2b89874"},
	{Path: "docs/superpowers/plans/2026-07-11-strategy-product-c-live-guide.md", ProductABlob: "4a058d589beb73fb98bd8d8e4dcc39a0f5fef776"},
	{Path: "cmd/vantare/main.go", ProductABlob: "bd6394b0394bfb7eae57fab0e7348af2b9270609"},
	{Path: "frontend/src/hub/HubApp.tsx", ProductABlob: "d8afbdcda3baa1142f2e28d0e1242b8d8002a40d"},
	{Path: "frontend/src/hub/calendar/CalendarRaceDetailPanel.test.tsx", ProductABlob: "8010da217a82dd9a96faabe7c5aa89a55128e38c"},
	{Path: "frontend/src/hub/calendar/CalendarRaceDetailPanel.tsx", ProductABlob: "3d080a3e5e221cd512405ebce3a265c3536aeec3"},
	{Path: "frontend/src/hub/components/LauncherDock.test.tsx", ProductABlob: "2408ca9081a274d307ee31e3369f987e4cc43e31"},
	{Path: "frontend/src/hub/components/Topbar.tsx", ProductABlob: "88edd79f6854a449b36a714fb266c2160600ca88"},
	{Path: "frontend/src/hub/navigation.test.ts", ProductABlob: "2f85455f1fa2aed47174f3acc17b82e6ff958efb"},
	{Path: "frontend/src/hub/navigation.ts", ProductABlob: "50e04914ad88ffa5936bb85505dc013c530c3da3"},
	{Path: "frontend/src/hub/pages/CalendarPage.tsx", ProductABlob: "00c635df80aebf6e6ef0ade4bd6421bdcb9dfb04"},
	{Path: "frontend/src/i18n/locales/en.ts", ProductABlob: "3ee03ecaa626590d3f8cfa73f3cf237b29c8a17d"},
	{Path: "frontend/src/i18n/locales/es.ts", ProductABlob: "8a987edd79f3b3492a7d669b95f5a6d6908b7536"},
	{Path: "frontend/src/i18n/locales/it.ts", ProductABlob: "b645740eeabac65c4c84df6c8f5b4eacbaa66ea4"},
	{Path: "frontend/src/i18n/locales/pt.ts", ProductABlob: "306e8abc18250970a332be2fbfa764e9354baa79"},
	{Path: "frontend/src/index.css", ProductABlob: "a037f7dd5ffec3047e716760076b841ba03c7aa4"},
	{Path: "frontend/src/lib/access-policy.test.ts", ProductABlob: "49c99c4fb4cfbf865fb1f523a6698097174869d1"},
	{Path: "frontend/src/lib/access-policy.ts", ProductABlob: "b745075f728f230c8b57c1ec9f42b5b2c58b2c25"},
	{Path: "frontend/vite.config.ts", ProductABlob: "325d288f25e9a1943b00c44628c22cd6ce29071c"},
}

var str01OperationalPaths = map[string]struct{}{
	"docs/current-plan.md":                                       {},
	"docs/strategy-planner/str-01-delivery-paths.txt":            {},
	"docs/strategy-planner/str-01-product-a-characterization.md": {},
	"docs/vantare-program/handoffs/strategy-planner.md":          {},
	"docs/vantare-program/project-map.md":                        {},
}

func TestValidateDenyCopyDeltaRejectsHistoricalIntegrationPaths(t *testing.T) {
	changed := []string{
		"internal/app/strategy_service.go",
		"frontend/src/hub/HubApp.tsx",
		"frontend/src/i18n/locales/es.ts",
		"frontend/src/index.css",
	}
	err := validateDenyCopyDelta(changed)
	if err == nil {
		t.Fatal("expected denied Product A paths to fail")
	}
	for _, path := range changed {
		if !strings.Contains(err.Error(), path) {
			t.Errorf("error does not identify %s: %v", path, err)
		}
	}
}

func TestValidateDenyCopyDeltaAllowsSTR01DeliveryPaths(t *testing.T) {
	changed := []string{
		"internal/strategy/producta/model.go",
		"docs/current-plan.md",
		"docs/vantare-program/handoffs/strategy-planner.md",
		"docs/vantare-program/project-map.md",
		"docs/strategy-planner/str-01-delivery-paths.txt",
		"docs/strategy-planner/str-01-product-a-characterization.md",
	}
	if err := validateDenyCopyDelta(changed); err != nil {
		t.Fatal(err)
	}
}

func TestValidateDeliveryManifestRequiresExactDelta(t *testing.T) {
	tests := []struct {
		name     string
		actual   []string
		expected []string
		wantErr  string
	}{
		{
			name:     "exact",
			actual:   []string{"internal/strategy/producta/model.go", "docs/current-plan.md"},
			expected: []string{"docs/current-plan.md", "internal/strategy/producta/model.go"},
		},
		{
			name:     "untracked extra",
			actual:   []string{"internal/strategy/producta/model.go", "internal/app/strategy_service.go"},
			expected: []string{"internal/strategy/producta/model.go"},
			wantErr:  "internal/app/strategy_service.go",
		},
		{
			name:     "missing manifest path",
			actual:   []string{"internal/strategy/producta/model.go"},
			expected: []string{"internal/strategy/producta/model.go", "docs/current-plan.md"},
			wantErr:  "docs/current-plan.md",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateDeliveryManifest(test.actual, test.expected)
			if test.wantErr == "" {
				if err != nil {
					t.Fatal(err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), test.wantErr) {
				t.Fatalf("error = %v, want path %q", err, test.wantErr)
			}
		})
	}
}

func TestDeniedProductABlobCannotAppearOutsideOracle(t *testing.T) {
	const deniedPath = "frontend/src/hub/strategy/strategy-store-context.ts"
	const deniedBlob = "61ed65006fde1ee80946a621b301f760b11442bb"

	fixture := []byte(deniedStrategyStoreContextFixture)
	if err := validateBlobIdentity(fixture, deniedBlob); err != nil {
		t.Fatalf("exact Product A fixture lost its reviewed identity: %v", err)
	}
	err := validateDeniedBlobCopies([]deliveryArtifact{{
		Path: "docs/strategy-planner/str-01-product-a-characterization.md",
		Blob: gitBlobSHA(fixture),
	}})
	if err == nil || !strings.Contains(err.Error(), deniedPath) {
		t.Fatalf("exact denied blob outside producta was not rejected: %v", err)
	}

	tests := []struct {
		name    string
		content []byte
	}{
		{name: "removed byte", content: fixture[:len(fixture)-1]},
		{name: "changed byte", content: append(append([]byte(nil), fixture[:len(fixture)-2]...), 'X', '\n')},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := validateBlobIdentity(test.content, deniedBlob); err == nil {
				t.Fatal("changed historical fixture unexpectedly retained its reviewed blob identity")
			}
		})
	}
}

func TestDenyCopyManifestMatchesRescueMatrix(t *testing.T) {
	root, err := findModuleRootFromWorkingDirectory()
	if err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile(filepath.Join(root, "docs", "strategy-planner", "rescue-matrix.md"))
	if err != nil {
		t.Fatal(err)
	}
	pattern := regexp.MustCompile("(?m)^\\| ([0-9]+) \\| \\x60([^\\x60]+)\\x60 \\|")
	var matrixPaths []string
	for _, match := range pattern.FindAllStringSubmatch(string(content), -1) {
		row, err := strconv.Atoi(match[1])
		if err != nil {
			t.Fatal(err)
		}
		if row >= 26 && row <= 94 {
			matrixPaths = append(matrixPaths, normalizeRepoPath(match[2]))
		}
	}
	manifestPaths := make([]string, 0, len(denyCopyManifest))
	for _, entry := range denyCopyManifest {
		manifestPaths = append(manifestPaths, normalizeRepoPath(entry.Path))
	}
	sort.Strings(matrixPaths)
	sort.Strings(manifestPaths)
	if len(matrixPaths) != 69 || strings.Join(matrixPaths, "\n") != strings.Join(manifestPaths, "\n") {
		t.Fatalf("deny-copy manifest differs from matrix: matrix=%d manifest=%d", len(matrixPaths), len(manifestPaths))
	}
}

func TestSTR01VersionedDeliveryManifestRejectsDenyCopy(t *testing.T) {
	root, err := findModuleRootFromWorkingDirectory()
	if err != nil {
		t.Fatal(err)
	}
	paths, err := readDeliveryManifest(root)
	if err != nil {
		t.Fatal(err)
	}
	artifacts, err := collectDeliveryArtifacts(root, paths)
	if err != nil {
		t.Fatal(err)
	}
	if len(paths) != 34 {
		t.Fatalf("delivery manifest has %d paths, want 34", len(paths))
	}
	if err := validateDenyCopyDelta(paths); err != nil {
		t.Fatal(err)
	}
	if err := validateDeniedBlobCopies(artifacts); err != nil {
		t.Fatal(err)
	}
}

func readDeliveryManifest(root string) ([]string, error) {
	manifestPath := filepath.Join(root, "docs", "strategy-planner", "str-01-delivery-paths.txt")
	content, err := os.ReadFile(manifestPath)
	if err != nil {
		return nil, fmt.Errorf("read delivery manifest: %w", err)
	}
	var paths []string
	seen := make(map[string]struct{})
	for _, line := range strings.Split(string(content), "\n") {
		path := normalizeRepoPath(strings.TrimSpace(line))
		if path == "." || path == "" || strings.HasPrefix(path, "#") {
			continue
		}
		if _, duplicate := seen[path]; duplicate {
			return nil, fmt.Errorf("duplicate delivery path %s", path)
		}
		seen[path] = struct{}{}
		paths = append(paths, path)
	}
	return paths, nil
}

func collectDeliveryArtifacts(root string, paths []string) ([]deliveryArtifact, error) {
	artifacts := make([]deliveryArtifact, 0, len(paths))
	for _, path := range paths {
		blob, exists, err := fileGitBlob(filepath.Join(root, filepath.FromSlash(path)))
		if err != nil {
			return nil, err
		}
		if !exists {
			return nil, fmt.Errorf("delivery path %s does not exist", path)
		}
		artifacts = append(artifacts, deliveryArtifact{Path: normalizeRepoPath(path), Blob: blob})
	}
	return artifacts, nil
}

func validateDeliveryManifest(actual, expected []string) error {
	if err := validateDenyCopyDelta(actual); err != nil {
		return err
	}
	actualSet, err := normalizedPathSet("actual delta", actual)
	if err != nil {
		return err
	}
	expectedSet, err := normalizedPathSet("delivery manifest", expected)
	if err != nil {
		return err
	}
	var extra, missing []string
	for path := range actualSet {
		if _, ok := expectedSet[path]; !ok {
			extra = append(extra, path)
		}
	}
	for path := range expectedSet {
		if _, ok := actualSet[path]; !ok {
			missing = append(missing, path)
		}
	}
	if len(extra) == 0 && len(missing) == 0 {
		return nil
	}
	sort.Strings(extra)
	sort.Strings(missing)
	return fmt.Errorf("STR-01 delta differs from delivery manifest: extra=%v missing=%v", extra, missing)
}

func normalizedPathSet(label string, paths []string) (map[string]struct{}, error) {
	set := make(map[string]struct{}, len(paths))
	for _, raw := range paths {
		path := normalizeRepoPath(raw)
		if path == "." || path == "" {
			return nil, fmt.Errorf("%s contains an empty path", label)
		}
		if _, duplicate := set[path]; duplicate {
			return nil, fmt.Errorf("%s contains duplicate path %s", label, path)
		}
		set[path] = struct{}{}
	}
	return set, nil
}

func validateDeniedBlobCopies(artifacts []deliveryArtifact) error {
	deniedBlobs := make(map[string]string, len(denyCopyManifest))
	for _, entry := range denyCopyManifest {
		deniedBlobs[entry.ProductABlob] = entry.Path
	}
	var violations []string
	for _, artifact := range artifacts {
		path := normalizeRepoPath(artifact.Path)
		if strings.HasPrefix(path, "internal/strategy/producta/") {
			continue
		}
		if origin, denied := deniedBlobs[artifact.Blob]; denied {
			violations = append(violations, fmt.Sprintf("%s copies %s", path, origin))
		}
	}
	if len(violations) == 0 {
		return nil
	}
	sort.Strings(violations)
	return fmt.Errorf("STR-01 copies denied Product A blobs: %s", strings.Join(violations, ", "))
}

func validateBlobIdentity(content []byte, expected string) error {
	if got := gitBlobSHA(content); got != expected {
		return fmt.Errorf("Git blob = %s, want %s", got, expected)
	}
	return nil
}

func validateDenyCopyDelta(changedPaths []string) error {
	var violations []string
	for _, changed := range changedPaths {
		path := normalizeRepoPath(changed)
		if strings.HasPrefix(path, "internal/strategy/producta/") {
			continue
		}
		if _, allowed := str01OperationalPaths[path]; allowed {
			continue
		}
		violations = append(violations, path)
	}
	if len(violations) == 0 {
		return nil
	}
	sort.Strings(violations)
	return fmt.Errorf("STR-01 delta contains paths outside its allowlist: %s", strings.Join(violations, ", "))
}

func fileGitBlob(path string) (string, bool, error) {
	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("stat %s: %w", path, err)
	}
	if !info.Mode().IsRegular() {
		return "", false, fmt.Errorf("%s is not a regular file", path)
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return "", false, fmt.Errorf("read %s: %w", path, err)
	}
	return gitBlobSHA(content), true, nil
}

func normalizeRepoPath(path string) string {
	path = filepath.ToSlash(filepath.Clean(path))
	path = strings.TrimPrefix(path, "./")
	path = strings.TrimPrefix(path, "vantare-v2/")
	return path
}
