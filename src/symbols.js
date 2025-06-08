import axios from "axios";

// Shared strategy state
export let symbols = [];

/**
 * Create a strategy object for one symbol + one side
 */
function createStrategyObject(id, symbol) {
    return   { symbol, hasPosition: false, entryPrice: 0, quantity: 0, side: "" }
}

/**
 * Get symbols with:
 * - Price below maxPrice
 * - Listed on both Spot and Futures
 * - Not stablecoins
 * - Sorted by quote volume
 */
async function getTopLowCapSymbolsFromBinance(maxPrice = 1, limit = 100) {
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
            .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
            .slice(0, limit)
            .map(t => t.symbol.toLowerCase());

    } catch (error) {
        console.error('❌ Error fetching Binance data:', error.message);
        return [];
    }
}


export async function setObject() {


    let symbolAry = await getTopLowCapSymbolsFromBinance(1, 200);
    if (!symbolAry.length) {
        console.warn('⚠️ No valid trading symbols retrieved from Binance.');
        return [];
    }
    console.log(`✅ Selected ${symbolAry.length} symbols:`, symbolAry);

    symbols = symbolAry.map((symbol, i) => createStrategyObject(i, symbol));


    // symbols = ['humausdt'].map((symbol, i) => createStrategyObject(i, symbol));

    return symbols;
}
