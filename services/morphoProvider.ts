export async function fetchMorphoRates(): Promise<{ cbBtcSupply: number; usdcBorrow: number }> {
    try {
        const response = await fetch("https://api.dune.com/api/v1/query/6749366/results?limit=1&api_key=JTEkwHSKuNMSefmvPgdYaAjt3FDm7Wwn");
        const data = await response.json();
        const latestRow = data.result?.rows?.[0];

        if (latestRow) {
            // borrow_apy from Dune is a decimal (e.g. 0.032 for 3.2%)
            // We return it as a percentage (3.2)
            return {
                cbBtcSupply: 0.0, // Morpho collateral typically earns 0% unless it's a vault
                usdcBorrow: latestRow.borrow_apy * 100
            };
        }
        throw new Error("No data found in Dune response");
    } catch (e) {
        console.error("Morpho fetch error: ", e);
        return { cbBtcSupply: 0.0, usdcBorrow: 3.5 }; // Fallback defaults
    }
}
