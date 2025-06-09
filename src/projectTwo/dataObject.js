import axios from "axios";

export let dataObject = {
    interval: '1m',
    thresholdPercent: 1.5,
    limit: 100,// RSI calculation needs 14+ candles
    rsiPeriod: 14,
    overboughtThreshold: 70,
    oversoldThreshold: 30,
    sideWayOverboughtThreshold: 70,
    sideWayOversoldThreshold: 30,
    lookback: 20,
    maxSidewaySlope: 0.5,  // NEW: Limit trend strength in sideways detection
    minSlope: 0.5, // <-- NEW: for exclusive slope condition
    // coolDownTime: 60 * 1000, // 1 minute cooldown (adjust as needed)
    coolDownTime: 2 * 1000, //  2 seconds
    profitTaking: false,
    lastExitTime: 0,
    lastDecisionTime: 0,
    quantity: 0,
    ws:null,
    coins: []

}

let symbols = []

function createStrategyObject(id, symbol) {
    return {
        symbol, candles: [], hasPosition: false
    }
}


async function getTopLowCapSymbolsFromBinance(maxPrice = 1, limit = 50) {
    try {
        const [spotInfo, futuresInfo, tickerInfo] = await Promise.all([
            axios.get('https://api.binance.com/api/v3/exchangeInfo'),
            axios.get('https://fapi.binance.com/fapi/v1/exchangeInfo'),
            axios.get('https://api.binance.com/api/v3/ticker/24hr')
        ]);

        const spotSymbols = new Set(
            spotInfo.data.symbols
                .filter(s => s.symbol.endsWith('USDT') && s.status === 'TRADING')
                .map(s => s.symbol)
        );

        const futuresSymbols = new Set(
            futuresInfo.data.symbols
                .filter(s => s.symbol.endsWith('USDT') && s.status === 'TRADING')
                .map(s => s.symbol)
        );

        const stablecoins = new Set([
            'usdt', 'usdc', 'busd', 'tusd', 'dai', 'fdusd',
            'usdd', 'gusd', 'usdp', 'eur', 'eurt'
        ]);

        // Replace the return statement inside getTopLowCapSymbolsFromBinance with this:
        return tickerInfo.data
            .filter(t => {
                const base = t.symbol.replace('USDT', '').toLowerCase();
                return (
                    t.symbol.endsWith('USDT') &&
                    parseFloat(t.lastPrice) < maxPrice &&
                    !stablecoins.has(base) &&
                    spotSymbols.has(t.symbol) &&
                    futuresSymbols.has(t.symbol)
                );
            })
            .sort((a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent)) // ✅ Sort by gainer %
            .slice(0, limit)
            .map(t => t.symbol.toLowerCase());


    } catch (error) {
        console.error('❌ Error fetching Binance data:', error.message);
        return [];
    }
}


export async function setObject() {


    let symbolAry = await getTopLowCapSymbolsFromBinance(5, 20);
    if (!symbolAry.length) {
        console.warn('⚠️ No valid trading symbols retrieved from Binance.');
        return [];
    }
    console.log(`✅ Selected ${symbolAry.length} symbols:`, symbolAry);

    symbols = symbolAry.map((symbol, i) => createStrategyObject(i, symbol));


    // symbols = ['dogeusdt'].map((symbol, i) => createStrategyObject(i, symbol));

    return symbols;
}


