import WebSocket from "ws";
import fetch from "node-fetch";
import { orderPlacing } from "../orderplacing.js";
import { calculateQuantity } from "../projectOne/utility/utility.js";
import { setObject, symbols } from "../symbols.js";
import {isTradingTime} from "./tradingTime.js";
import {calculateUnrealizedProfit} from "../projectTwo/utility/utility.js";

// --- Parameters ---
const interval = "1m";
const higherInterval = "5m";
const smaPeriod = 50;
const rsiPeriod = 14;
const bbPeriod = 20;
const bbStdDev = 2;
const adxPeriod = 14;
const atrPeriod = 10;
const superTrendMultiplier = 3;

// --- Helper Functions ---

// Simple Moving Average
function calculateSMA(data, period) {
    if (data.length < period) return null;
    const slice = data.slice(-period);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / period;
}

// RSI Calculation
function calculateRSI(data, period = 14) {
    if (data.length < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = data.length - period; i < data.length; i++) {
        const diff = data[i] - data[i - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgGain / (avgLoss || 1e-10);
    return 100 - 100 / (1 + rs);
}

// Bollinger Bands Calculation
function calculateBollingerBands(data, period = 20, stdDev = 2) {
    if (data.length < period) return null;
    const slice = data.slice(-period);
    const mean = calculateSMA(slice, period);
    const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
    const std = Math.sqrt(variance);
    return {
        upper: mean + stdDev * std,
        lower: mean - stdDev * std,
        middle: mean,
    };
}

// Volume Spike Detection
function isVolumeSpike(volumes) {
    if (volumes.length < 21) return false;
    const avg = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const current = volumes.at(-1);
    return current > avg * 2;
}

// Candle Pattern Detection
function detectCandlePattern(opens, highs, lows, closes) {
    const len = closes.length;
    if (len < 2) return "NONE";
    const o = opens[len - 1];
    const h = highs[len - 1];
    const l = lows[len - 1];
    const c = closes[len - 1];
    const body = Math.abs(c - o);
    const range = h - l;
    if (range === 0) return "NONE";
    const upperShadow = h - Math.max(o, c);
    const lowerShadow = Math.min(o, c) - l;

    // Pin bar
    if (lowerShadow > body * 2 && upperShadow < body * 0.3) return "BULLISH_PIN_BAR";
    if (upperShadow > body * 2 && lowerShadow < body * 0.3) return "BEARISH_PIN_BAR";

    // Doji
    if (body / range < 0.1) return "DOJI";

    // Engulfing
    const prevBody = closes[len - 2] - opens[len - 2];
    const currBody = c - o;
    if (prevBody < 0 && currBody > 0 && o < closes[len - 2] && c > opens[len - 2]) return "BULLISH_ENGULFING";
    if (prevBody > 0 && currBody < 0 && o > closes[len - 2] && c < opens[len - 2]) return "BEARISH_ENGULFING";

    return "NONE";
}

// ATR Calculation for SuperTrend and ADX
function calculateATR(highs, lows, closes, period) {
    if (highs.length < period + 1) return null;
    let trs = [];
    for (let i = closes.length - period; i < closes.length; i++) {
        const high = highs[i];
        const low = lows[i];
        const prevClose = closes[i - 1];
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trs.push(tr);
    }
    return calculateSMA(trs, period);
}

// ADX Calculation
function calculateADX(highs, lows, closes, period) {
    if (highs.length < period + 1) return null;
    let plusDMs = [];
    let minusDMs = [];
    let trs = [];

    for (let i = closes.length - period; i < closes.length; i++) {
        const upMove = highs[i] - highs[i - 1];
        const downMove = lows[i - 1] - lows[i];
        let plusDM = 0, minusDM = 0;
        if (upMove > downMove && upMove > 0) plusDM = upMove;
        if (downMove > upMove && downMove > 0) minusDM = downMove;

        plusDMs.push(plusDM);
        minusDMs.push(minusDM);

        const high = highs[i];
        const low = lows[i];
        const prevClose = closes[i - 1];
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trs.push(tr);
    }

    const atr = calculateSMA(trs, period);
    if (!atr) return null;

    const plusDI = (calculateSMA(plusDMs, period) / atr) * 100;
    const minusDI = (calculateSMA(minusDMs, period) / atr) * 100;

    const dx = (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100;

    // Calculate ADX as SMA of DX values over period
    // For simplicity here, return dx directly (can be smoothed further)
    return dx;
}

// SuperTrend Calculation
function calculateSuperTrend(highs, lows, closes, period = 10, multiplier = 3) {
    if (highs.length < period + 1) return null;

    const atr = calculateATR(highs, lows, closes, period);
    if (!atr) return null;

    const hl2 = (highs[highs.length - 1] + lows[lows.length - 1]) / 2;
    const basicUpperBand = hl2 + multiplier * atr;
    const basicLowerBand = hl2 - multiplier * atr;

    // Need previous SuperTrend to calculate final bands - for demo, simplified:
    // Using basic bands as final bands here
    // Usually, SuperTrend band flips when price crosses bands
    return { upperBand: basicUpperBand, lowerBand: basicLowerBand };
}

// Fetch Candles from Binance REST API
async function preloadCandles(symbol, interval = "1m") {


    try{
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=100`;
        const res = await fetch(url);
        const data = await res.json();
        if (!Array.isArray(data)) return null;

        const closes = data.map(d => parseFloat(d[4]));
        const volumes = data.map(d => parseFloat(d[5]));
        const opens = data.map(d => parseFloat(d[1]));
        const highs = data.map(d => parseFloat(d[2]));
        const lows = data.map(d => parseFloat(d[3]));

        return { closes, volumes, opens, highs, lows };
    }catch (e){
        console.error(e);
    }

}

// Create Binance WebSocket URL for multiple symbols
function createMultiStreamURL(symbols, interval) {
    // return `wss://stream.binance.com:9443/stream?streams=${symbols.map(s => `${s.symbol.toLowerCase()}@kline_${interval}`).join("/")}`;



         const streams = symbols.flatMap(s => [
            `${s.symbol.toLowerCase()}@kline_1m`,
            `${s.symbol.toLowerCase()}@kline_5m`
        ]);
        return `wss://stream.binance.com:9443/stream?streams=${streams.join("/")}`;


}

// State to hold candle data per symbol and interval
const state = {};

// Main Bot Function
async function startBot() {
    // Preload historical candles for all symbols and intervals
     for (const s of symbols) {
        const [m1, m5] = await Promise.all([
            preloadCandles(s.symbol, "1m"),
            preloadCandles(s.symbol, "5m"),
        ]);
        // if (m1 && m5) state[s.symbol.toLowerCase()] = { "1m": m1, "5m": m5 };
        if (m1 && m5) state[s.symbol.toLowerCase()] = { "1m": m1, "5m": m5 };

    }



    // Connect to Binance WebSocket for real-time candles
    const ws = new WebSocket(createMultiStreamURL(symbols));
    const cooldown = {};


    ws.on("message", async (message) => {
        // const parsed = JSON.parse(data);
        // const k = parsed.data.k;
        // const symbol = parsed.data.s.toLowerCase();


        const { stream, data } = JSON.parse(message);
        const k = data.k;
        const symbol = data.s.toLowerCase();
        const interval = k.i; // "1m" or "5m"

        if (!state[symbol]) return;
        if (!k.x) return; // Only process closed candles



        const close = parseFloat(k.c);
        const volume = parseFloat(k.v);
        const open = parseFloat(k.o);
        const high = parseFloat(k.h);
        const low = parseFloat(k.l);

        const frame = state[symbol][interval];
        frame.closes.push(close);
        frame.volumes.push(volume);
        frame.opens.push(open);
        frame.highs.push(high);
        frame.lows.push(low);

        // Keep max 100 candles for memory limits
        // if (frame.closes.length > 100) {
        //     ["closes", "volumes", "opens", "highs", "lows"].forEach(arr => frame[arr].shift());
        // }

        ["closes", "opens", "highs", "lows", "volumes"].forEach(key => {
            if (frame[key].length > 100) frame[key].shift();
        });

        if (interval !== "1m") return;


        // Calculate Indicators
        const sma1m = calculateSMA(state[symbol]["1m"].closes, smaPeriod);
        const bb1m = calculateBollingerBands(state[symbol]["1m"].closes, bbPeriod, bbStdDev);
        const rsi1m = calculateRSI(state[symbol]["1m"].closes, rsiPeriod);

        const sma5m = calculateSMA(state[symbol]["5m"].closes, smaPeriod);
        const bb5m = calculateBollingerBands(state[symbol]["5m"].closes, bbPeriod, bbStdDev);
        const rsi5m = calculateRSI(state[symbol]["5m"].closes, rsiPeriod);

        const candlePattern = detectCandlePattern(state[symbol]["1m"].opens, state[symbol]["1m"].highs, state[symbol]["1m"].lows, state[symbol]["1m"].closes);
        const spike = isVolumeSpike(state[symbol]["1m"].volumes);
        const adx = calculateADX(state[symbol]["1m"].highs, state[symbol]["1m"].lows, state[symbol]["1m"].closes, adxPeriod);
        const superTrend = calculateSuperTrend(state[symbol]["1m"].highs, state[symbol]["1m"].lows, state[symbol]["1m"].closes, atrPeriod, superTrendMultiplier);
        // // ** ဒီနေရာမှာ လုပ်ပါ **
        // const adxText = adx ? adx.toFixed(1) : "N/A";
        // const superTrendLower = superTrend ? superTrend.lowerBand.toFixed(4) : "N/A";
        // const superTrendUpper = superTrend ? superTrend.upperBand.toFixed(4) : "N/A";
        //
        // // ဥပမာ log output မှာသုံးနိုင်မယ်
        // console.log(`ADX: ${adxText} | SuperTrend Bands: [${superTrendLower}, ${superTrendUpper}]`);


        const index = symbols.findIndex(s => s.symbol.toLowerCase() === symbol);
        const status = symbols[index];

        const trend = close > sma1m ? "UP" : "DOWN";
        const isSideways =
            (isTradingTime() ? (close > bb1m.lower && close < bb1m.upper) : true) &&
            rsi1m > 40 && rsi1m < 60 &&
            rsi5m > 40 && rsi5m < 60;

        const quantity = calculateQuantity(10, close);

        // Overbought / Oversold Logic with volume spike & candle confirmation
        const overBought = rsi1m > 70 && rsi5m > 60 &&  (isTradingTime() ? (spike && candlePattern.includes("BEARISH")) :  true);
        const overSold = rsi1m < 30 && rsi5m < 40 &&  (isTradingTime() ? (spike && candlePattern.includes("BULLISH")) :  true);

        // Confirm trend strength with ADX threshold (e.g., > 25)
        const strongTrend = adx && adx > 25;

        // Use SuperTrend bands to confirm dynamic support/resistance
        const aboveSuperTrend = superTrend && close > superTrend.upperBand;
        const belowSuperTrend = superTrend && close < superTrend.lowerBand;

        let shouldBuy = false;
        let shouldSell = false;

        // Strategy decision examples:
        if (isSideways && overBought) {
            shouldSell = true;
        } else if (isSideways && overSold) {
            shouldBuy = true;
        }else  if (trend === "UP" && strongTrend && overSold && aboveSuperTrend) {
            shouldBuy = true;
        } else if (trend === "DOWN" && strongTrend && overBought && belowSuperTrend) {
            shouldSell = true;
        }

        const logPrefix = ` Trend ${trend} | OverBought ${overBought} | OverSold ${overSold} | SideWay ${isSideways} |  ADX:${adx?.toFixed(1)} | ST[${superTrend?.lowerBand.toFixed(4)}, ${superTrend?.upperBand.toFixed(4)}] | ${shouldBuy ? "BUY" : shouldSell ? "SELL" : "NO SIGNAL"} | [${symbol.toUpperCase()}]$${close.toFixed(4)} | RSI1m: ${rsi1m?.toFixed(1)} | RSI5m: ${rsi5m?.toFixed(1)} | ${candlePattern} | VolSpike: ${spike}`;

          const execute = async (side) => {
            if (cooldown[symbol]) return;
            cooldown[symbol] = true;
            setTimeout(() => (cooldown[symbol] = false), 30000); // 30s cooldown

            try {
                await orderPlacing(symbol.toUpperCase(), side, quantity);
                Object.assign(status, {
                    hasPosition: true,
                    side,
                    entryPrice: close,
                    quantity,
                });
                console.log(`[${side}] ${logPrefix}`);
            } catch (e) {
                console.error(`Order error for ${symbol}:`, e);
            }
        };

        // Exit logic with PnL thresholds
        if (status.hasPosition && status.entryPrice && status.quantity) {
            // const pnl = (close - status.entryPrice) / status.entryPrice;

            const pnl = calculateUnrealizedProfit(status.entryPrice, close, status.quantity, status.side) * 10


            if (pnl >= 0.05 || pnl <= -0.1) {
                const exitSide = status.side === "BUY" ? "SELL" : "BUY";
                await execute(exitSide);
                Object.assign(status, { hasPosition: false, entryPrice: 0, quantity: 0 });
                return;
            }
        }

        // Entry logic
        if (!status.hasPosition) {
            if (shouldBuy) return execute("BUY");
            if (shouldSell) return execute("SELL");
            // console.log(`[NO SIGNAL] ${logPrefix}`);
        }
    });

    ws.on("error", console.error);
    ws.on("close", () => {
        console.log("WebSocket closed. Reconnecting...");
        setTimeout(startBot, 5000);
    });
}

// --- Initialize and start bot ---
setObject().then(() => {
    console.log("start...");
    startBot();
});
