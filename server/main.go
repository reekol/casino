package main

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	maxJSONBytes     = 4 << 20 // 4 MiB
	maxUpstreamBytes = 4 << 20 // 4 MiB
)

var gamePathPattern = regexp.MustCompile(`^/g:([A-Za-z0-9]{8})/?$`)
var launchTargetPathPattern = regexp.MustCompile(`^/api/launch-target/([A-Za-z0-9]{8})/?$`)
var integrationModesPathPattern = regexp.MustCompile(`^/api/integration-modes/([A-Za-z0-9]{8})/?$`)
var validHTTPMethod = regexp.MustCompile(`^[A-Z!#$%&'*+.^_` + "`" + `|~-]+$`)

type gameIntegration struct {
	Handler      string   `json:"handler"`
	HandlerParam string   `json:"handler_param"`
	LaunchTimer  *int     `json:"launch_timer"`
	Method       string   `json:"method"`
	Endpoint     string   `json:"endpoint"`
	Headers      []string `json:"headers"`
	Body         string   `json:"body"`
}

type gameIntegrationModes map[string]gameIntegration

type server struct {
	root       string
	token      []byte
	mu         sync.Mutex
	httpClient *http.Client
}

type apiError struct {
	Error string `json:"error"`
}

func main() {
	root := env("RR_WEB_ROOT", ".")
	absRoot, err := filepath.Abs(root)
	if err != nil {
		log.Fatalf("resolve web root: %v", err)
	}
	info, err := os.Stat(absRoot)
	if err != nil || !info.IsDir() {
		log.Fatalf("web root %q is not an accessible directory", absRoot)
	}
	token := os.Getenv("RR_API_TOKEN")
	if len(token) < 24 {
		log.Fatal("RR_API_TOKEN is required and must contain at least 24 characters")
	}

	s := &server{root: absRoot, token: []byte(token)}
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.health)
	mux.HandleFunc("/api/json", s.apiJSON)
	mux.HandleFunc("/api/json/", s.apiJSON)
	mux.HandleFunc("/api/integration-modes/", s.integrationModes)
	mux.Handle("/", s.route())

	addr := env("RR_ADDR", ":8080")
	httpServer := &http.Server{
		Addr:              addr,
		Handler:           securityHeaders(mux),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}
	log.Printf("Royal Reels serving %s on %s", absRoot, addr)
	log.Fatal(httpServer.ListenAndServe())
}

func (s *server) health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_, _ = io.WriteString(w, `{"status":"ok"}`)
}

func (s *server) route() http.Handler {
	static := s.staticFiles()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if gamePathPattern.MatchString(r.URL.Path) {
			s.gameLaunch(w, r)
			return
		}
		if launchTargetPathPattern.MatchString(r.URL.Path) {
			s.gameLaunchTarget(w, r)
			return
		}
		if integrationModesPathPattern.MatchString(r.URL.Path) {
			s.integrationModes(w, r)
			return
		}
		static.ServeHTTP(w, r)
	})
}

func requestedGameMode(r *http.Request) string {
	return strings.TrimSpace(r.URL.Query().Get("mode"))
}

func (s *server) loadIntegrationModes(w http.ResponseWriter, gameID string) (gameIntegrationModes, bool) {
	configPath := filepath.Join(s.root, "integrations.json")
	configData, err := os.ReadFile(configPath)
	if err != nil {
		log.Printf("read integrations.json: %v", err)
		writeLaunchError(w, http.StatusInternalServerError, "integration configuration is unavailable")
		return nil, false
	}
	var integrations map[string]gameIntegrationModes
	if err := json.Unmarshal(configData, &integrations); err != nil {
		log.Printf("parse integrations.json: %v", err)
		writeLaunchError(w, http.StatusInternalServerError, "integration configuration is invalid")
		return nil, false
	}
	modes, ok := integrations[gameID]
	if !ok || len(modes) == 0 {
		writeLaunchError(w, http.StatusNotFound, "no integration configured for this game")
		return nil, false
	}
	return modes, true
}

