import axios from 'axios';
import WebSocket from 'ws';
import { ADX } from 'technicalindicators';

const symbol = 'BTCUSDT';
const interval = '1m';
const limit = 100; // history candle count

let candles = [];

// Step 1: Fetch historical candles
async function fetchHistory() {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await axios.get(url);
    candles = res.data.map(c => ({
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4])
    }));

    console.log(`Fetched ${candles.length} historical candles.`);

    startWebSocket(); // Start real-time updates after history is ready
}

// Step 2: Open WebSocket for live candles
function startWebSocket() {
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`);

    ws.on('message', (data) => {
        const json = JSON.parse(data);
        const k = json.k;

        if (k.x) { // closed candle only
            const newCandle = {
                high: parseFloat(k.h),
                low: parseFloat(k.l),
                close: parseFloat(k.c)
            };

            candles.push(newCandle);
            if (candles.length > limit) candles.shift(); // keep array size constant

            const highs = candles.map(c => c.high);
            const lows = candles.map(c => c.low);
            const closes = candles.map(c => c.close);

            const adxResult = ADX.calculate({
                period: 14,
                high: highs,
                low: lows,
                close: closes
            });

            const last = adxResult[adxResult.length - 1];
            if (last) {
                console.clear();
                console.log(`[${symbol}] +DI: ${last.pdi.toFixed(2)} | -DI: ${last.mdi.toFixed(2)} | ADX: ${last.adx.toFixed(2)}`);

                if (last.adx > 25) {
                    if (last.pdi > last.mdi) {
                        console.log('➡️ Strong Uptrend');
                    } else {
                        console.log('⬅️ Strong Downtrend');
                    }
                } else {
                    console.log('⏸️ No clear trend');
                }
            }
        }
    });

    ws.on('error', (err) => console.error('WebSocket error:', err));
    ws.on('close', () => console.log('WebSocket closed'));
}

// Start the whole process
await fetchHistory();
