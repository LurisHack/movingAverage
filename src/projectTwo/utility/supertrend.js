
// ✅ ATR Calculation
function calculateATR(candles, period = 10) {
    const trs = [];

    for (let i = 1; i < candles.length; i++) {
        const current = candles[i];
        const prev = candles[i - 1];

        const high = parseFloat(current[2]);
        const low = parseFloat(current[3]);
        const closePrev = parseFloat(prev[4]);

        const tr = Math.max(
            high - low,
            Math.abs(high - closePrev),
            Math.abs(low - closePrev)
        );
        trs.push(tr);
    }

    const atrs = [];
    for (let i = 0; i < trs.length; i++) {
        if (i < period) {
            atrs.push(null);
        } else {
            const sum = trs.slice(i - period, i).reduce((a, b) => a + b, 0);
            atrs.push(sum / period);
        }
    }

    return atrs;
}

// ✅ Supertrend Calculation
 export function calculateSupertrend(candles, period = 7, multiplier = 3) {
    const atr = [];
    const hl2 = candles.map(c => (parseFloat(c[2]) + parseFloat(c[3])) / 2); // (high + low) / 2
    const tr = [];

    for (let i = 1; i < candles.length; i++) {
        const high = parseFloat(candles[i][2]);
        const low = parseFloat(candles[i][3]);
        const prevClose = parseFloat(candles[i - 1][4]);

        const currTR = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
        );
        tr.push(currTR);
    }

    for (let i = 0; i < tr.length; i++) {
        if (i < period) {
            atr.push(null);
        } else if (i === period) {
            const sum = tr.slice(i - period, i).reduce((a, b) => a + b, 0);
            atr.push(sum / period);
        } else {
            const prevAtr = atr[i - 1];
            atr.push((prevAtr * (period - 1) + tr[i]) / period);
        }
    }

    const finalSignalIndex = candles.length - 1;
    const finalHL2 = hl2[finalSignalIndex];
    const finalATR = atr[finalSignalIndex];

    if (!finalATR) return 'neutral';

    const upperBand = finalHL2 + multiplier * finalATR;
    const lowerBand = finalHL2 - multiplier * finalATR;
    const close = parseFloat(candles[finalSignalIndex][4]);

    if (close > upperBand) return 'up';
    if (close < lowerBand) return 'down';
    return 'neutral';
}

// ✅ Fetch candles from Binance
// async function fetchCandles(symbol = 'BTCUSDT', interval = '1m', limit = 100) {
//     const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
//     try {
//         const response = await axios.get(url);
//         const candles = response.data.map(c => [
//             c[0], c[1], c[2], c[3], c[4], c[5]
//         ]);
//         return candles;
//     } catch (error) {
//         console.error("Error fetching data:", error.message);
//         return [];
//     }
// }

// ✅ Main logic
export async function run() {
    // const candles = await fetchCandles("BTCUSDT", "1m", 100);
    // const supertrend = calculateSupertrend(dataObject.coins[0].candles, 10, 3);

    console.log(supertrend)

    // supertrend.forEach((entry, i) => {
    //     if (entry.supertrend && entry.trend) {
    //         console.log(
    //             `#${i} Time: ${new Date(entry.time).toLocaleTimeString()} | Trend: ${entry.trend.toUpperCase()} | Supertrend: ${entry.supertrend.toFixed(2)}`
    //         );
    //     }
    // });
}

// run();