func (s *server) integrationModes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	matches := integrationModesPathPattern.FindStringSubmatch(r.URL.Path)
	if len(matches) != 2 {
		http.NotFound(w, r)
		return
	}
	// This endpoint intentionally exposes only state names, never provider URLs, headers or bodies.
	configPath := filepath.Join(s.root, "integrations.json")
	data, err := os.ReadFile(configPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "integration configuration is unavailable")
		return
	}
	var integrations map[string]gameIntegrationModes
	if err := json.Unmarshal(data, &integrations); err != nil {
		writeError(w, http.StatusInternalServerError, "integration configuration is invalid")
		return
	}
	modes, ok := integrations[matches[1]]
	if !ok {
		writeError(w, http.StatusNotFound, "no integration configured for this game")
		return
	}
	names := make([]string, 0, len(modes))
	for name := range modes {
		names = append(names, name)
	}
	sort.Strings(names)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]any{"game_id": matches[1], "modes": names})
}

func (s *server) loadGameIntegration(w http.ResponseWriter, gameID, mode string) (gameIntegration, bool) {
	modes, ok := s.loadIntegrationModes(w, gameID)
	if !ok {
		return gameIntegration{}, false
	}
	if mode == "" {
		if _, exists := modes["real"]; exists {
			mode = "real"
		} else {
			for name := range modes {
				mode = name
				break
			}
		}
	}
	cfg, exists := modes[mode]
	if !exists {
		writeLaunchError(w, http.StatusBadRequest, "unknown integration mode")
		return gameIntegration{}, false
	}
	if cfg.Handler == "" {
		cfg.Handler = "handler_json"
	}
	if cfg.Handler != "handler_json" {
		writeLaunchError(w, http.StatusNotImplemented, "unsupported integration handler")
		return gameIntegration{}, false
	}
	return cfg, true
}

// /g:{id} returns the countdown document immediately. The integration request
// runs separately through /api/launch-target/{id}, so a slow provider cannot
// delay the visible countdown animation.
func (s *server) gameLaunch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	matches := gamePathPattern.FindStringSubmatch(r.URL.Path)
	if len(matches) != 2 {
		http.NotFound(w, r)
		return
	}
	mode := requestedGameMode(r)
	cfg, ok := s.loadGameIntegration(w, matches[1], mode)
	if !ok {
		return
	}
	launchTimer := 5
	if cfg.LaunchTimer != nil {
		launchTimer = *cfg.LaunchTimer
	}
	if launchTimer < 0 || launchTimer > 3600 {
		writeLaunchError(w, http.StatusBadRequest, "launch_timer must be between 0 and 3600 seconds")
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if r.Method == http.MethodHead {
		return
	}
	_, _ = io.WriteString(w, launchCountdownHTML(matches[1], mode, launchTimer))
}

