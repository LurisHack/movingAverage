import { ocoPlaceOrder, orderPlacing } from "./orderplacing.js";
import WebSocket from 'ws';
import { getAccount } from "./utility/account.js";
import dotenv from "dotenv";
import {runAnalysis} from "./utility/ema50Analysis.js";

dotenv.config();

let symbols = [];

const settings = {
    rsiLength: 14,
    rsiOB: 70,
    rsiOS: 30,
    maLength: 50,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    adxLength: 14,
    adxThreshold: 20,
    takeProfitPerc: 0.1,
    stopLossPerc: 1.0,
    tradeCooldown: 5000,
    candleLimit: 288,
    interval: '5m',
    ws: null
}

function sma(data, period) {
    return data.map((_, i) => {
        if (i < period - 1) return null;
        const slice = data.slice(i - period + 1, i + 1);
        return slice.reduce((a, b) => a + b, 0) / period;
    });
}

function ema(data, period) {
    const k = 2 / (period + 1);
    let emaArr = [data[0]];
    for (let i = 1; i < data.length; i++) {
        emaArr.push(data[i] * k + emaArr[i - 1] * (1 - k));
    }
    return emaArr;
}

function calculateRSI(data, length) {
    let rsi = Array(length).fill(null);
    let gain = 0, loss = 0;

    for (let i = 1; i <= length; i++) {
        let delta = data[i] - data[i - 1];
        if (delta >= 0) gain += delta; else loss -= delta;
    }
    gain /= length;
    loss /= length;
    rsi[length] = 100 - 100 / (1 + gain / loss);

    for (let i = length + 1; i < data.length; i++) {
        let delta = data[i] - data[i - 1];
        if (delta >= 0) {
            gain = (gain * (length - 1) + delta) / length;
            loss = (loss * (length - 1)) / length;
        } else {
            gain = (gain * (length - 1)) / length;
            loss = (loss * (length - 1) - delta) / length;
        }
        rsi[i] = 100 - 100 / (1 + gain / loss);
    }

    return rsi;
}

function calculateMACD(data, fastLen, slowLen, signalLen) {
    const fast = ema(data, fastLen);
    const slow = ema(data, slowLen);
    const macdLine = data.map((_, i) => fast[i] - slow[i]);
    const signal = ema(macdLine.slice(slowLen), signalLen);
    const macdHist = macdLine.slice(slowLen + signalLen - 1).map((v, i) => v - signal[i]);
    return { macdLine, signalLine: signal, macdHist };
}

function calculateADX(highs, lows, closes, length) {
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

function calculateOrderQuantity(price) {
    const budgetUSD = 10;
    if (!price || price <= 0) return 0;
    return +(budgetUSD / price).toFixed(6);
}

async function takeProfit(currentPrice, symbolObj) {



    if ((Date.now() - symbolObj.lastSignalTime) < settings.tradeCooldown) return;
    symbolObj.lastSignalTime = Date.now();

    const entry = symbolObj.entryPrice;
    const current = currentPrice;
    const amt = Math.abs(symbolObj.rawQty); // always use absolute to avoid -ve logic issues


    // console.log(entry, current, amt)

    if (symbolObj.entryPrice) {
        const pnl = (symbolObj.position === 'long')
            ? (current - entry) * amt
            : (entry - current) * amt;

        // console.log(symbolObj.symbol, pnl , settings.takeProfitPerc)
        //
        // return

        // console.log(pnl, se.takeProfitPerc)


        if (pnl > settings.takeProfitPerc) {
            symbolObj.entryPrice = null;
            await orderPlacing(symbolObj.symbol, symbolObj.position === 'long' ? 'SELL' : 'BUY', symbolObj.rawQty);
            // runAnalysis(200).then(topVolatile => {
            //     const symbol = topVolatile[0].symbol;
            //     if (symbolObj.symbol !== symbol) {
            //         resetSymbol(symbol);
            //     }
            // });
        }
    }
}

function initializeSymbol(symbolObj) {
    async function loadHistoricalCandles() {
        const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbolObj.symbol}&interval=${settings.interval}&limit=${settings.candleLimit}`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data)) return;

        data.forEach(k => {
            symbolObj.candles.push({ time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4] });
            symbolObj.closes.push(+k[4]);
            symbolObj.highs.push(+k[2]);
            symbolObj.lows.push(+k[3]);
        });
        await updateIndicators(symbolObj.closes.at(-1));
    }

    async function updateIndicators(currentPrice) {
        if (symbolObj.closes.length < settings.maLength + settings.macdSlow + settings.macdSignal) return;
        if (!currentPrice) return;

        const ma = ema(symbolObj.closes, settings.maLength);
        symbolObj.currentMA = ma[ma.length - 1];

        if (currentPrice > symbolObj.currentMA && symbolObj.position !== 'long') {
            symbolObj.position = 'long';
            symbolObj.rawQty = calculateOrderQuantity(currentPrice);
            await ocoPlaceOrder(symbolObj.symbol, 'BUY', symbolObj.rawQty);
            symbolObj.entryPrice = currentPrice;
        } else if (currentPrice < symbolObj.currentMA && symbolObj.position !== 'short') {
            symbolObj.position = 'short';
            symbolObj.rawQty = calculateOrderQuantity(currentPrice);
            await ocoPlaceOrder(symbolObj.symbol, 'SELL', symbolObj.rawQty);
            symbolObj.entryPrice = currentPrice;
        }
    }

    async function start() {
        await loadHistoricalCandles();
        const wsUrl = `wss://fstream.binance.com/ws/${symbolObj.symbol.toLowerCase()}@kline_${settings.interval}`;
        let reconnectTimeout = null;

        function connectWebSocket() {
            const ws = new WebSocket(wsUrl);
            symbolObj.ws = ws;

            ws.onmessage = async ({ data }) => {
                const msg = JSON.parse(data);
                takeProfit(parseFloat(msg.k.c), symbolObj).then();
                if (!msg.k || !msg.k.x) return;
                const k = msg.k;
                const candle = { open: +k.o, high: +k.h, low: +k.l, close: +k.c, time: k.t };
                symbolObj.candles.push(candle);
                symbolObj.closes.push(candle.close);
                symbolObj.highs.push(candle.high);
                symbolObj.lows.push(candle.low);

                if (symbolObj.candles.length > settings.candleLimit) {
                    symbolObj.candles.shift();
                    symbolObj.closes.shift();
                    symbolObj.highs.shift();
                    symbolObj.lows.shift();
                }

                await updateIndicators(msg.k.c);
            };

            ws.onerror = (err) => {
                console.error(`❌ WebSocket error for ${symbolObj.symbol}:`, err.message || err);
                ws.close();
            };

            ws.onclose = () => {
                console.warn(`🔁 WebSocket closed for ${symbolObj.symbol}. Reconnecting in 5s...`);
                symbolObj.ws = null;
                if (reconnectTimeout) clearTimeout(reconnectTimeout);
                reconnectTimeout = setTimeout(() => {
                    connectWebSocket();
                }, 5000);
            };
        }

        connectWebSocket();
    }

    start().then();
}

