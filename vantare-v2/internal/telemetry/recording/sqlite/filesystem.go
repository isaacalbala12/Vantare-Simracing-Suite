package sqlite

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

type FileSystem interface {
	MkdirAll(string, os.FileMode) error
	ReadFile(string) ([]byte, error)
	WriteAtomic(context.Context, string, []byte, os.FileMode) error
	CopyFile(string, string, os.FileMode) error
	SHA256(string) (string, error)
	Stat(string) (os.FileInfo, error)
}

type OSFileSystem struct{}

func (OSFileSystem) MkdirAll(path string, mode os.FileMode) error {
	return os.MkdirAll(path, mode)
}

func (OSFileSystem) ReadFile(path string) ([]byte, error) {
	return os.ReadFile(path)
}

func (OSFileSystem) WriteAtomic(ctx context.Context, path string, data []byte, mode os.FileMode) (err error) {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("create manifest directory: %w", err)
	}
	file, err := os.CreateTemp(filepath.Dir(path), filepath.Base(path)+".tmp-*")
	if err != nil {
		return fmt.Errorf("create manifest temp: %w", err)
	}
	tempPath := file.Name()
	closed := false
	defer func() {
		if !closed {
			if closeErr := file.Close(); err == nil && closeErr != nil {
				err = fmt.Errorf("close manifest temp: %w", closeErr)
			}
		}
		if removeErr := os.Remove(tempPath); err == nil && removeErr != nil && !os.IsNotExist(removeErr) {
			err = fmt.Errorf("remove manifest temp: %w", removeErr)
		}
	}()
	if err := file.Chmod(mode); err != nil {
		return fmt.Errorf("chmod manifest temp: %w", err)
	}
	const writeChunk = 32 * 1024
	for offset := 0; offset < len(data); offset += writeChunk {
		if err := ctx.Err(); err != nil {
			return err
		}
		end := min(offset+writeChunk, len(data))
		if _, err := file.Write(data[offset:end]); err != nil {
			return fmt.Errorf("write manifest temp: %w", err)
		}
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return fmt.Errorf("sync manifest temp: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close manifest temp: %w", err)
	}
	closed = true
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := replaceAtomic(tempPath, path); err != nil {
		return fmt.Errorf("replace manifest: %w", err)
	}
	return nil
}

func (OSFileSystem) CopyFile(source, destination string, mode os.FileMode) (err error) {
	input, err := os.Open(source)
	if err != nil {
		return fmt.Errorf("open source: %w", err)
	}
	defer func() {
		if closeErr := input.Close(); err == nil && closeErr != nil {
			err = fmt.Errorf("close source: %w", closeErr)
		}
	}()
	if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
		return fmt.Errorf("create destination directory: %w", err)
	}
	output, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode)
	if err != nil {
		return fmt.Errorf("create destination: %w", err)
	}
	defer func() {
		if closeErr := output.Close(); err == nil && closeErr != nil {
			err = fmt.Errorf("close destination: %w", closeErr)
		}
	}()
	if _, err := io.Copy(output, input); err != nil {
		return fmt.Errorf("copy file: %w", err)
	}
	if err := output.Sync(); err != nil {
		return fmt.Errorf("sync destination: %w", err)
	}
	return nil
}

func (OSFileSystem) SHA256(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("open for digest: %w", err)
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", fmt.Errorf("digest file: %w", err)
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func (OSFileSystem) Stat(path string) (os.FileInfo, error) {
	return os.Stat(path)
}
