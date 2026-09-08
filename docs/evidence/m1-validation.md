# M1 validation evidence

Date: 2026-09-08. Baseline: commit `8a26d861d0d984aad70a2bbc92423d9ae3f70293`. Scope: deterministic synthetic accounting only.

## Observable M1 exits

| Exit                                      | Evidence                                                                                                                                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bigint arithmetic and retained remainders | 500 deterministic `mulDiv` floor/ceil cases plus explicit conversion above `Number.MAX_SAFE_INTEGER`; malformed canonical uints rejected                                                |
| One global treasury and isolated sizes    | 1,000, 10,000 and 100,000 USDC states use independent portfolio/operation streams; a mutation in one leaves the others unchanged                                                        |
| No Arc alias duplication                  | Arc native and ERC-20 views resolve to one balance family; duplicate initialization of that family fails                                                                                |
| Conservation and restart                  | 100 generated transfer sequences with capital above `Number.MAX_SAFE_INTEGER` serialize, parse and assert the conservation identity at every receipt                                    |
| Costs and partial failure                 | Approval cost occurs only when needed; source failure releases reservation minus actual cost; withdrawal followed by failed swap retains withdrawn cash and charges only incurred costs |
| Transfer settlement                       | Replay fixture covers reserve, burn, delay, destination failure/retry, settlement and payable settlement; exact redelivery is a no-op and a changed duplicate conflicts                 |
| Attempt exhaustion and closure            | Three failed destination attempts retain a blocked receivable; closure preserves the deadline hash, blocks local accrual and permits later transfer reconciliation                      |
| Mark/liquidation purity                   | Mark, immediate liquidation, blocked value, in-transit value, stale data and unavailable data are distinct; repeated valuation does not mutate state or charge exit costs               |

The replay input is [`tests/fixtures/m1-accounting-transfer.json`](../../tests/fixtures/m1-accounting-transfer.json). It declares `SYNTHETIC_TEST` and contains no RPC response, contract address, transaction, attestation, liquidity or live fee claim.

## Commands and results

- Frozen lockfile install completed for all nine workspace projects. The shell's configured pnpm `10.34.5` launcher was unavailable, so the installed standalone pnpm `9.10.0` executed the same lockfile and scripts; no dependency range or lock resolution changed.
- Focused accounting run: 12 tests passed.
- `pnpm check`: passed. Formatting, root and recursive typechecks, manifest/seal validation, generated-schema drift, all tests and production builds passed.
- Full test run: 65 tests passed in five files (13 added by M1).
- Generated schema catalog: 65 definitions checked.
- Manifest bundle: valid at `0xe56799da87c300fd434d550069a0bbb6d742d85b488360a241868e827495ab54`; 23 dependencies remain gated and all three profiles remain disabled.
- `git diff --check`: passed before commit.

Database concurrency tests remain M3 work. No database schema changed in M1. Fork, RPC and live testnet tests were neither required nor run; M1's external gate explicitly requires synthetic fixtures only.
