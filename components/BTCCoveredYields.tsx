"use client";
import React, { useState, useEffect, useMemo } from 'react';
import mermaid from 'mermaid';
import { fetchMorphoRates } from '../services/morphoProvider';

/* ═══════════════════════════════════════════════════════════════════
   BTCCoveredYields — Derive.xyz Inspired Design
   
   Color: dark slate bg, green/yellow accents for APR heat
   Font: Inter with tabular-nums for data alignment
   Layout: tight rows, collapsed borders, 1px slate-800 dividers
   ═══════════════════════════════════════════════════════════════════ */

import {
    ParsedOption, CellData, SuggestedTrade, Status, ScoredLadder,
    pEx, bsGreeks, parseInst, expiryToDate, putApyHedged,
    buildOptimalLadder
} from '../utils/optionsMath';

/* Hover tooltip — CSS-only, no state, defined once at module level */
const Tip = ({ text, children }: { text: string; children: React.ReactNode }) => (
    <span style={{ position: 'relative', cursor: 'help', borderBottom: '1px dotted var(--text-muted)', color: 'var(--text-secondary)', display: 'inline-block' }} className="tip-wrap">
        {children}
        <span className="tip-popup" style={{
            position: 'absolute', bottom: 'calc(100% + 4px)', left: '50%', transform: 'translateX(-50%)',
            backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-strong)', borderRadius: '4px',
            padding: '4px 8px', fontSize: 'var(--t-meta)', lineHeight: '1.35', color: 'var(--text-primary)',
            width: '200px', textAlign: 'left', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            pointerEvents: 'none', opacity: 0, transition: 'opacity 0.15s', zIndex: 9999, whiteSpace: 'normal',
        }}>{text}</span>
        <style>{`.tip-wrap:hover .tip-popup { opacity: 1 !important; }`}</style>
    </span>
);

/* Derive-style heat color */
function heatColor(apy: number, type: 'P' | 'C', dark: boolean): string {
    const i = Math.min(Math.max(apy, 0), 120) / 120;
    if (dark) {
        return type === 'P'
            ? `rgba(34,197,94,${0.03 + i * 0.22})`
            : `rgba(234,179,8,${0.03 + i * 0.18})`;
    }
    return type === 'P'
        ? `rgba(34,197,94,${0.05 + i * 0.25})`
        : `rgba(234,179,8,${0.05 + i * 0.2})`;
}
mermaid.initialize({
    startOnLoad: true,
    theme: 'dark',
    themeVariables: {
        fontSize: '20px',
        fontFamily: 'Inter',
        primaryColor: '#b39ddb',
        edgeLabelBackground: '#0f172a'
    }
});

const MermaidDiagram = ({ chart }: { chart: string }) => {
    const [svg, setSvg] = useState('');
    useEffect(() => {
        mermaid.render('mermaid-chart', chart).then(res => setSvg(res.svg)).catch(e => console.error(e));
    }, [chart]);
    return <div dangerouslySetInnerHTML={{ __html: svg }} style={{ display: 'flex', justifyContent: 'center' }} />;
};

