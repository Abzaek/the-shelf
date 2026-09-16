# Offline personal reading verification — 2026-09-16

This report records pre-deployment verification. Check GitHub Actions and the production release for current deployment status. Author commerce and community features are outside this release.

## Automated verification

- `pnpm check`: architecture boundaries, Prettier, TypeScript, ESLint, sync/security regression tests, and existing analytics integration tests passed.
- `pnpm build`: production Next.js/Serwist build passed. The offline shell and application assets are precached, including local fonts and the PDF worker.
- Full Playwright suite: **21 passed** across Chromium, desktop WebKit, and the iPhone 13 emulation preset. The test server stages and starts the same standalone artifact as deployment, with disposable SQLite data and fixture accounts.
- After the final sync-status correction, the rebuilt artifact passed all **3 targeted cross-browser checks** for concurrent notes, remote deletion propagation, and the indicator returning to its saved state. `pnpm check` and `pnpm build` passed again.

| Scenario | Chromium | Desktop WebKit | iPhone emulation |
| --- | --- | --- | --- |
| Download, cold offline page navigation, PDF rendering, offline notes, reload, reconnect | Passed | Passed | Passed |
| Import a PDF offline, reload, reconnect, upload its bytes | Passed | Passed | Passed |
| Keep private API responses out of shared service-worker caches | Passed | Passed | Passed |
| Two independent device databases edit one note offline; preserve both versions | Passed | Passed | Passed |
| Switch accounts while a private note is pending; restore it only to its owner | Passed | Passed | Passed |
| Open and reload a downloaded EPUB without a connection | Passed | Passed | Passed |
| tus partial upload, offset checks, account binding, completion retry, quota rejection | Passed | Passed | Passed |

Server tests also cover ordered checkpoints, duplicate pushes, independent field merges, membership removal/re-add, deletion tombstones, ownership, validation, origin checks, and encrypted Drive tokens. Mocked Google responses exercise OAuth state, PKCE, replay rejection, account separation, and refresh-token use without contacting a real Google account.

## Browser test details

The first Linux CI run passed 20 of 21 cases and exposed an import-test race: the test checked the filename already visible in the form and reloaded before the save completed. The test now waits for the post-persistence success confirmation and dialog closure before checking offline reload durability; the durability assertion remains unchanged.

Chromium uses Playwright's offline mode. WebKit uses a test-only localhost proxy that drops connections for one device cookie: this exercises real network failures and the application's own service-worker fallback. It avoids the limitations of [Playwright's Chromium-only service-worker tooling](https://playwright.dev/docs/service-workers). The proxy's control endpoint is absent from the production application.

Production Secure session cookies remain unchanged. The HTTP-only localhost fixtures adjust only their own test cookies for WebKit. This does not verify a real TLS deployment's cookie behavior.

This workstation used an existing Chromium test executable through `SHELF_TEST_CHROMIUM_PATH`; CI installs Playwright's matching Chromium and WebKit builds. That override is optional and never hardcoded into project configuration.

## Fixes found during verification

- Serialize parent tombstone flags in replication requests.
- Apply the default quota when an account has no explicit quota override.
- Distinguish new tus upload IDs from ownership checks for existing uploads.
- Store binary data as an ArrayBuffer when a WebKit profile rejects IndexedDB Blob writes.
- Wait for service-worker control before reporting offline readiness.
- Wait for an EPUB location before allowing a resize that clears and redraws its views.
- Keep the mobile import dialog within the viewport, with a scrollable body and reachable actions.
- Stop stale session checks from restoring a signed-out account.
- Clear acknowledged remote deletions from the pending indicator, while retaining pending removals across reloads.

## Remaining manual coverage

- Actual iPhone/iPad hardware, installed Home Screen behavior, touch selection, native file pickers, keyboard/safe-area changes, orientation, OS suspension, and storage eviction.
- Native macOS Safari retest of this production build; Playwright WebKit is a separate browser build.
- Full browser-process/OS restarts and service-worker/schema upgrades with pending edits. Automated tests above use cold page navigation and reload within an isolated browser context.
- Live Google OAuth/Picker/download/revocation after configuring the operator's Google project; mocked tests are not live integration verification.
- Production HTTPS, reverse-proxy upload limits/timeouts, server-disk exhaustion, and large-library performance.

The earlier `safari-ios-2026-09-16.md` report refers to the pre-change revision and remains intact. It is not evidence that this new release was tested on a physical iOS device.