// /api/launch-target/{id} performs the provider integration asynchronously
// from the countdown page and returns the resolved URL as JSON.
func (s *server) gameLaunchTarget(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	matches := launchTargetPathPattern.FindStringSubmatch(r.URL.Path)
	if len(matches) != 2 {
		http.NotFound(w, r)
		return
	}
	mode := requestedGameMode(r)
	cfg, ok := s.loadGameIntegration(w, matches[1], mode)
	if !ok {
		return
	}
	launchURL, status, message := s.resolveGameLaunchURL(r, matches[1], cfg)
	if message != "" {
		writeLaunchError(w, status, message)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(struct {
		URL string `json:"url"`
	}{URL: launchURL})
}

func (s *server) resolveGameLaunchURL(r *http.Request, gameID string, cfg gameIntegration) (string, int, string) {
	if strings.TrimSpace(cfg.Endpoint) == "" {
		return "", http.StatusServiceUnavailable, "integration endpoint is not configured"
	}
	endpoint, err := url.Parse(strings.TrimSpace(cfg.Endpoint))
	if err != nil || (endpoint.Scheme != "http" && endpoint.Scheme != "https") || endpoint.Host == "" || endpoint.User != nil {
		return "", http.StatusBadRequest, "integration endpoint must be an absolute HTTP or HTTPS URL"
	}
	method := strings.ToUpper(strings.TrimSpace(cfg.Method))
	if method == "" {
		method = http.MethodPost
	}
	if !validHTTPMethod.MatchString(method) || method == http.MethodConnect || method == http.MethodTrace {
		return "", http.StatusBadRequest, "invalid integration HTTP method"
	}
	var body io.Reader
	if cfg.Body != "" {
		body = strings.NewReader(cfg.Body)
	}
	upstreamReq, err := http.NewRequestWithContext(r.Context(), method, endpoint.String(), body)
	if err != nil {
		return "", http.StatusBadRequest, "could not construct integration request"
	}
	for _, line := range cfg.Headers {
		name, value, ok := strings.Cut(line, ":")
		name, value = strings.TrimSpace(name), strings.TrimSpace(value)
		if !ok || name == "" || strings.ContainsAny(name, "\r\n") || strings.ContainsAny(value, "\r\n") {
			return "", http.StatusBadRequest, "invalid integration header configuration"
		}
		upstreamReq.Header.Add(name, value)
	}
	client := s.httpClient
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	upstreamResp, err := client.Do(upstreamReq)
	if err != nil {
		log.Printf("game %s upstream request: %v", gameID, err)
		return "", http.StatusBadGateway, "integration request failed"
	}
	defer upstreamResp.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(upstreamResp.Body, maxUpstreamBytes+1))
	if err != nil || len(responseBody) > maxUpstreamBytes {
		return "", http.StatusBadGateway, "integration response could not be read or exceeded 4 MiB"
	}
	if upstreamResp.StatusCode < 200 || upstreamResp.StatusCode >= 300 {
		return "", http.StatusBadGateway, fmt.Sprintf("integration endpoint returned HTTP %d", upstreamResp.StatusCode)
	}
	var payload any
	decoder := json.NewDecoder(strings.NewReader(string(responseBody)))
	decoder.UseNumber()
	if err := decoder.Decode(&payload); err != nil {
		return "", http.StatusBadGateway, "integration endpoint did not return valid JSON"
	}
	param := cfg.HandlerParam
	if param == "" {
		param = ".launcher"
	}
	value, found := queryJSONValue(payload, param)
	if !found {
		return "", http.StatusBadGateway, "configured handler_param was not found in the JSON response"
	}
	launchURL, ok := value.(string)
	if !ok {
		return "", http.StatusBadGateway, "configured handler_param did not resolve to a launch URL string"
	}
	launchURL = strings.TrimSpace(launchURL)
	if !isSafeLaunchURL(launchURL) {
		return "", http.StatusBadGateway, "configured handler_param did not contain a valid HTTP or HTTPS launch URL"
	}
	return launchURL, http.StatusOK, ""
}

