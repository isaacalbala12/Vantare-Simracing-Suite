//go:build windows

package reportdraft

import (
	"os"
	"syscall"
	"testing"
	"time"
)

type reportDraftWindowsFileInfo struct {
	attributes uint32
}

func (reportDraftWindowsFileInfo) Name() string       { return DirectoryName }
func (reportDraftWindowsFileInfo) Size() int64        { return 0 }
func (reportDraftWindowsFileInfo) Mode() os.FileMode  { return os.ModeDir }
func (reportDraftWindowsFileInfo) ModTime() time.Time { return time.Time{} }
func (reportDraftWindowsFileInfo) IsDir() bool        { return true }
func (info reportDraftWindowsFileInfo) Sys() any {
	return &syscall.Win32FileAttributeData{FileAttributes: info.attributes}
}

func TestReportDraftPathLinkedRejectsWindowsReparsePoint(t *testing.T) {
	if !reportDraftPathLinked(reportDraftWindowsFileInfo{attributes: reportDraftFileAttributeReparsePoint}) {
		t.Fatal("Windows reparse point was accepted as a private draft directory")
	}
	if reportDraftPathLinked(reportDraftWindowsFileInfo{}) {
		t.Fatal("ordinary Windows directory was rejected")
	}
}
