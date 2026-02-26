export interface ParsedOption { instrument: string; strike: number; expiry: string; expiryTs: number; type: 'C' | 'P'; markPrice: number; markIv: number; futuresPrice: number; dte: number; }
export interface CellData { apy: number; markIv: number; markPrice: number; futuresPrice: number; dte: number; premiumUsd: number; probExercise: number; greeks: { delta: number; gamma: number; theta: number; vega: number; }; }
export interface SuggestedTrade { instrument: string; type: 'HedgedCSP'; strike: number; expiry: string; dte: number; apy: number; markIv: number; futuresPrice: number; probExercise: number; premiumUsd: number; moneyness: number; }
export type Status = 'ok' | 'err' | 'load';

export function normCdf(x: number): number {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1; const t = 1 / (1 + p * Math.abs(x));
    return 0.5 * (1 + sign * (1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2)));
}

export function pEx(S: number, K: number, T: number, s: number, type: 'C' | 'P'): number {
    if (T <= 0 || s <= 0) return 0;
    const d2 = (Math.log(S / K) - 0.5 * s * s * T) / (s * Math.sqrt(T));
    return type === 'C' ? normCdf(d2) : normCdf(-d2);
}

export function bsGreeks(S: number, K: number, T: number, sigma: number, type: 'C' | 'P') {
    if (T <= 0 || sigma <= 0) return { delta: 0, gamma: 0, theta: 0, vega: 0 };
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
    const normPdf = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
    const Nd1 = normCdf(d1);
    const nPdfd1 = normPdf(d1);

    // r=0 assumptions for crypto
    const delta = type === 'C' ? Nd1 : Nd1 - 1;
    const gamma = nPdfd1 / (S * sigma * sqrtT);
    const vega = S * nPdfd1 * sqrtT / 100; // per 1% change in IV
    const theta = -(S * sigma * nPdfd1) / (2 * sqrtT) / 365; // per day

    return { delta, gamma, theta, vega };
}
export function parseInst(n: string) { const p = n.split('-'); return p.length === 4 ? { expiry: p[1], strike: +p[2], type: p[3] as 'C' | 'P' } : null; }
export function expiryToDate(e: string): Date {
    const M: Record<string, number> = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
    return new Date(Date.UTC(2000 + +e.slice(5), M[e.slice(2, 5)] ?? 0, +e.slice(0, 2), 8));
}
// Raw native APY if 100% allocated to covered puts
export const putApyHedged = (mp: number, fp: number, k: number, d: number) => {
    if (d <= 0 || k <= 0) return 0;
    const premiumUsd = mp * fp;
    return (premiumUsd / k) * (365 / d) * 100;
};

/* ═══════════════════════════════════════════════════════════════════
   SCORING ENGINE — 6-Factor Ladder Optimizer
   
   1. Expected Value (30%)       — risk-adjusted P&L
   2. Volatility Edge (20%)      — mark IV vs DVOL
   3. Risk-Return Ratio (20%)    — EV / conditional tail risk
   4. Theta Efficiency (15%)     — premium per day
   5. Kelly Fraction (10%)       — optimal sizing signal
   6. Strike Diversification (5%)— wider = more defensive
   ═══════════════════════════════════════════════════════════════════ */

export interface ScoredLadder {
    legs: SuggestedTrade[];
    score: number;          // 0–10 composite
    ev: number;             // expected value (USD)
    evAnnual: number;       // annualized EV
    volEdge: number;        // mean (markIV - DVOL) / DVOL
    thetaEff: number;       // premium per day
    riskReturn: number;     // EV / risk
    kelly: number;          // Kelly fraction
    diversification: number;// strike spread / futures
    probAllOTM: number;     // P(all legs expire worthless)
    totalPrem: number;
    avgApy: number;
    topFactor: string;      // human-readable top contributor
}

