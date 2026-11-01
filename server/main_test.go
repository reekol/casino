package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func testServer(t *testing.T) (*server, string) {
	t.Helper()
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "locales"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "locales", "ui_bg.json"), []byte(`{"hello":"zdravei"}`), 0644); err != nil {
		t.Fatal(err)
	}
	return &server{root: root, token: []byte("test-token-with-at-least-24-chars")}, root
}

func TestJSONUpdateRequiresTokenAndValidJSON(t *testing.T) {
	s, root := testServer(t)
	h := http.HandlerFunc(s.apiJSON)

	unauthorized := httptest.NewRequest(http.MethodPut, "/api/json/locales/ui_bg.json", strings.NewReader(`{"hello":"updated"}`))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, unauthorized)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}

	bad := httptest.NewRequest(http.MethodPut, "/api/json/locales/ui_bg.json", strings.NewReader(`{broken`))
	bad.Header.Set("Authorization", "Bearer test-token-with-at-least-24-chars")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, bad)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid JSON, got %d", w.Code)
	}

	good := httptest.NewRequest(http.MethodPut, "/api/json/locales/ui_bg.json", strings.NewReader(`{"hello":"updated"}`))
	good.Header.Set("Authorization", "Bearer test-token-with-at-least-24-chars")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, good)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	data, err := os.ReadFile(filepath.Join(root, "locales", "ui_bg.json"))
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != `{"hello":"updated"}` {
		t.Fatalf("unexpected file contents: %s", data)
	}
}

func TestJSONUpdateRejectsTraversalAndNewFiles(t *testing.T) {
	s, _ := testServer(t)
	for _, path := range []string{"/api/json/../outside.json", "/api/json/new.json", "/api/json/index.html"} {
		r := httptest.NewRequest(http.MethodPut, path, strings.NewReader(`{}`))
		r.Header.Set("Authorization", "Bearer test-token-with-at-least-24-chars")
		w := httptest.NewRecorder()
		s.apiJSON(w, r)
		if w.Code < 400 {
			t.Errorf("expected error for %s, got %d", path, w.Code)
		}
	}
}

func TestJSONList(t *testing.T) {
	s, root := testServer(t)
	if err := os.WriteFile(filepath.Join(root, "integrations.json"), []byte(`{"secret":true}`), 0644); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodGet, "/api/json", nil)
	r.Header.Set("Authorization", "Bearer test-token-with-at-least-24-chars")
	w := httptest.NewRecorder()
	s.apiJSON(w, r)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "locales/ui_bg.json") {
		t.Fatalf("unexpected list response: %d %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "integrations.json") {
		t.Fatalf("integrations.json should appear in the authenticated API listing: %s", w.Body.String())
	}
}

