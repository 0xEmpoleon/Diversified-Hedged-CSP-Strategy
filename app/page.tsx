"use client";

import React, { useEffect, useState } from 'react';
import BTCCoveredYields from '../components/BTCCoveredYields';

export default function Dashboard() {
    /* Default to dark (Derive.xyz style). Light mode available via toggle */
    const [darkMode, setDarkMode] = useState(true);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    }, [darkMode]);

    return (
        <main className="container">
            <header className="header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h1>Deribit Option Strategist</h1>
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--t-label)', fontWeight: 400 }}>
                        Automated Strategy Recommendations
                    </span>
                </div>
                <button
                    onClick={() => setDarkMode(!darkMode)}
                    style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        padding: '3px 10px',
                        cursor: 'pointer',
                        fontSize: 'var(--t-label)',
                        fontWeight: 500,
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-ui)',
                        transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--border-strong)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-card)')}
                >
                    {darkMode ? '☀ Light' : '🌙 Dark'}
                </button>
            </header>
            <BTCCoveredYields darkMode={darkMode} />
        </main>
    );
}