func launchCountdownHTML(gameID, mode string, seconds int) string {
	// The countdown begins immediately. The provider integration is fetched in parallel.
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Launching game</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(ellipse at center,#24202d 0%,#111018 65%,#09090d 100%);color:#fff;font:16px system-ui,sans-serif}.launch{width:min(92vw,440px);padding:42px 28px;text-align:center;border:1px solid #ffffff20;border-radius:24px;background:#ffffff09;box-shadow:0 24px 80px #0008;backdrop-filter:blur(12px)}h1{font-size:clamp(22px,5vw,30px);margin:0 0 10px}.sub{color:#bcb8c8;margin:0 0 28px}.timer{width:156px;height:156px;margin:0 auto 24px;position:relative;display:grid;place-items:center}.timer svg{position:absolute;inset:0;transform:rotate(-90deg)}.track,.progress{fill:none;stroke-width:7}.track{stroke:#ffffff20}.progress{stroke:#e8b95b;stroke-linecap:round;stroke-dasharray:408.4;stroke-dashoffset:0}.number{font-size:54px;font-weight:750;font-variant-numeric:tabular-nums}.status{color:#e8b95b;font-weight:650;letter-spacing:.08em;text-transform:uppercase;font-size:12px}.fallback{margin-top:22px;color:#aaa;font-size:13px}.fallback a{color:#f2ce83}
</style></head>
<body><main class="launch" id="launch" data-game-id="` + html.EscapeString(gameID) + `" data-mode="` + html.EscapeString(mode) + `" data-seconds="` + strconv.Itoa(seconds) + `">
<h1>Preparing your game</h1><p class="sub">Your game is almost ready</p>
<div class="timer" aria-live="polite"><svg viewBox="0 0 150 150" aria-hidden="true"><circle class="track" cx="75" cy="75" r="65"></circle><circle class="progress" id="progress" cx="75" cy="75" r="65"></circle></svg><span class="number" id="number">` + strconv.Itoa(seconds) + `</span></div>
<div class="status" id="status">Connecting to game provider</div><p class="fallback" id="fallback" hidden>If you are not redirected, <a id="manual" href="#">open the game</a>.</p>
</main><script>
(()=>{
 const root=document.getElementById('launch'),gameId=root.dataset.gameId,mode=root.dataset.mode,total=Math.max(0,Number(root.dataset.seconds)||0),number=document.getElementById('number'),progress=document.getElementById('progress'),status=document.getElementById('status'),fallback=document.getElementById('fallback'),manual=document.getElementById('manual'),circumference=408.4,started=performance.now(),embedded=window.parent!==window;
 let target='',targetReady=false,timerFinished=false,finished=false;
 function maybeFinish(){if(finished||!targetReady||!timerFinished)return;finished=true;status.textContent='Game ready';if(embedded){window.parent.postMessage({type:'rr-countdown-complete'},location.origin);}else{window.location.replace(target);}}
 function setTarget(value){let parsed;try{parsed=new URL(value);}catch{return;}if(!['http:','https:'].includes(parsed.protocol))return;target=parsed.href;targetReady=true;manual.href=target;fallback.hidden=false;if(embedded){window.parent.postMessage({type:'rr-game-preload',target},location.origin);}status.textContent=timerFinished?'Game ready':'Game is loading';maybeFinish();}
 // Start the timer before waiting for the integration endpoint.
 function tick(now){const remaining=Math.max(0,total-(now-started)/1000);number.textContent=String(Math.ceil(remaining));progress.style.strokeDashoffset=String(circumference*(1-remaining/Math.max(total,0.0001)));if(remaining<=0){timerFinished=true;status.textContent=targetReady?'Game ready':'Waiting for game response';maybeFinish();return;}requestAnimationFrame(tick);}
 if(total===0){number.textContent='0';timerFinished=true;}else{requestAnimationFrame(tick);}
 fetch('/api/launch-target/'+encodeURIComponent(gameId)+'?mode='+encodeURIComponent(mode),{cache:'no-store',credentials:'same-origin'}).then(async response=>{const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Provider request failed');if(typeof data.url!=='string')throw new Error('Provider response did not contain a launch URL');setTarget(data.url);}).catch(error=>{status.textContent='Unable to prepare game';const detail=document.createElement('div');detail.style.cssText='margin-top:12px;color:#f2a5a5;font-size:12px';detail.textContent=error.message;root.appendChild(detail);});
 maybeFinish();
})();
</script></body></html>`
}

func isSafeLaunchURL(raw string) bool {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.User != nil || parsed.Host == "" {
		return false
	}
	scheme := strings.ToLower(parsed.Scheme)
	return scheme == "http" || scheme == "https"
}

// queryJSONValue evaluates a simple dotted JSON path such as .launcher or .data.launcher.
// Array indexes are supported as [0]. A leading dot is optional.
func queryJSONValue(root any, path string) (any, bool) {
	path = strings.TrimSpace(path)
	if path == "" || path == "." || path == "$" {
		return root, true
	}
	path = strings.TrimPrefix(path, "$")
	path = strings.TrimPrefix(path, ".")
	var current any = root
	for len(path) > 0 {
		if path[0] == '.' {
			path = path[1:]
			continue
		}
		if path[0] == '[' {
			end := strings.IndexByte(path, ']')
			if end < 2 {
				return nil, false
			}
			index, err := strconv.Atoi(path[1:end])
			array, ok := current.([]any)
			if err != nil || !ok || index < 0 || index >= len(array) {
				return nil, false
			}
			current = array[index]
			path = path[end+1:]
			continue
		}
		end := strings.IndexAny(path, ".[")
		if end < 0 {
			end = len(path)
		}
		key := path[:end]
		if key == "" {
			return nil, false
		}
		object, ok := current.(map[string]any)
		if !ok {
			return nil, false
		}
		current, ok = object[key]
		if !ok {
			return nil, false
		}
		path = path[end:]
	}
	return current, true
}

func writeLaunchError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_, _ = io.WriteString(w, "<!doctype html><html><head><meta charset=\"utf-8\"><title>Game launch error</title></head><body><pre>"+html.EscapeString(message)+"</pre></body></html>")
}

func (s *server) staticFiles() http.Handler {
	fs := http.FileServer(http.Dir(s.root))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// integrations.json contains server-side provider endpoints and request
		// configuration. Never expose it through the public static file server.
		if strings.EqualFold(strings.Trim(r.URL.Path, "/"), "integrations.json") {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		// Avoid stale application data and locale dictionaries after API updates.
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		fs.ServeHTTP(w, r)
	})
}

func (s *server) apiJSON(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		w.Header().Set("WWW-Authenticate", `Bearer realm="Royal Reels API"`)
		writeError(w, http.StatusUnauthorized, "valid bearer token required")
		return
	}
	w.Header().Set("Cache-Control", "no-store")

	if r.URL.Path == "/api/json" || r.URL.Path == "/api/json/" {
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", http.MethodGet)
			writeError(w, http.StatusMethodNotAllowed, "use GET to list JSON files")
			return
		}
		s.listJSON(w)
		return
	}

	if r.Method != http.MethodGet && r.Method != http.MethodPut {
		w.Header().Set("Allow", "GET, PUT")
		writeError(w, http.StatusMethodNotAllowed, "use GET to read or PUT to update a JSON file")
		return
	}
	rel := strings.TrimPrefix(r.URL.Path, "/api/json/")
	if rel == "" || strings.Contains(rel, "\\") || strings.HasPrefix(rel, "/") {
		writeError(w, http.StatusBadRequest, "invalid file path")
		return
	}
	clean := filepath.Clean(filepath.FromSlash(rel))
	if clean == "." || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) || filepath.IsAbs(clean) || !strings.EqualFold(filepath.Ext(clean), ".json") {
		writeError(w, http.StatusBadRequest, "path must identify a JSON file inside the web root")
		return
	}

	target := filepath.Join(s.root, clean)
	resolved, err := filepath.EvalSymlinks(target)
	if err != nil {
		writeError(w, http.StatusNotFound, "JSON file not found")
		return
	}
	if !withinRoot(s.root, resolved) {
		writeError(w, http.StatusForbidden, "file is outside the web root")
		return
	}
	info, err := os.Stat(resolved)
	if err != nil || !info.Mode().IsRegular() {
		writeError(w, http.StatusNotFound, "regular JSON file not found")
		return
	}

	if r.Method == http.MethodGet {
		data, readErr := os.ReadFile(resolved)
		if readErr != nil {
			writeError(w, http.StatusInternalServerError, "could not read JSON file")
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write(data)
		return
	}

	body := http.MaxBytesReader(w, r.Body, maxJSONBytes)
	data, err := io.ReadAll(body)
	if err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeError(w, http.StatusRequestEntityTooLarge, "JSON body exceeds 4 MiB")
		} else {
			writeError(w, http.StatusBadRequest, "could not read request body")
		}
		return
	}
	if !json.Valid(data) {
		writeError(w, http.StatusBadRequest, "request body is not valid JSON")
		return
	}

	s.mu.Lock()
	err = atomicReplace(filepath.Dir(resolved), filepath.Base(resolved), data)
	s.mu.Unlock()
	if err != nil {
		log.Printf("update %q: %v", rel, err)
		writeError(w, http.StatusInternalServerError, "could not update JSON file")
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "file": filepath.ToSlash(clean), "bytes": len(data)})
}

func (s *server) listJSON(w http.ResponseWriter) {
	var files []string
	err := filepath.WalkDir(s.root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			if path != s.root && (d.Name() == ".git" || d.Name() == "node_modules") {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.EqualFold(filepath.Ext(d.Name()), ".json") {
			rel, relErr := filepath.Rel(s.root, path)
			if relErr == nil {
				files = append(files, filepath.ToSlash(rel))
			}
		}
		return nil
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not enumerate JSON files")
		return
	}
	sort.Strings(files)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]any{"files": files})
}

func (s *server) authorized(r *http.Request) bool {
	const prefix = "Bearer "
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, prefix) {
		return false
	}
	provided := []byte(strings.TrimSpace(strings.TrimPrefix(header, prefix)))
	return len(provided) == len(s.token) && subtle.ConstantTimeCompare(provided, s.token) == 1
}

func atomicReplace(dir, name string, data []byte) error {
	tmp, err := os.CreateTemp(dir, ".royal-reels-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if _, err = tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err = tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err = tmp.Close(); err != nil {
		return err
	}
	if err = os.Chmod(tmpName, 0644); err != nil {
		return err
	}
	if err = os.Rename(tmpName, filepath.Join(dir, name)); err != nil {
		return fmt.Errorf("replace file: %w", err)
	}
	return nil
}

func withinRoot(root, path string) bool {
	rel, err := filepath.Rel(root, path)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(apiError{Error: message})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "SAMEORIGIN")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		next.ServeHTTP(w, r)
	})
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
