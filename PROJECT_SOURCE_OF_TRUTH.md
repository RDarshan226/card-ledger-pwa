# Card Ledger PWA — Project Source of Truth

## Baseline
- Repository: RDarshan226/card-ledger-pwa
- Branch: main
- Current app version: v78
- Main UI file: index.html

## Change discipline
1. Before every modification, fetch the latest main-branch file(s). Never edit from a stale copy.
2. Make only the change explicitly requested. No unrelated redesign, refactor, cleanup, data edits, or feature removal.
3. Preserve all existing UI, data structures, PWA behaviour, local storage, IndexedDB, encryption, recovery, and GitHub sync unless the user explicitly requests a change.
4. Every actual code change increments the app version by exactly 1. Update every existing version reference, including the visible badge and APP_VERSION.
5. After a change, verify the affected code path and confirm protected security/sync files were not altered unless explicitly requested.

## Protected architecture

### User-selected encryption key file
File: `security-core.js`

Owns:
- User-selected local text-file key handle
- Reading the key text only when encryption/decryption is required
- AES-256-GCM key derivation/import from that text
- No automatic encryption-key generation
- No persistence of key contents in IndexedDB/localStorage/credential vault
- No upload of the key to GitHub

Rules:
- The PWA must never generate a replacement encryption key.
- The PWA may persist only a reference/handle to the user-selected key file so supported browsers can reopen it.
- The key file contents must never be written to PWA storage or GitHub.
- The same selected key file is used for GitHub transaction encryption/decryption.
- If the key file is unavailable or its permission is lost, the PWA must request the user to select/re-authorize the file rather than generate a new key.

### GitHub Sync Core
File: `github-sync-core.js`

Owns:
- GitHub token persistence and API transport
- Repository: `RDarshan226/card-ledger-pwa`
- Encrypted feed: `chat-updates.json`
- Upload/download of ciphertext only

Rules:
- Never upload the key file or plaintext transaction data.
- Never replace or regenerate the user-selected encryption key.
- Existing encrypted feed entries remain untouched.

### Existing legacy recovery
Older `CLREC1` recovery packages and credential-vault Chat keys belong to the previous architecture. They are no longer used by the new text-file key architecture.

## UI/application layer
`index.html` contains the GUI and application logic. UI requests should be implemented here whenever possible without touching the protected modules.

Examples of normal UI-only changes:
- colours
- ribbons
- buttons
- tabs
- typography
- splash screen
- labels
- layout

## Data safety
A normal UI/version update must not clear IndexedDB/local storage, reset credentials, or invalidate recovery packages.
If a requested change could affect persistence or security, stop and explain the risk before implementing it.

## Commit reporting
After every repo change, report:
- new app version
- exact requested change
- protected functionality preserved
- commit SHA(s)


## Card and tab management additions (v74)
- Ledger can add cards with name, credit/debit type, limit, billing date, shared-limit group, network, tier, BIN, opening month/year, annual fee and reward rate.
- A card added through Ledger is the same card record used by Card Fees, Rewards, Account Ageing and relevant other tabs.
- Card Fees supports add, edit and remove of cards and card details.
- Rewards supports card-level reward tracking edits and card add/remove; detailed reward rules remain editable from Card Fees.
- Account Ageing supports card add, edit and remove and opening-date editing.
- Recurring Payment tab has its own persistent recurring-payment records with add, edit and remove.
- Removed default cards are tombstoned so loadData does not silently recreate them.
- Recurring payments and removed-card tombstones are included in rolling local backup data.


## Brave Android key-file fallback (v75)
- If the browser supports File System Access, the selected .txt key-file handle may be persisted.
- If it does not support that API (including Brave Android in the current supported configuration), Card Ledger falls back to a normal .txt file picker.
- In fallback mode, the key text is held only in memory for the current browser session and is never stored in localStorage, IndexedDB, GitHub, or a backup.
- The user must select the key file again after a session where the in-memory key has been cleared.


## Automatic PWA update mechanism (v76)
- On app load, the PWA registers the service worker with `updateViaCache: 'none'` and explicitly checks for an update.
- The PWA checks for a newer service worker again when returning to the app, on window focus, and every 5 minutes while open.
- A newly installed service worker is instructed to skip waiting, and the page reloads automatically after the new controller takes over.
- The update process does not clear ledger data, IndexedDB/local storage, encryption keys, or GitHub sync data.


## Automatic PWA update mechanism (v76)
- On startup, the PWA registers the service worker with `updateViaCache:'none'` and explicitly calls `registration.update()`.
- The app also checks for updates when returning to the foreground/visible state and on window focus.
- When a new service worker is waiting, the app sends `SKIP_WAITING`; the new worker claims clients and `controllerchange` triggers one automatic reload.
- This is designed to pick up future GitHub Pages releases without requiring the user to manually clear the site's cache.


## Automatic PWA update detection (v78)
- Service-worker registration uses a versioned script query (sw.js?app=vXX) together with updateViaCache:'none', so the browser checks the GitHub Pages service worker instead of relying on a stale HTTP-cached worker script.
- The app checks for updates on startup, after a short delay, when the app regains focus/visibility, and periodically while open.
- A newly installed service worker is activated immediately with skipWaiting, then the page reloads once on controllerchange.
- The service worker cache version is kept in sync with the app version; activation removes older app caches.
- Automatic updates affect application code/assets only and do not clear or overwrite the user's IndexedDB ledger, encryption key file, GitHub token, or encrypted transaction data.

- v78 consolidates the update listeners into one service-worker update flow and keeps the versioned service-worker URL so stale registrations are less likely to persist.

- v80 fixes the Rewards tab to render the existing reward-tracking manager, exposing Add Card, Edit, Save, Cancel, and Remove controls while preserving the reward calculation panels.

- v80 fixes a duplicate `let html` declaration introduced while wiring the Rewards tracker manager; this JavaScript syntax error was preventing the app from finishing startup and leaving the splash screen visible.
