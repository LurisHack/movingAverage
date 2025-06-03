// sidewayScanner.js
import fs from 'fs';
import axios from 'axios';



// sidewayDetector.js

function isSideways(candles, options = {}) {
    const {
        rangeThreshold = 0.01,
        adxThreshold = 20,
        rsiRange = [45, 55],
        bbWidthThreshold = 0.01,
    } = options;

    if (candles.length < 20) return false;

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    const avgPrice = (maxHigh + minLow) / 2;
    const priceRange = (maxHigh - minLow) / avgPrice;

    const adx = calculateADX(candles);
    const lastAdx = adx[adx.length - 1];

    const rsi = calculateRSI(closes, 14);
    const lastRsi = rsi[rsi.length - 1];

    const bb = calculateBollingerBands(closes, 20, 2);
    const lastBB = bb[bb.length - 1];
    const bbWidth = (lastBB.upper - lastBB.lower) / lastBB.middle;

    const isPriceStable = priceRange < rangeThreshold;
    const isLowTrend = lastAdx < adxThreshold;
    const isRsiNeutral = lastRsi > rsiRange[0] && lastRsi < rsiRange[1];
    const isNarrowBB = bbWidth < bbWidthThreshold;

    return isPriceStable && isLowTrend && isRsiNeutral && isNarrowBB;
}


// indicators.js
function calculateRSI(closes, period = 14) {
    const rsi = [];
    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
        const change = closes[i] - closes[i - 1];
        change >= 0 ? gains += change : losses -= change;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;
    rsi[period] = 100 - 100 / (1 + avgGain / avgLoss);

    for (let i = period + 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        change >= 0 ? gains = change : gains = 0;
        change < 0 ? losses = -change : losses = 0;

        avgGain = (avgGain * (period - 1) + gains) / period;
        avgLoss = (avgLoss * (period - 1) + losses) / period;
        rsi[i] = 100 - 100 / (1 + avgGain / avgLoss);
    }

    return rsi;
}

function calculateADX(candles, period = 14) {
    const tr = [], plusDM = [], minusDM = [], dx = [], adx = [];

    for (let i = 1; i < candles.length; i++) {
        const current = candles[i];
        const prev = candles[i - 1];

        const highDiff = current.high - prev.high;
        const lowDiff = prev.low - current.low;

        plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
        minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);

        const range = Math.max(current.high - current.low, Math.abs(current.high - prev.close), Math.abs(current.low - prev.close));
        tr.push(range);
    }

    let tr14 = tr.slice(0, period).reduce((a, b) => a + b, 0);
    let plusDM14 = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
    let minusDM14 = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

    for (let i = period; i < tr.length; i++) {
        tr14 = tr14 - tr14 / period + tr[i];
        plusDM14 = plusDM14 - plusDM14 / period + plusDM[i];
        minusDM14 = minusDM14 - minusDM14 / period + minusDM[i];

        const plusDI = (plusDM14 / tr14) * 100;
        const minusDI = (minusDM14 / tr14) * 100;
        const dxi = (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100;
        dx.push(dxi);
    }

    let adxVal = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
    adx.push(adxVal);

    for (let i = period; i < dx.length; i++) {
        adxVal = (adxVal * (period - 1) + dx[i]) / period;
        adx.push(adxVal);
    }

    // Pad start with nulls to align length with candles
    return Array(candles.length - adx.length).fill(null).concat(adx);
}

function calculateBollingerBands(closes, period = 20, stdDev = 2) {
    const bands = [];

    for (let i = period - 1; i < closes.length; i++) {
        const slice = closes.slice(i - period + 1, i + 1);
        const mean = slice.reduce((a, b) => a + b, 0) / period;
        const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
        const stdev = Math.sqrt(variance);

        bands.push({
            upper: mean + stdDev * stdev,
            lower: mean - stdDev * stdev,
            middle: mean
        });
    }

    // Pad start with nulls
    return Array(closes.length - bands.length).fill(null).concat(bands);
}



// Binance OHLCV Fetcher (last 50 candles, 5m timeframe)
async function getOHLCV(symbol, interval = '5m', limit = 50) {
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await axios.get(url);
    return res.data.map(c => ({
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
    }));
}

// Get top 20 USDT trading pairs by volume
async function getTopSymbols(limit = 200) {
    const url = `https://fapi.binance.com/fapi/v1/ticker/24hr`;
    const res = await axios.get(url);
    const symbols = res.data
        .filter(s => s.symbol.endsWith('USDT') && !s.symbol.includes('BUSD') && !s.symbol.includes('DOWN') && !s.symbol.includes('UP'))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, limit)
        .map(s => s.symbol);
    return symbols;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function scanSidewaysSymbols() {
    const topSymbols = await getTopSymbols();
    const results = [];

    console.log(`Scanning ${topSymbols.length} top symbols for sideway conditions...\n`);

    for (const symbol of topSymbols) {
        try {
            const candles = await getOHLCV(symbol);
            const isSide = isSideways(candles);

            if (isSide) {
                console.log(`[SIDEWAY] ${symbol}`);
                results.push(symbol);
            } else {
                console.log(`[TRENDING] ${symbol}`);
            }
        } catch (err) {
            console.error(`Error checking ${symbol}:`, err.message);
        }

        // Wait 200ms before next request to avoid rate limit (5 req/sec)
        await sleep(200);
    }

    // Output to file
    fs.writeFileSync('sideways_coins.json', JSON.stringify(results, null, 2));
    console.log(`\n✅ Found ${results.length} sideways symbols. Saved to sideways_coins.json`);
}





scanSidewaysSymbols();