function resetSymbol(symbol) {
    const existing = symbols.find(s => s.symbol === symbol);
    if (existing) cleanUpSymbol(existing);
    symbols = symbols.filter(s => s.symbol !== symbol);
    const newSymbolObj = { symbol, candles: [], closes: [], highs: [], lows: [], lastSignalTime: 0, position: null, entryPrice: 0, rawQty: 0, currentMA: 0, ws: null };
    symbols.push(newSymbolObj);
    initializeSymbol(newSymbolObj);
    return newSymbolObj;
}

function cleanUpSymbol(symbolObj) {
    if (symbolObj.ws) {
        symbolObj.ws.removeAllListeners();
        symbolObj.ws.terminate();
        symbolObj.ws = null;
    }
    if (symbolObj.reconnectTimeout) {
        clearTimeout(symbolObj.reconnectTimeout);
        symbolObj.reconnectTimeout = null;
    }
    symbolObj.candles = [];
    symbolObj.closes = [];
    symbolObj.highs = [];
    symbolObj.lows = [];
    symbolObj.position = null;
    symbolObj.entryPrice = 0;
    symbolObj.rawQty = 0;
    symbolObj.currentMA = 0;
}

export async function init() {
    const account = await getAccount(process.env.BUY_API_KEY, process.env.BUY_API_SECRET);
    await Promise.all(account.positions.map((position) => {
        symbols.push({
            symbol: position.symbol,
            candles: [], closes: [], highs: [], lows: [], lastSignalTime: 0,
            position: parseFloat(position.notional) < 0 ? 'short' : 'long',
            entryPrice: parseFloat(position.entryPrice),
            rawQty: Math.abs(parseFloat(position.positionAmt)),
            currentMA: 0, ws: null
        });
    }));

    runAnalysis(250).then(topGainer => {
        console.log(topGainer);
        Promise.all(topGainer.map((gainer) => {
            const findSymbol = symbols.find(s => s.symbol === gainer.symbol);
            if (!findSymbol) {
                symbols.push({ symbol: gainer.symbol, candles: [], closes: [], highs: [], lows: [], lastSignalTime: 0, position: null, entryPrice: 0, rawQty: 0, currentMA: 0, ws: null });
            }
        })).then(() => {
            symbols.map(symbolObj => initializeSymbol(symbolObj));
        });
    }).catch(console.error);
}

export async function restartBot() {
    console.log("♻️ Restarting bot...");

    // Clean up each symbol
    symbols.forEach(cleanUpSymbol);
    symbols = [];

    // Force garbage collection if available (Node must be run with `--expose-gc`)
    if (global.gc) {
        global.gc();
        console.log("🧹 Garbage collected");
    }

    // Re-run the initialization
    await init();
}



// Restart every 30 minutes
setInterval(() => {
    restartBot().catch(console.error);
}, 30 * 60 * 1000); // 30 minutes in milliseconds