# Finding — the EURC/cirBTC Shield failure is the WALLET's own RPC call, not this app's code

## Confirmed: the stats fix worked

Image 1 (this turn): zero console errors, stats loading cleanly. The
Multicall3 fix from the previous turn resolved the rate-limit storm on
the protocol-stats poll as intended.

## The decisive evidence

Image 2 is a photograph of the wallet's OWN error dialog (Rabby), not
this app's UI:

```
Error
Request exceeds defined limit.
URL: https://rpc.testnet.arc.network
Request body: {"method":"eth_getTransactionCount","params":["0x1dc7...c9894","latest"]}
Details: rate limit exceeded
```

`eth_getTransactionCount` is a **nonce lookup** — and the wallet extension
makes this call **itself**, directly to the same RPC endpoint, as part of
its own internal transaction-signing flow. This is not a request this
app's code initiates or has ever had a path to control. Every fix this
session (the shared throttle queue, sequential stats calls, Multicall3)
only covers requests THIS app makes via `window.ethereum.request` on the
app's own behalf — none of them touch what the wallet extension does on
its own, separately, before it lets a transaction through to be signed.

This retroactively explains the earlier "Shield EURC Failed — Rejected
by user" report from a few turns ago: that wasn't a real user rejection —
it was this same rate-limited nonce lookup inside the wallet, surfaced
by Rabby in a way that reads as a rejection rather than a network error.

## Mitigation applied (best-effort, not a guaranteed fix)

`sendTransaction()` now pre-fetches the nonce itself (through this app's
own retry logic, `rpcCallWithRetry`) and passes it explicitly in the
`eth_sendTransaction` request object. A wallet that honors a
caller-supplied `nonce` field can skip its own separate lookup entirely —
removing the exact call that's been failing. A wallet that ignores the
field and looks the nonce up anyway (some do) is no worse off than
before; this is purely additive, no downside either way.

This is explicitly **not** guaranteed to fully resolve it — whether it
helps depends on whether Rabby (and Arc's own `rpc.testnet.arc.network`
being this rate-limited in general) respects an explicit nonce. Worth a
fresh EURC/cirBTC Shield attempt after deploying this to see if the
wallet's own error dialog still appears.

## What's genuinely outside this app's reach

If the wallet's own RPC calls keep hitting this limit regardless, the
remaining options aren't frontend code changes:
- Check whether Rabby lets you set a custom/different RPC URL for Arc
  Testnet specifically (many wallets do, per-network) — pointing it at a
  less congested endpoint would sidestep this entirely.
- This may be worth reporting to Arc Testnet's own infrastructure/RPC
  provider — a public rate limit this tight is affecting more than just
  this one app (it's rate-limiting a wallet's own basic nonce lookups).

## Files changed
- `src/DApp.jsx` only (`sendTransaction()`).
