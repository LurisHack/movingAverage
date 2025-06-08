import WebSocket from 'ws';
import axios from 'axios';
import {dataObject} from "./dataObject.js";

const candleLimit = 100;
const btcPrices = [];

function addPrice(array, price) {
    array.push(price);
    if (array.length > candleLimit) {
        array.shift();
    }
}

function pearsonCorrelation(x, y) {
    if (x.length !== y.length || x.length === 0) return 0;
    const n = x.length;
    const meanX = x.reduce((a, b) => a + b) / n;
    const meanY = y.reduce((a, b) => a + b) / n;

    let numerator = 0;
    let denominatorX = 0;
    let denominatorY = 0;

    for (let i = 0; i < n; i++) {
        const dx = x[i] - meanX;
        const dy = y[i] - meanY;
        numerator += dx * dy;
        denominatorX += dx * dx;
        denominatorY += dy * dy;
    }

    const denominator = Math.sqrt(denominatorX * denominatorY);
    return denominator === 0 ? 0 : numerator / denominator;
}

function isUptrend(prices) {
    return prices[prices.length - 1] > prices[prices.length - 5];
}

function isDowntrend(prices) {
    return prices[prices.length - 1] < prices[prices.length - 5];
}

function isBullishSignal(prices) {
    return prices[prices.length - 1] > prices[prices.length - 2];
}

function isBearishSignal(prices) {
    return prices[prices.length - 1] < prices[prices.length - 2];
}

export function decisionEngineLive(coinPrice) {
    // const status = dataObject.coins[index];
    // parseFloat(status.candles.at(-1)[4])
    // const coinPrice = status.candles

    // console.log('coin price ', coinPrice)
    // console.log('close price ', btcPrices)
    //
    //
    //
    // console.log('btc price: ' + btcPrices.length);
    // console.log('coin price: ' + coinPrice.length);

    if (btcPrices.length < candleLimit || coinPrice.length < candleLimit) return;

    const correlation = pearsonCorrelation(btcPrices, coinPrice);

    if (correlation > 0.85) {
        if (isUptrend(btcPrices) && isBullishSignal(coinPrice)) {
            console.log("🔥 BUY ETH");
            return 'BUY'
        } else if (isDowntrend(btcPrices) && isBearishSignal(coinPrice)) {
            return 'SELL'
        } else {
            console.log("⚠️ Strong correlation, no clear signal");
            return  null
        }
    } else {
        console.log("📉 Weak correlation");
        return  null
    }
}

// ✅ Fetch 100 historical close prices from Binance
async function fetchClosingPrices(symbol = 'BTCUSDT', interval = '5m', limit = 100) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    try {
        const response = await axios.get(url);
        const prices = response.data.map(candle => parseFloat(candle[4])); // Close price is at index 4
        return prices;
    } catch (error) {
        console.error(`❌ Error fetching ${symbol} data:`, error.message);
        return [];
    }
}

// ✅ Initialize historical data before starting WebSocket
export async function initialize() {
    const btc = await fetchClosingPrices('BTCUSDT');
    // const eth = await fetchClosingPrices('ETHUSDT');
    btcPrices.push(...btc);
    // ethPrices.push(...eth);
    console.log("✅ Loaded historical data.");

    // ✅ Connect BTC WebSocket
    const btcWS = new WebSocket('wss://fstream.binance.com/ws/btcusdt@kline_1m');
    btcWS.on('message', (data) => {
        const json = JSON.parse(data);
        if (json.k && json.k.x) {
            const close = parseFloat(json.k.c);
            addPrice(btcPrices, close);
            // decisionEngineLive();
        }
    });

 }