export default function BTCCoveredYields({ darkMode }: { darkMode: boolean }) {
    const [hoverTip, setHoverTip] = useState<{ d: any; x: number; y: number } | null>(null);
    const [pinnedTip, setPinnedTip] = useState<{ d: any; x: number; y: number } | null>(null);
    const [pinnedKey, setPinnedKey] = useState<string | null>(null);
    const [spot, setSpot] = useState<{ v: number; c: number; cp: number } | null>(null);
    const [dvol, setDvol] = useState<{ v: number; cp: number } | null>(null);
    const [opts, setOpts] = useState<ParsedOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [trades, setTrades] = useState<SuggestedTrade[]>([]);
    const [locked, setLocked] = useState<Set<string>>(new Set());
    const [sugAt, setSugAt] = useState<Date | null>(null);
    const [dataAt, setDataAt] = useState<Date | null>(null);
    const [st, setSt] = useState<{ spot: Status; opt: Status; dvol: Status }>({ spot: 'load', opt: 'load', dvol: 'load' });
    const [maxPexCap, setMaxPexCap] = useState(40); // P(exercise) cap 0–100, default 40%
    const [numLegs, setNumLegs] = useState(0);       // 0 = Auto, 1-5 = fixed
    const [allowRep, setAllowRep] = useState(false); // allow repetitive legs

    // Dynamic Starting Amounts
    const [amounts, setAmounts] = useState<{ principal: number, cbBtcRatio: number }>({ principal: 1000, cbBtcRatio: 50 });

    // Live Morpho Rates
    const [morphoRates, setMorphoRates] = useState<{ cbBtcSupply: number, usdcBorrow: number }>({
        cbBtcSupply: 0.0, usdcBorrow: 3.5
    });

    useEffect(() => {
        fetchMorphoRates().then(setMorphoRates).catch(console.error);
    }, []);

    // Compute best ladders — memoized; in Auto mode sweeps all leg counts 1–5
    const computedHedged = useMemo(() => {
        if (!trades.length) return null as ScoredLadder | null;
        if (numLegs === 0) {
            let top: ScoredLadder | null = null;
            for (let n = 1; n <= 5; n++) {
                const l = buildOptimalLadder(trades, dvol?.v || null, n, allowRep);
                if (l && (!top || l.score > top.score)) top = l;
            }
            return top;
        }
        return buildOptimalLadder(trades, dvol?.v || null, numLegs, allowRep);
    }, [trades, dvol, numLegs, allowRep]);

    // Set of keys for options that are currently recommended (used to highlight them in the matrix)
    const recommendedKeys = useMemo(() => {
        const s = new Set<string>();
        const addL = (l: ScoredLadder | null) => {
            if (l && l.score >= 5.0) {
                l.legs.forEach(leg => s.add(`HP-${leg.strike}-${leg.expiry}`));
            }
        };
        addL(computedHedged);
        return s;
    }, [computedHedged]);

    const tip = pinnedTip || hoverTip;
    const toggleLock = (k: string) => setLocked(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

    // ── Fetch (5s) ────────────────────────────────────────────────
    useEffect(() => {
        const go = async () => {
            const ns = { spot: 'load' as Status, opt: 'load' as Status, dvol: 'load' as Status };
            try { const r = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT'); const d = await r.json(); const v = +d.lastPrice; if (v > 0) { setSpot({ v, c: +d.priceChange, cp: +d.priceChangePercent }); ns.spot = 'ok'; } else ns.spot = 'err'; } catch { ns.spot = 'err'; }
            try { const now = Date.now(); const r = await fetch(`https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=BTC&resolution=3600&start_timestamp=${now - 86520000}&end_timestamp=${now}`); const d = await r.json(); if (d.result?.data?.length > 0) { const a = d.result.data; const l = a[a.length - 1][4] ?? a[a.length - 1][1]; const f = a[0][1]; setDvol({ v: l, cp: ((l - f) / f) * 100 }); ns.dvol = 'ok'; } else ns.dvol = 'err'; } catch { ns.dvol = 'err'; }
            try {
                const r = await fetch('https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option');
                const d = await r.json();
                if (!d.result?.length) { ns.opt = 'err'; setLoading(false); setSt(ns); return; }
                ns.opt = 'ok'; const now = Date.now(); const arr: ParsedOption[] = [];
                for (const it of d.result) {
                    const info = parseInst(it.instrument_name); if (!info || it.mark_price <= 0 || it.underlying_price <= 0 || info.strike % 1000 !== 0) continue;
                    const ed = expiryToDate(info.expiry); const dte = Math.max(0, Math.ceil((ed.getTime() - now) / 86400000)); if (dte <= 0) continue;
                    arr.push({ instrument: it.instrument_name, strike: info.strike, expiry: info.expiry, expiryTs: ed.getTime(), type: info.type, markPrice: it.mark_price, markIv: it.mark_iv, futuresPrice: it.underlying_price, dte });
                }
                setOpts(arr); setLoading(false); setDataAt(new Date());
            } catch { ns.opt = 'err'; setLoading(false); }
            setSt(ns);
        };
        go(); const iv = setInterval(go, 15000); return () => clearInterval(iv);
    }, []);

    // ── Suggested trades (60s, DTE ≥ 15) ──────────────────────────
    useEffect(() => {
        if (!opts.length) return;
        const compute = () => {
            const t: SuggestedTrade[] = [];
            for (const o of opts) {
                if (o.dte < 15 || o.type === 'C') continue; // Only process Puts
                const m = o.futuresPrice / o.strike;
                if (m < 1 || m > 1.15) continue;
                const pe = pEx(o.futuresPrice, o.strike, o.dte / 365, o.markIv / 100, o.type);
                if (pe > maxPexCap / 100) continue; // Only strategies with ≤ maxPexCap% P(exercise)

                const apyHedged = putApyHedged(o.markPrice, o.futuresPrice, o.strike, o.dte);
                if (apyHedged > 5 && apyHedged <= 200) {
                    t.push({ instrument: o.instrument, type: 'HedgedCSP', strike: o.strike, expiry: o.expiry, dte: o.dte, apy: apyHedged, markIv: o.markIv, futuresPrice: o.futuresPrice, probExercise: pe, premiumUsd: o.markPrice * o.futuresPrice, moneyness: (m - 1) * 100 });
                }
            }
            t.sort((a, b) => b.apy - a.apy);
            setTrades(t.slice(0, Math.max(15, numLegs * 4))); setSugAt(new Date());
        };
        compute(); const iv = setInterval(compute, 15000); return () => clearInterval(iv);
    }, [opts, maxPexCap, morphoRates, amounts]);

    // ── Derived data (DTE ≥ 15) ───────────────────────────────────
    const { exps, putK, cells } = useMemo(() => {
        if (!opts.length) return { exps: [] as any[], putK: [] as number[], cells: {} as Record<string, CellData> };
        const f = opts.filter(o => o.dte >= 15 && o.type === 'P');
        const em = new Map<string, { ts: number; dte: number; fp: number }>();
        for (const o of f) if (!em.has(o.expiry)) em.set(o.expiry, { ts: o.expiryTs, dte: o.dte, fp: o.futuresPrice });
        const exps = Array.from(em.entries()).map(([l, d]) => ({ label: l, ...d })).sort((a, b) => a.ts - b.ts);
        const ref = exps[0]?.fp || (spot?.v || 60000);
        const pS = new Set<number>();
        for (const o of f) { if (o.type === 'P' && o.strike <= ref) pS.add(o.strike); }
        const putK = Array.from(pS).sort((a, b) => b - a).slice(0, 10);
        const cells: Record<string, CellData> = {};
        for (const o of f) {
            const pe = pEx(o.futuresPrice, o.strike, o.dte / 365, o.markIv / 100, o.type);
            const greeks = bsGreeks(o.futuresPrice, o.strike, o.dte / 365, o.markIv / 100, o.type);

            const kHP = `HP-${o.strike}-${o.expiry}`;
            cells[kHP] = {
                apy: putApyHedged(o.markPrice, o.futuresPrice, o.strike, o.dte),
                markIv: o.markIv, markPrice: o.markPrice, futuresPrice: o.futuresPrice, dte: o.dte, premiumUsd: o.markPrice * o.futuresPrice, probExercise: pe, greeks
            };
        }
        return { exps, putK, cells };
    }, [opts, spot, morphoRates, amounts]);

    /* ── Cell (Derive-style: tabular-nums, tight, subtle heat bg) ── */
    const dataFont: React.CSSProperties = {
        fontFamily: 'var(--font-ui)',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 'var(--t-data)',
        lineHeight: '1.3',
        whiteSpace: 'nowrap',
        textAlign: 'center',
    };

    const renderCell = (type: 'HP', strike: number, exp: { label: string; dte: number }) => {
        const k = `${type}-${strike}-${exp.label}`; const d = cells[k]; const isL = locked.has(k); const isP = pinnedKey === k;

        if (!d) return (
            <td key={k} style={{ ...dataFont, color: 'var(--text-muted)', padding: '4px 6px', borderBottom: '1px solid var(--border-color)' }}>—</td>
        );

        const { apy, probExercise: pe, greeks } = d;
        const excluded = pe > maxPexCap / 100;
        const isRec = recommendedKeys.has(k);
        const bg = isP
            ? 'rgba(37,99,235,0.2)'  /* blue highlight when pinned */
            : isL ? 'rgba(37,99,235,0.1)'
                : excluded ? 'transparent'
                    : isRec ? 'rgba(34,197,94,0.25)'
                        : heatColor(apy, 'P', darkMode);
        const det = { type: 'HedgedCSP', strike, exp: exp.label, apy: apy.toFixed(1), dte: d.dte, markIv: d.markIv.toFixed(1), markPrice: d.markPrice, futuresPrice: d.futuresPrice, premiumUsd: d.premiumUsd, probExercise: pe, greeks };

        return (
            <td key={k}
                onClick={(e) => { if (pinnedKey === k) { setPinnedKey(null); setPinnedTip(null); } else { setPinnedKey(k); setPinnedTip({ d: det, x: e.clientX, y: e.clientY }); } toggleLock(k); }}
                onMouseEnter={(e) => { if (!pinnedKey) setHoverTip({ d: det, x: e.clientX, y: e.clientY }); }}
                onMouseLeave={() => { if (!pinnedKey) setHoverTip(null); }}
                style={{
                    ...dataFont,
                    backgroundColor: bg,
                    color: excluded ? 'var(--text-muted)' : (isRec ? 'var(--green)' : 'var(--text-primary)'),
                    opacity: excluded ? 0.6 : 1,
                    padding: '3px 5px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border-color)',
                    borderLeft: isP ? '2px solid var(--blue)' : 'none',
                    boxShadow: isRec ? `inset 0 0 0 1.5px var(--green)` : 'none',
                    position: 'relative',
                    transition: 'background 0.15s, opacity 0.15s',
                }}>
                <span style={{ fontWeight: !excluded && (isRec || apy > 30) ? 700 : 400 }}>{apy.toFixed(1)}%</span>
                <span style={{ fontSize: 'var(--t-micro)', color: isRec ? 'inherit' : 'var(--text-muted)', marginLeft: '2px', opacity: isRec ? 0.8 : 1 }}>{(pe * 100).toFixed(0)}%</span>
                <span style={{ display: 'block', fontSize: 'var(--t-micro)', color: isRec ? 'inherit' : 'var(--text-muted)', opacity: isRec ? 0.8 : 1, lineHeight: '1' }}>{(d.premiumUsd / d.futuresPrice).toFixed(4)}฿</span>
                {(isL || isP) && <span style={{ position: 'absolute', top: 0, right: 1, fontSize: '0.5rem', color: 'var(--blue)' }}>●</span>}
            </td>
        );
    };



    /* Status dot — Derive style (minimal, no label bg) */
    const Dot = ({ s, label }: { s: Status; label: string }) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: 'var(--t-label)', fontWeight: 500, color: 'var(--text-secondary)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: s === 'ok' ? 'var(--green)' : s === 'err' ? 'var(--red)' : 'var(--yellow)', boxShadow: s === 'ok' ? '0 0 4px var(--green)' : 'none' }} />
            {label}
        </span>
    );

    /* ── Table (Derive-style: no cell borders, just row dividers) ── */
    const Table = ({ type, strikes, accentColor, label }: { type: 'HP'; strikes: number[]; accentColor: string; label: string }) => (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ fontSize: 'var(--t-label)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-strong)', paddingBottom: '4px', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px', flex: '0 0 auto' }}>
                <span style={{ width: '8px', height: '3px', backgroundColor: accentColor, borderRadius: '1px', display: 'inline-block' }} />
                {label}
            </div>
            <div style={{ overflow: 'auto', flex: '1 1 auto', minHeight: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                        <th style={{ color: 'var(--text-muted)', textAlign: 'left', padding: '3px 5px', fontSize: 'var(--t-label)', fontWeight: 500, whiteSpace: 'nowrap', position: 'sticky', top: 0, left: 0, backgroundColor: 'var(--bg-panel)', zIndex: 2, borderBottom: '1px solid var(--border-strong)' }}>Strike</th>
                        {exps.map(e => <th key={`${type}-h-${e.label}`} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3px 3px', fontSize: 'var(--t-label)', fontWeight: 500, whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: 'var(--bg-panel)', zIndex: 1, borderBottom: '1px solid var(--border-strong)' }}>{e.label}</th>)}
                    </tr></thead>
                    <tbody>
                        {!strikes.length
                            ? <tr><td colSpan={exps.length + 1} style={{ textAlign: 'center', padding: '8px', color: 'var(--text-muted)', fontSize: 'var(--t-label)' }}>{loading ? 'Loading…' : 'No data'}</td></tr>
                            : strikes.map(s => (
                                <tr key={`${type}-${s}`} style={{ transition: 'background 0.1s' }}
                                    onMouseEnter={(e) => { if (!pinnedKey) e.currentTarget.style.background = 'var(--bg-row-hover)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}>
                                    <td style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', padding: '3px 5px', fontSize: 'var(--t-data)', whiteSpace: 'nowrap', position: 'sticky', left: 0, backgroundColor: 'var(--bg-panel)', zIndex: 1, borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>${s.toLocaleString()}</td>
                                    {exps.map(e => renderCell(type, s, e))}
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const lltv = 0.86;
    const currentLtv = amounts.cbBtcRatio > 0 ? (0.50) : 0;
    const dropToLiquidate = spot ? (1 - (currentLtv / lltv)) * 100 : 33.3;
    const liqPrice = spot ? (spot.v * (currentLtv / lltv)).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '...';
    const rallyPrice = spot ? (spot.v * 1.490).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '...';

    // cbBTC and USDC funds based on principal
    const cbBtcFunds = (amounts.principal * (amounts.cbBtcRatio / 100)).toFixed(0);
    const usdcFunds = (amounts.principal * (1 - amounts.cbBtcRatio / 100)).toFixed(0);
    const borrowedAmount = (amounts.principal * (amounts.cbBtcRatio / 100) * 0.50).toFixed(0);
    const totalDeribitMargin = (Number(usdcFunds) + Number(borrowedAmount)).toFixed(0);

    const chartStr = `
graph LR
    A["Initial<br>$${amounts.principal}"] --- B["$${cbBtcFunds} cbBTC"]
    A --- C["$${usdcFunds} USDC"]

    subgraph Morpho [Morpho: cbBTC Pool]
        B --> D["Deposit cbBTC<br>+${morphoRates.cbBtcSupply}% APY"]
        D --> E["Borrow $${borrowedAmount} USDC<br>-3.0% APY"]
        D -.-> Liq["LIQUIDATION<br>Drop to $${liqPrice}"]
    end

    subgraph Deribit [Deribit: Portfolio Margin]
        C --> F["$${totalDeribitMargin}<br>USDC Margin"]
        E -.-> F
        F --> G{Strategy}
        
        G --> H["Short $${cbBtcFunds} BTC Perp<br>+11.0% Funding"]
        H -.-> MC["MARGIN CALL<br>Rally to $${rallyPrice}"]
        
        G --> I["Sell Puts<br>+Premium APY"]
    end

    classDef morpho fill:#4f46e5,stroke:#fff,stroke-width:4px,color:#fff;
    classDef deribit fill:#10b981,stroke:#fff,stroke-width:4px,color:#fff;
    classDef risk fill:#ef4444,stroke:#fff,stroke-width:2px,color:#fff;
    classDef main fill:#334155,stroke:#fff,stroke-width:4px,color:#fff;
    
    class Morpho morpho;
    class Deribit deribit;
    class Liq,MC risk;
    class A main;
`;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1 1 auto', minHeight: 0, overflow: 'hidden', marginTop: '4px' }}>
            {/* Global Status Header */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '2px 0', flex: '0 0 auto' }}>
                <Dot s={st.spot} label="Binance" />
                <Dot s={st.opt} label="Deribit" />
                <Dot s={st.dvol} label="DVOL" />
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px', alignItems: 'center' }}>
                    {spot !== null && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--t-data)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                            BTC <span>${spot.v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            <span style={{ fontSize: 'var(--t-meta)', fontWeight: 500, color: spot.c >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                {spot.c >= 0 ? '↗' : '↘'} {Math.abs(spot.cp).toFixed(2)}%
                            </span>
                        </span>
                    )}
                    {dvol !== null && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--t-data)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                            DVOL <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{dvol.v.toFixed(1)}</span>
                            <span style={{ fontSize: 'var(--t-meta)', fontWeight: 500, color: dvol.cp >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                {dvol.cp >= 0 ? '↗' : '↘'} {Math.abs(dvol.cp).toFixed(1)}%
                            </span>
                        </span>
                    )}
                </div>
            </div>

            {/* Main 2x2 Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '16px', flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>

                {/* Q1: Top Yields */}
                <div className="neo-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: 'var(--t-title)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)' }}>
                            ⚡ Top Yields
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontVariantNumeric: 'tabular-nums' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: 'var(--t-meta)', color: allowRep ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                    <input type="checkbox" checked={allowRep} onChange={e => setAllowRep(e.target.checked)} style={{ accentColor: 'var(--blue)', cursor: 'pointer', margin: 0 }} />
                                    Repeat legs
                                </label>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Legs</span>
                                <input
                                    type="range" min={0} max={5} step={1} value={numLegs}
                                    onChange={e => setNumLegs(+e.target.value)}
                                    style={{ width: '60px', accentColor: 'var(--blue)', cursor: 'pointer', verticalAlign: 'middle' }}
                                />
                                <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, minWidth: '28px', textAlign: 'right', color: numLegs === 0 ? 'var(--green)' : 'var(--blue)' }}>{numLegs === 0 ? 'Auto' : numLegs}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>P(ex) cap</span>
                                <input
                                    type="range" min={0} max={100} step={1} value={maxPexCap}
                                    onChange={e => setMaxPexCap(+e.target.value)}
                                    style={{ width: '80px', accentColor: 'var(--blue)', cursor: 'pointer', verticalAlign: 'middle' }}
                                />
                                <span style={{
                                    fontSize: 'var(--t-meta)', fontWeight: 700, minWidth: '30px', textAlign: 'right',
                                    color: maxPexCap <= 25 ? 'var(--green)' : maxPexCap <= 50 ? 'var(--yellow)' : 'var(--red)'
                                }}>{maxPexCap}%</span>
                            </div>
                            <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: dataAt ? 'var(--green)' : 'var(--text-muted)', boxShadow: dataAt ? '0 0 4px var(--green)' : 'none' }} />
                        </div>
                    </div>
                    {!trades.length ? (
                        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--t-data)' }}>{loading ? 'Loading...' : 'Scanning...'}</div>
                    ) : (() => {
                        const hedgedLadder = computedHedged;
                        const filteredHedged = hedgedLadder && hedgedLadder.score >= 5.0 ? hedgedLadder : null;

                        const LadderCard = ({ ladder, label }: { ladder: ScoredLadder | null; label: string; }) => {
                            const accent = 'var(--green)';
                            if (!ladder) return <div style={{ border: '1px solid var(--border-color)', padding: '6px 8px', backgroundColor: 'var(--bg-card)', borderRadius: '4px', fontSize: 'var(--t-data)', color: 'var(--text-muted)' }}>No {label} available</div>;
                            const { legs, score, ev, evAnnual, volEdge, thetaEff, riskReturn, kelly, probAllOTM, totalPrem, avgApy, topFactor } = ladder;
                            const probAnyEx = 1 - probAllOTM;
                            const uniqueExpiries = Array.from(new Set(legs.map(l => l.expiry)));
                            const isMixed = uniqueExpiries.length > 1;
                            const expiryLabel = isMixed ? uniqueExpiries.join(' / ') : legs[0].expiry;
                            const avgDte = legs.reduce((s, l) => s + l.dte, 0) / legs.length;
                            const dteLabel = isMixed ? `${Math.min(...legs.map(l => l.dte))}–${Math.max(...legs.map(l => l.dte))}d (avg ${avgDte.toFixed(0)}d)` : `${legs[0].dte}d`;
                            const scoreColor = score >= 7 ? 'var(--green)' : score >= 4 ? 'var(--yellow)' : 'var(--red)';

                            return (
                                <div style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', borderRadius: '4px', borderLeft: `3px solid ${accent}`, overflow: 'visible' }}>
                                    <div style={{ padding: '4px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ fontWeight: 700, fontSize: 'var(--t-label)', textTransform: 'uppercase', letterSpacing: '0.05em', color: accent }}>{label}</span>
                                                <Tip text={`Base Yield contribution from Delta-Neutral Hedge (Morpho cbBTC Supply, USDC Borrow, Deribit Perp) + Put Premium. Normalized to Total Principal.`}>
                                                    <span style={{ fontSize: 'var(--t-micro)', fontWeight: 700, color: scoreColor, backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', padding: '0 4px', borderRadius: '3px', border: `1px solid ${scoreColor}`, borderBottom: 'none' }}>{score.toFixed(1)}</span>
                                                </Tip>
                                            </div>
                                            <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-muted)' }}>{expiryLabel} · {dteLabel} · {legs.length} legs{isMixed ? ' · mixed expiry' : ''} · {topFactor}</span>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 'var(--t-hero)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: '1', fontVariantNumeric: 'tabular-nums' }}>{avgApy.toFixed(1)}%</div>
                                            <div style={{ fontSize: 'var(--t-micro)', color: 'var(--text-muted)' }}>Portfolio APY</div>
                                        </div>
                                    </div>
                                    <div style={{ padding: '0 8px 3px', fontSize: 'var(--t-meta)', fontVariantNumeric: 'tabular-nums' }}>
                                        {legs.map((l, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', borderTop: i > 0 ? '1px solid var(--border-color)' : 'none', color: 'var(--text-secondary)' }}>
                                                <span>Sell CSP <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>${l.strike.toLocaleString()}</span>{isMixed ? <span style={{ color: 'var(--text-muted)', fontSize: 'var(--t-micro)', marginLeft: '3px' }}>{l.expiry}</span> : null}</span>
                                                <span>${(l.premiumUsd / legs.length).toFixed(0)} · {(l.premiumUsd / l.futuresPrice / legs.length).toFixed(4)} BTC · {l.apy.toFixed(0)}% · P(ex) {(l.probExercise * 100).toFixed(0)}%</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ padding: '4px 8px', borderTop: '1px solid var(--border-color)', fontSize: 'var(--t-meta)', color: 'var(--text-muted)', backgroundColor: darkMode ? 'rgba(15,23,42,0.5)' : 'rgba(241,245,249,0.5)', lineHeight: '1.45' }}>
                                        <div style={{ display: 'grid', gap: '3px', gridTemplateColumns: 'auto 1fr', fontSize: 'var(--t-micro)' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>Yield Attribution:</span>
                                            <span>Morpho-Perp Hedge <span style={{ fontWeight: 600 }}>{((morphoRates.cbBtcSupply * amounts.cbBtcRatio / 100) - (3.0 * (amounts.cbBtcRatio * 0.5 / 100)) + (11.0 * amounts.cbBtcRatio / 100)).toFixed(2)}%</span> &middot; Options <span style={{ color: accent, fontWeight: 600 }}>+{(avgApy - ((morphoRates.cbBtcSupply * amounts.cbBtcRatio / 100) - (3.0 * (amounts.cbBtcRatio * 0.5 / 100)) + (11.0 * amounts.cbBtcRatio / 100))).toFixed(1)}%</span></span>
                                        </div>
                                        <div style={{ marginTop: '2px', borderTop: '1px dotted var(--border-color)', paddingTop: '2px' }}>
                                            <Tip text="Expected Value: risk-adjusted annualized profit relative to Total Principal.">EV (Principal)</Tip>: ${((ev / 100) * amounts.principal).toFixed(0)} · <Tip text="Probability that at least one option gets exercised/assigned.">P(any ex)</Tip>: <span style={{ color: accent, fontWeight: 600 }}>{(probAnyEx * 100).toFixed(0)}%</span> · <Tip text="Theta: premium income earned per day normalized to USD principal.">θ</Tip>: ${((thetaEff / 100) * amounts.principal).toFixed(0)}/d
                                        </div>
                                    </div>
                                </div>
                            );
                        };
                        return <LadderCard ladder={filteredHedged} label="Hedged Ladder Config" />;
                    })()}
                </div>

                {/* Q2: Detailed APY Breakdown (Financial Table) */}
                <div className="neo-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                    <span className="neo-folder-tab" style={{ background: 'var(--green)', color: '#1a1a1a' }}>~/pnl/annualized/breakout</span>
                    <div style={{ padding: '8px 0', flex: '1 1 auto', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: 'var(--t-title)', fontWeight: 700, marginBottom: '12px' }}>Annualized Position PnL</div>
                        <div style={{ flex: '1 1 auto', overflow: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta)', fontVariantNumeric: 'tabular-nums' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                                        <th style={{ padding: '8px 4px', fontWeight: 600 }}>Position</th>
                                        <th style={{ padding: '8px 4px', fontWeight: 600 }}>Size / Capital</th>
                                        <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>ROI (Local %)</th>
                                        <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>ROI (Account %)</th>
                                        <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>ROI ($ Principal)</th>
                                        <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(() => {
                                        const ratio = amounts.cbBtcRatio / 100;
                                        const principal = amounts.principal;

                                        // 1. Get the best ladder's premium data
                                        const hedgedLadder = computedHedged;
                                        const cspCapital = principal * (1 - ratio);
                                        const lentCapital = principal * ratio;
                                        const borrowDebt = principal * ratio * 0.5;
                                        const perpNotional = principal * ratio;

                                        // Since options are scored on native APY, avgApy is exactly the pure Option ROI
                                        const nativeCspApy = hedgedLadder ? hedgedLadder.avgApy : 0;
                                        const cspPortfolioRate = nativeCspApy * (cspCapital / principal);
                                        const cspDollarReturn = (nativeCspApy / 100) * cspCapital;

                                        const rows = [
                                            {
                                                name: 'Cash-Secured Put',
                                                capital: cspCapital,
                                                localRate: nativeCspApy,
                                                portfolioRate: cspPortfolioRate,
                                                dollarReturn: cspDollarReturn,
                                                label: ' (Collateral)',
                                                status: 'Not Hedged',
                                                color: 'var(--green)'
                                            },
                                            {
                                                name: 'cbBTC Lent',
                                                capital: lentCapital,
                                                localRate: morphoRates.cbBtcSupply,
                                                portfolioRate: (morphoRates.cbBtcSupply * ratio),
                                                dollarReturn: (morphoRates.cbBtcSupply / 100) * lentCapital,
                                                label: ' (Asset)',
                                                status: 'Hedged',
                                                color: 'var(--text-primary)'
                                            },
                                            {
                                                name: 'USDC Borrow (-3% Debt)',
                                                capital: borrowDebt,
                                                localRate: -3.0,
                                                portfolioRate: -(3.0 * (ratio * 0.5)),
                                                dollarReturn: ((-3.0 / 100) * borrowDebt),
                                                label: ' (Debt)',
                                                status: 'N/A',
                                                color: '#ef5350'
                                            },
                                            {
                                                name: 'BTC Perp Short (+11% Notional)',
                                                capital: perpNotional,
                                                localRate: 11.0,
                                                portfolioRate: (11.0 * ratio),
                                                dollarReturn: ((11.0 / 100) * perpNotional),
                                                label: ' (Notional)',
                                                status: 'Hedged',
                                                color: 'var(--green)'
                                            }
                                        ];

                                        const netApy = rows.reduce((acc, r) => acc + r.portfolioRate, 0);
                                        const totalReturn = rows.reduce((acc, r) => acc + r.dollarReturn, 0);

                                        return (
                                            <>
                                                {rows.map((r, i) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                                        <td style={{ padding: '10px 4px', fontWeight: 600, color: 'var(--text-primary)' }}>{i + 1}. {r.name}</td>
                                                        <td style={{ padding: '10px 4px' }}>${r.capital.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{r.label}</td>
                                                        <td style={{ padding: '10px 4px', textAlign: 'right', fontWeight: 700, color: r.color }}>{r.localRate >= 0 ? '+' : ''}{r.localRate.toFixed(2)}%</td>
                                                        <td style={{ padding: '10px 4px', textAlign: 'right', fontWeight: 700, color: r.color }}>{r.portfolioRate >= 0 ? '+' : ''}{r.portfolioRate.toFixed(2)}%</td>
                                                        <td style={{ padding: '10px 4px', textAlign: 'right', color: r.color }}>{r.dollarReturn >= 0 ? '+' : '-'}${Math.abs(r.dollarReturn).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                        <td style={{ padding: '10px 4px', textAlign: 'right', fontSize: 'var(--t-micro)', color: 'var(--text-muted)' }}>{r.status}</td>
                                                    </tr>
                                                ))}
                                                <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)', fontWeight: 700 }}>
                                                    <td style={{ padding: '12px 4px', color: 'var(--text-primary)' }}>Total / Net</td>
                                                    <td style={{ padding: '12px 4px' }}>${principal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Deployed)</td>
                                                    <td style={{ padding: '12px 4px', textAlign: 'right', color: 'var(--text-muted)' }}>-</td>
                                                    <td style={{ padding: '12px 4px', textAlign: 'right', color: 'var(--green)', fontSize: '1.1em' }}>{netApy >= 0 ? '+' : ''}{netApy.toFixed(2)}%</td>
                                                    <td style={{ padding: '12px 4px', textAlign: 'right', color: 'var(--green)', fontSize: '1.1em' }}>{totalReturn >= 0 ? '+' : '-'}${Math.abs(totalReturn).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    <td style={{ padding: '12px 4px', textAlign: 'right', fontSize: 'var(--t-micro)', color: 'var(--text-muted)' }}>Net Unhedged</td>
                                                </tr>
                                            </>
                                        );
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Q3: Yield Matrix */}
                <div className="neo-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                    <span className="neo-folder-tab">~/earn/btc/yields</span>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flex: '0 0 auto' }}>
                        <span style={{ fontSize: 'var(--t-title)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            Covered Yield Matrix
                            <span style={{ fontSize: 'var(--t-meta)', fontWeight: 400, color: 'var(--text-muted)' }}>DTE ≥ 15 · 1฿ notional · click to pin</span>
                        </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', minHeight: 0, overflow: 'auto', flex: '1 1 auto' }}>
                        <Table type="HP" strikes={putK} accentColor="var(--green)" label="Delta-Neutral Hedged Puts" />
                    </div>
                </div>

                {/* Q4: Mermaid Flowchart */}
                <div className="neo-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                    <span className="neo-folder-tab" style={{ background: 'var(--blue)', color: '#fff' }}>~/construction/morpho/cbbtc</span>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flex: '0 0 auto' }}>
                        <span style={{ fontSize: 'var(--t-title)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            Trade Construction
                        </span>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-muted)' }}>Principal:</span>
                                <input type="number" value={amounts.principal} onChange={e => setAmounts(p => ({ ...p, principal: +e.target.value }))} style={{ width: '70px', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: 'var(--t-data)', padding: '2px 4px', borderRadius: '4px' }} />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-muted)' }}>cbBTC Ratio:</span>
                                <input type="range" min={0} max={100} value={amounts.cbBtcRatio} onChange={e => setAmounts(p => ({ ...p, cbBtcRatio: +e.target.value }))} style={{ width: '80px', accentColor: 'var(--blue)' }} />
                                <span style={{ fontSize: 'var(--t-data)', fontWeight: 600, width: '35px' }}>{amounts.cbBtcRatio}%</span>
                            </div>
                        </div>
                    </div>
                    <div style={{ flex: '1 1 auto', overflow: 'auto', padding: '16px', backgroundColor: '#0f172a', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center' }}>
                        <MermaidDiagram chart={chartStr} />
                    </div>
                </div>
            </div>

            {/* Tooltip */}
            {tip && (() => {
                const W = typeof window !== 'undefined' ? window : { innerHeight: 832, innerWidth: 1470 };
                return (
                    <div style={{ position: 'fixed', top: Math.min(Math.max(8, tip.y - 130), W.innerHeight - 220), left: Math.min(tip.x + 12, W.innerWidth - 230), backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-strong)', padding: '8px 10px', borderRadius: '6px', pointerEvents: 'none', zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.4)', width: '14rem', fontSize: 'var(--t-data)' }}>
                        <strong style={{ display: 'block', borderBottom: '1px solid var(--border-color)', paddingBottom: '3px', marginBottom: '6px', fontSize: 'var(--t-label)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--green)' }}>
                            🟢 Delta-Neutral CSP
                        </strong>
                        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: '1px', columnGap: '12px', fontVariantNumeric: 'tabular-nums', lineHeight: '1.6' }}>
                            {[
                                ['Strike', `$${tip.d.strike.toLocaleString()}`],
                                ['Expiry', tip.d.exp],
                                ['DTE', `${tip.d.dte}d`],
                                ['Futures', `$${tip.d.futuresPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}`],
                                ['IV', `${tip.d.markIv}%`],
                                ['Prem $', `$${tip.d.premiumUsd.toFixed(2)}`],
                                ['Prem ฿', `${(tip.d.premiumUsd / tip.d.futuresPrice).toFixed(4)} ฿`],
                                ['P(ex)', `${(tip.d.probExercise * 100).toFixed(1)}%`],
                                ['Δ Delta', tip.d.greeks.delta.toFixed(2)],
                                ['Γ Gamma', tip.d.greeks.gamma.toFixed(5)],
                                ['Θ Theta', tip.d.greeks.theta.toFixed(2)],
                                ['ν Vega', tip.d.greeks.vega.toFixed(2)],
                            ].map(([l, v]) => (
                                <React.Fragment key={l}>
                                    <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{l}</span>
                                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right' }}>{v}</span>
                                </React.Fragment>
                            ))}
                        </div>
                        <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '6px', paddingTop: '4px', display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: '12px', alignItems: 'center' }}>
                            <span style={{ color: 'var(--text-muted)' }}>APR</span>
                            <span style={{ fontWeight: 700, fontSize: 'var(--t-title)', color: 'var(--text-primary)' }}>{tip.d.apy}%</span>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
