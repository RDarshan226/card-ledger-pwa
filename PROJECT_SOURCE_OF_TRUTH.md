# Card Ledger PWA — Project Source of Truth

## Baseline
- Repository: RDarshan226/card-ledger-pwa
- Branch: main
- Current app version: v72
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
