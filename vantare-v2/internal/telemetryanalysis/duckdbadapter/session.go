package duckdbadapter

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"time"
)

type readerSession struct {
	process isolatedProcess
	stdin   io.WriteCloser
	stdout  *bufio.Reader
	handles []*os.File
	closed  bool
}

func startReaderSession(runtimeTrust TrustedRuntime, staged artifactRequest) (*readerSession, error) {
	runtimeFiles, handles, err := loadRuntimeLocked(runtimeTrust)
	if err != nil {
		return nil, ErrRuntimeUnavailable
	}
	stagedFile, err := openLockedRead(staged.Path)
	if err != nil || verifyRuntimeFile(stagedFile, RuntimeFile{Size: staged.Size, SHA256: staged.SHA256}) != nil {
		if stagedFile != nil {
			_ = stagedFile.Close()
		}
		closeFiles(handles)
		return nil, ErrArtifactChanged
	}
	handles = append(handles, stagedFile)
	command := exec.Command(runtimeFiles.HelperPath)
	command.Dir = runtimeFiles.Directory
	command.WaitDelay = 2 * time.Second
	stdin, err := command.StdinPipe()
	if err != nil {
		closeFiles(handles)
		return nil, ErrRuntimeUnavailable
	}
	stdout, err := command.StdoutPipe()
	if err != nil {
		stdin.Close()
		closeFiles(handles)
		return nil, ErrRuntimeUnavailable
	}
	command.Stderr = &limitedWriter{limit: maxStderrBytes}
	process, err := startIsolated(command)
	if err != nil {
		stdin.Close()
		closeFiles(handles)
		return nil, ErrRuntimeUnavailable
	}
	return &readerSession{process: process, stdin: stdin, stdout: bufio.NewReaderSize(stdout, 64*1024), handles: handles}, nil
}

func (session *readerSession) roundTrip(ctx context.Context, frameRequest request) (response, error) {
	if session.closed {
		return response{}, ErrRuntimeUnavailable
	}
	if err := ctx.Err(); err != nil {
		return response{}, err
	}
	frame, requestID, err := encodeRequest(frameRequest)
	if err != nil {
		return response{}, err
	}
	if _, err := session.stdin.Write(frame); err != nil {
		session.terminate()
		return response{}, ErrRuntimeUnavailable
	}
	type result struct {
		frame []byte
		err   error
	}
	resultChannel := make(chan result, 1)
	go func() {
		frame, err := readResponseFrame(session.stdout)
		resultChannel <- result{frame: frame, err: err}
	}()
	select {
	case <-ctx.Done():
		session.terminate()
		<-resultChannel
		return response{}, ctx.Err()
	case received := <-resultChannel:
		if received.err != nil {
			session.terminate()
			return response{}, ErrRuntimeUnavailable
		}
		answer, err := decodeResponse(received.frame, requestID, frameRequest.Operation)
		if err != nil {
			session.terminate()
			return response{}, err
		}
		if err := responseError(answer); err != nil {
			session.terminate()
			return response{}, err
		}
		return answer, nil
	}
}

func readResponseFrame(reader *bufio.Reader) ([]byte, error) {
	var frame bytes.Buffer
	for {
		fragment, err := reader.ReadSlice('\n')
		if frame.Len()+len(fragment) > maxOutputFrameBytes+1 {
			return nil, ErrProtocol
		}
		_, _ = frame.Write(fragment)
		if err == nil {
			return frame.Bytes(), nil
		}
		if !errors.Is(err, bufio.ErrBufferFull) {
			return nil, err
		}
	}
}

func (session *readerSession) close() error {
	if session.closed {
		return nil
	}
	session.closed = true
	_ = session.stdin.Close()
	err := session.process.Wait()
	closeFiles(session.handles)
	session.handles = nil
	return err
}

func (session *readerSession) terminate() {
	if session.closed {
		return
	}
	session.closed = true
	session.process.Terminate()
	_ = session.stdin.Close()
	_ = session.process.Wait()
	closeFiles(session.handles)
	session.handles = nil
}
