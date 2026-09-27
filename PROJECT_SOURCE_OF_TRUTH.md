# Card Ledger PWA — Project Source of Truth

## Baseline
- Repository: RDarshan226/card-ledger-pwa
- Branch: main
- Current app version: v64
- Main UI file: index.html

## Change discipline
1. Before every modification, fetch the latest main-branch file(s). Never edit from a stale copy.
2. Make only the change explicitly requested. No unrelated redesign, refactor, cleanup, data edits, or feature removal.
3. Preserve all existing UI, data structures, PWA behaviour, local storage, IndexedDB, encryption, recovery, and GitHub sync unless the user explicitly requests a change.
4. Every actual code change increments the app version by exactly 1. Update every existing version reference, including the visible badge and APP_VERSION.
5. After a change, verify the affected code path and confirm protected security/sync files were not altered unless explicitly requested.

## Protected architecture

### Security Core — DO NOT MODIFY FOR UNRELATED CHANGES
File: `security-core.js`

Owns:
- Chat AES-GCM encryption key
- Chat key persistence identifier: `card-ledger-chat-aes-key-v1`
- `CL1.` encrypted payload encoding helpers
- Existing Chat key recovery/mismatch protections

Rules:
- Never rotate, replace, delete, migrate, or silently regenerate the Chat key for a GUI/data change.
- Never silently generate a replacement key when encrypted `CL1.` GitHub entries exist.
- Never change the encrypted `CL1.` format for an unrelated feature.
- If the security core must change, treat it as a separate security change and explain the impact first.

### GitHub Sync Core — DO NOT MODIFY FOR UNRELATED CHANGES
File: `github-sync-core.js`

Owns:
- GitHub token storage: `card-ledger-github-token-v1`
- Repository: `RDarshan226/card-ledger-pwa`
- Encrypted feed: `chat-updates.json`
- GitHub API upload/download transport

Rules:
- Never clear or replace the stored GitHub token for an unrelated change.
- Never rewrite/delete existing encrypted feed entries for an unrelated change.
- Never change sync architecture for a GUI change.

### Recovery
Recovery package format is `CLREC1....`.
Recovery functionality must remain compatible with existing exported recovery packages.
Recovery verification must validate the candidate key before replacing local security material.

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
