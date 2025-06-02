import axios from "axios";

const BASE_URL = "https://fapi.binance.com";

const INTERVAL = "1m";
const LIMIT = 1440;  // 1440 candles = 24 hours of 1-minute data


// const INTERVAL = "5m";  // 5-minute interval
// const LIMIT = 288;      // 288 candles = 24 hours (5m × 288 = 1440 minutes = 24 hours)

// const INTERVAL = "15m";  // 15-minute interval
// const LIMIT = 96;        // 96 candles = 24 hours (15m × 96 = 1440 minutes = 24 hours)

function getVolatility(high, low) {
    return ((high - low) / low) * 100;
}

async function getFuturesSymbols() {
    const res = await axios.get(`${BASE_URL}/fapi/v1/exchangeInfo`);
    return res.data.symbols
        .filter(s =>
            s.contractType === 'PERPETUAL' &&
            s.quoteAsset === 'USDT' &&
            !s.symbol.includes("DOWN") &&
            !s.symbol.includes("UP")
        )
        .map(s => s.symbol);
}

async function calculateSymbolVolatility(symbol) {
    try {
        const { data } = await axios.get(`${BASE_URL}/fapi/v1/klines`, {
            params: {
                symbol,
                interval: INTERVAL,
                limit: LIMIT
            }
        });

        const highs = data.map(c => parseFloat(c[2]));
        const lows = data.map(c => parseFloat(c[3]));

        const maxHigh = Math.max(...highs);
        const minLow = Math.min(...lows);

        const volatility = getVolatility(maxHigh, minLow);
        return { symbol, volatility: volatility.toFixed(2) };
    } catch (err) {
        return null;
    }
}

export async function findMostVolatile() {
    const symbols = await getFuturesSymbols();

    const volResults = await Promise.all(
        symbols.slice(0, 100).map(calculateSymbolVolatility) // speed improvement
    );

    const filtered = volResults.filter(Boolean);
    const sorted = filtered.sort((a, b) => b.volatility - a.volatility);

    const top1 = sorted[0];
    console.log("📈 Most Volatile Futures Coin in last 24h:");
    console.log(`🔥 ${top1.symbol}: ${top1.volatility}% movement`);

    // console.log("\n📊 Top 3 volatile:");
    // sorted.slice(0, 3).forEach((item, idx) =>
    //     console.log(`${idx + 1}. ${item.symbol}: ${item.volatility}%`)
    // );

    return sorted.slice(0, 3)
}

