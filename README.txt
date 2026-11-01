Royal Reels — Go Server Edition
================================

Royal Reels is served by a standalone Go HTTP server. It serves the static
multi-page application and exposes a bearer-token-protected API for updating
existing JSON data files. No database or external runtime is required.

RUN LOCALLY
-----------

Requirements: Go 1.23 or newer.

Create a strong API token (at least 24 characters):

    export RR_API_TOKEN="$(openssl rand -hex 32)"

Start the server from the project directory:

    go run ./server

Then open:

    http://localhost:8080/

Configuration:

- RR_ADDR: listen address (default: :8080).
- RR_WEB_ROOT: directory containing index.html and the project files (default: .).
- RR_API_TOKEN: required API bearer token; minimum 24 characters.

PROJECT STRUCTURE
-----------------

- index.html: main application page.
- styles.css: application styles.
- js/: application behavior and language synchronization.
- locales/: English, French, Russian, and Bulgarian translations.
- games_page_(1).json through games_page_(4).json: game catalog pages.
- random_(1).json through random_(20).json: nine-game random layouts.
- win_types.json: configured win types.
- statistics.json and users.json: illustrative demo data.
- modal_links.json: custom links opened in workspace modal windows.
- integrations.json: per-game external integration configuration keyed by game ID.

GAME LAUNCH INTEGRATIONS
------------------------

GET /g:{gameid} reads the matching entry from integrations.json and sends its
configured outbound HTTP request. The method, endpoint, headers, and body are
used as configured. The handler_json response handler (default) parses the
upstream JSON and selects handler_param (default .launcher), which must resolve
to an absolute HTTP or HTTPS launch URL. The server returns an HTML page with
an animated circular countdown, then redirects to that URL. launch_timer sets
the countdown in seconds (default 5; set to 0 for immediate redirect; maximum
3600). JSON paths support dotted fields and array indexes, such as
.data.launcher or .data.items[0].url. Upstream requests time out after 15 seconds
and responses are limited to 4 MiB.
- pages/: standalone casino and esports concept pages and ranking data.
- server/main.go: standalone Go HTTP server and JSON update API.
- go.mod: Go module definition.
- Dockerfile: multi-stage Go build and unprivileged runtime image.
- compose.yaml: Podman Compose deployment definition.

API SANDBOX
-----------

Open the interactive API sandbox:

    http://localhost:8080/api-sandbox.html

It exercises every API route:
- GET /healthz (public health check)
- GET /api/json (Bearer token required; lists JSON files, including integrations.json)
- GET /api/json/{path} (Bearer token required; reads an existing JSON file)
- PUT /api/json/{path} (Bearer token required; updates an existing JSON file)

Enter RR_API_TOKEN in the page to call protected endpoints. The token remains
in page memory only. Select a file from the JSON index, load its current contents
through the regular static-file server, edit it, and submit it with PUT. The
sandbox does not add an API route or bypass server-side validation.

JSON UPDATE API
---------------

All API endpoints require this header:

    Authorization: Bearer YOUR_TOKEN

List JSON files available for updates:

    curl -H "Authorization: Bearer $RR_API_TOKEN" \
      http://localhost:8080/api/json

Update an existing JSON file. The request body must contain valid JSON:

    curl -X PUT \
      -H "Authorization: Bearer $RR_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data-binary @locales/ui_bg.json \
      http://localhost:8080/api/json/locales/ui_bg.json

The same endpoint works for catalog, random layout, modal link, ranking,
translation, and other existing JSON files. Use the path relative to the project
root, for example:

    PUT /api/json/games_page_(1).json
    PUT /api/json/pages/esports_rankings.json
    PUT /api/json/modal_links.json

API behavior and safeguards:

- Only existing .json files inside RR_WEB_ROOT can be updated; new files and
  non-JSON files cannot be created or overwritten through this API.
- Parent-directory traversal and paths resolving outside the web root are
  rejected.
- Request bodies are limited to 4 MiB and must pass JSON syntax validation.
- Updates use a temporary file and atomic rename to avoid partially written JSON.
- API access uses a constant-time bearer-token comparison.
- The token is read from the environment and is never included in the website.
- Static files are served with no-store cache headers so updated JSON is picked
  up by subsequent browser fetches.
- The API is intended for trusted administrative clients. Use HTTPS or place the
  service behind a TLS-terminating reverse proxy when accessed over a network.

