"use client";

import React from 'react';

export default function OrderBook({ quotes }: { quotes: any[] }) {
    // Only display real quotes from the backend
    const displayQuotes = quotes && quotes.length > 0 ? quotes : [];

    return (
        <div className="neo-panel" style={{ position: 'relative' }}>
            <span className="neo-folder-tab">~/dashboard/orderbook</span>
            <h2 className="panel-header">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20V10"></path>
                    <path d="M18 20V4"></path>
                    <path d="M6 20v-4"></path>
                </svg>
                Aggregated Quotes
            </h2>

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>Venue</th>
                            <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>Instrument</th>
                            <th style={{ textAlign: 'right', padding: '0.75rem', borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>Bid</th>
                            <th style={{ textAlign: 'right', padding: '0.75rem', borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>Ask</th>
                            <th style={{ textAlign: 'right', padding: '0.75rem', borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>IV %</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayQuotes.length === 0 ? (
                            <tr>
                                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                                    No live quotes available.
                                </td>
                            </tr>
                        ) : displayQuotes.map((q: any, i: number) => (
                            <tr key={q.id || i}>
                                <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>{q.venue}</td>
                                <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)', fontFamily: "'JetBrains Mono', monospace" }}>{q.instrument}</td>
                                <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)', textAlign: 'right', color: 'var(--success)' }}>{q.bid?.toFixed(4)}</td>
                                <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)', textAlign: 'right', color: 'var(--danger)' }}>{q.ask?.toFixed(4)}</td>
                                <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>{q.iv?.toFixed(1)}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
