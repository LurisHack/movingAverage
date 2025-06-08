import axios from 'axios';
import { sleep, getTopSymbols } from '../projectOne/utility/utility.js';

// --- EMA Calculation ---
function calculateEMA(values, period) {
    const k = 2 / (period + 1);
    let emaArray = [values.slice(0, period).reduce((a, b) => a + b, 0) / period];

    for (let i = period; i < values.length; i++) {
        emaArray.push(values[i] * k + emaArray[emaArray.length - 1] * (1 - k));
    }
    return Array(values.length - emaArray.length).fill(null).concat(emaArray);
}

// --- MACD ---
function calculateMACD(closes) {
    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);
    const macdLine = ema12.map((v, i) => (v !== null && ema26[i] !== null ? v - ema26[i] : null));
    const signalLine = calculateEMA(macdLine.filter(v => v !== null), 9);
    const fullSignal = Array(macdLine.length - signalLine.length).fill(null).concat(signalLine);
    return { macdLine, signalLine: fullSignal };
}

// --- VWAP ---
function calculateVWAP(candles) {
    let cumPV = 0, cumVolume = 0;
    return candles.map(c => {
        const typical = (c.high + c.low + c.close) / 3;
        cumPV += typical * c.volume;
        cumVolume += c.volume;
        return cumVolume === 0 ? 0 : cumPV / cumVolume;
    });
}

// --- RSI ---
function calculateRSI(closes, period = 14) {
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;
    const rsiArray = [100 - (100 / (1 + avgGain / avgLoss))];

    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) {
            avgGain = (avgGain * (period - 1) + diff) / period;
            avgLoss = (avgLoss * (period - 1)) / period;
        } else {
            avgGain = (avgGain * (period - 1)) / period;
            avgLoss = (avgLoss * (period - 1) - diff) / period;
        }

        const rs = avgGain / (avgLoss || 1);
        rsiArray.push(100 - 100 / (1 + rs));
    }

    return Array(closes.length - rsiArray.length).fill(null).concat(rsiArray);
}

// --- Volume Spike ---
function isVolumeSpike(volumes, multiplier = 2) {
    const recent = volumes[volumes.length - 1];
    const avg = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    return recent > avg * multiplier;
}

// --- ADX Calculation ---
function calculateADX(candles, period = 14) {
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const closes = candles.map(c => c.close);

    const tr = [];
    const plusDM = [];
    const minusDM = [];

    for (let i = 1; i < candles.length; i++) {
        const highDiff = highs[i] - highs[i - 1];
        const lowDiff = lows[i - 1] - lows[i];

        const upMove = highDiff > 0 && highDiff > lowDiff ? highDiff : 0;
        const downMove = lowDiff > 0 && lowDiff > highDiff ? lowDiff : 0;

        const currentTR = Math.max(
            highs[i] - lows[i],
            Math.abs(highs[i] - closes[i - 1]),
            Math.abs(lows[i] - closes[i - 1])
        );

        plusDM.push(upMove);
        minusDM.push(downMove);
        tr.push(currentTR);
    }

    const smooth = (arr, period) => {
        let result = [];
        let sum = arr.slice(0, period).reduce((a, b) => a + b, 0);
        result[period - 1] = sum;

        for (let i = period; i < arr.length; i++) {
            sum = result[i - 1] - result[i - 1] / period + arr[i];
            result[i] = sum;
        }
        return result;
    };

    const smoothedTR = smooth(tr, period);
    const smoothedPlusDM = smooth(plusDM, period);
    const smoothedMinusDM = smooth(minusDM, period);

    const plusDI = smoothedPlusDM.map((dm, i) =>
        smoothedTR[i] ? (100 * dm) / smoothedTR[i] : 0
    );
    const minusDI = smoothedMinusDM.map((dm, i) =>
        smoothedTR[i] ? (100 * dm) / smoothedTR[i] : 0
    );

    const dx = plusDI.map((p, i) =>
        (Math.abs(p - minusDI[i]) / (p + minusDI[i])) * 100 || 0
    );

    const adx = [];
    const firstADX = dx.slice(period - 1, period * 2 - 1).reduce((a, b) => a + b, 0) / period;
    adx[period * 2 - 2] = firstADX;

    for (let i = period * 2 - 1; i < dx.length; i++) {
        adx[i] = ((adx[i - 1] * (period - 1)) + dx[i]) / period;
    }

    return Array(candles.length - adx.length).fill(null).concat(adx);
}

// --- Long Signal Logic ---
function isLongSignal(candles) {
    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);
    const macd = calculateMACD(closes);
    const vwap = calculateVWAP(candles);
    const rsi = calculateRSI(closes);
    const adx = calculateADX(candles);
    const last = closes.length - 1;

    return (
        macd.macdLine[last] > macd.signalLine[last] &&
        closes[last] > vwap[last] &&
        rsi[last] > 30 && rsi[last] < 50 &&
        adx[last] >= 15 &&
        isVolumeSpike(volumes)
    );


    // return (
    //     macd.macdLine[last] > macd.signalLine[last] &&
    //     closes[last] > vwap[last] &&
    //     rsi[last] > 30 && rsi[last] < 60 &&
    //     adx[last] >= 20 &&
    //     isVolumeSpike(volumes)
    // );
}

// --- Short Signal Logic ---
function isShortSignal(candles) {
    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);
    const macd = calculateMACD(closes);
    const vwap = calculateVWAP(candles);
    const rsi = calculateRSI(closes);
    const adx = calculateADX(candles);
    const last = closes.length - 1;

    return (
        macd.macdLine[last] < macd.signalLine[last] &&
        closes[last] < vwap[last] &&
        rsi[last] < 80 && rsi[last] > 50 &&
        adx[last] >= 15 &&
        isVolumeSpike(volumes)
    );

    // return (
    //     macd.macdLine[last] < macd.signalLine[last] &&
    //     closes[last] < vwap[last] &&
    //     rsi[last] < 70 && rsi[last] > 40 &&
    //     adx[last] >= 20 &&
    //     isVolumeSpike(volumes)
    // );
}

// --- Binance OHLCV ---
async function getOHLCV(symbol, interval = '5m', limit = 100) {
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

// --- Combined Scanner ---
export async function combinedScanner(limit = 100, interval = '15m', ohlcvLimit = 100) {
    const symbols = await getTopSymbols(limit);
    const longSignals = [];
    const shortSignals = [];

    for (const symbol of symbols) {
        try {
            const candles = await getOHLCV(symbol, interval, ohlcvLimit);
            if (candles.length < 30) continue;

            if (isLongSignal(candles)) {
                longSignals.push({ symbol, price: candles[candles.length - 1].close });
            } else if (isShortSignal(candles)) {
                shortSignals.push({ symbol, price: candles[candles.length - 1].close });
            }
        } catch (e) {
            console.error(`❌ Error processing ${symbol}: ${e.message}`);
        }
        await sleep(200); // API rate limit protection
    }

    return { longSignals, shortSignals };
}

// --- Execute Scanner ---
(async () => {


   async function start(){

       console.log('Starting...');
        const { longSignals, shortSignals } = await combinedScanner(390, '5m', 250);

        console.log("\n📈 Long Signals:");
        longSignals.forEach(d => console.log(`${d.symbol} @ ${d.price}`));

        console.log("\n📉 Short Signals:");
        shortSignals.forEach(d => console.log(`${d.symbol} @ ${d.price}`));

        console.log('End')
        await setTimeout(start, 1000);

    }

    start();

})();
