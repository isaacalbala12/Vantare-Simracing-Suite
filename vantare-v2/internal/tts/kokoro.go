package tts

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// KokoroProvider synthesizes speech using Kokoro-82M.
// Supports:
//   - REST API mode (default): Kokoro-FastAPI container at http://localhost:8880/v1/audio/speech
//   - CLI mode: direct Kokoro Python package
//
// REST mode uses OpenAI-compatible endpoint (POST /v1/audio/speech).
// Compatible with: remsky/Kokoro-FastAPI, hwdsl2/docker-kokoro, etc.
type KokoroProvider struct {
	mode       string // "rest" (default) or "cli"
	restURL    string
	outDir     string
	httpClient *http.Client
}

// NewKokoroProvider creates a new Kokoro provider.
// outDir: directory for cached synthesized files.
// Default REST endpoint: http://localhost:8880/v1/audio/speech (Kokoro-FastAPI).
func NewKokoroProvider(outDir string) *KokoroProvider {
	return &KokoroProvider{
		mode:       "rest",
		restURL:    "http://localhost:8880/v1/audio/speech",
		outDir:     outDir,
		httpClient: &http.Client{},
	}
}

// SetRESTURL changes the REST endpoint (for custom ports or remote servers).
func (k *KokoroProvider) SetRESTURL(url string) { k.restURL = url }

func (k *KokoroProvider) Name() string { return "kokoro" }

// Kokoro voices by language:
// Full list (54 voices): https://huggingface.co/hexgrad/Kokoro-82M/tree/main/voices
// Prefix: first letter = language, second = gender.
// a=American English, b=British English, e=Spanish, f=French,
// h=Hindi, i=Italian, j=Japanese, p=Portuguese, z=Chinese.
// f=female, m=male.
//
// Spanish:
//
//	ef_dora (female), em_alex (male), em_santa (male)
//
// English US:
//
//	af_bella, af_nicole, af_sky, af_heart, af_jessica, af_sarah (female)
//	am_adam, am_echo, am_eric, am_liam, am_michael, am_onyx (male)
//
// English GB:
//
//	bf_alice, bf_emma, bf_isabella, bf_lily (female)
//	bm_daniel, bm_fable, bm_george, bm_lewis (male)
//
// Voice mixing (Kokoro-FastAPI): combine with "+" separator.
// Example: "ef_dora+em_alex" blends female + male Spanish voices.
func VoiceForLang(lang, gender string) string {
	switch lang {
	case "es":
		if gender == "male" {
			return "em_alex"
		}
		return "ef_dora"
	case "en":
		if gender == "male" {
			return "am_echo"
		}
		return "af_bella"
	case "en-gb":
		if gender == "male" {
			return "bm_george"
		}
		return "bf_alice"
	default:
		return "af_bella"
	}
}

func (k *KokoroProvider) Synthesize(req Request) (Result, error) {
	if req.Text == "" {
		return Result{}, fmt.Errorf("kokoro: empty text")
	}
	if req.Voice == "" {
		req.Voice = VoiceForLang(req.Language, "female")
	}
	filename := fmt.Sprintf("%s_%s_%s.mp3", sanitize(req.Language), sanitize(req.Voice), sanitize(req.Text))
	path := filepath.Join(k.outDir, filename)

	if k.mode == "rest" {
		return k.synthesizeREST(req, path)
	}
	return k.synthesizeCLI(req, path)
}

// synthesizeREST calls Kokoro-FastAPI (OpenAI-compatible endpoint).
// POST /v1/audio/speech with JSON body: {model, input, voice, response_format}
func (k *KokoroProvider) synthesizeREST(req Request, path string) (Result, error) {
	body := map[string]any{
		"model":           "kokoro",
		"input":           req.Text,
		"voice":           req.Voice,
		"response_format": "mp3",
		"speed":           1.0,
	}
	jsonBody, _ := json.Marshal(body)
	resp, err := k.httpClient.Post(k.restURL, "application/json", bytes.NewReader(jsonBody))
	if err != nil {
		return Result{}, fmt.Errorf("kokoro rest: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return Result{}, fmt.Errorf("kokoro rest: HTTP %d: %s", resp.StatusCode, string(bodyBytes))
	}

	out, err := os.Create(path)
	if err != nil {
		return Result{}, fmt.Errorf("kokoro write: %w", err)
	}
	defer out.Close()

	if _, err := io.Copy(out, resp.Body); err != nil {
		return Result{}, fmt.Errorf("kokoro copy: %w", err)
	}
	return Result{Format: "mp3", Path: path}, nil
}

func (k *KokoroProvider) synthesizeCLI(req Request, path string) (Result, error) {
	kokoroLang := "a" // default: American English
	switch req.Language {
	case "es":
		kokoroLang = "e"
	}
	cmd := exec.Command("python", "-m", "kokoro",
		"-m", req.Voice,
		"-l", kokoroLang,
		"-t", req.Text,
		"-o", path,
	)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return Result{}, fmt.Errorf("kokoro cli: %v (stderr: %s)", err, stderr.String())
	}
	return Result{Format: "mp3", Path: path}, nil
}

func (k *KokoroProvider) Health() error {
	if k.mode == "rest" {
		// Build health URL safely: strip "/v1/audio/speech" suffix if present.
		healthURL := strings.TrimSuffix(k.restURL, "/v1/audio/speech") + "/health"
		resp, err := k.httpClient.Get(healthURL)
		if err != nil {
			return fmt.Errorf("kokoro not reachable: %w", err)
		}
		resp.Body.Close()
		return nil
	}
	return nil
}

func sanitize(s string) string {
	result := make([]byte, 0, len(s))
	for _, b := range []byte(s) {
		if (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9') || b == '_' {
			result = append(result, b)
		} else {
			result = append(result, '_')
		}
	}
	return string(result)
}