/* Conditional tail loss — expected loss given assignment (Black-Scholes) */
export function conditionalTailLoss(S: number, K: number, T: number, sigma: number, type: 'C' | 'P'): number {
    if (T <= 0 || sigma <= 0) return 0;
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;

    if (type === 'P') {
        // E[loss | assigned] = K × N(-d2) - S × N(-d1) for puts
        const Nd2 = normCdf(-d2);
        if (Nd2 < 1e-10) return 0;
        return Math.max(0, K * normCdf(-d2) - S * normCdf(-d1));
    } else {
        // E[loss | assigned] = S × N(d1) - K × N(d2) for calls (opportunity cost)
        const Nd2 = normCdf(d2);
        if (Nd2 < 1e-10) return 0;
        return Math.max(0, S * normCdf(d1) - K * normCdf(d2));
    }
}

/* Score a ladder combination — mixed-expiry safe (uses per-leg dte/fp) */
export function scoreLadder(legs: SuggestedTrade[], dvolVal: number | null): Omit<ScoredLadder, 'topFactor'> & { factors: number[] } {
    const n = legs.length;
    const dv = dvolVal || 57;

    let totalEv = 0, totalRisk = 0, totalPrem = 0, totalApy = 0, volEdgeSum = 0, thetaSum = 0;

    for (const l of legs) {
        const sigma = l.markIv / 100;
        const T = l.dte / 365;
        const pITM = l.probExercise;
        const tailLoss = conditionalTailLoss(l.futuresPrice, l.strike, T, sigma, 'P');
        const ev = l.premiumUsd * (1 - pITM) - tailLoss * pITM;
        const maxLoss = Math.max(0, tailLoss);
        totalEv += ev;
        totalRisk += pITM * maxLoss;
        totalPrem += l.premiumUsd;
        totalApy += l.apy;
        volEdgeSum += (l.markIv - dv) / Math.max(dv, 1);
        thetaSum += l.premiumUsd / l.dte;
    }

    const avgDte = legs.reduce((s, l) => s + l.dte, 0) / n;
    const fp0 = legs[0].futuresPrice;
    const avgApy = totalApy / n;
    const evAnnual = totalEv * (365 / avgDte);
    const volEdge = volEdgeSum / n;
    const thetaEff = thetaSum;                            // sum of per-leg θ
    const riskReturn = totalRisk > 0 ? totalEv / totalRisk : 0;
    const maxPex = Math.max(...legs.map(l => l.probExercise));
    const probAllOTM = 1 - maxPex;
    const avgLoss = totalRisk / Math.max(maxPex, 0.01);
    const kelly = totalPrem > 0 ? Math.max(0, probAllOTM - maxPex * avgLoss / totalPrem) : 0;
    const strikes = legs.map(l => l.strike);
    const diversification = (Math.max(...strikes) - Math.min(...strikes)) / fp0;
    const factors = [evAnnual, Math.max(0, volEdge), riskReturn, thetaEff, kelly, diversification];

    return { legs, score: 0, ev: totalEv, evAnnual, volEdge, thetaEff, riskReturn, kelly, diversification, probAllOTM, totalPrem, avgApy, factors };
}

/* Min-max normalize and compute weighted composite */
export function rankLadders(candidates: ReturnType<typeof scoreLadder>[]): ScoredLadder[] {
    if (!candidates.length) return [];
    const W = [0.30, 0.20, 0.20, 0.15, 0.10, 0.05]; // EV, volEdge, riskReturn, theta, kelly, div
    const factorNames = ['Expected Value', 'Vol Edge', 'Risk/Return', 'Theta', 'Kelly', 'Diversification'];

    // Min-max normalize each factor
    const nFactors = 6;
    const mins = Array(nFactors).fill(Infinity);
    const maxs = Array(nFactors).fill(-Infinity);
    for (const c of candidates) {
        for (let i = 0; i < nFactors; i++) {
            mins[i] = Math.min(mins[i], c.factors[i]);
            maxs[i] = Math.max(maxs[i], c.factors[i]);
        }
    }

    return candidates.map(c => {
        let score = 0;
        let topContrib = 0;
        let topIdx = 0;
        for (let i = 0; i < nFactors; i++) {
            const range = maxs[i] - mins[i];
            const norm = range > 1e-10 ? (c.factors[i] - mins[i]) / range : 0.5;
            const contrib = W[i] * norm;
            score += contrib;
            if (contrib > topContrib) { topContrib = contrib; topIdx = i; }
        }
        // Scale to 0-10
        const score10 = Math.min(10, Math.max(0, score * 10));
        const topFactor = factorNames[topIdx];
        return { ...c, score: score10, topFactor };
    }).sort((a, b) => b.score - a.score);
}

