import { dataObject } from "./dataObject.js";

// EMA Calculator
function calculateEMA(values, period) {
    const k = 2 / (period + 1);
    let ema = values[0];
    const result = [ema];
    for (let i = 1; i < values.length; i++) {
        ema = values[i] * k + ema * (1 - k);
        result.push(ema);
    }
    return result;
}

// Simplified ADX Strength Estimator (returns dummy value for now)
function estimateTrendStrength(highs, lows, closes) {
    let gain = 0;
    for (let i = 1; i < highs.length; i++) {
        if (closes[i] > closes[i - 1]) gain++;
    }
    const ratio = gain / (highs.length - 1);
    return ratio >= 0.6 ? 25 : ratio <= 0.4 ? 25 : 10; // Approximate ADX-like threshold
}

export function detectTrend(index) {
    const candles = dataObject.coins[index].candles;
    const lookback = dataObject.lookback || 20;
    const minSlope = dataObject.minSlope || 0.5;
    const thresholdPercent = dataObject.thresholdPercent || 1;

    if (candles.length < lookback) return 'unknown';

    const recent = candles.slice(-lookback);
    const closes = recent.map(c => parseFloat(c[4]));
    const highs = recent.map(c => parseFloat(c[2]));
    const lows = recent.map(c => parseFloat(c[3]));

    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    const mid = (maxHigh + minLow) / 2;
    const rangePercent = ((maxHigh - minLow) / mid) * 100;
    const slope = closes[closes.length - 1] - closes[0];

    // Check higher lows
    const higherLows = recent.every((c, i) =>
        i === 0 ? true : c[3] >= recent[i - 1][3] || Math.abs(c[3] - recent[i - 1][3]) < 0.2
    );

    // Check lower highs
    const lowerHighs = recent.every((c, i) =>
        i === 0 ? true : c[2] <= recent[i - 1][2] || Math.abs(c[2] - recent[i - 1][2]) < 0.2
    );

    // EMA Confirmation
    const emaFast = calculateEMA(closes, 9).at(-1);
    const emaSlow = calculateEMA(closes, 21).at(-1);
    const emaTrend = emaFast > emaSlow ? 'up' : emaFast < emaSlow ? 'down' : 'side';

    // Trend Strength (Simulated ADX)
    const adx = estimateTrendStrength(highs, lows, closes);

    // Final Decision
    if (slope > minSlope && higherLows && emaTrend === 'up' && adx >= 20)
        return 'uptrend';

    if (slope < -minSlope && lowerHighs && emaTrend === 'down' && adx >= 20)
        return 'downtrend';

    if (rangePercent <= thresholdPercent && Math.abs(slope) <= minSlope)
        return 'sideway';

    return 'unknown';
}
