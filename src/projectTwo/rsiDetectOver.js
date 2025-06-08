import {dataObject} from "./dataObject.js";

// ✅ RSI Calculation
function calculateRSI(index) {
    const candles = dataObject.coins[index].candles;
    const closes = candles.map(c => parseFloat(c[4]));
    if (closes.length < dataObject.rsiPeriod + 1) return null;

    let gains = 0;
    let losses = 0;

    for (let i = closes.length - dataObject.rsiPeriod - 1; i < closes.length - 1; i++) {
        const change = closes[i + 1] - closes[i];
        if (change >= 0) gains += change;
        else losses -= change;
    }

    const avgGain = gains / dataObject.rsiPeriod;
    const avgLoss = losses / dataObject.rsiPeriod;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

// ✅ Stochastic RSI Calculation
export function getStochRSI(index) {
    const candles = dataObject.coins[index].candles;
    const closes = candles.map(c => parseFloat(c[4]));
    if (closes.length < 28) return null; // 14 RSI + 14 Stoch Period

    const rsiPeriod = 14;
    const rsiValues = [];

    for (let i = 0; i < closes.length - rsiPeriod; i++) {
        const slice = closes.slice(i, i + rsiPeriod + 1);
        let gains = 0, losses = 0;

        for (let j = 0; j < rsiPeriod; j++) {
            const delta = slice[j + 1] - slice[j];
            if (delta > 0) gains += delta;
            else losses -= delta;
        }

        const avgGain = gains / rsiPeriod;
        const avgLoss = losses / rsiPeriod;

        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        rsiValues.push(rsi);
    }

    const recentRsi = rsiValues.slice(-14);
    const minRsi = Math.min(...recentRsi);
    const maxRsi = Math.max(...recentRsi);
    const lastRsi = rsiValues[rsiValues.length - 1];

    const stochRsi = (maxRsi - minRsi) === 0 ? 0 : ((lastRsi - minRsi) / (maxRsi - minRsi)) * 100;
    return stochRsi;
}

// ✅ MACD Calculation
export function getMACD(index, fast = 12, slow = 26, signal = 9) {
    const candles = dataObject.coins[index].candles;
    const closes = candles.map(c => parseFloat(c[4]));
    if (closes.length < slow + signal) return null;

    const ema = (arr, period) => {
        const k = 2 / (period + 1);
        let emaArray = [arr.slice(0, period).reduce((a, b) => a + b) / period];
        for (let i = period; i < arr.length; i++) {
            emaArray.push((arr[i] - emaArray[emaArray.length - 1]) * k + emaArray[emaArray.length - 1]);
        }
        return emaArray;
    };

    const fastEma = ema(closes, fast);
    const slowEma = ema(closes, slow);
    const macdLine = fastEma.slice(slowEma.length * -1).map((v, i) => v - slowEma[i]);
    const signalLine = ema(macdLine, signal);
    const histogram = macdLine.slice(-1)[0] - signalLine.slice(-1)[0];

    return {
        macd: macdLine.slice(-1)[0],
        signal: signalLine.slice(-1)[0],
        histogram
    };
}

export function isVolumeSpike(index, length = 20, spikeMultiplier = 2) {
    const candles = dataObject.coins[index].candles;
    if (candles.length < length + 1) return false;

    const volumes = candles.map(c => parseFloat(c[5]));
    const recentVolumes = volumes.slice(-length - 1, -1); // last `length` excluding current
    const averageVolume = recentVolumes.reduce((a, b) => a + b, 0) / length;
    const latestVolume = volumes[volumes.length - 1];

    return latestVolume > averageVolume * spikeMultiplier;
}

export function getCandlePattern(index) {
    const candles = dataObject.coins[index].candles;
    if (candles.length < 2) return null;

    const [prev, curr] = candles.slice(-2).map(c => ({
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4])
    }));

    const isBullishEngulfing = prev.close < prev.open && curr.close > curr.open &&
        curr.open < prev.close && curr.close > prev.open;

    const isBearishEngulfing = prev.close > prev.open && curr.close < curr.open &&
        curr.open > prev.close && curr.close < prev.open;

    const isDoji = Math.abs(curr.close - curr.open) < (curr.high - curr.low) * 0.1;

    const body = Math.abs(curr.close - curr.open);
    const upperWick = curr.high - Math.max(curr.close, curr.open);
    const lowerWick = Math.min(curr.close, curr.open) - curr.low;

    const isPinBar = (upperWick > body * 2 && lowerWick < body * 0.5) ||
        (lowerWick > body * 2 && upperWick < body * 0.5);

    return {
        isBullishEngulfing,
        isBearishEngulfing,
        isDoji,
        isPinBar
    };
}


export function isBullishReversalSignal(index) {
    const volumeSpike = isVolumeSpike(index);
    const pattern = getCandlePattern(index);

    return volumeSpike && (
        pattern?.isBullishEngulfing ||
        pattern?.isPinBar // bullish pin bar (long lower wick)
    );
}

export function isBearishReversalSignal(index) {
    const volumeSpike = isVolumeSpike(index);
    const pattern = getCandlePattern(index);

    return volumeSpike && (
        pattern?.isBearishEngulfing ||
        pattern?.isPinBar // bearish pin bar (long upper wick)
    );
}


// ✅ Overbought Check with MACD Filter
export function isOverBought(index) {
    const rsi = calculateRSI(index);
    const stoch = getStochRSI(index);
    const macd = getMACD(index);
    const volumeSpike = isVolumeSpike(index);
    const bullishReversal = isBullishReversalSignal(index);

    if (rsi !== null && stoch !== null && macd !== null && volumeSpike) {
        return (
            rsi >= dataObject.overboughtThreshold &&
            stoch > dataObject.overboughtThreshold &&
            (macd.histogram > 0)
            // && bullishReversal
        );
    }
    return false;
}

// ✅ Oversold Check with MACD Filter
export function isOverSold(index) {
    const rsi = calculateRSI(index);
    const stoch = getStochRSI(index);
    const macd = getMACD(index);
    const volumeSpike = isVolumeSpike(index);
    const bearishReversal = isBearishReversalSignal(index); // ✅ fix here

    if (rsi !== null && stoch !== null && macd !== null && volumeSpike) {
        return (
            rsi <= dataObject.oversoldThreshold &&
            stoch < dataObject.oversoldThreshold &&
            (macd.histogram < 0)
            // && bearishReversal
        );
    }
    return false;
}

// ✅ Optional: Export individual values
export function getRSI(index) {
    return calculateRSI(index);
}

export function getLastMACD(index) {
    return getMACD(index);
}


export function forSideWayOver(index) {

    const rsi = calculateRSI(index);
    const stoch = getStochRSI(index);
    const macd = getMACD(index);
    // const volumeSpike = isVolumeSpike(index);
    const bullishReversal = isBullishReversalSignal(index); // ✅ fix here
    const bearishReversal = isBearishReversalSignal(index);

    if (rsi !== null && stoch !== null && macd !== null) {

        return {
            buy:
                rsi < dataObject.sideWayOversoldThreshold &&
                stoch < dataObject.sideWayOversoldThreshold &&
                 (macd.histogram > 0),
                 bullishReversal,

            sell:
                rsi >= dataObject.sideWayOverboughtThreshold &&
                stoch > dataObject.sideWayOverboughtThreshold &&
                 (macd.histogram < 0),
                bearishReversal,

        }
    }
}