/* Generic k-combination generator (without repetition) */
export function combinations<T>(arr: T[], k: number): T[][] {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const [first, ...rest] = arr;
    return [
        ...combinations(rest, k - 1).map(c => [first, ...c]),
        ...combinations(rest, k),
    ];
}

/* k-combination WITH repetition — same option can appear multiple times in a ladder */
export function combinationsWithRep<T>(arr: T[], k: number): T[][] {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];
    const [first, ...rest] = arr;
    return [
        ...combinationsWithRep(arr, k - 1).map(c => [first, ...c]), // allow repeat
        ...combinationsWithRep(rest, k),                              // skip first
    ];
}

/* Combinatorial search: all valid numLegs-strike combos for an expiry */
export function buildOptimalLadder(trades: SuggestedTrade[], dvolVal: number | null, numLegs: number, allowRep: boolean): ScoredLadder | null {
    const ofType = trades.filter(t => t.type === 'HedgedCSP');
    if (!allowRep && ofType.length < numLegs) return null;
    if (allowRep && ofType.length === 0) return null;

    // Deduplicate by strike+expiry
    const unique = new Map<string, SuggestedTrade>();
    for (const t of ofType) {
        const key = `${t.strike}-${t.expiry}`;
        if (!unique.has(key)) unique.set(key, t);
    }
    const all = Array.from(unique.values()).sort((a, b) => b.apy - a.apy);

    const allCandidates: ReturnType<typeof scoreLadder>[] = [];
    const perExpiryCap = allowRep ? Math.min(5, numLegs + 2) : Math.max(8, numLegs + 5);

    // ── Same-expiry combinations ─────────────
    const byExpiry = new Map<string, SuggestedTrade[]>();
    for (const t of all) {
        const arr = byExpiry.get(t.expiry) || [];
        arr.push(t);
        byExpiry.set(t.expiry, arr);
    }
    for (const [, expTrades] of Array.from(byExpiry.entries())) {
        const opts = expTrades.sort((a, b) => b.strike - a.strike).slice(0, perExpiryCap);
        if (!allowRep && opts.length < numLegs) continue;
        if (allowRep && opts.length === 0) continue;
        const combos = allowRep ? combinationsWithRep(opts, numLegs) : combinations(opts, numLegs);
        for (const combo of combos)
            allCandidates.push(scoreLadder(combo, dvolVal));
    }

    // ── Cross-expiry combinations ────────
    const topCap = allowRep ? 8 : 15;
    const top = all.slice(0, topCap);
    if ((allowRep && top.length > 0) || (!allowRep && top.length >= numLegs)) {
        const seen = new Set<string>();
        const combos = allowRep ? combinationsWithRep(top, numLegs) : combinations(top, numLegs);
        for (const combo of combos) {
            const key = combo.map(x => `${x.strike}-${x.expiry}`).join('|');
            if (!seen.has(key)) { seen.add(key); allCandidates.push(scoreLadder(combo, dvolVal)); }
        }
    }

    if (!allCandidates.length) return null;
    const ranked = rankLadders(allCandidates);
    return ranked[0] || null;
}
