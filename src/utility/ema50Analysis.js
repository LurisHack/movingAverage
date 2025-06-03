import axios from 'axios';

// EMA 50 calculator
function calculateEMA(closes, period = 50) {
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
    }

    return ema;
}

// ATR 14 calculator
function calculateATR(highs, lows, closes, period = 14) {
    let trueRanges = [];
    for (let i = 1; i < closes.length; i++) {
        const highLow = highs[i] - lows[i];
        const highClose = Math.abs(highs[i] - closes[i - 1]);
        const lowClose = Math.abs(lows[i] - closes[i - 1]);
        trueRanges.push(Math.max(highLow, highClose, lowClose));
    }

    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < trueRanges.length; i++) {
        atr = (trueRanges[i] + (period - 1) * atr) / period;
    }

    return atr;
}

// Volume Spike Detector (last volume vs average of previous volumes)
function isVolumeSpike(volumes, spikeFactor = 2.0) {
    const lastVolume = volumes[volumes.length - 1];
    const avgVolume = volumes.slice(0, volumes.length - 1).reduce((a, b) => a + b, 0) / (volumes.length - 1);
    return lastVolume > avgVolume * spikeFactor;
}

// Order Book Imbalance Filter
async function checkOrderBookImbalance(symbol, threshold = 1.5) {
    try {
        const res = await axios.get(`https://fapi.binance.com/fapi/v1/depth`, {
            params: { symbol, limit: 20 }
        });

        const bids = res.data.bids.map(b => parseFloat(b[1])); // volume bids
        const asks = res.data.asks.map(a => parseFloat(a[1])); // volume asks

        const totalBidVolume = bids.reduce((a, b) => a + b, 0);
        const totalAskVolume = asks.reduce((a, b) => a + b, 0);

        return totalBidVolume > totalAskVolume * threshold || totalAskVolume > totalBidVolume * threshold;
    } catch (err) {
        console.log(`[OrderBook Error] ${symbol}:`, err.message);
        return false;
    }
}

// Get USDT perpetual pairs under 1 USDT
async function getUSDTFuturesSymbols() {
    const res = await axios.get('https://fapi.binance.com/fapi/v1/exchangeInfo');
    return res.data.symbols
        .filter(s =>
            s.contractType === 'PERPETUAL' &&
            s.quoteAsset === 'USDT' &&
            s.status === 'TRADING' &&
            parseFloat(s.filters.find(f => f.filterType === 'PRICE_FILTER').minPrice) < 1
        )
        .map(s => s.symbol);
}

// Analyze a single symbol
async function analyzeSymbol(symbol) {
    try {
        const res = await axios.get('https://fapi.binance.com/fapi/v1/klines', {
            params: { symbol, interval: '1m', limit: 100 }
        });

        const closes = res.data.map(k => parseFloat(k[4]));
        const highs = res.data.map(k => parseFloat(k[2]));
        const lows = res.data.map(k => parseFloat(k[3]));
        const volumes = res.data.map(k => parseFloat(k[5]));

        const ema50 = calculateEMA(closes, 50);
        const atr14 = calculateATR(highs, lows, closes, 14);
        const currentPrice = closes[closes.length - 1];
        const diffPercent = Math.abs(currentPrice - ema50) / ema50 * 100;

        const volumeSpike = isVolumeSpike(volumes);
        const imbalance = await checkOrderBookImbalance(symbol);

        // ATR percentage relative to current price
        const atrPercent = (atr14 / currentPrice) * 100;
        const volatilityThresholdPercent = 0.2; // Adjust this threshold as needed

        if (
            diffPercent < 1 &&            // Price close to EMA50 within 1%
            (volumeSpike || imbalance) && // Volume spike or order book imbalance
            atrPercent > volatilityThresholdPercent // Volatility threshold
        ) {
            return {
                symbol,
                price: currentPrice,
                diff: diffPercent.toFixed(2),
                volumeSpike,
                imbalance,
                atrPercent: atrPercent.toFixed(2)
            };
        }
    } catch (err) {
        console.log(`[ERROR] ${symbol}:`, err.message);
    }
}

// Main loop
export async function runAnalysis(limit = 20) {
    const symbols = await getUSDTFuturesSymbols();
    const results = [];

    for (let i = 0; i < Math.min(limit, symbols.length); i++) {
        await new Promise(resolve => setTimeout(resolve, 250)); // rate-limit 250ms delay
        const result = await analyzeSymbol(symbols[i]);
        if (result) results.push(result);
    }

    return results;
}

// // Example usage:
// runAnalysis(250).then(results => {
//     console.log("Matching Symbols:", results);
// });
