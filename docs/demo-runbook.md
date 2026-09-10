# Demo runbook

## M0 foundation review (about two minutes)

1. Run `docker compose up --build -d`; open <http://localhost:3000>.
2. Show the three profiles, disabled status and explicit evidence labels. Explain that the Arc registry role does not mix testnet markets into Ethereum economics.
3. Run `pnpm config:validate`. Open one instrument fact sheet and its manifest gate. Unknown addresses and transaction evidence are unresolved, not samples disguised as deployments.
4. Run `pnpm worker:once` with local DATABASE_URL twice. The second response has `inserted: false`; `pnpm test:db` also checks restart and concurrent delivery.
5. Run `pnpm plan M1` and show the precise accounting exit criteria. M0 has no signed intent, balance history, yield, attestation, Merkle proof or eligibility result to demonstrate.

If the API is unavailable, the page displays that state instead of cached or synthetic success. Stop the stack with `docker compose down`; preserve the volume.

## M6 proof and dashboard review (about four minutes)

1. Run `pnpm test:e2e:export-proof`. Explain that a fresh process reloads the complete versioned export, recomputes the selected corrected eligibility receipt and verifies every audit event, leaf, proof, batch link and registry receipt.
2. Open `docs/evidence/m6-registry-publication.json`. Show Arc Testnet registry `0xc391ad7e4826a2c1ecc56e845098b8c1b580eebd`, the separate owner/publisher accounts and the finalized sequence-16 publication. Then open `m6-registry-publication-v1.json` to show that the original publication remains available.
3. With an Arc archive RPC configured, run `POA_RUN_LIVE_M6_VERIFY=1 pnpm test:evidence:m6`. Show the registry head with two predecessor-linked batches. State that this is a post-execution integrity anchor, not independent proof that receipt preceded execution.
4. Start API/web against a canonical database experiment selected by `POA_DEMO_EXPERIMENT_ID`. Show the three capital cards as correlated policy views (`n = 1`), both references, mark/liquidation, cash, positions, transit, blocked value, costs and drawdown. Show compliance, economics, statistics and overall eligibility separately.
5. Open the evidence and limitations panels. Synthetic/testnet/replay/mixed output is excluded before criteria, inference remains disabled, and automatic funding remains off. If canonical backend data is absent, retain the explicit unavailable screen.

The exact commands, evidence hashes and interrupted-publication resume variables are in [the M6 runbook](runbooks/m6-export-proof.md). Production object-store retention remains `TO_VERIFY`, so the external profiles remain disabled.

## M7 target narrative and data plan

| Evidence stream          | Source and start                                                                         | Allowed claim                                                           | Prohibited use                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Ethereum forward         | New signed intents after a frozen X; verified current Ethereum blocks/quotes             | Prospective shadow economics on Ethereum only                           | No artificial Arc yield, pre-X capture or historical replay added to the series    |
| Cross-chain technical    | Actual Sepolia↔Arc test-token burn/attestation/receipt and vault round trips             | Integration lifecycle with real test transactions                       | No real-capital eligibility or virtual bankroll presented as tokens actually moved |
| Historical replay        | Archived inputs, exact versions and labeled earlier dates                                | Engine reproduction and longer narrative                                | Cannot extend forward duration or upgrade old results                              |
| Synthetic failure/stress | Deterministic fixtures, explicit fake amounts/times and no claimed external transactions | Software behavior under partial failure, delayed transfer or stale data | Cannot become economic evidence                                                    |
| Mixed diagnostic         | Explicit incompatible market inputs, separate experiment/report                          | Diagnostic only, entire result excluded                                 | Cannot carve out a clean Ethereum subsection afterward                             |

The final demo follows external signer → durable receipt → deterministic future plan → actual economic consequences at each tested size → two comparable references → separate compliance/economics/statistics → proof and downloadable replay. Show in-transit capital unavailable, fees retained after failure, and exactly one destination credit.

The Ethereum swap and Sepolia↔Arc technical flow are separate evidence streams because there is no verified Sepolia USDT swap in the M0 catalog. Do not splice them into one forward result. A combined compressed example may be entirely synthetic. At M7 record both actual transfer directions and vault deposits/withdrawals in advance; a network outage uses that dated technical recording or a labeled replay, never a fabricated fresh transaction.

Rehearse closure with unresolved transit, unavailable conservative reference, failed swap after successful withdrawal, duplicate SDK submission, worker restart and a modified Merkle leaf. Record observation period and incidents honestly; an `INSUFFICIENT_EVIDENCE`/`NOT_ASSESSED` outcome is valid. No test or demonstration authorizes automatic funding.
