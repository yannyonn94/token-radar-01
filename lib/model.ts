// The token radar's model (radar-2): one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and may add
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// Implied value follows only from the snapshot's own figures:
//
//   base       = tvl_usd x CATEGORY_MULTIPLE  (median mcap/TVL of the category's live peers, clamped)
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   chain      = 1 + 0.02 x min(extra_chains, 4)
//   implied    = max(1, round(base x growthMult x maturity x chain))
//
// No protocol name is ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_floor: number;
  multiple_cap: number;
  chain_step: number;
  chain_max_extra: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.2,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  multiple_floor: 0.05,
  multiple_cap: 0.6,
  chain_step: 0.02,
  chain_max_extra: 4,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 200;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    category_multiple: number;
    category_peers: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  category_multiple: number;
  category_peers: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  comparables: Record<string, { multiple: number; peers: number }>;
  watchlist: string[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

// ... (continued from previous file write)

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Median of a list of numbers. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** The category multiples derived from the snapshot's live protocols. */
export function categoryMultiples(snapshot: Snapshot): Record<string, { multiple: number; peers: number }> {
  const byCategory: Record<string, number[]> = {};
  const allRatios: number[] = [];

  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null && p.tvl_usd > 0) {
      const ratio = p.mcap_usd / p.tvl_usd;
      allRatios.push(ratio);
      if (p.category) {
        if (!byCategory[p.category]) byCategory[p.category] = [];
        byCategory[p.category].push(ratio);
      }
    }
  }

  const fallbackMedian = median(allRatios);
  const fallbackClamped = Math.min(MODEL.multiple_cap, Math.max(MODEL.multiple_floor, fallbackMedian));
  const result: Record<string, { multiple: number; peers: number }> = {};

  for (const [cat, ratios] of Object.entries(byCategory)) {
    if (ratios.length >= 3) {
      const med = median(ratios);
      result[cat] = {
        multiple: Math.min(MODEL.multiple_cap, Math.max(MODEL.multiple_floor, med)),
        peers: ratios.length,
      };
    }
  }

  return { __fallback__: { multiple: fallbackClamped, peers: allRatios.length }, ...result };
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  comparables: Record<string, { multiple: number; peers: number }>,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null; categoryMultiple: number; categoryPeers: number } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;

  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;

  const extraChains = Math.max(protocol.chains.length - 1, 0);
  const chainMult = 1 + model.chain_step * Math.min(extraChains, model.chain_max_extra);

  const catData = (protocol.category && comparables[protocol.category]) || comparables['__fallback__'];
  const categoryMultiple = catData ? catData.multiple : model.base_multiple;
  const categoryPeers = catData ? catData.peers : 0;

  const base = protocol.tvl_usd * categoryMultiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * chainMult));

  return { implied, growthPct, growthMult, maturityMult, chainMult, age, categoryMultiple, categoryPeers };
}

