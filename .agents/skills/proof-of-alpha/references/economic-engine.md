# Economic engine and accounting

## Canonical representation

- USDC and token balances: unsigned integers in minimum units plus explicit asset decimals.
- Portfolio weights: basis points summing to 10,000.
- Gas: retain native-unit precision and the captured conversion to USDC.
- Rates and ratios: use fixed-point or rational representations in canonical calculations; floating point is allowed only in versioned statistical analysis.
- Every rounding direction is operation-specific, documented, and tested. Preserve remainders; unit conversion cannot create value.
- Arc native USDC and its ERC-20 interface are two views of the same balance and must never be added together.

## Capital scenarios

The standard grid is 1,000, 10,000, and 100,000 USDC. Each scenario has a distinct signed decision stream, portfolio version, chain balances, positions, transfers, costs, and reference portfolios. They share market observations when appropriate but not balances or receipts. They are correlated market exposures, not three independent statistical samples.

A scenario is one global treasury:

```text
Global value
= Ethereum cash + Ethereum positions
+ Arc cash + Arc positions
+ book value of in-transit receivables
- fees payable not already recognized
```

Never interpret a 10,000-USDC scenario as 10,000 on each chain.

## Portfolio state

Track at least:

- available cash by network and asset;
- reserved cash for an accepted plan or transfer;
- protocol positions with shares/principal/index state;
- approvals or allowances relevant to modeled gas;
- in-transit receivables with net expected amount and uncertainty;
- fees payable and fees already recognized;
- monotonically increasing portfolio version.

Acceptance of an action and insertion into the journal are atomic. The MVP allows one allocation intent in progress per scenario. An unresolved transfer keeps affected capital locked; new work can only spend available balances.

## Planner and execution semantics

The agent signs a target allocation. A deterministic, versioned planner derives ordered steps such as withdraw, approve, swap, approve, transfer, receive, and deposit. The protocol evaluates the target through this planner, so it does not measure the agent's own routing quality.

Use amounts produced by prior steps, not nominal pre-fee amounts. Do not insert an unnecessary swap between direct USDC instruments. Track approvals so that approval gas is charged only when the modeled allowance requires it.

Each step uses a market state after durable receipt according to the locked block/latency rule. Exact-in swap quotes are amount-specific. If a quote already includes pool fee and price impact, do not deduct them again. Slippage tolerance is a guard, not a fee.

### Partial success

Plans are not fictionally atomic across independent transactions or chains. Preserve successful earlier steps and their costs when a later dependency fails. Stop dependent steps. Do not initiate a discretionary recovery trade unless the frozen policy defines it.

Rejection before an on-chain attempt consumes no gas. A modeled failed attempt can consume gas. Expiry bounds starting a plan; it does not undo a confirmed burn or completed transaction.

## Instrument accounting

Adapters must model protocol mechanics rather than apply a displayed APY continuously.

- Lending: principal/index or receipt-token behavior, caps, available liquidity, paused/frozen states, fees, and exit capacity.
- ERC-4626: shares, assets, previews, conversion rules, `maxDeposit`/`maxWithdraw` or equivalent capacity logic, fees, and rounding. Owner-dependent limits from a real wallet do not directly represent a virtual portfolio; document the shadow-capacity rule.
- Swap: exact amount, route, pool state, received amount, fee/impact, gas, deadline, and failure.
- Vault or lending yield accrues between checkpoints and during inactivity. Capital in transit earns no investment yield.

Validate supported operations on fixed-block forks and known accounting fixtures. A fork verifies contract behavior at that state, not future market reactions.

## Transfers and receivables

Use one CCTP adapter for the MVP. The virtual transfer model and actual test-transfer tracker share economic states but retain distinct provenance.

```text
RESERVED -> SOURCE_FAILED
RESERVED -> IN_TRANSIT -> READY_TO_RECEIVE -> SETTLED
                       -> DELAYED -> READY_TO_RECEIVE
READY_TO_RECEIVE -> DESTINATION_RETRY -> READY_TO_RECEIVE
```

- `RESERVED`: amount cannot be spent but has not been debited twice.
- `SOURCE_FAILED`: release reservation, retain attempted costs only.
- `IN_TRANSIT`: source cash is gone; create one unavailable receivable net of identified fees.
- `DELAYED`: retain the receivable and surface an incident; never auto-refund.
- `DESTINATION_RETRY`: retry the same message idempotently with retry cost; no second source debit.
- `SETTLED`: remove the receivable and credit destination cash exactly once.

Record direction, environment, CCTP domains, message identifier/hash, source/destination transactions when actual, fee inputs, retry sequence, block references by chain, and observed times. Pure shadow transfers have no Circle attestation and must be labeled `SIMULATED`; never reuse another transfer's attestation.

Internal transfers are not contributions or withdrawals. Foregone yield during transit appears through portfolio comparison; do not deduct it again as a PnL cost.

## Costs

Canonical market result includes costs actually implied by the policy: withdrawal/deposit/approval gas, swap fees and impact, source gas, transfer fee, destination/relayer gas, retries, and exit costs if an exit is executed. Separate protocol fee, network gas, relayer charge, and subsidy. Infrastructure funding cannot increase bankroll.

Inference, data subscriptions, hosting, and other creator operating costs belong in a supplementary declared-cost view, with an explicit allocation rule across scenarios. Do not silently multiply one shared cost three times.

## Valuation

- `markValue`: estimated book value of cash and positions.
- `liquidationValue`: estimated recoverable USDC through the frozen exit plan after applicable costs and constraints.

An estimated exit at a checkpoint does not mutate the shadow wallet or repeatedly debit exit gas. If only part of a position is withdrawable, expose recoverable amount, blocked amount, and uncertainty. A stale last-known value may be displayed as stale but cannot be treated as a fresh observation.

## Reference portfolios

For each scenario, initialize exactly two references from the same capital, distribution, period, and valuation convention:

1. Cash: stationary USDC, no investment and no transfer.
2. Conservative yield: one passive instrument chosen before `X`, entered under its predefined latency and cost rules, with no opportunistic switching.

If conservative entry fails, keep cash and costs incurred, mark the reference unavailable, and suspend the conservative comparison. If it loses value, retain the loss. The testnet version is explicitly a technical test reference, not a claim of conservative economic yield.