func TestIntegrationsJSONIsReadableThroughAuthenticatedAPI(t *testing.T) {
	s, root := testServer(t)
	want := `{"secret":true}`
	if err := os.WriteFile(filepath.Join(root, "integrations.json"), []byte(want), 0644); err != nil {
		t.Fatal(err)
	}

	unauthorized := httptest.NewRecorder()
	s.apiJSON(unauthorized, httptest.NewRequest(http.MethodGet, "/api/json/integrations.json", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("expected unauthenticated API read to return 401, got %d", unauthorized.Code)
	}

	r := httptest.NewRequest(http.MethodGet, "/api/json/integrations.json", nil)
	r.Header.Set("Authorization", "Bearer test-token-with-at-least-24-chars")
	w := httptest.NewRecorder()
	s.apiJSON(w, r)
	if w.Code != http.StatusOK || strings.TrimSpace(w.Body.String()) != want {
		t.Fatalf("unexpected authenticated API read: %d %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Header().Get("Content-Type"), "application/json") {
		t.Fatalf("expected JSON content type, got %q", w.Header().Get("Content-Type"))
	}
}

func TestStaticServerServesHTMLAndJSON(t *testing.T) {
	s, root := testServer(t)
	if err := os.WriteFile(filepath.Join(root, "index.html"), []byte("<html>Royal Reels</html>"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "integrations.json"), []byte(`{"PvMqPLxp":{}}`), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, "pages"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "pages", "rankings.json"), []byte(`{"rows":[]}`), 0644); err != nil {
		t.Fatal(err)
	}
	h := s.staticFiles()

	cases := []struct {
		path        string
		wantBody    string
		contentType string
	}{
		{path: "/", wantBody: "Royal Reels", contentType: "text/html"},
		{path: "/locales/ui_bg.json", wantBody: "zdravei", contentType: "application/json"},
		{path: "/pages/rankings.json", wantBody: `"rows":[]`, contentType: "application/json"},
	}
	for _, tc := range cases {
		r := httptest.NewRequest(http.MethodGet, tc.path, nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != http.StatusOK {
			t.Errorf("GET %s: expected 200, got %d", tc.path, w.Code)
			continue
		}
		if !strings.Contains(w.Body.String(), tc.wantBody) {
			t.Errorf("GET %s: body %q does not contain %q", tc.path, w.Body.String(), tc.wantBody)
		}
		if got := w.Header().Get("Content-Type"); !strings.Contains(got, tc.contentType) {
			t.Errorf("GET %s: Content-Type %q, want %q", tc.path, got, tc.contentType)
		}
		if got := w.Header().Get("Cache-Control"); !strings.Contains(got, "no-store") {
			t.Errorf("GET %s: expected no-store cache header, got %q", tc.path, got)
		}
	}

	for _, path := range []string{"/integrations.json", "/INTEGRATIONS.JSON"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		if w.Code != http.StatusNotFound {
			t.Errorf("GET %s: expected hidden 404, got %d", path, w.Code)
		}
	}
}

func TestGameLaunchShowsCountdownImmediatelyAndFetchesIntegrationSeparately(t *testing.T) {
	var gotMethod, gotAuthorization, gotContentType, gotBody string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotAuthorization = r.Header.Get("Authorization")
		gotContentType = r.Header.Get("Content-Type")
		body, _ := io.ReadAll(r.Body)
		gotBody = string(body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"launcher":"https://game.example/play?token=abc","other":"ignored"}`)
	}))
	defer upstream.Close()

	s, root := testServer(t)
	integration := `{"PvMqPLxp":{"demo":{"handler":"handler_json","handler_param":".launcher","launch_timer":7,"method":"POST","endpoint":"` + upstream.URL + `","headers":["Authorization: Bearer integration-secret","Content-Type: application/json"],"body":"{\"game\":\"PvMqPLxp\"}"},"real":{"handler":"handler_json","handler_param":".launcher","launch_timer":7,"method":"POST","endpoint":"` + upstream.URL + `","headers":["Authorization: Bearer integration-secret","Content-Type: application/json"],"body":"{\"game\":\"PvMqPLxp\"}"}}}`
	if err := os.WriteFile(filepath.Join(root, "integrations.json"), []byte(integration), 0644); err != nil {
		t.Fatal(err)
	}

	// The HTML route must return without waiting for the provider request.
	w := httptest.NewRecorder()
	s.route().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/g:PvMqPLxp", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("countdown expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if gotMethod != "" {
		t.Fatalf("integration was called synchronously by countdown route: %s", gotMethod)
	}
	page := w.Body.String()
	for _, want := range []string{`data-game-id="PvMqPLxp"`, `data-seconds="7"`, "requestAnimationFrame", "fetch('/api/launch-target/'", "rr-game-preload", "rr-countdown-complete"} {
		if !strings.Contains(page, want) {
			t.Fatalf("countdown page missing %q: %s", want, page)
		}
	}

	// The separate target endpoint performs the configured provider request.
	targetW := httptest.NewRecorder()
	s.route().ServeHTTP(targetW, httptest.NewRequest(http.MethodGet, "/api/launch-target/PvMqPLxp", nil))
	if targetW.Code != http.StatusOK {
		t.Fatalf("target expected 200, got %d: %s", targetW.Code, targetW.Body.String())
	}
	if gotMethod != http.MethodPost || gotAuthorization != "Bearer integration-secret" || gotContentType != "application/json" {
		t.Fatalf("upstream request not configured correctly: method=%q auth=%q content-type=%q", gotMethod, gotAuthorization, gotContentType)
	}
	if gotBody != `{"game":"PvMqPLxp"}` {
		t.Fatalf("unexpected upstream body: %q", gotBody)
	}
	if !strings.Contains(targetW.Body.String(), `"url":"https://game.example/play?token=abc"`) {
		t.Fatalf("target response missing extracted URL: %s", targetW.Body.String())
	}
}

func TestGameLaunchDefaultsAndTargetEndpoint(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("default method = %q, want POST", r.Method)
		}
		_, _ = io.WriteString(w, `{"launcher":"https://game.example/play"}`)
	}))
	defer upstream.Close()
	s, root := testServer(t)
	integration := `{"AbCd1234":{"demo":{"endpoint":"` + upstream.URL + `"},"real":{"endpoint":"` + upstream.URL + `"}}}`
	if err := os.WriteFile(filepath.Join(root, "integrations.json"), []byte(integration), 0644); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	s.route().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/g:AbCd1234", nil))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `data-seconds="5"`) {
		t.Fatalf("countdown defaults not applied: %d %s", w.Code, w.Body.String())
	}
	targetW := httptest.NewRecorder()
	s.route().ServeHTTP(targetW, httptest.NewRequest(http.MethodGet, "/api/launch-target/AbCd1234", nil))
	if targetW.Code != http.StatusOK || !strings.Contains(targetW.Body.String(), `"url":"https://game.example/play"`) {
		t.Fatalf("handler defaults not applied: %d %s", targetW.Code, targetW.Body.String())
	}
}

func TestGameIntegrationSelectsIndependentDemoAndRealSettings(t *testing.T) {
	var calls []string
	demoUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, "demo")
		_, _ = io.WriteString(w, `{"url":"https://demo.example/play"}`)
	}))
	defer demoUpstream.Close()
	realUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, "real")
		_, _ = io.WriteString(w, `{"url":"https://real.example/play"}`)
	}))
	defer realUpstream.Close()

	s, root := testServer(t)
	integration := `{"AbCd1234":{"demo":{"handler":"handler_json","handler_param":".url","method":"POST","endpoint":"` + demoUpstream.URL + `"},"real":{"handler":"handler_json","handler_param":".url","method":"POST","endpoint":"` + realUpstream.URL + `"}}}`
	if err := os.WriteFile(filepath.Join(root, "integrations.json"), []byte(integration), 0644); err != nil {
		t.Fatal(err)
	}

	for _, tc := range []struct {
		mode string
		want string
	}{
		{mode: "demo", want: `"url":"https://demo.example/play"`},
		{mode: "real", want: `"url":"https://real.example/play"`},
		{mode: "", want: `"url":"https://real.example/play"`},
	} {
		target := "/api/launch-target/AbCd1234"
		if tc.mode != "" {
			target += "?mode=" + tc.mode
		}
		w := httptest.NewRecorder()
		s.route().ServeHTTP(w, httptest.NewRequest(http.MethodGet, target, nil))
		if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), tc.want) {
			t.Fatalf("mode %q returned %d %s; wanted %s", tc.mode, w.Code, w.Body.String(), tc.want)
		}
	}
	if len(calls) != 3 || calls[0] != "demo" || calls[1] != "real" || calls[2] != "real" {
		t.Fatalf("unexpected upstream mode sequence: %#v", calls)
	}
}

func TestGameIntegrationRejectsUnknownMode(t *testing.T) {
	s, root := testServer(t)
	integration := `{"AbCd1234":{"demo":{},"real":{}}}`
	if err := os.WriteFile(filepath.Join(root, "integrations.json"), []byte(integration), 0644); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	s.route().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/g:AbCd1234?mode=practice", nil))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("unknown mode should return 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestQueryJSONValueSupportsNestedFieldsAndArrayIndexes(t *testing.T) {
	var value any
	if err := json.Unmarshal([]byte(`{"data":{"items":[{"url":"first"},{"url":"second"}]}}`), &value); err != nil {
		t.Fatal(err)
	}
	got, ok := queryJSONValue(value, ".data.items[1].url")
	if !ok || got != "second" {
		t.Fatalf("query result = %#v, %v; want second, true", got, ok)
	}
}

func TestGameLaunchRejectsUnsafeRedirectURL(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"launcher":"javascript:alert(1)"}`)
	}))
	defer upstream.Close()
	s, root := testServer(t)
	integration := `{"AbCd1234":{"demo":{"endpoint":"` + upstream.URL + `","launch_timer":1},"real":{"endpoint":"` + upstream.URL + `","launch_timer":1}}}`
	if err := os.WriteFile(filepath.Join(root, "integrations.json"), []byte(integration), 0644); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	s.route().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/launch-target/AbCd1234", nil))
	if w.Code != http.StatusBadGateway || !strings.Contains(w.Body.String(), "valid HTTP or HTTPS") {
		t.Fatalf("unsafe launch URL was not rejected: %d %s", w.Code, w.Body.String())
	}
}

func TestLaunchCountdownStartsBeforeTargetIsReady(t *testing.T) {
	page := launchCountdownHTML("AbCd1234", "real", 0)
	for _, want := range []string{`data-game-id="AbCd1234"`, `data-mode="real"`, `data-seconds="0"`, "requestAnimationFrame", "fetch('/api/launch-target/'", "timerFinished", "targetReady", "window.location.replace(target)"} {
		if !strings.Contains(page, want) {
			t.Fatalf("countdown page missing %q: %s", want, page)
		}
	}
}