/** Generate the 6 farm steps for a protocol based on its data. */
export function farmSteps(protocol: SnapshotProtocol, age: number | null): string[] {
  const steps: string[] = [];

  // Step 1: Fresh wallet
  steps.push('Use a fresh wallet and store the seed phrase offline Cost: $0 Time: 5 minutes');

  // Step 2: Main action by category
  let action = 'Deposit USDC';
  const cat = protocol.category || '';
  if (/Lending|CDP/.test(cat)) action = 'Supply USDC into the lending market';
  else if (/Dex|Yield/.test(cat)) action = 'Provide liquidity to the primary pool';
  else if (/Bridge/.test(cat)) action = 'Bridge USDC to the protocol';
  else if (/Staking|Restaking/.test(cat)) action = 'Stake the protocol’s native asset or USDC';
  else if (/Perpetual|Derivative/.test(cat)) action = 'Deposit margin in USDC';
  else if (/Curator|Allocator|Risk/.test(cat)) action = 'Deposit USDC into the vault';
  else if (/RWA/.test(cat)) action = 'Mint the yield-bearing RWA asset';

  let cost = '$50';
  if (protocol.tvl_usd >= 5_000_000_000) cost = '$250';
  else if (protocol.tvl_usd >= 1_000_000_000) cost = '$150';
  else if (protocol.tvl_usd >= 100_000_000) cost = '$100';

  steps.push(`${action} Cost: ${cost} Time: 20 minutes`);

  // Step 3: Weekly qualification
  steps.push(`Perform one weekly qualifying action (e.g., swap, stake, or vote) Cost: $5 gas Time: 10 minutes per week`);

  // Step 4: Hold duration
  let holdDays = 30;
  if (age !== null) {
    if (age < 180) holdDays = 60;
    else if (age < 365) holdDays = 45;
    else holdDays = 30;
  }
  steps.push(`Hold the position for at least ${holdDays} days to qualify for potential rewards Cost: $0 Time: ${holdDays} days`);

  // Step 5: Claim safely
  steps.push('Claim tokens only via official links published by the protocol; never pay to claim Cost: $10 gas Time: 10 minutes');

  // Step 6: Logging
  steps.push('Record wallet address, dates, and all transaction hashes in your farm log Cost: $0 Time: 5 minutes');

  return steps.map((s) => {
    // Ensure length constraints 20-600 chars
    if (s.length < 20) return s.padEnd(20, '.');
    if (s.length > 600) return s.slice(0, 597) + '...';
    return s;
  });
}

