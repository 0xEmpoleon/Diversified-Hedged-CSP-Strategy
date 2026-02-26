import { useState, useEffect } from 'react';

export function useRFQData() {
    const [quotes, setQuotes] = useState<any[]>([]);
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [deribitStatus, setDeribitStatus] = useState("Connecting...");
    const [deriveStatus, setDeriveStatus] = useState("Connecting...");

    useEffect(() => {
        const ws = new WebSocket("ws://127.0.0.1:8001/ws");

        ws.onopen = () => {
            // Let the backend override these once connected
            console.log("WS connected to backend");
        };
        ws.onclose = () => {
            setDeribitStatus("Disconnected");
            setDeriveStatus("Disconnected");
        };
        ws.onerror = () => {
            setDeribitStatus("Connection Error");
            setDeriveStatus("Connection Error");
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'status') {
                    if (data.venue === 'Deribit') setDeribitStatus(data.status);
                    if (data.venue === 'Derive') setDeriveStatus(data.status);
                } else if (data.type === 'suggestion') {
                    setSuggestions(prev => [data.data, ...prev].slice(0, 5));
                } else if (data.underlying_asset) {
                    setQuotes(prev => {
                        const existing = [...prev];
                        const idx = existing.findIndex(q =>
                            q.underlying_asset === data.underlying_asset &&
                            q.strike_price === data.strike_price &&
                            q.expiration_timestamp === data.expiration_timestamp &&
                            q.option_type === data.option_type &&
                            q.source_exchange === data.source_exchange
                        );
                        if (idx >= 0) {
                            existing[idx] = data;
                        } else {
                            existing.push(data);
                        }
                        return existing;
                    });
                }
            } catch (e) {
                console.error("WS Parse error", e);
            }
        };

        return () => ws.close();
    }, []);

    return { quotes, suggestions, deribitStatus, deriveStatus };
}
