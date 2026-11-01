# Royal Reels
## Per-game integrations

`integrations.json` stores two independent outbound request configurations for every game ID: `demo` and `real`. Each mode has its own handler, JSON response path, countdown duration, HTTP method, endpoint, headers, and body.

Example:

```json
{
  "PvMqPLxp": {
    "demo": {
      "handler": "handler_json",
      "handler_param": ".url",
      "launch_timer": 5,
      "method": "POST",
      "endpoint": "https://games.dev.seqr.link/fe/SpaceEntropy_3x3/demoPlayApi",
      "headers": [
        "Authorization: Bearer YOUR_DEMO_TOKEN",
        "Content-Type: application/json"
      ],
      "body": "{\"player_id\":\"12345\"}"
    },
    "real": {
      "handler": "handler_json",
      "handler_param": ".url",
      "launch_timer": 5,
      "method": "POST",
      "endpoint": "https://games.dev.seqr.link/fe/SpaceEntropy_3x3/demoPlayApi",
      "headers": [
        "Authorization: Bearer YOUR_REAL_TOKEN",
        "Content-Type: application/json"
      ],
      "body": "{\"player_id\":\"12345\"}"
    }
  }
}
```

`handler` defaults to `handler_json`, `handler_param` defaults to `.url`, `launch_timer` defaults to 5 seconds, and `method` defaults to `POST`. Keep the demo and real credentials and request parameters separate. `mode` is selected with `?mode=demo` or `?mode=real`; it defaults to `real` when omitted.

Keep real credentials out of public repositories and restrict access to the authenticated JSON API. The server reads `integrations.json` from disk. Direct public static access returns `404`, but the authenticated JSON API includes it in `GET /api/json` and supports reading it with `GET /api/json/integrations.json` and updating it with `PUT /api/json/integrations.json`.


### Game launch route

A request to `/g:{gameid}?mode=demo` or `/g:{gameid}?mode=real` immediately returns the HTML countdown page; mode defaults to `real`. It does
not wait for the provider integration. The countdown animation starts as soon
as that page loads. In parallel, the page requests
`/api/launch-target/{gameid}?mode={demo|real}`, which performs the selected mode's provider request
and returns the resolved launch URL as JSON. The browser then asks the lobby to
preload that URL in the second iframe while the countdown continues. Both launch frames fill the modal content area; the modal uses its normal responsive dimensions without per-game aspect-ratio settings.

The target endpoint looks up the game ID and selected `demo` or `real` block in `integrations.json` and applies:

- `method`: outbound HTTP method (defaults to `POST`).
- `endpoint`: absolute HTTP or HTTPS provider URL.
- `headers`: configured `Header-Name: value` entries.
- `body`: request body string.
- `handler`: response handler (currently `handler_json`).
- `handler_param`: JSON path to the launch URL (defaults to `.url`).

When the timer has elapsed and the preloaded game iframe has fired its load
event, the lobby removes the countdown iframe and reveals the game iframe.
Both frames receive fullscreen/autoplay permissions. If the countdown reaches
zero before the provider responds, it waits for the launch URL; if the provider
responds first, the game preloads in the background until the timer finishes.
When `/g:{gameid}` is opened directly as a top-level page, it redirects after
both conditions are met and shows a manual launch link once the URL is ready.
The target endpoint returns an error if the configuration is missing, the
upstream request fails, the response is not valid JSON, the configured path is
missing, or the extracted value is not a safe HTTP/HTTPS URL. Upstream requests
have a 15-second timeout and responses are limited to 4 MiB.

JSON paths support dotted object properties and numeric array indexes, for
example `.launcher`, `.data.launcher`, or `.data.items[0].url`.

### Resizing launched game windows

Launched game modals are resizable in both directions, including while Auto Arrange is enabled. Their iframe expands with the modal. The modal uses automatic overflow, so scrollbars appear only when content exceeds the resized window.
