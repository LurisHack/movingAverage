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

// Volume Spike Detector
function isVolumeSpike(volumes, spikeFactor = 2.0) {
    const lastVolume = volumes[volumes.length - 1];
    const avgVolume = volumes.slice(0, volumes.length - 1).reduce((a, b) => a + b, 0) / (volumes.length - 1);
    return lastVolume > avgVolume * spikeFactor;
}

// Order Book Imbalance
async function checkOrderBookImbalance(symbol, threshold = 1.5) {
    try {
        const res = await axios.get(`https://fapi.binance.com/fapi/v1/depth`, {
            params: { symbol, limit: 20 }
        });

        const bids = res.data.bids.map(b => parseFloat(b[1]));
        const asks = res.data.asks.map(a => parseFloat(a[1]));

        const totalBidVolume = bids.reduce((a, b) => a + b, 0);
        const totalAskVolume = asks.reduce((a, b) => a + b, 0);

        return {
            imbalance: totalBidVolume > totalAskVolume * threshold || totalAskVolume > totalBidVolume * threshold,
            side: totalBidVolume > totalAskVolume * threshold ? 'BID' :
                totalAskVolume > totalBidVolume * threshold ? 'ASK' : 'NEUTRAL'
        };
    } catch (err) {
        console.log(`[OrderBook Error] ${symbol}:`, err.message);
        return { imbalance: false, side: 'NEUTRAL' };
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
        const data = await fetchWithRetry('https://fapi.binance.com/fapi/v1/klines', {
            symbol, interval: '1m', limit: 100
        });

        if (!data || !Array.isArray(data) || data.length === 0) {
            console.log(`[ERROR] ${symbol}: Kline data is missing or malformed.`);
            return null;  // Skip this symbol
        }

        const closes = data.map(k => parseFloat(k[4]));
        const highs = data.map(k => parseFloat(k[2]));
        const lows = data.map(k => parseFloat(k[3]));
        const volumes = data.map(k => parseFloat(k[5]));

        const ema50 = calculateEMA(closes, 50);
        const atr14 = calculateATR(highs, lows, closes, 14);
        const currentPrice = closes[closes.length - 1];
        const diffPercent = Math.abs(currentPrice - ema50) / ema50 * 100;
        const atrPercent = (atr14 / currentPrice) * 100;

        const volumeSpike = isVolumeSpike(volumes);
        const { imbalance, side } = await checkOrderBookImbalance(symbol);

        const volatilityThresholdPercent = 0.3;

        let signal = 'NONE';

        if (
            diffPercent < 1 &&
            (volumeSpike || imbalance) &&
            atrPercent > volatilityThresholdPercent
        ) {
            if (currentPrice > ema50 && (volumeSpike || (imbalance && side === 'BID'))) {
                signal = 'BUY';
            } else if (currentPrice < ema50 && (volumeSpike || (imbalance && side === 'ASK'))) {
                signal = 'SELL';
            }
        }

        return {
            symbol,
            price: currentPrice,
            ema50: ema50.toFixed(5),
            diffPercent: diffPercent.toFixed(2),
            volumeSpike,
            imbalance,
            imbalanceSide: side,
            atrPercent: atrPercent.toFixed(2),
            signal
        };
    } catch (err) {
        console.log(`[ERROR] ${symbol}:`, err.message || err);
        if (err.response) {
            console.log(`↪ Status: ${err.response.status}`);
            console.log(`↪ Response:`, err.response.data);
        }
        return null;
    }
}

// Main loop
export async function runAnalysis(limit = 20) {
    const symbols = await getUSDTFuturesSymbols();
    const results = [];

    for (let i = 0; i < Math.min(limit, symbols.length); i++) {
        await new Promise(resolve => setTimeout(resolve, 250)); // rate-limit
        const result = await analyzeSymbol(symbols[i]);
        if (result && result.signal !== 'NONE') {
            results.push(result);
        }
    }

    return results;
}

async function fetchWithRetry(url, params, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await axios.get(url, { params });
            return res.data;
        } catch (err) {
            if (err.response && err.response.status === 429 && i < retries - 1) {
                console.warn(`⏳ 429 Too Many Requests. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
            } else {
                throw err;
            }
        }
    }
}

// Example usage:
// runAnalysis(200).then(results => {
//     console.log("Matching Signals:", results);
// });
