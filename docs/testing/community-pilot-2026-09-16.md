# Community pilot verification — 2026-09-16

Local implementation on `codex/community-pilot`. No production deployment, enrollment of real readers, or invitation messages were performed.

## Results

- Final `pnpm check` passed: architecture boundaries, formatting, types, lint, synchronization, analytics, and community regression checks.
- Final `pnpm build` passed with the additive community migration and offline-shell integration.
- The complete 24-case browser run passed all **21 existing personal-reading/upload scenarios** plus the Chromium and desktop WebKit community scenarios. Its iPhone community case exposed a stalled-request loading state.
- After fixing that issue with an eight-second community transport timeout, the production artifact was rebuilt and all **3 community scenarios passed**: Chromium, desktop WebKit, and the iPhone 13 emulation preset. The full 24-case suite was not repeated after this isolated community transport fix.
- A deterministic server-side test harness also substitutes a never-resolving fetch to verify bounded community request recovery and immediate caller cancellation. This does not contact a real service.
- Mobile and desktop screenshots were inspected, and browser assertions verified no page-level horizontal overflow.

## Community coverage

Existing-account invitation; explicit alias and rules consent; private-library isolation; room creation; discussion and reply publication; collapsed spoilers; reports and moderator hiding; membership and account binding; moderator authorization; suspension; global pause; duplicate prevention; rate limits; pagination; owner removal; leaving; account deletion; no-store responses; bounded JSON input; cross-origin denial; and migration from the deployed v5 schema while preserving an existing private book.

Browser coverage includes reopening a discussion URL, the main Community navigation link, browser Back, reload, and offline navigation to the community connection notice. Tests use disposable SQLite data and fixture accounts. No real email provider or participant is involved.

## Findings corrected

- A form hint was included in an input's accessible name; it now uses a separate description.
- Community selection followed only native history events; it now follows Next.js URL state, including navigation links.
- Offline WebKit reloads could spend most of the test budget waiting for the browser load event despite a rendered reader. Offline test reloads now wait for DOM content and retain the existing PDF/EPUB, persisted-content, and synchronization assertions.
- A community fetch could stall while the browser still reported online. Requests now time out, display connection recovery, and preserve a current draft and operation ID for an explicit retry. Reconnecting never publishes automatically.

## Limits

Playwright WebKit and an iPhone viewport are not physical iOS or native Safari verification. Production HTTPS, real invited cohorts, moderation operations over time, accessibility assistive-technology testing, and larger-library/community load remain outside this local verification. Community is online-only; drafts exist only in the current view. There is no author commerce or private-file sharing.
