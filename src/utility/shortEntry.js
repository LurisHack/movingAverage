 import axios from 'axios';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ------------------ Indicator Functions ------------------

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

function calculateEMA(closes, period = 9) {
    const k = 2 / (period + 1);
    const ema = [closes.slice(0, period).reduce((a, b) => a + b, 0) / period];

    for (let i = period; i < closes.length; i++) {
        ema.push(closes[i] * k + ema[ema.length - 1] * (1 - k));
    }

    return Array(closes.length - ema.length).fill(null).concat(ema);
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

// ------------------ Trend & Reversal Detection ------------------

function isUptrend(candles) {
    const closes = candles.map(c => c.close);
    const ema9 = calculateEMA(closes, 9);
    const ema21 = calculateEMA(closes, 21);
    const rsi = calculateRSI(closes);
    const adx = calculateADX(candles);

    const last = closes.length - 1;
    return (
        ema9[last] > ema21[last] &&
        closes[last] > ema9[last] &&
        rsi[last] > 60 &&
        adx[last] > 20
    );
}

function isShortOpportunity(candles) {
    const closes = candles.map(c => c.close);
    const ema9 = calculateEMA(closes, 9);
    const ema21 = calculateEMA(closes, 21);
    const rsi = calculateRSI(closes);

    const last = closes.length - 1;
    const prevRSI = rsi[last - 1];
    const currentRSI = rsi[last];

    const rsiDivergence = prevRSI > 70 && currentRSI < prevRSI;
    const emaCrossDown = ema9[last] < ema21[last];
    const bearishCandle = candles[last].close < candles[last].open;

    return rsiDivergence && emaCrossDown && bearishCandle;
}

// ------------------ Binance API ------------------

async function getOHLCV(symbol, interval = '15m', limit = 50) {
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
        .filter(s => s.symbol.endsWith('USDT') && !s.symbol.includes('DOWN') && !s.symbol.includes('UP'))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, limit)
        .map(s => s.symbol);
}

// ------------------ Scanner ------------------

export async function scanMarketsForShortOpportunities(limit = 30, interval = '15m') {
    const symbols = await getTopSymbols(limit);
    const shortCandidates = [];

    for (const symbol of symbols) {
        try {
            const candles = await getOHLCV(symbol, interval, 51);
            const price = candles[candles.length - 1].close;

            if (price > 1 && isUptrend(candles) && isShortOpportunity(candles)) {
                shortCandidates.push({ symbol, price });
                console.log(`⚠️ ${symbol} may reverse. Price: ${price}`);
            }
        } catch (err) {
            console.error(`⚠️ Error on ${symbol}: ${err.message}`);
        }
        await sleep(200);
    }

    return shortCandidates;
}

// Example Run
(async () => {
    const result = await scanMarketsForShortOpportunities(250, '30m');
    console.log('🔻 Short Opportunities from Uptrend:');
    result.forEach(r => console.log(`${r.symbol} @ ${r.price}`));
})();
