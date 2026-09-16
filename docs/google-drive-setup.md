# Optional Google Drive library

The integration reads PDF/EPUB files explicitly selected by a user in Google Picker. Files stay in the user's Drive; The Shelf stores references and streams selected downloads to that user's device. It does not automatically export hosted books into Drive, request full-Drive access, create a public CDN, or distribute other users' private files. Review Google's current API/user-data policies before publishing the OAuth application.

## Operator setup

1. Create a Google Cloud project. Enable Google Drive API and Google Picker API.
2. Configure the OAuth consent screen, authorized domain, privacy policy, and the non-sensitive `https://www.googleapis.com/auth/drive.file` scope. Add test users while the app is in testing. Complete the applicable publishing/verification process before opening it to everyone.
3. Create a web OAuth client. Set the exact callback to `<SHELF_APP_URL>/api/drive/callback`; register the app origin where required.
4. Create a browser API key for Picker, restrict it to the site's HTTP referrers and required Google APIs. Copy the project's numeric project number.
5. Configure `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_PICKER_API_KEY`, `GOOGLE_DRIVE_PROJECT_NUMBER`, and `SHELF_TOKEN_ENCRYPTION_KEY` on the server. Generate the last value with `openssl rand -base64 32`. Never commit these values.
6. Restart the application. In Settings → Your Google Drive library, connect, select a test book, download it, read offline, reconnect, then disconnect. Test revoked access and a full/unavailable Drive account.

Refresh tokens are AES-256-GCM encrypted in `drive_connections`. Back up the encryption key securely with the database; losing or changing it without re-encryption requires reconnection. Only an ephemeral access token is sent to Google's browser picker. Tokens must never be placed in IndexedDB or localStorage.

Drive quota belongs to the reader. Google's API also has quotas and evolving pricing thresholds. Stay within applicable free limits and monitor usage; do not promise unlimited storage or API access. Re-selecting a file refreshes its version after it changes in Drive. Disconnecting prevents future downloads but does not delete existing device downloads.

The code can be tested with mocked Google responses, but a real OAuth/Picker round trip requires the operator's Google configuration. Do not label that live integration verified until it has been exercised.

Sources: [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Google Workspace developer policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy), [Drive limits](https://developers.google.com/workspace/drive/api/guides/limits).
