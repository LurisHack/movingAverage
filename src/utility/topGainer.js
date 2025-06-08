import fetch from 'node-fetch';

export async function getTopFuturesGainers(limit = 5) {
    try {
        // Step 1: Get valid trading futures symbols.js only
        const exchangeInfoRes = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
        const exchangeInfo = await exchangeInfoRes.json();

        const validFuturesSymbols = new Set(
            exchangeInfo.symbols
                .filter(s => s.contractType === 'PERPETUAL' && s.status === 'TRADING')
                .map(s => s.symbol)
        );

        // Step 2: Get all 24hr ticker price change stats
        const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr');
        const data = await res.json();

        // Step 3: Filter only USDT pairs that exist in valid futures
        const filtered = data.filter(item =>
            item.symbol.endsWith('USDT') && validFuturesSymbols.has(item.symbol)
        );

        // Step 4: Sort by highest % change
        const topGainers = filtered
            .sort((a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent))
            .slice(0, limit)
            .map(item => ({
                symbol: item.symbol,
                priceChangePercent: item.priceChangePercent,
                lastPrice: item.lastPrice,
                volume: item.volume
            }));

        return topGainers;
    } catch (err) {
        console.error('❌ Error:', err.message);
        return [];
    }
}

// getTopFuturesGainers(5).then(console.log);
