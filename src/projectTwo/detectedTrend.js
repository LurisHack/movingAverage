import { EMA, ADX } from 'technicalindicators';
import { dataObject } from './dataObject.js';

function linearRegressionSlope(values) {
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i + 1);
    const avgX = x.reduce((a, b) => a + b) / n;
    const avgY = values.reduce((a, b) => a + b) / n;
    const numerator = x.reduce((sum, xi, i) => sum + (xi - avgX) * (values[i] - avgY), 0);
    const denominator = x.reduce((sum, xi) => sum + Math.pow(xi - avgX, 2), 0);
    return numerator / denominator;
}

function isHigherLows(lows) {
    let count = 0;
    for (let i = 1; i < lows.length; i++) {
        if (lows[i] >= lows[i - 1]) count++;
    }
    return count >= lows.length * 0.6;
}

function isLowerHighs(highs) {
    let count = 0;
    for (let i = 1; i < highs.length; i++) {
        if (highs[i] <= highs[i - 1]) count++;
    }
    return count >= highs.length * 0.6;
}

export function detectTrend(index) {
    const candles = dataObject.coins[index].candles;
    const lookback = dataObject.lookback || 15; // Reduced for 1-min TF
    const adxThreshold = dataObject.adxThreshold || 15; // Lower for 1-min
    const thresholdPercent = dataObject.thresholdPercent || 0.5;

    if (candles.length < lookback + 50) return 'unknown';

    const recent = candles.slice(-lookback);
    const highs = recent.map(c => parseFloat(c[2]));
    const lows = recent.map(c => parseFloat(c[3]));
    const closes = recent.map(c => parseFloat(c[4]));

    const fullCloses = candles.map(c => parseFloat(c[4]));
    const fullHighs = candles.map(c => parseFloat(c[2]));
    const fullLows = candles.map(c => parseFloat(c[3]));

    // EMA 5 & 13 (faster for 1-min TF)
    const ema5 = EMA.calculate({ period: 5, values: fullCloses }).at(-1);
    const ema13 = EMA.calculate({ period: 13, values: fullCloses }).at(-1);
    const emaTrend = ema5 > ema13 ? 'up' : ema5 < ema13 ? 'down' : 'side';

    // ADX + DI
    const adxArr = ADX.calculate({
        period: 14,
        close: fullCloses,
        high: fullHighs,
        low: fullLows
    });
    const adxLast = adxArr.at(-1);
    const adx = adxLast?.adx || 0;
    const plusDI = adxLast?.pdi || 0;
    const minusDI = adxLast?.mdi || 0;

    // Slope
    const slope = linearRegressionSlope(closes);
    const percentSlope = (closes.at(-1) - closes[0]) / closes[0] * 100;

    // Range %
    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    const mid = (maxHigh + minLow) / 2;
    const rangePercent = ((maxHigh - minLow) / mid) * 100;

    // Price Action
    const higherLows = isHigherLows(lows);
    const lowerHighs = isLowerHighs(highs);

    // Final Trend Decision
    if (
        (emaTrend === 'up' || percentSlope > 0.05) &&
        plusDI > minusDI &&
        adx >= adxThreshold &&
        higherLows
    ) {
        return 'uptrend';
    }

    if (
        (emaTrend === 'down' || percentSlope < -0.05) &&
        minusDI > plusDI &&
        adx >= adxThreshold &&
        lowerHighs
    ) {
        return 'downtrend';
    }

    if (
        rangePercent <= thresholdPercent &&
        Math.abs(percentSlope) < 0.05 &&
        adx < adxThreshold
    ) {
        return 'sideway';
    }

    return 'unknown';
}
