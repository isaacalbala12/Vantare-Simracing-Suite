package main

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
)

func tempPathTagged(final, tag, protocol, runner string) string {
	return final + "." + tag + "-" + protocol[:12] + "-" + runner[:12] + ".tmp"
}
func tempPath(final, protocol, runner string) string {
	return tempPathTagged(final, "ta04f7", protocol, runner)
}

type outputGuard struct {
	allowedRoot, final, temp string
	ancestors                []ancestorIdentity
}

func preflightOutput(allowedRoot, final, protocol, runner string) (outputGuard, error) {
	return preflightOutputTagged(allowedRoot, final, "ta04f7", protocol, runner)
}
func preflightOutputTagged(allowedRoot, final, tag, protocol, runner string) (outputGuard, error) {
	var g outputGuard
	if !filepath.IsAbs(final) || filepath.Clean(final) != final || len(protocol) < 12 || len(runner) < 12 {
		return g, fmt.Errorf("output")
	}
	tmp := tempPathTagged(final, tag, protocol, runner)
	for _, p := range []string{final, tmp} {
		if _, e := os.Lstat(p); e == nil || !errors.Is(e, os.ErrNotExist) {
			return g, fmt.Errorf("output_state_preexisting")
		}
	}
	snap, err := snapshotAncestors(allowedRoot, filepath.Dir(final))
	if err != nil {
		return g, err
	}
	if err = validateAncestors(filepath.Dir(final)); err != nil {
		return g, err
	}
	return outputGuard{filepath.Clean(allowedRoot), final, tmp, snap}, nil
}
func validateAncestors(parent string) error {
	clean := filepath.Clean(parent)
	resolved, e := filepath.EvalSymlinks(clean)
	if e != nil || !samePath(clean, resolved) {
		return fmt.Errorf("reparse")
	}
	i, e := os.Lstat(clean)
	if e != nil || !i.IsDir() || i.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("parent")
	}
	return nil
}
func samePath(a, b string) bool {
	if runtime.GOOS == "windows" {
		return strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
	}
	return filepath.Clean(a) == filepath.Clean(b)
}
func publishExclusive(g outputGuard, body []byte) (ret error) {
	validate := func(p string) error {
		if e := validateAncestors(p); e != nil {
			return e
		}
		return compareAncestors(g.ancestors)
	}
	return publishWithOps(g.final, g.temp, body, outputOps{validate: validate, open: func(p string) (syncFile, error) { return os.OpenFile(p, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600) }, read: os.ReadFile, link: os.Link, remove: os.Remove, lstat: os.Lstat})
}

type ancestorIdentity struct {
	path string
	info os.FileInfo
}

func snapshotAncestors(allowedRoot, parent string) ([]ancestorIdentity, error) {
	allowedRoot = filepath.Clean(allowedRoot)
	parent = filepath.Clean(parent)
	if !filepath.IsAbs(allowedRoot) {
		return nil, fmt.Errorf("allowed_root")
	}
	rel, e := filepath.Rel(allowedRoot, parent)
	if e != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return nil, fmt.Errorf("outside_root")
	}
	paths := []string{allowedRoot}
	current := allowedRoot
	for _, part := range strings.Split(rel, string(os.PathSeparator)) {
		if part == "" || part == "." {
			continue
		}
		current = filepath.Join(current, part)
		paths = append(paths, current)
	}
	out := make([]ancestorIdentity, 0, len(paths))
	for _, p := range paths {
		i, e := os.Lstat(p)
		if e != nil || !i.IsDir() || i.Mode()&os.ModeSymlink != 0 {
			return nil, fmt.Errorf("ancestor")
		}
		out = append(out, ancestorIdentity{p, i})
	}
	return out, nil
}
func compareAncestors(s []ancestorIdentity) error {
	for _, x := range s {
		i, e := os.Lstat(x.path)
		if e != nil || !os.SameFile(x.info, i) || creationIdentity(x.info) != creationIdentity(i) || i.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("ancestor_changed")
		}
	}
	return nil
}
func creationIdentity(i os.FileInfo) string {
	v := reflect.ValueOf(i.Sys())
	if v.Kind() == reflect.Ptr {
		v = v.Elem()
	}
	if v.IsValid() && v.Kind() == reflect.Struct {
		f := v.FieldByName("CreationTime")
		if f.IsValid() && f.CanInterface() {
			return fmt.Sprint(f.Interface())
		}
	}
	return ""
}

type syncFile interface {
	io.Writer
	Sync() error
	Close() error
}
type outputOps struct {
	validate func(string) error
	open     func(string) (syncFile, error)
	read     func(string) ([]byte, error)
	link     func(string, string) error
	remove   func(string) error
	lstat    func(string) (os.FileInfo, error)
}

func publishWithOps(final, tmp string, body []byte, ops outputOps) (ret error) {
	if e := ops.validate(filepath.Dir(final)); e != nil {
		return e
	}
	if _, e := ops.lstat(final); !errors.Is(e, os.ErrNotExist) {
		return fmt.Errorf("output_state_preexisting")
	}
	if _, e := ops.lstat(tmp); !errors.Is(e, os.ErrNotExist) {
		return fmt.Errorf("output_state_preexisting")
	}
	f, e := ops.open(tmp)
	if e != nil {
		return e
	}
	remove := true
	defer func() {
		if remove {
			if x := ops.remove(tmp); x != nil && ret == nil {
				ret = x
			}
		}
	}()
	if _, e = f.Write(body); e != nil {
		_ = f.Close()
		return e
	}
	if e = f.Sync(); e != nil {
		_ = f.Close()
		return e
	}
	if e = f.Close(); e != nil {
		return e
	}
	if e = ops.validate(filepath.Dir(final)); e != nil {
		return e
	}
	if _, e = ops.lstat(final); !errors.Is(e, os.ErrNotExist) {
		return fmt.Errorf("output_state_preexisting")
	}
	if _, e = ops.lstat(tmp); e != nil {
		return fmt.Errorf("temp_missing")
	}
	check, e := ops.read(tmp)
	if e != nil || !bytes.Equal(check, body) {
		return fmt.Errorf("temp verify")
	}
	if e = ops.link(tmp, final); e != nil {
		return e
	}
	if e = ops.validate(filepath.Dir(final)); e != nil {
		return e
	}
	if _, e = ops.lstat(final); e != nil {
		return fmt.Errorf("final_missing")
	}
	if _, e = ops.lstat(tmp); e != nil {
		return fmt.Errorf("temp_missing")
	}
	check, e = ops.read(final)
	if e != nil || !bytes.Equal(check, body) {
		remove = false
		return fmt.Errorf("final verify")
	}
	if e = ops.remove(tmp); e != nil {
		return e
	}
	remove = false
	if _, e = ops.lstat(tmp); !errors.Is(e, os.ErrNotExist) {
		return fmt.Errorf("temp remains")
	}
	return nil
}
