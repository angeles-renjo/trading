# Crypto Trading Partner 🤝📈

A BTC **support/resistance swing-trading bot** with a web dashboard, built on
**Bybit** market data. It backtests, paper-trades, and (when you explicitly arm
it) trades **real money** — the same strategy code across all three modes.

> ⚠️ **Real money & full automation are involved.** This is an educational tool,
> **not financial advice**, and nothing here guarantees a profit. Start with
> backtesting and paper trading. Only go live with money you can afford to lose.

---

## What it does

- **Two strategies (pick with `STRATEGY=`):**
  - **`trend`** (default, recommended) — **breakout + trend filter**: buy when
    price breaks above the prior *N*-bar high *while in an uptrend* (above a
    rising long MA), stop at ~3×ATR, and **trail the stop** to let winners run.
    Best fit for crypto's strong trends and far less fee-sensitive.
  - **`sr`** (baseline) — horizontal **support/resistance bounce**: buy a
    confirmed bullish bounce off a strong support zone with a fixed **2:1**
    target. Mean-reversion; works in ranges, struggles in trends.
- Both are spot, **long-only** (no leverage, no liquidation), share the same
  risk engine, and run through the same backtester so you can **compare them on
  identical history** and let the numbers decide.

> Backtest both before committing: `STRATEGY=trend npm run backtest -- --bars 3000`
> vs `STRATEGY=sr npm run backtest -- --bars 3000`.
- **Risk management:** sizes every trade to risk a fixed fraction of equity
  (default **1%**), one position at a time, a **weekly trade cap** (default 3),
  and a **daily-loss circuit breaker** that halts new entries.
- **Three modes, one codebase:**
  1. **Backtest** — replay the strategy over historical candles.
  2. **Paper** — live prices, simulated money (default).
  3. **Live** — real Bybit orders (off unless explicitly enabled & armed).

---

## Quick start

```bash
npm install
cp .env.example .env.local      # tweak if you like; defaults are sane

# 1) Backtest on BTC history (needs Bybit reachable; see "offline" below)
npm run backtest -- --bars 1500 --interval 240 --grade A+

# 2) Run the dashboard (paper mode) at http://localhost:3000
npm run dev

# 3) Run the bot loop (paper) — scans every minute, trades on A+ setups
npm run bot
```

### Offline / no Bybit access

Some networks block `api.bybit.com` (the build sandbox does). Use the deterministic
mock data source to explore everything without a connection:

```bash
MARKET_DATA_SOURCE=mock npm run dev
MARKET_DATA_SOURCE=mock npm run backtest -- --bars 1500 --grade B
```

Mock data is synthetic — good for trying the UI and the engine, **useless for
judging the strategy**. Use real Bybit data (or a CSV) for that.

### Backtest from a CSV (fully offline, real data)

```bash
npm run backtest -- --csv path/to/btc_4h.csv
# CSV columns: time,open,high,low,close,volume   (time = unix s/ms or ISO)
```

---

## Going live (real money) — do this carefully

The rollout is **backtest → paper → Bybit testnet → mainnet**. Live orders are
placed **only** when all of the following are true:

1. `TRADING_MODE=live`
2. `BOT_ARMED=true`
3. `BYBIT_API_KEY` and `BYBIT_API_SECRET` are set

**Always validate on Bybit testnet first:**

```bash
# .env.local
TRADING_MODE=live
BOT_ARMED=true
BYBIT_BASE_URL=https://api-testnet.bybit.com   # TESTNET
BYBIT_API_KEY=...        # testnet keys from testnet.bybit.com
BYBIT_API_SECRET=...
```

Only after testnet behaves correctly, switch `BYBIT_BASE_URL` back to
`https://api.bybit.com` and fund the account (e.g. ~60 USDT ≈ NZ$100).

- Create API keys with **spot trading** permission. Do **not** enable withdrawals.
- The live order path is **experimental** and cannot be exercised from the build
  sandbox — that is exactly why testnet-first is mandatory.
