package telemetryanalysis

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type SourceRoot struct {
	Kind       SourceKind
	Root       string
	Format     string
	Extensions []string
}

type MetadataEntry struct {
	Name      string
	Size      int64
	ModTime   time.Time
	IsDir     bool
	IsSymlink bool
}

// MetadataSource intentionally has no content-reading operation.
type MetadataSource interface {
	ReadDir(context.Context, string) ([]MetadataEntry, error)
	Exists(context.Context, string) (bool, error)
}

type OSMetadataSource struct{}

func (OSMetadataSource) ReadDir(ctx context.Context, root string) ([]MetadataEntry, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, sanitizedError("read_root")
	}
	result := make([]MetadataEntry, 0, len(entries))
	for _, entry := range entries {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		info, infoErr := entry.Info()
		if infoErr != nil {
			return nil, sanitizedError("read_metadata")
		}
		result = append(result, MetadataEntry{
			Name: entry.Name(), Size: info.Size(), ModTime: info.ModTime(), IsDir: entry.IsDir(),
			IsSymlink: entry.Type()&os.ModeSymlink != 0,
		})
	}
	return result, nil
}

func (OSMetadataSource) Exists(ctx context.Context, filePath string) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	_, err := os.Stat(filePath)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return false, sanitizedError("read_metadata")
}

func Discover(ctx context.Context, source MetadataSource, root SourceRoot, maxCandidates int) ([]Candidate, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if maxCandidates <= 0 {
		return nil, ErrCandidateLimit
	}
	entries, err := source.ReadDir(ctx, root.Root)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return nil, err
		}
		return nil, sanitizedError("read_root")
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name < entries[j].Name })

	candidates := make([]Candidate, 0)
	for _, entry := range entries {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if entry.IsDir || entry.IsSymlink || !validEntryName(entry.Name) ||
			!hasAllowedExtension(entry.Name, root.Extensions) {
			continue
		}
		if len(candidates) >= maxCandidates {
			return nil, ErrCandidateLimit
		}
		sourcePath := path.Join(root.Root, entry.Name)
		walPresent := false
		if root.Kind == SourceLMU {
			walPresent, err = source.Exists(ctx, sourcePath+".wal")
			if err != nil {
				if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
					return nil, err
				}
				return nil, sanitizedError("read_metadata")
			}
		}
		state := StateStabilizing
		if walPresent {
			state = StateActive
		}
		candidates = append(candidates, Candidate{
			Kind: root.Kind, Format: sourceFormat(root, entry.Name),
			Locator: redactLocator(root.Kind, sourcePath), Size: entry.Size,
			ModTime: entry.ModTime.UTC(), WALPresent: walPresent, State: state,
			sourcePath: sourcePath,
			walPath:    walPath(root.Kind, sourcePath),
		})
	}
	return candidates, nil
}

func walPath(kind SourceKind, sourcePath string) string {
	if kind == SourceLMU {
		return sourcePath + ".wal"
	}
	return ""
}

func hasAllowedExtension(name string, extensions []string) bool {
	extension := strings.ToLower(filepath.Ext(name))
	for _, allowed := range extensions {
		if extension == strings.ToLower(allowed) {
			return true
		}
	}
	return false
}

func validEntryName(name string) bool {
	return name != "" && name != "." && name != ".." && !strings.ContainsAny(name, `/\`)
}

func sourceFormat(root SourceRoot, name string) string {
	if root.Format != "" {
		return root.Format
	}
	if root.Kind == SourceLMU && strings.EqualFold(filepath.Ext(name), ".duckdb") {
		return "lmu-duckdb"
	}
	return strings.TrimPrefix(strings.ToLower(filepath.Ext(name)), ".")
}

func redactLocator(kind SourceKind, sourcePath string) string {
	sum := sha256.Sum256([]byte(filepath.Clean(sourcePath)))
	return string(kind) + "://" + hex.EncodeToString(sum[:8])
}

type sanitizedError string

func (e sanitizedError) Error() string { return "telemetry analysis discovery error: " + string(e) }
