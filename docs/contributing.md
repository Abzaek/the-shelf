# Making a change

`AGENTS.md` is the source of contributor instructions. This workflow applies to any AI model and to human contributors.

1. Read the architecture and relevant ADRs. Identify the module that owns the behavior. For community, also read `docs/architecture/community.md`, ADR 0002, and the pilot guide; community publication never reuses personal-library replication.
2. Read installed Next.js documentation for the API being changed. Inspect installed library types for RxDB, Dexie, Serwist, and tus rather than guessing APIs. Keep the direct Dexie dependency pinned to the version required by RxDB’s adapter (currently 4.4.2); two Dexie runtimes in the same bundle break initialization. Check `pnpm why dexie` when upgrading either package.
3. Write down the expected behavior and failure modes. Preserve local edits, account separation, quota enforcement, and existing records.
4. Change the narrowest owning module. Add a small service/adapter if a new external integration is needed; do not bury it in a component.
5. Add meaningful regression tests. Server tests use a disposable SQLite directory, never `.data` or a production service. Browser tests use isolated accounts and browser contexts. WebKit uses a local test-only proxy to interrupt device connections because Playwright service-worker tooling is Chromium-only. The proxy and its network-control route never enter the production application. HTTP localhost fixtures relax only the test cookie’s Secure attribute; production cookie settings stay unchanged.
6. Run `pnpm check`. For offline/auth/reader/transfer/PWA work, build production and run `pnpm test:e2e`. Install browsers with `pnpm exec playwright install chromium webkit` when needed.
7. Update architecture, setup, and decision records. An ADR should state the problem, decision, alternatives, consequences, migration path, and verification.
8. Inspect the diff. Report test outcomes, unverified behavior, and configuration requirements. Deployment is a separate action.

## Commands

- `pnpm dev`: local development; service workers are registered only in production.
- `pnpm check`: architecture boundaries, formatting of the offline modules, typecheck, lint, server regression tests.
- `pnpm build`: production Next.js and Serwist output.
- `pnpm test:community`: isolated migration, membership, privacy, moderation, and publication regression checks.
- `pnpm test:e2e`: isolated production browser checks against a staged standalone release; see `playwright.config.ts`.

## Changing persistence

Never change released migrations in place. Add the next server migration and a test from the previous schema. Increment the RxDB schema and supply migration strategies for incompatible local changes. Version wire-format changes explicitly; document which old clients the server continues to support. Account for pending uploads and tombstones during rollback.

## Enforcement

CI runs architecture checks, Prettier, types, lint, server regression tests, and production browser tests. Use the repository Prettier configuration when editing the offline modules; `pnpm check:format` lists the enforced paths. `scripts/check-architecture.mjs` catches forbidden UI/database imports and missing canonical documentation. Tests cover runtime contracts that documentation cannot enforce. These checks reduce inconsistency; they cannot guarantee arbitrary model compliance or replace review.

CI runs Chromium on Ubuntu and both WebKit profiles on the standard `macos-15` runner. Linux WebKit produced intermittent internal resource-loading errors during offline navigation, while macOS verification passed; [Playwright recommends macOS for the closest Safari behavior](https://playwright.dev/docs/browsers#webkit). All browser scenarios remain required, with failure traces retained per OS. Deployment waits for both matrix jobs and publishes only the Linux artifact. These [standard hosted runners are free for this public repository](https://docs.github.com/en/actions/reference/runners/github-hosted-runners); reassess billing before changing repository visibility or selecting larger runners. macOS WebKit remains emulation, not a physical iOS test.
