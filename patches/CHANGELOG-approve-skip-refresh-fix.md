# Fix — why USDC Shield works but EURC/cirBTC doesn't (and a self-inflicted contributor)

## The structural difference

Native USDC Shield is **one transaction** (deposit via `msg.value`).
EURC/cirBTC Shield is **two, sequential**: Approve, then Deposit. Two
wallet-initiated transactions mean the wallet does its own nonce lookup
(`eth_getTransactionCount` — see the previous turn's finding) **twice**
instead of once, on the same rate-limited RPC. That alone roughly doubles
the exposure to the exact failure already confirmed via the photographed
Rabby error dialog.

## A self-inflicted amplifier, found this turn

`sendRealTx()`'s success path fires `onSuccess()` — which triggers an
**immediate, unthrottled** stats refresh (`protocolStats.refresh(true)`,
deliberately bypassing the shared queue by design) plus
`onChainActivity.refresh()` (its own 4-way concurrent log scan) — after
**every** confirmed transaction, Approve included.

For EURC/cirBTC, that means: Approve confirms → this burst of the app's
OWN RPC calls fires immediately, fire-and-forget → in the very same
window, the calling code moves straight into building and sending the
Deposit transaction, which is exactly when the wallet does its second
nonce lookup. This app's own "make the dashboard feel instant" burst was
landing in the single worst possible moment for the wallet's own
RPC call — a self-inflicted contributor stacked on top of the
already-tight rate limit.

USDC never has this problem: one transaction, no approve step, no
mid-flow burst competing with anything.

## Fix

`sendRealTx()` now accepts `skipOnSuccess: true`. An `approve()` call
moves no value and changes no TVL/volume/fee figure — there is nothing
for that stats refresh to usefully show yet, so it's skipped entirely
for approve steps (both of them: the Shield panel's EURC/cirBTC approve,
and PrivarStaking's approve). The refresh still fires normally, exactly
as before, right after the transaction that actually moves value
(Deposit, the real Stake, etc.).

Combined with the previous turn's nonce pre-fetch, this should meaningfully
narrow the gap between USDC's single-transaction path and EURC/cirBTC's
two-transaction one — though as with the nonce fix, whether the wallet's
own rate limit still bites occasionally depends on how congested Arc
Testnet's public RPC is at any given moment, which isn't something either
fix can fully guarantee against.

## Files changed
- `src/DApp.jsx` only.
