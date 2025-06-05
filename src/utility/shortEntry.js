// Full code for scanning 5m timeframe short entry signals using RSI, ADX, EMA, and candlestick pattern

import fs from 'fs';
import axios from 'axios';
import { getTopSymbols, sleep } from "../projectOne/utility/utility.js";

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

function isShortEntrySignal(candles) {
    const closes = candles.map(c => c.close);
    const rsi = calculateRSI(closes);
    const lastRSI = rsi[rsi.length - 1];
    const prevRSI = rsi[rsi.length - 2];

    const adx = calculateADX(candles);
    const lastADX = adx[adx.length - 1];

    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];

    const bearishEngulf = prevCandle.close > prevCandle.open &&
        lastCandle.open > lastCandle.close &&
        lastCandle.close < prevCandle.open &&
        lastCandle.open > prevCandle.close;

    return (
        lastRSI < prevRSI && lastRSI < 60 &&
        lastADX > 20 &&
        bearishEngulf
    );
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

// ------------------ Market Scanner ------------------

export async function scanMarkets(limit, interval = '5m') {
    const symbols = await getTopSymbols(limit);
    const shorts = [];

    console.log(`Scanning ${symbols.length} symbols on ${interval} timeframe...`);

    for (const symbol of symbols) {
        try {
            const candles = await getOHLCV(symbol, interval, 52);
            if (!candles || candles.length < 20) continue;

            const close = candles[candles.length - 1].close;
            const prevClose = candles[candles.length - 2].close;

            if (close > 1 && isShortEntrySignal(candles)) {
                const percentDrop = ((prevClose - close) / prevClose) * 100;
                shorts.push({ symbol, price: close, percentDrop });
            }
        } catch (err) {
            console.error(`Error on ${symbol}: ${err.message}`);
        }

        await sleep(200);
    }

    shorts.sort((a, b) => b.percentDrop - a.percentDrop);
    return shorts;
}

// ------------------ Execution ------------------

(async () => {
    const result = await scanMarkets(200, '15m');
    console.log("\n📉 Short Entry Candidates:");
    result.forEach(d => console.log(`${d.symbol} @ ${d.price.toFixed(4)} 🔻 ${d.percentDrop.toFixed(2)}%`));
})();
