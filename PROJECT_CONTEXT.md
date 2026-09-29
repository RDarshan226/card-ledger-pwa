# Card Ledger PWA — Project Context & Mandatory Change/Test Rules

Last updated: 2026-09-29
Current PWA version: v178
Repository: RDarshan226/card-ledger-pwa
PWA: https://rdarshan226.github.io/card-ledger-pwa/

## Purpose

Card Ledger is a GitHub Pages PWA for tracking credit-card transactions, dues, repayments, cashback, charges, card fees, cards, and related financial data.

The project must be maintained conservatively. Fix the reported problem first and avoid introducing unrelated changes or new dependencies unless required.

## Critical standing rule: test every PWA change

EVERY time any change is made to the PWA/repository, perform a test/verification pass before considering the change complete.

Use the live PWA after the change:
https://rdarshan226.github.io/card-ledger-pwa/

Do not assume that changing one JavaScript function affects only one screen. Check the impact across the entire application.

### Minimum regression checklist for EVERY change

1. Open/reload the live PWA and confirm it starts without a blank screen, startup error, or console-visible application failure when testable.
2. Confirm the displayed PWA version matches the newly committed version.
3. Check EVERY tab/major section, not only the section directly related to the change:
   - Ledger
   - Cards / card management
   - Card Fees
   - Cashback
   - Dues / upcoming dues
   - Recurring payments, if present
   - Entry / +Entry
   - Settings / GitHub connection / recovery controls, if present
   - Any other tab or section currently present in the PWA
4. Check existing data is still visible and correctly calculated:
   - Cards
   - Transactions/entries
   - Expense vs Card Repayment classification
   - Cashback
   - Charges/fees
   - Card fees
   - Due bills/upcoming dues
   - Recurring payments
   - Card-specific transaction lists
   - Totals, summaries, filters and dates
5. Test the actual workflow changed by the update, including saving data and reloading where applicable.
6. For GitHub-backed functionality, verify authentication, read, write/save, reload/read-back, and conflict/error handling as applicable.
7. Check that a change has not silently reverted or broken another feature.
8. If a test cannot be performed because the environment/tool does not permit it, explicitly state what could not be tested. Never claim the PWA was tested when it was only inspected in source code.
9. If a test fails, diagnose the actual failure before making another speculative code change.

## GitHub data/storage rules

The current project is intended to use GitHub-backed data for the ledger data core. Do not casually reintroduce localStorage persistence or create a second competing source of truth.

Before changing storage/authentication code, inspect all callers and startup/render paths because a storage change can affect every tab.

## GitHub authentication rules

The GitHub token/authentication flow is critical functionality.

When authentication is changed:
- Test the initial unauthenticated/opening state.
- Confirm the GitHub token prompt actually appears when a token is required.
- Confirm valid-token connection.
- Confirm invalid/expired-token handling.
- Confirm read access.
- Confirm write/save access.
- Confirm the saved data can be read back after reload.
- Check that authentication changes do not break startup or read-only display.

Do not treat a source-code inspection as proof that the token prompt works in the live PWA.

## Versioning rule

Every repository/PWA change MUST increment the version sequentially.

Current version: v178.

For the next change use v179, then v180, etc. Never reuse an old version number.

When changing the application version, keep cache-busting/service-worker references consistent so the live PWA actually receives the new code.

After every change:
- verify the version in index.html/UI;
- verify relevant script cache-busting references;
- verify service-worker cache/version references;
- verify the modified source file(s).

## Regression philosophy

A fix is not complete merely because the changed function looks correct.

Always consider:
- startup/load sequence;
- authentication;
- data loading;
- rendering;
- all tabs;
- all calculations;
- add/edit/delete flows;
- save/reload behavior;
- service-worker caching;
- existing records;
- card metadata;
- cross-tab data dependencies.

A new fix must not create additional issues in areas that previously worked.

## Current known project context

Recent work has involved:
- GitHub-backed ledger data;
- GitHub token authentication;
- +Entry / Add Transaction;
- transaction editing;
- Card Fees;
- adding cards;
- cashback and charges;
- service-worker cache invalidation;
- previous B64/encryption-related errors.

Recent versions reached v178. The latest v178 work attempted to make the +Entry save path authenticate before its initial GitHub data read.

If a problem remains, inspect the complete relevant flow and reproduce/verify it before making another modification.

## User expectation

The user does not want repeated back-and-forth speculative fixes. For every reported bug:
1. identify the exact failing path;
2. make the smallest appropriate fix;
3. increment the version;
4. test the live PWA;
5. perform the full regression checklist;
6. report exactly what was tested and any limitation.

Do not make unrelated improvements while fixing a specific bug unless they are necessary to prevent regression.

## Important live link

Always use this live PWA for post-change testing:
https://rdarshan226.github.io/card-ledger-pwa/