Health check:

    curl http://localhost:8080/healthz

Returns {"status":"ok"} when the server is running.

CONTAINER DEPLOYMENT WITH PODMAN
--------------------------------

The Go application serves the complete website itself, including HTML, CSS, JavaScript,
images, and JSON files. No Nginx or other web server is installed or required. The same
Go process also exposes the authenticated JSON update API.

The image compiles the Go server in a build stage and runs it as an unprivileged
UID 10001. The site directory is writable by that user so the API can atomically
update JSON files. The API token must be supplied at startup.

Generate and export a token before starting the container:

    export RR_API_TOKEN="$(openssl rand -hex 32)"

Option 1 — Podman Compose

    podman compose up -d --build
    podman compose logs -f
    podman compose down

The compose file requires RR_API_TOKEN in the environment. If using the
standalone podman-compose command, the same commands apply:

    podman-compose up -d --build
    podman-compose logs -f
    podman-compose down

Option 2 — Podman directly (no Compose provider required)

Build:

    podman build -t royal-reels .

Run:

    podman run -d --name royal-reels --restart=unless-stopped \
      -p 8080:8080 \
      -e RR_API_TOKEN="$RR_API_TOKEN" \
      royal-reels

Logs and cleanup:

    podman logs -f royal-reels
    podman stop royal-reels
    podman rm royal-reels

Open http://localhost:8080/ . The Go server serves index.html at the root and serves
all nested static assets and JSON files directly from RR_WEB_ROOT. The default host port is 8080. To change it,
change the host-side mapping (for example, -p 9090:8080); keep the container-side
port at 8080.

PERSISTENCE
-----------

The container filesystem is writable, but changes made inside a replaceable
container are not guaranteed to survive container recreation. For persistent
JSON updates, mount a host directory containing the project files at
/app/site: add `-v /path/to/rrmodal:/app/site:Z` to `podman run` (SELinux systems)
or add the equivalent bind mount to compose.yaml. Ensure the mounted directory
is writable by UID 10001 inside the container (or configure an appropriate
Podman user namespace/ownership mapping). Back up JSON files before bulk edits.

DATA LOADING AND LANGUAGES
-------------------------

The catalog is loaded on demand. Additional catalog pages are fetched only when
requested, and random layouts are fetched only when selected. JSON files are
the source of truth for configured data. Keep game properties in catalog JSON
rather than duplicating them in HTML or JavaScript. Preserve existing game IDs
when editing entries and assign a unique ID to each new game.

Each random_(N).json file contains nine complete game objects in intended layout
order. Keep these objects consistent with catalog data while preserving each
layout's intended marker-color arrangement.

The main lobby, standalone casino pages, and esports rankings support English,
French, Russian, and Bulgarian. Translation strings are stored in separate JSON
files under locales/. The main page synchronizes its selected language with
same-origin pages opened in modal iframes. Third-party pages need to implement
the same protocol to participate in language synchronization.

The esports leaderboard data is loaded from pages/esports_rankings.json.
Player names and handles are data values and are intentionally not translated.

DEMO-DATA NOTICE
----------------

Account, wallet, transaction, competition, player, and prize information is
illustrative demo data. This project is not a production gambling platform and
must not be used for real private user data, payments, or financial transactions.


GAME INTEGRATIONS
-----------------

integrations.json is hidden from public static access (404), but is listed and readable
through authenticated GET /api/json and GET /api/json/integrations.json. It remains
updatable through authenticated PUT /api/json/integrations.json.

integrations.json is keyed by each game's eight-character ID. Every game has
an entry with a handler name (default `handler_json`), handler parameter (default `.launcher`), HTTP method, endpoint URL,
an array of HTTP header strings, a string request body, and launch_timer in seconds (default 5; 0 means immediate redirect). Values are configured independently:

    {
      "PvMqPLxp": {
        "handler": "handler_json",
        "handler_param": ".launcher",
        "launch_timer": 5,
        "method": "POST",
        "endpoint": "https://provider.example/launch",
        "headers": ["Authorization: Bearer TOKEN", "Content-Type: application/json"],
        "body": "{\"gameId\":\"PvMqPLxp\"}"
      }
    }

Update it through the existing authenticated JSON API:

    PUT /api/json/integrations.json

Game deep links use the path format /g:<game_id>, for example /g:PvMqPLxp.
