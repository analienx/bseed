# UX GATE — Section A pre-OTA browser-access proof (LivingRoomMainDimmer)

Supervisor order: bseed #8 comment `5508198155` (staging accepted; OTA BLOCKED until Section A proof delivered).
Protocol: supervisor addendum "exact browser/visual UX acceptance protocol", sections A–C.

## Result

```text
UX_PRE_OTA_BROWSER_ACCESS = PASS
OTA status: BLOCKED — awaiting supervisor authorization (not performed)
```

## What was proven

Real rendered page access to the running Z2M frontend and the actual
`LivingRoomMainDimmer` device page, captured at the prescribed viewports,
before any OTA. The page shows the expected pre-OTA (1.1.2) definition.

## Frontend path determination (Section A1/A2, read-only)

- Effective Z2M frontend config has **no `frontend.package`** key; the served
  application was identified from the loaded app itself as
  **`zigbee2mqtt-windfront`** (WindFront). Recorded instead of guessed, as ordered.
- Frontend is enabled on add-on port **8099**, no auth block configured
  (WindFront instance is unauthenticated; nothing to redact).
- Route scheme is WindFront's (not the classic `#/device/<IEEE>/exposes` of the
  classic frontend), so per the addendum the route was NOT invented: navigation
  was performed as prescribed — open **Devices**, search `LivingRoomMainDimmer`,
  click the device, click the **Exposes** tab, record the final URL.
- Final URL: `http://192.168.50.58:18099/#/device/0/0xa4c13843a9d40f85/exposes`
  (windfront route `#/device/0/<IEEE>/exposes`).

## Transport transparency

The executor host is not on the HA LAN. Access was provided equivalently to
"user URL" by: SSH local forward to the HA host + a **temporary, minimal
read-only TCP relay** on the HA host bound to LAN `192.168.50.58:18099` ->
`127.0.0.1:8099` (container port), used only for this capture and fully torn
down afterwards (process killed, file removed, port free on both ends). No Z2M
or HA configuration was changed. No credentials exist for this frontend; none
were used, printed, or committed.

## Capture method (Section C)

Playwright-driven Edge (Chromium), JavaScript enabled, real rendered page:
- desktop `1440x1200` and mobile `412x915`, device scale factor 1;
- network/UI idle wait + additional ~2 s for live controls;
- captured final URL, `document.title`, `body.innerText` (UTF-8), console
  messages, uncaught page errors, viewport dimensions, UTC timestamp.
- Navigation clicked only Devices / search / device / Exposes tab. **No setting
  was submitted or changed** (read-only session verified post-capture; no
  semantic deltas in the staging post-conditions).

## Evidence files (this directory)

| File | Purpose |
|---|---|
| `pre-ota-browser-access.png` | REQUIRED pre-OTA baseline screenshot (desktop 1440x1200) |
| `pre-ota-browser-access-desktop.png` | same capture, protocol filename kept |
| `pre-ota-browser-access-mobile.png` | mobile 412x915 capture |
| `browser-metadata.json` | final URL, title, navigation log, viewports, timestamp, firmware observed |
| `page-visible-text.txt` | desktop `body.innerText` |
| `browser-console.log` | console output (one informational WebSocket line; **no errors/warnings**) |
| `step-devices-search.png` | navigation step: Devices list with search applied |
| `step-device-info.png` | navigation step: device info page before Exposes tab |

## Baseline content expectedness

Visible text of the device page shows the **old 1.1.2 definition**: endpoint-scoped
controls (`State (Endpoint: relay_left)` etc.), no v4 controls (no
`Physical relay behavior` selects, no `Advanced hardware configuration
(read-only)`, no `Logical relay state` composites). This is the correct pre-OTA
access baseline per Section A3.
