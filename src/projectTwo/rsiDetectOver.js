import {dataObject} from "./dataObject.js";
import {MACD} from "technicalindicators";

// ✅ RSI Calculation
function calculateRSI(index) {
    const candles = dataObject.coins[index].candles;
    const period = dataObject.rsiPeriod || 14;
    const closes = candles.map(c => parseFloat(c[4]));

    if (closes.length < period + 1) return null;

    // Initial average gain/loss
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const change = closes[i] - closes[i - 1];
        if (change >= 0) gains += change;
        else losses -= change;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Wilder's smoothing for remaining candles
    for (let i = period + 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
}

// ✅ Stochastic RSI Calculation
export function getStochRSI(index) {
    const candles = dataObject.coins[index].candles;
    const closes = candles.map(c => parseFloat(c[4]));
    if (closes.length < 14 + 14) return null; // 14 RSI + 14 Stoch Period

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


// Helper: Supertrend Calculation
function getSupertrendSignal(index) {
    const candles = dataObject.coins[index].candles;
    if (candles.length < 15) return null;

    const atrPeriod = 10;
    const multiplier = 3;

    const highs = candles.map(c => parseFloat(c[2]));
    const lows = candles.map(c => parseFloat(c[3]));
    const closes = candles.map(c => parseFloat(c[4]));

    const tr = [];
    for (let i = 1; i < candles.length; i++) {
        const high = highs[i];
        const low = lows[i];
        const prevClose = closes[i - 1];
        tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    }

    const atr = [];
    for (let i = atrPeriod - 1; i < tr.length; i++) {
        const slice = tr.slice(i - atrPeriod + 1, i + 1);
        const avg = slice.reduce((a, b) => a + b, 0) / atrPeriod;
        atr.push(avg);
    }

    const basicUpperBand = closes.slice(-atr.length).map((close, i) => (highs[i + atrPeriod] + lows[i + atrPeriod]) / 2 + multiplier * atr[i]);
    const basicLowerBand = closes.slice(-atr.length).map((close, i) => (highs[i + atrPeriod] + lows[i + atrPeriod]) / 2 - multiplier * atr[i]);

    const finalUpperBand = [];
    const finalLowerBand = [];
    const trend = [];

    for (let i = 0; i < atr.length; i++) {
        if (i === 0) {
            finalUpperBand.push(basicUpperBand[i]);
            finalLowerBand.push(basicLowerBand[i]);
            trend.push('down');
        } else {
            const prevClose = closes[i + atrPeriod - 1];
            const prevUpper = finalUpperBand[i - 1];
            const prevLower = finalLowerBand[i - 1];

            const currUpper = basicUpperBand[i] < prevUpper || prevClose > prevUpper ? basicUpperBand[i] : prevUpper;
            const currLower = basicLowerBand[i] > prevLower || prevClose < prevLower ? basicLowerBand[i] : prevLower;

            finalUpperBand.push(currUpper);
            finalLowerBand.push(currLower);

            const direction = prevClose <= currUpper ? 'down' : 'up';
            trend.push(direction);
        }
    }

    return trend[trend.length - 1]; // latest trend: 'up' or 'down'
}

// ✅ MACD Calculation
// MACD Calculation
function getMACD(index) {
    const candles = dataObject.coins[index].candles;
    const closes = candles.map(c => parseFloat(c[4]));
    if (closes.length < 35) return null;

    const macdInput = {
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    };

    const macdArr = MACD.calculate(macdInput);
    const last2 = macdArr.slice(-2);
    if (last2.length < 2) return null;

    const weakening = last2[1].histogram < last2[0].histogram;

    return {
        ...last2[1],
        weakening
    };
}


// Bullish Reversal Signal
function isBullishReversalSignal(index) {
    const candles = dataObject.coins[index].candles;
    if (candles.length < 3) return false;

    const [prev, last] = candles.slice(-2).map(c => ({
        open: parseFloat(c[1]),
        close: parseFloat(c[4]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3])
    }));

    const bodySize = Math.abs(last.close - last.open);
    if (bodySize < (last.high - last.low) * 0.25) return false;

    return last.close > last.open &&
        prev.close < prev.open &&
        last.close > prev.open &&
        last.open < prev.close;
}

// Bearish Reversal Signal
function isBearishReversalSignal(index) {
    const candles = dataObject.coins[index].candles;
    if (candles.length < 3) return false;

    const [prev, last] = candles.slice(-2).map(c => ({
        open: parseFloat(c[1]),
        close: parseFloat(c[4]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3])
    }));

    const bodySize = Math.abs(last.close - last.open);
    if (bodySize < (last.high - last.low) * 0.25) return false;

    return last.close < last.open &&
        prev.close > prev.open &&
        last.close < prev.open &&
        last.open > prev.close;
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
            rsi > dataObject.overboughtThreshold &&
            stoch > dataObject.overboughtThreshold &&
            (macd.histogram > 0) &&
            !macd.weakening
            && bullishReversal
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
            (macd.histogram < 0) &&
            !macd.weakening
            && bearishReversal
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

    if (rsi === null || stoch === null || macd === null) {
        return { overSold: false, overBought: false };
    }else {

        return {
            overSold:
                rsi < dataObject.sideWayOversoldThreshold &&
                stoch < dataObject.sideWayOversoldThreshold &&
                 (macd.histogram > 0) &&
                 bullishReversal,

            overBought:
                rsi >= dataObject.sideWayOverboughtThreshold &&
                stoch > dataObject.sideWayOverboughtThreshold &&
                 (macd.histogram < 0) &&
                bearishReversal,

        }
    }
}


// Main Buy/Sell Signal
export function buySell(index) {
    const candles = dataObject.coins[index].candles;
    if (!candles || candles.length < 35) return { buy: false, sell: false };

    const macd = getMACD(index);
    const trend = getSupertrendSignal(index);
    const bullish = isBullishReversalSignal(index);
    const bearish = isBearishReversalSignal(index);

    const lastVolume = parseFloat(candles[candles.length - 1][5]);
    const avgVolume = candles.slice(-20).reduce((acc, c) => acc + parseFloat(c[5]), 0) / 20;
    const strongVolume = lastVolume > avgVolume * 0.8;

    const strongMACD = macd && macd.histogram > 0 && macd.MACD > macd.signal && !macd.weakening;
    const strongSellMACD = macd && macd.histogram < 0 && macd.MACD < macd.signal && !macd.weakening;

    return {
        buy: strongMACD && bullish && trend === 'up' && strongVolume,
        sell: strongSellMACD && bearish && trend === 'down' && strongVolume
    };
}

export function exitSignal(index) {
    const bullishReversal = isBullishReversalSignal(index);
    const bearishReversal = isBearishReversalSignal(index);
    const rsi = calculateRSI(index);
    const macd = getMACD(index);
    const volumeSpike = isVolumeSpike(index);

    if (!macd || rsi === null) {
        return { sellExit: false, buyExit: false };
    }

    return {
        sellExit:
            bullishReversal &&                  // bearish position → exit when bullish reversal
            macd.histogram > 0 &&                // MACD turning positive
            macd.weakening &&                    // but weakening
            // rsi < 70 &&                          // previously overbought, now weakening
            volumeSpike,                         // spike may suggest distribution

        buyExit:
            bearishReversal &&           // bullish position → exit when bearish reversal
            macd.histogram < 0 &&                // MACD turning negative
            macd.weakening &&                    // momentum weakening
            // rsi > 30 &&                          // previously oversold, now weakening
            volumeSpike                          // spike may suggest selling pressure
    };
}

