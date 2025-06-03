// === RSI Calculation ===
 export function calculateRSI(closes, length = 14) {
    const gains = [], losses = [];

    for (let i = 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        gains.push(change > 0 ? change : 0);
        losses.push(change < 0 ? Math.abs(change) : 0);
    }

    const rsi = [];
    let avgGain = gains.slice(0, length).reduce((a, b) => a + b, 0) / length;
    let avgLoss = losses.slice(0, length).reduce((a, b) => a + b, 0) / length;
    rsi[length] = 100 - (100 / (1 + avgGain / avgLoss));

    for (let i = length + 1; i < closes.length; i++) {
        avgGain = (avgGain * (length - 1) + gains[i - 1]) / length;
        avgLoss = (avgLoss * (length - 1) + losses[i - 1]) / length;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi[i] = 100 - (100 / (1 + rs));
    }

    return rsi;
}

// === ADX Calculation ===
export function calculateADX(highs, lows, closes, length = 14) {
    const plusDM = [], minusDM = [], tr = [];

    for (let i = 1; i < highs.length; i++) {
        const up = highs[i] - highs[i - 1];
        const down = lows[i - 1] - lows[i];

        plusDM.push(up > down && up > 0 ? up : 0);
        minusDM.push(down > up && down > 0 ? down : 0);

        const trVal = Math.max(
            highs[i] - lows[i],
            Math.abs(highs[i] - closes[i - 1]),
            Math.abs(lows[i] - closes[i - 1])
        );
        tr.push(trVal);
    }

    function rma(values, length) {
        const rmaArr = [];
        let sum = values.slice(0, length).reduce((a, b) => a + b, 0);
        rmaArr[length - 1] = sum / length;
        for (let i = length; i < values.length; i++) {
            rmaArr[i] = (rmaArr[i - 1] * (length - 1) + values[i]) / length;
        }
        return rmaArr;
    }

    const trRMA = rma(tr, length);
    const plusRMA = rma(plusDM, length);
    const minusRMA = rma(minusDM, length);

    const plusDI = plusRMA.map((v, i) => (trRMA[i] ? 100 * v / trRMA[i] : 0));
    const minusDI = minusRMA.map((v, i) => (trRMA[i] ? 100 * v / trRMA[i] : 0));

    const dx = plusDI.map((v, i) => {
        const total = v + minusDI[i];
        return total ? 100 * Math.abs(v - minusDI[i]) / total : 0;
    });

    const adx = rma(dx.slice(length), length);
    return { adx, plusDI, minusDI };
}