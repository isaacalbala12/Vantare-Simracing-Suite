package catalog

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sync"
)

type CacheStatus string

const (
	CacheCurrent   CacheStatus = "current"
	CacheAccepted  CacheStatus = "accepted"
	CacheUnchanged CacheStatus = "unchanged"
	CacheRecovered CacheStatus = "recovered"
)

const currentName = "official-catalog.current.json"
const previousName = "official-catalog.previous.json"
const leaseFileName = ".official-catalog.lock"

type Cache struct {
	mu       sync.Mutex
	root     string
	verifier *Verifier
	write    func(string, []byte) error
}

func OpenCache(root string, verifier *Verifier) (*Cache, error) {
	if verifier == nil || !filepath.IsAbs(root) || filepath.Clean(root) != root {
		return nil, catalogError(ErrorUnavailable, "cache")
	}
	if err := os.MkdirAll(root, 0o700); err != nil {
		return nil, wrapCatalogError(ErrorUnavailable, "cache", err)
	}
	return &Cache{root: root, verifier: verifier, write: writeAtomic}, nil
}

func (cache *Cache) Load() (catalog VerifiedCatalog, status CacheStatus, err error) {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	lease, acquireErr := acquireCacheLease(filepath.Join(cache.root, leaseFileName))
	if acquireErr != nil {
		return VerifiedCatalog{}, "", wrapCatalogError(ErrorUnavailable, "cache.lease", acquireErr)
	}
	defer func() {
		if releaseErr := lease.Close(); releaseErr != nil {
			catalog = VerifiedCatalog{}
			status = ""
			wrapped := wrapCatalogError(ErrorUnavailable, "cache.lease", releaseErr)
			if err == nil {
				err = wrapped
			} else {
				err = errors.Join(err, wrapped)
			}
		}
	}()
	return cache.loadLocked()
}

func (cache *Cache) loadLocked() (VerifiedCatalog, CacheStatus, error) {
	current := cache.readSlot(currentName)
	previous := cache.readSlot(previousName)
	// There is deliberately no external high-water mark in Task 1. The
	// greatest verified sequence available across the two durable slots is the
	// local authority; equal sequences must also have byte-identical evidence.
	if current.valid && previous.valid {
		switch {
		case current.catalog.Sequence > previous.catalog.Sequence:
			return current.catalog, CacheCurrent, nil
		case previous.catalog.Sequence > current.catalog.Sequence:
			if err := cache.repairCurrent(previous.document, previous.catalog); err != nil {
				return VerifiedCatalog{}, "", err
			}
			return previous.catalog, CacheRecovered, nil
		case bytes.Equal(current.document, previous.document):
			return current.catalog, CacheCurrent, nil
		default:
			return VerifiedCatalog{}, "", catalogError(ErrorSequenceConflict, "cache")
		}
	}
	if current.valid {
		return current.catalog, CacheCurrent, nil
	}
	if previous.valid {
		if current.missing {
			if err := cache.repairCurrent(previous.document, previous.catalog); err != nil {
				return VerifiedCatalog{}, "", err
			}
		}
		return previous.catalog, CacheRecovered, nil
	}
	cause := current.err
	if cause == nil || os.IsNotExist(cause) {
		cause = previous.err
	}
	return VerifiedCatalog{}, "", wrapCatalogError(ErrorUnavailable, "cache", cause)
}

type cacheSlot struct {
	document []byte
	catalog  VerifiedCatalog
	err      error
	valid    bool
	missing  bool
}

func (cache *Cache) readSlot(name string) cacheSlot {
	document, err := readCacheFile(filepath.Join(cache.root, name))
	if err != nil {
		return cacheSlot{err: err, missing: os.IsNotExist(err)}
	}
	verified, err := cache.verifier.Verify(document)
	if err != nil {
		return cacheSlot{document: document, err: err}
	}
	return cacheSlot{document: document, catalog: verified, valid: true}
}

func (cache *Cache) repairCurrent(document []byte, expected VerifiedCatalog) error {
	path := filepath.Join(cache.root, currentName)
	if err := cache.write(path, document); err != nil {
		landed, readErr := readCacheFile(path)
		if readErr == nil && bytes.Equal(landed, document) {
			if verified, verifyErr := cache.verifier.Verify(landed); verifyErr == nil && verified.Sequence == expected.Sequence {
				return nil
			}
		}
		return wrapCatalogError(ErrorUnavailable, "cache", err)
	}
	return nil
}