- Optional crash-safety: set `USE_EXCHANGE_STOP=true` to also rest a stop order on
  the exchange at entry (test it on testnet first). Even without it, the running
  bot actively monitors and exits at the stop.

### Notes on a small account

With ~US$60 and a 1% risk-per-trade, each trade risks well under a dollar, and
exchange fees (~0.1%/side) are a meaningful fraction of a tight stop. The strategy
enforces a **minimum stop distance** (`MIN_STOP_PCT`, default 0.5%) so fees don't
dominate the risk. Treat a small live account as real-skin learning money.

---

## Configuration (`.env.local`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `MARKET_DATA_SOURCE` | `bybit` | `bybit` (live data) or `mock` (offline) |
| `BYBIT_BASE_URL` | `https://api.bybit.com` | mainnet, or testnet URL |
| `BYBIT_CATEGORY` | `spot` | product category |
| `SYMBOL` | `BTC` | base symbol (paired with quote → `BTCUSDT`) |
| `QUOTE_CURRENCY` | `USDT` | quote currency / cash |
| `PRIMARY_INTERVAL` | `240` | trading timeframe (Bybit code; 240 = 4h) |
| `STARTING_BALANCE` | `10000` | paper starting cash |
| `RISK_PER_TRADE` | `0.01` | fraction of equity risked per trade |
| `RISK_REWARD` | `2` | reward:risk target (2 = 2:1) |
| `MAX_TRADES_PER_WEEK` | `3` | selectivity cap |
| `DAILY_LOSS_LIMIT_PCT` | `0.06` | halt new entries after this daily loss |
| `MIN_GRADE` | `A+` | lowest setup grade the bot trades |
| `MIN_STOP_PCT` | `0.005` | noise floor on stop distance |
| `FEE_RATE` | `0.001` | simulated taker fee per side |
| `TRADING_MODE` | `paper` | `paper` or `live` |
| `BOT_ARMED` | `false` | master live-trading switch |
| `USE_EXCHANGE_STOP` | `false` | rest a stop order on the exchange at entry |
| `POLL_INTERVAL_SEC` | `60` | bot loop cadence |
| `WEBHOOK_URL` | – | optional notifier (Discord/Slack-style) |
| `NZD_PER_USD` | `1.66` | display-only FX for NZD figures |

---

## Project layout

```
src/
  lib/
    strategy/        S/R zone detection + A+ setup → TradePlan
    indicators.ts    swing pivots, ATR, reaction candles
    backtest/        event-driven backtester (+ CSV loader)
    exchange/        MarketDataProvider + Broker interfaces
                     bybit-market, mock-market, paper-broker, bybit-broker (live)
    trading/         engine (decision loop), risk (sizing/gating), account (P&L)
    bot/             the live/paper run loop
    notify/          console + webhook notifiers
    storage/         file-backed account state
    server/          dashboard data assemblers (server-only)
  app/               Next.js dashboard + API routes
  components/        UI + lightweight-charts price chart
scripts/             bot.ts, backtest.ts (CLI entrypoints)
```

## Commands

| Command | What |
| --- | --- |
| `npm run dev` | dashboard (dev) at :3000 |
| `npm run build` / `start` | production build / serve |
| `npm run bot` | run the bot loop (`-- --once` for a single cycle) |
| `npm run backtest` | run a backtest (see flags above) |
| `npm test` | unit + integration tests (vitest) |
| `npm run typecheck` | `tsc --noEmit` |

## Caveats & honesty

- Backtests fill at the signal-bar close and don't model slippage; treat results
  as optimistic. Live fills will differ.
- The mock data source has no predictive value — it only exercises the plumbing.
- The live broker is implemented to Bybit's V5 docs but is **untested against a
  real exchange from here**; testnet validation is on you and is non-negotiable.
- Past backtest performance does not predict future results.
