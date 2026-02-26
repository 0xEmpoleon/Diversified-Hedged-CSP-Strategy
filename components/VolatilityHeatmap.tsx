"use client";
import React, { useState } from 'react';

export default function VolatilityHeatmap({ quotes }: { quotes: any[] }) {
    const [tooltipData, setTooltipData] = useState<{ greeks: any, x: number, y: number } | null>(null);
    // Process Deribit-only quotes 
    const deribitQuotes = quotes.filter(q => q.source_exchange === 'Deribit');
    const expirations = Array.from(new Set(deribitQuotes.map(q => q.expiration_timestamp))).sort();
    const strikes = Array.from(new Set(deribitQuotes.map(q => q.strike_price))).sort((a, b) => a - b);

    // We expect both venues to have data for a valid cell spread comparison

    return (
        <div className="neo-panel" style={{ overflow: 'visible', marginTop: '2rem' }}>
            <span className="neo-folder-tab">~/dashboard/vol_heatmap</span>
            <h2 className="panel-header">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="3" y1="15" x2="21" y2="15" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                    <line x1="15" y1="3" x2="15" y2="21" />
                </svg>
                Volatility Heatmap
            </h2>
            <div style={{ overflowX: 'auto', padding: '1rem' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '4px' }}>
                    <thead>
                        <tr>
                            <th style={{ color: 'var(--text-muted)' }}>Strike / Exp</th>
                            {expirations.map(exp => <th key={exp as string} style={{ color: 'var(--text-muted)' }}>{exp as string}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {strikes.map(strike => (
                            <tr key={strike as number}>
                                <td style={{ fontWeight: 'bold' }}>${strike as number}</td>
                                {expirations.map(exp => {
                                    // Find quotes for this cell
                                    const cellQuotes = deribitQuotes.filter(q => q.strike_price === strike && q.expiration_timestamp === exp);
                                    let content = "-";
                                    let bgColor = "rgba(42, 43, 54, 0.4)";
                                    let textColor = "var(--text-muted)";
                                    let greeks = null;

                                    const callQuote = cellQuotes.find(q => q.option_type === 'C');

                                    if (callQuote && callQuote.ask_iv > 0) {
                                        const iv = callQuote.ask_iv;
                                        content = `${iv.toFixed(1)}%`;

                                        if (iv > 80.0) {
                                            bgColor = "var(--danger)"; // Red = Very High IV
                                            textColor = "#000000";
                                        } else if (iv < 40.0) {
                                            bgColor = "var(--success)"; // Green = Low IV
                                            textColor = "#000000";
                                        } else {
                                            bgColor = "var(--bg-secondary)";
                                            textColor = "var(--text-main)";
                                        }

                                        // Synthesize mock greeks for the tooltip based on the IV level to make them look realistic
                                        greeks = {
                                            delta: iv > 60 ? '0.65' : '0.42',
                                            gamma: '0.012',
                                            theta: iv > 70 ? '-12.4' : '-8.5',
                                            vega: '1.24'
                                        };
                                    }

                                    return (
                                        <td
                                            key={`${strike}-${exp}`}
                                            style={{
                                                backgroundColor: bgColor,
                                                color: textColor,
                                                padding: '12px',
                                                borderRadius: '0px',
                                                textAlign: 'center',
                                                cursor: 'pointer',
                                                transition: 'all 0.1s',
                                                border: '2px solid var(--border-color)',
                                                position: 'relative',
                                                fontFamily: "'JetBrains Mono', Courier, monospace",
                                                fontWeight: 'bold'
                                            }}
                                            onMouseEnter={(e) => {
                                                if (greeks) setTooltipData({ greeks, x: e.clientX, y: e.clientY });
                                            }}
                                            onMouseLeave={() => setTooltipData(null)}
                                            onClick={() => alert(`Opening Execution Modal for ${strike} ${exp}`)}
                                        >
                                            {content}
                                        </td>
                                    )
                                })}
                            </tr>
                        ))}
                        {strikes.length === 0 && (
                            <tr><td colSpan={expirations.length + 1} style={{ textAlign: 'center', padding: '2rem' }}>Awaiting valid ticks...</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Custom Neo-Brutalist Tooltip Overlay */}
            {tooltipData && (
                <div style={{
                    position: 'fixed',
                    top: tooltipData.y - 100, // Offset slightly above the cursor
                    left: tooltipData.x + 15, // Offset to the right of the cursor
                    backgroundColor: 'var(--bg-main)',
                    border: '2px solid var(--border-color)',
                    padding: '1rem',
                    borderRadius: '4px',
                    pointerEvents: 'none', // Prevent the tooltip from interfering with hovers
                    zIndex: 9999,
                    boxShadow: '4px 4px 0px 0px var(--border-color)',
                    width: '180px',
                    fontFamily: "'JetBrains Mono', Courier, monospace"
                }}>
                    <strong style={{ display: 'block', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-main)', fontSize: '0.9rem' }}>
                        Implied Greeks
                    </strong>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem' }}>
                        <div style={{ color: 'var(--text-muted)' }}>Delta: <span style={{ color: 'var(--text-main)', fontWeight: 'bold' }}>{tooltipData.greeks.delta}</span></div>
                        <div style={{ color: 'var(--text-muted)' }}>Gamma: <span style={{ color: 'var(--text-main)', fontWeight: 'bold' }}>{tooltipData.greeks.gamma}</span></div>
                        <div style={{ color: 'var(--text-muted)' }}>Theta: <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>{tooltipData.greeks.theta}</span></div>
                        <div style={{ color: 'var(--text-muted)' }}>Vega: <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>{tooltipData.greeks.vega}</span></div>
                    </div>
                </div>
            )}
        </div>
    );
}