func (cache *Cache) Accept(candidate []byte) (catalog VerifiedCatalog, status CacheStatus, err error) {
	candidate = append([]byte(nil), candidate...)
	verified, err := cache.verifier.Verify(candidate)
	if err != nil {
		return VerifiedCatalog{}, "", err
	}
	cache.mu.Lock()
	defer cache.mu.Unlock()
	lease, acquireErr := acquireCacheLease(filepath.Join(cache.root, leaseFileName))
	if acquireErr != nil {
		return VerifiedCatalog{}, "", wrapCatalogError(ErrorUnavailable, "cache.lease", acquireErr)
	}
	defer func() {
		if releaseErr := lease.Close(); releaseErr != nil {
			catalog = VerifiedCatalog{}
			status = ""
			wrapped := wrapCatalogError(ErrorUnavailable, "cache.lease", releaseErr)
			if err == nil {
				err = wrapped
			} else {
				err = errors.Join(err, wrapped)
			}
		}
	}()
	currentPath := filepath.Join(cache.root, currentName)
	currentSlot := cache.readSlot(currentName)
	if err := validateAcceptSlot(currentSlot, "cache.current"); err != nil {
		return VerifiedCatalog{}, "", err
	}
	previousSlot := cache.readSlot(previousName)
	if err := validateAcceptSlot(previousSlot, "cache.previous"); err != nil {
		return VerifiedCatalog{}, "", err
	}
	hasSlot := !currentSlot.missing || !previousSlot.missing
	if hasSlot {
		current, _, currentErr := cache.loadLocked()
		if currentErr != nil {
			return VerifiedCatalog{}, "", currentErr
		}
		currentBytes := append([]byte(nil), current.document...)
		if verified.Sequence < current.Sequence {
			return VerifiedCatalog{}, "", catalogError(ErrorRollback, "sequence")
		}
		if verified.Sequence == current.Sequence {
			if bytes.Equal(candidate, currentBytes) {
				return cloneVerified(current), CacheUnchanged, nil
			}
			return VerifiedCatalog{}, "", catalogError(ErrorSequenceConflict, "sequence")
		}
		if err := cache.write(filepath.Join(cache.root, previousName), currentBytes); err != nil {
			return VerifiedCatalog{}, "", wrapCatalogError(ErrorUnavailable, "cache", err)
		}
	}
	if err := cache.write(currentPath, candidate); err != nil {
		landed, readErr := readCacheFile(currentPath)
		if readErr == nil && bytes.Equal(landed, candidate) {
			if reconciled, verifyErr := cache.verifier.Verify(landed); verifyErr == nil && reconciled.Sequence == verified.Sequence {
				return cloneVerified(reconciled), CacheAccepted, nil
			}
		}
		return VerifiedCatalog{}, "", wrapCatalogError(ErrorUnavailable, "cache", err)
	}
	return cloneVerified(verified), CacheAccepted, nil
}

func validateAcceptSlot(slot cacheSlot, field string) error {
	if slot.valid || slot.missing {
		return nil
	}
	return wrapCatalogError(ErrorUnavailable, field, slot.err)
}

func readCacheFile(path string) ([]byte, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if info.Size() < 0 || info.Size() > int64(MaxSerializedBundleBytes) {
		return nil, fmt.Errorf("catalog cache file exceeds limit")
	}
	handle, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer handle.Close()
	document, err := io.ReadAll(io.LimitReader(handle, int64(MaxSerializedBundleBytes)+1))
	if err != nil {
		return nil, err
	}
	if len(document) > MaxSerializedBundleBytes {
		return nil, fmt.Errorf("catalog cache file exceeds limit")
	}
	return document, nil
}

func writeAtomic(path string, data []byte) error {
	directory := filepath.Dir(path)
	temporary, err := os.CreateTemp(directory, ".official-catalog-*.tmp")
	if err != nil {
		return fmt.Errorf("create temporary catalog: %w", err)
	}
	temporaryPath := temporary.Name()
	committed := false
	defer func() {
		if !committed {
			_ = temporary.Close()
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return err
	}
	if _, err := temporary.Write(data); err != nil {
		return err
	}
	if err := temporary.Sync(); err != nil {
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := replaceAtomic(temporaryPath, path); err != nil {
		return err
	}
	committed = true
	if runtime.GOOS != "windows" {
		directoryHandle, openErr := os.Open(directory)
		if openErr != nil {
			return openErr
		}
		syncErr := directoryHandle.Sync()
		closeErr := directoryHandle.Close()
		if syncErr != nil {
			return syncErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	return nil
}
