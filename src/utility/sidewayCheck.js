

// === Sideway Detection ===
function detectSideway({
                           prices,
                           volumes,
                           thresholdPercent = 1.5,
                           adx = null,
                           rsi = null
                       }) {
    const result = {
        isSideway: false,
        reasons: []
    };

    const recentPrices = prices.slice(-20);
    const recentVolumes = volumes.slice(-20);

    const max = Math.max(...recentPrices);
    const min = Math.min(...recentPrices);
    const priceRange = ((max - min) / min) * 100;

    if (priceRange <= thresholdPercent) {
        result.reasons.push('Price is moving within a tight range (low volatility)');
    }

    if (rsi && rsi.length >= 20) {
        const rsiSlice = rsi.slice(-20);
        const avgRsi = rsiSlice.reduce((a, b) => a + b, 0) / rsiSlice.length;

        if (avgRsi > 45 && avgRsi < 55) {
            result.reasons.push('RSI shows weak momentum (sideway)');
        }
    }

    if (adx && adx.length >= 20) {
        const avgAdx = adx.slice(-20).reduce((a, b) => a + b, 0) / 20;
        if (avgAdx < 20) {
            result.reasons.push('ADX shows weak trend strength (< 20)');
        }
    }

    const avgVol = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const volMax = Math.max(...recentVolumes);
    const volMin = Math.min(...recentVolumes);
    const volRange = ((volMax - volMin) / avgVol) * 100;

    if (volRange < 30) {
        result.reasons.push('Volume is flat (no strong buying/selling activity)');
    }

    let smallCandles = 0;
    for (let i = 1; i < recentPrices.length; i++) {
        const body = Math.abs(recentPrices[i] - recentPrices[i - 1]);
        if ((body / recentPrices[i - 1]) * 100 < 0.5) {
            smallCandles++;
        }
    }

    if (smallCandles > 12) {
        result.reasons.push('Many small-bodied candles (low conviction)');
    }

    if (priceRange <= thresholdPercent && volRange < 30) {
        result.reasons.push('Automated detection confirms range-bound behavior');
    }

    if (result.reasons.length >= 3) {
        result.isSideway = true;
    }

    return result;
}

// === Example Data & Usage ===
//
// const closes = [100.1, 100.3, 100.2, 99.9, 100.0, 100.4, 99.8];
// const volumes = [110, 115, 112, 108, 111, 109, 113];
// const highs = [100.4, 100.5, 100.3, 100.0, 100.2, 100.6, 100.0];
// const lows =  [99.9, 100.0, 99.8, 99.7, 99.9, 100.1, 99.7];


// Sideway check
// const sidewayCheck = detectSideway({
//     prices: closes,
//     volumes: volumes,
//     rsi: rsi,
//     adx: adx
// });
//
// if (sidewayCheck.isSideway) {
//     console.log("🔍 Market is SIDEWAY");
//     console.log("📋 Reasons:", sidewayCheck.reasons);
// } else {
//     console.log("📈 Market is TRENDING");
// }
