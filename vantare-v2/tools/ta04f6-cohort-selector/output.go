package main

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

type atomicFileV1 interface {
	io.Writer
	Sync() error
	Close() error
}
type atomicFSV1 interface {
	Validate(string) error
	OpenExclusive(string) (atomicFileV1, error)
	Rename(string, string) error
	Remove(string) error
}
type osAtomicFSV1 struct{}

func (osAtomicFSV1) OpenExclusive(path string) (atomicFileV1, error) {
	return os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
}
func (osAtomicFSV1) Rename(from, to string) error { return os.Rename(from, to) }
func (osAtomicFSV1) Remove(path string) error     { return os.Remove(path) }
func (osAtomicFSV1) Validate(target string) error { return validateAtomicTargetV1(target) }

func writeAtomicExclusiveV1(target string, content []byte) error {
	return writeAtomicExclusiveWithFSV1(target, content, osAtomicFSV1{}, rand.Reader)
}

func writeAtomicExclusiveWithFSV1(target string, content []byte, fs atomicFSV1, random io.Reader) (err error) {
	if fs == nil || random == nil || fs.Validate(target) != nil {
		return invalid()
	}
	var nonce [16]byte
	if _, err = io.ReadFull(random, nonce[:]); err != nil {
		return &CodedError{Code: CodePipelineFault}
	}
	temporary := filepath.Join(filepath.Dir(target), "."+filepath.Base(target)+"."+hex.EncodeToString(nonce[:])+".tmp")
	file, err := fs.OpenExclusive(temporary)
	if err != nil {
		return &CodedError{Code: CodePipelineFault}
	}
	remove := true
	defer func() {
		if remove {
			_ = fs.Remove(temporary)
		}
	}()
	if _, err = file.Write(content); err != nil {
		_ = file.Close()
		return &CodedError{Code: CodePipelineFault}
	}
	if err = file.Sync(); err != nil {
		_ = file.Close()
		return &CodedError{Code: CodePipelineFault}
	}
	if err = file.Close(); err != nil {
		return &CodedError{Code: CodePipelineFault}
	}
	if err = fs.Validate(target); err != nil {
		return invalid()
	}
	if err = fs.Rename(temporary, target); err != nil {
		return &CodedError{Code: CodePipelineFault}
	}
	remove = false
	return nil
}

func validateAtomicTargetV1(target string) error {
	if !filepath.IsAbs(target) || filepath.Clean(target) != target {
		return invalid()
	}
	if _, err := os.Lstat(target); err == nil || !errors.Is(err, os.ErrNotExist) {
		return invalid()
	}
	parent := filepath.Dir(target)
	volume := filepath.VolumeName(parent) + string(os.PathSeparator)
	current := volume
	rel, err := filepath.Rel(volume, parent)
	if err != nil {
		return invalid()
	}
	for _, part := range strings.Split(rel, string(os.PathSeparator)) {
		if part == "" || part == "." {
			continue
		}
		current = filepath.Join(current, part)
		info, e := os.Lstat(current)
		if e != nil || info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
			return invalid()
		}
		resolved, e := filepath.EvalSymlinks(current)
		if e != nil || !sameAtomicPathV1(current, resolved) {
			return invalid()
		}
	}
	return nil
}
func sameAtomicPathV1(a, b string) bool {
	a = filepath.Clean(a)
	b = filepath.Clean(b)
	if runtime.GOOS == "windows" {
		return strings.EqualFold(a, b)
	}
	return a == b
}
