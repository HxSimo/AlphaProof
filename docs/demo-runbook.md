# Demo runbook

## M0 foundation review (about two minutes)

1. Run `docker compose up --build -d`; open <http://localhost:3000>.
2. Show the three profiles, disabled status and explicit evidence labels. Explain that the Arc registry role does not mix testnet markets into Ethereum economics.
3. Run `pnpm config:validate`. Open one instrument fact sheet and its manifest gate. Unknown addresses and transaction evidence are unresolved, not samples disguised as deployments.
4. Run `pnpm worker:once` with local DATABASE_URL twice. The second response has `inserted: false`; `pnpm test:db` also checks restart and concurrent delivery.
5. Run `pnpm plan M1` and show the precise accounting exit criteria. M0 has no signed intent, balance history, yield, attestation, Merkle proof or eligibility result to demonstrate.

If the API is unavailable, the page displays that state instead of cached or synthetic success. Stop the stack with `docker compose down`; preserve the volume.

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
