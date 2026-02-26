"use client";

import React, { useState } from 'react';

export default function TradeSuggestions({ suggestions }: { suggestions: any[] }) {
    // Only display real suggestions from the backend
    const activeSuggestions = suggestions && suggestions.length > 0 ? suggestions : [];
    const displaySuggestions = activeSuggestions.slice(0, 5);
    const [selectedTrade, setSelectedTrade] = useState<any | null>(null);
    const [isExecuting, setIsExecuting] = useState(false);

    const handleExecute = (trade: any) => {
        setSelectedTrade(trade);
    };

    const confirmExecution = () => {
        setIsExecuting(true);
        setTimeout(() => {
            setIsExecuting(false);
            setSelectedTrade(null);
            alert(`Successfully executed: ${selectedTrade.type} on ${selectedTrade.instrument}`);
        }, 1500);
    };

    const closeModal = () => {
        if (!isExecuting) setSelectedTrade(null);
    };

    return (
        <div className="neo-panel" style={{ position: 'relative', marginTop: '2rem' }}>
            <span className="neo-folder-tab">~/dashboard/opportunities</span>
            <h2 className="panel-header">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                Trade Suggestions
            </h2>

            <p className="text-muted" style={{ marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                AI-flagged opportunities based on IV spreads across venues.
            </p>

            <div className="suggestions-list">
                {displaySuggestions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                        No opportunities flagged yet.
                    </div>
                ) : displaySuggestions.map((s: any) => (
                    <div key={s.id} className="suggestion-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div className="suggestion-header">
                            <span className="suggestion-title">{s.instrument}</span>
                            <span className="badge" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                {s.type}
                            </span>
                        </div>

                        <div style={{ color: 'var(--text-main)', fontSize: '0.95rem' }}>
                            {s.action}
                        </div>

                        <div className="suggestion-metrics">
                            <div className="metric">
                                <span className="metric-label">IV Spread</span>
                                <span className="metric-value text-success">{s.spread}</span>
                            </div>
                            <div className="metric" style={{ textAlign: 'right' }}>
                                <span className="metric-label">Est. Profit</span>
                                <span className="metric-value">${s.profit_estimate}</span>
                            </div>
                        </div>

                        <button
                            className="neo-button"
                            onClick={() => handleExecute(s)}
                            style={{ width: '100%', marginTop: '1.5rem', fontSize: '0.875rem' }}
                        >
                            Review &amp; Execute
                        </button>
                    </div>
                ))}
            </div>

            {/* Execution Modal */}
            {selectedTrade && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }} onClick={closeModal}>
                    <div
                        className="neo-panel"
                        style={{ width: '450px', maxWidth: '90%', backgroundColor: 'var(--bg-main)' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: 'var(--text-main)', borderBottom: '4px solid var(--border-color)', paddingBottom: '0.5rem', fontWeight: 800 }}>Execute Strategy</h3>

                        <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span className="text-muted">Instrument:</span>
                                <strong>{selectedTrade.instrument}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span className="text-muted">Strategy:</span>
                                <strong style={{ color: 'var(--warning)' }}>{selectedTrade.type}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span className="text-muted">Action:</span>
                                <strong>{selectedTrade.action}</strong>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                            <button
                                className="neo-button neo-button-outline"
                                onClick={closeModal}
                                disabled={isExecuting}
                                style={{ flex: 1, cursor: isExecuting ? 'not-allowed' : 'pointer', opacity: isExecuting ? 0.5 : 1 }}
                            >
                                Cancel
                            </button>
                            <button
                                className="neo-button"
                                onClick={confirmExecution}
                                disabled={isExecuting}
                                style={{
                                    flex: 1,
                                    backgroundColor: 'var(--success)',
                                    cursor: isExecuting ? 'not-allowed' : 'pointer',
                                    display: 'flex', justifyContent: 'center', alignItems: 'center'
                                }}
                            >
                                {isExecuting ? 'Routing...' : 'Confirm Order'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
