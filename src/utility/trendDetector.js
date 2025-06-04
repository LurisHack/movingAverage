import fs from 'fs';
import axios from 'axios';

// Utility
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ------------------ Indicator Calculations ------------------

function calculateRSI(closes, period = 14) {
    const rsi = [];
    let gains = 0, losses = 0;

    for (let i = 1; i <= period; i++) {
        const change = closes[i] - closes[i - 1];
        change >= 0 ? gains += change : losses -= change;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;
    rsi[period] = 100 - 100 / (1 + avgGain / avgLoss);

    for (let i = period + 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        rsi[i] = 100 - 100 / (1 + avgGain / avgLoss);
    }

    return rsi;
}

function calculateADX(candles, period = 14) {
    const tr = [], plusDM = [], minusDM = [], dx = [], adx = [];

    for (let i = 1; i < candles.length; i++) {
        const curr = candles[i], prev = candles[i - 1];
        const highDiff = curr.high - prev.high;
        const lowDiff = prev.low - curr.low;

        plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
        minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);

        const range = Math.max(
            curr.high - curr.low,
            Math.abs(curr.high - prev.close),
            Math.abs(curr.low - prev.close)
        );
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

    return Array(candles.length - adx.length).fill(null).concat(adx);
}

function calculateEMA(closes, period = 9) {
    const k = 2 / (period + 1);
    const ema = [closes.slice(0, period).reduce((a, b) => a + b, 0) / period];

    for (let i = period; i < closes.length; i++) {
        ema.push(closes[i] * k + ema[ema.length - 1] * (1 - k));
    }

    return Array(closes.length - ema.length).fill(null).concat(ema);
}

// ------------------ Pattern Detection ------------------

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
    const rsi = calculateRSI(closes, 14);
    const bbWidth = (Math.max(...closes) - Math.min(...closes)) / avgPrice;

    return (
        priceRange < rangeThreshold &&
        adx[adx.length - 1] < adxThreshold &&
        rsi[rsi.length - 1] > rsiRange[0] &&
        rsi[rsi.length - 1] < rsiRange[1] &&
        bbWidth < bbWidthThreshold
    );
}


function isUptrend(candles, options = {}) {
    const {
        adxThreshold = 20,
        rsiThreshold = 60,
    } = options;

    if (candles.length < 20) return false;

    const closes = candles.map(c => c.close);
    const adx = calculateADX(candles);
    const rsi = calculateRSI(closes, 14);
    const ema9 = calculateEMA(closes, 9);
    const ema21 = calculateEMA(closes, 21);

    const lastClose = closes[closes.length - 1];
    const lastEma9 = ema9[ema9.length - 1];
    const lastEma21 = ema21[ema21.length - 1];

    const emaBullish = lastEma9 > lastEma21 && lastClose > lastEma9;
    const isTrending = adx[adx.length - 1] > adxThreshold;
    const isBullishRSI = rsi[rsi.length - 1] > rsiThreshold;

    return emaBullish && isTrending && isBullishRSI;
}


function isDowntrend(candles, options = {}) {
    const {
        adxThreshold = 20,
        rsiThreshold = 40,
    } = options;

    if (candles.length < 20) return false;

    const closes = candles.map(c => c.close);
    const adx = calculateADX(candles);
    const rsi = calculateRSI(closes, 14);
    const ema9 = calculateEMA(closes, 9);
    const ema21 = calculateEMA(closes, 21);

    const lastClose = closes[closes.length - 1];
    const lastEma9 = ema9[ema9.length - 1];
    const lastEma21 = ema21[ema21.length - 1];

    const emaBearish = lastEma9 < lastEma21 && lastClose < lastEma9;
    const isTrending = adx[adx.length - 1] > adxThreshold;
    const isBearishRSI = rsi[rsi.length - 1] < rsiThreshold;

    return emaBearish && isTrending && isBearishRSI;
}

// ------------------ Binance API ------------------

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

async function getTopSymbols(limit = 20) {
    const url = `https://fapi.binance.com/fapi/v1/ticker/24hr`;
    const res = await axios.get(url);
    return res.data
        .filter(s => s.symbol.endsWith('USDT') && !s.symbol.includes('BUSD') && !s.symbol.includes('DOWN') && !s.symbol.includes('UP'))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, limit)
        .map(s => s.symbol);
}

// ------------------ Scanner ------------------

export async function scanMarkets(limit) {
    const symbols = await getTopSymbols(limit);
    const uptrends = [];
    const downtrends = [];
    const sideways = [];

    console.log(`🔍 Scanning ${symbols.length} top symbols...\n`);

    for (const symbol of symbols) {
        try {
            const candles = await getOHLCV(symbol, '5m', 51); // Need 51 to calculate change
            const close = candles[candles.length - 1].close;
            const prevClose = candles[candles.length - 2].close;

            if (close > 1) continue;

            if (isDowntrend(candles)) {
                const percentDrop = ((prevClose - close) / prevClose) * 100;
                downtrends.push({ symbol, price: close, percentDrop });
            } else if (isUptrend(candles)) {
                const percentGain = ((close - prevClose) / prevClose) * 100;
                uptrends.push({ symbol, price: close, percentGain });
            } else if (isSideways(candles)) {
                sideways.push({ symbol, price: close });
            }
        } catch (err) {
            console.error(`⚠️ Error on ${symbol}: ${err.message}`);
        }

        await sleep(200);
    }

// Sort by biggest drop first
    downtrends.sort((a, b) => b.percentDrop - a.percentDrop);

// Sort by biggest gain first
    uptrends.sort((a, b) => b.percentGain - a.percentGain);

    return { uptrends, downtrends, sideways };

}



// const result = await scanMarkets(100);
// console.log("📉 Downtrend Coins (sorted by % drop):");
// result.downtrends.forEach(d => {
//     console.log(`${d.symbol} @ ${d.price.toFixed(4)} 🔻 ${d.percentDrop.toFixed(2)}%`);
// });

// console.log(result);