/** Build the full radar board. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const comparables = categoryMultiples(snapshot);
  const watchSet = new Set(snapshot.watchlist);

  // Collect all rankable pre-token protocols
  const candidates: SnapshotProtocol[] = [];
  for (const p of snapshot.protocols) {
    if (isRankable(p)) {
      candidates.push(p);
    }
  }

  // Sort: watchlist first (by TVL desc), then early rows (by TVL desc)
  const scored = candidates.map((p) => {
    const val = impliedValue(p, snapshot.as_of, MODEL, comparables);
    return { p, val };
  });

  // Watchlist entries
  const watchRows = scored.filter((x) => watchSet.has(x.p.slug)).sort((a, b) => b.p.tvl_usd - a.p.tvl_usd);
  // Early rows: below floor, not in watchlist
  const earlyCandidates = scored
    .filter((x) => !watchSet.has(x.p.slug) && x.p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.p.tvl_usd - a.p.tvl_usd)
    .slice(0, EARLY_ROWS);

  const combined = [...watchRows, ...earlyCandidates];

  // Sort by implied value desc, tie-break slug A-Z
  combined.sort((a, b) => {
    if (b.val.implied !== a.val.implied) return b.val.implied - a.val.implied;
    return a.p.slug.localeCompare(b.p.slug);
  });

  return combined.map((x, idx) => {
    const p = x.p;
    const v = x.val;
    return {
      rank: idx + 1,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: 'pre-token',
      age_days: v.age,
      implied_value_usd: v.implied,
      model: {
        base_multiple: MODEL.base_multiple,
        category_multiple: v.categoryMultiple,
        category_peers: v.categoryPeers,
        growth_pct: v.growthPct,
        growth_multiplier: v.growthMult,
        maturity_multiplier: v.maturityMult,
        chain_multiplier: v.chainMult,
        age_days: v.age,
      },
      farm_steps: farmSteps(p, v.age),
    };
  });
}

/** Get the top live token rows. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd || 0) - (a.mcap_usd || 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** Parse and validate the snapshot JSON. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('Snapshot is not valid JSON');
  }

  if (typeof raw !== 'object' || raw === null) throw new SnapshotError('Snapshot must be an object');
  const obj = raw as Record<string, unknown>;

  if (typeof obj.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(obj.as_of)) throw new SnapshotError('as_of must be YYYY-MM-DD');
  if (typeof obj.source !== 'string') throw new SnapshotError('source must be a string');
  if (typeof obj.floor_usd !== 'number' || !Number.isInteger(obj.floor_usd) || obj.floor_usd <= 0)
    throw new SnapshotError('floor_usd must be a positive integer');

  if (!Array.isArray(obj.protocols)) throw new SnapshotError('protocols must be an array');
  if (!Array.isArray(obj.watchlist)) throw new SnapshotError('watchlist must be an array');
  if (!obj.watchlist.every((w) => typeof w === 'string')) throw new SnapshotError('watchlist must hold strings');

  const protocols: SnapshotProtocol[] = obj.protocols.map((p, i) => {
    if (typeof p !== 'object' || p === null) throw new SnapshotError(`protocols[${i}] must be an object`);
    const pp = p as Record<string, unknown>;
    if (typeof pp.slug !== 'string' || pp.slug.length === 0) throw new SnapshotError(`protocols[${i}].slug invalid`);
    if (typeof pp.name !== 'string' || pp.name.length === 0) throw new SnapshotError(`protocols[${i}].name invalid`);
    if (typeof pp.tvl_usd !== 'number' || !Number.isFinite(pp.tvl_usd)) throw new SnapshotError(`protocols[${i}].tvl_usd invalid`);
    return {
      slug: pp.slug,
      name: pp.name,
      category: pp.category === null || typeof pp.category === 'string' ? (pp.category as string | null) : null,
      chains: Array.isArray(pp.chains) ? pp.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: pp.tvl_usd,
      change_7d: typeof pp.change_7d === 'number' ? pp.change_7d : null,
      mcap_usd: typeof pp.mcap_usd === 'number' ? pp.mcap_usd : null,
      listed_at: typeof pp.listed_at === 'string' ? pp.listed_at : null,
      gecko_id: typeof pp.gecko_id === 'string' ? pp.gecko_id : null,
      symbol: typeof pp.symbol === 'string' ? pp.symbol : null,
    };
  });

  return { as_of: obj.as_of, source: obj.source, floor_usd: obj.floor_usd, protocols, watchlist: obj.watchlist as string[] };
}

/** Check board for gate issues. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `board has ${board.length} rows, need at least 100`;
  const watchSet = new Set(snapshot.watchlist);
  const slugs = new Set(board.map((r) => r.slug));
  for (const w of snapshot.watchlist) {
    if (!slugs.has(w)) return `watchlist slug missing: ${w}`;
  }

  for (let i = 0; i < board.length; i++) {
    if (board[i].rank !== i + 1) return `rank not sequential at index ${i}: ${board[i].rank}`;
    if (!Number.isInteger(board[i].implied_value_usd) || board[i].implied_value_usd <= 0)
      return `invalid implied value at rank ${board[i].rank}`;
    if (i > 0 && board[i].implied_value_usd > board[i - 1].implied_value_usd)
      return `implied value rises at rank ${board[i].rank}`;
    const steps = board[i].farm_steps;
    if (steps.length < 3 || steps.length > 12) return `farm_steps count out of range at rank ${board[i].rank}`;
    for (const s of steps) {
      const trimmed = s.trim();
      if (trimmed.length < 20 || trimmed.length > 600) return `farm step length out of range at rank ${board[i].rank}`;
    }
  }

  const allSame = board.every((r) => r.implied_value_usd === board[0].implied_value_usd);
  if (allSame) return 'all implied values are identical';

  return null;
}

/** Build the full radar data object. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const comparables = categoryMultiples(snapshot);

  const rows: RadarRow[] = board.map((r) => ({
    rank: r.rank,
    slug: r.slug,
    name: r.name,
    category: r.category,
    chains: r.chains,
    tvl_usd: r.tvl_usd,
    change_7d: r.change_7d,
    mcap_usd: r.mcap_usd,
    listed_at: r.listed_at,
    age_days: r.age_days,
    implied_value_usd: r.implied_value_usd,
    growth_multiplier: r.model.growth_multiplier,
    maturity_multiplier: r.model.maturity_multiplier,
    category_multiple: r.model.category_multiple,
    category_peers: r.model.category_peers,
    farm_steps: r.farm_steps,
  }));

  const watchCount = board.filter((r) => snapshot.watchlist.includes(r.slug)).length;

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: MODEL,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.length - watchCount,
    live_size: live.length,
    rows,
    live,
    comparables,
    watchlist: snapshot.watchlist,
  };

  return { board, radar };
}

/** Serialize radar data for browser consumption. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
