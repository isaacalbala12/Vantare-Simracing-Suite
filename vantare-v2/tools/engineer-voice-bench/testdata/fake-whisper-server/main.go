package main

import (
	"fmt"
	"net/http"
	"os"
	"time"
)

func main() {
	port := ""
	for index, argument := range os.Args {
		if argument == "--port" && index+1 < len(os.Args) {
			port = os.Args[index+1]
			break
		}
	}
	if port == "" {
		os.Exit(2)
	}
	mode := os.Getenv("VANTARE_FAKE_WHISPER_MODE")
	handler := http.NewServeMux()
	handler.HandleFunc("/", func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/inference" {
			writer.WriteHeader(http.StatusOK)
			if _, err := writer.Write([]byte("ready")); err != nil {
				return
			}
			return
		}
		if mode == "timeout" {
			time.Sleep(30 * time.Second)
		}
		writer.Header().Set("Content-Type", "application/json")
		if mode == "invalid" {
			if _, err := writer.Write([]byte("not-json")); err != nil {
				return
			}
			return
		}
		if _, err := writer.Write([]byte(`{"text":"ok"}`)); err != nil {
			return
		}
	})
	if err := http.ListenAndServe("127.0.0.1:"+port, handler); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
