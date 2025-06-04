import {  orderPlacing} from "./orderplacing.js";
import WebSocket from 'ws';
import {getAccount} from "./utility/account.js";
import dotenv from "dotenv";
import {scanMarkets} from "./utility/trendDetector.js";

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
    takeProfitPerc: 0.03,
    stopLossPerc: 1.0,
    tradeCooldown: 5000,
    candleLimit: 288,
    interval: '5m',
    ws: null
}


function ema(data, period) {
    const k = 2 / (period + 1);
    let emaArr = [data[0]];
    for (let i = 1; i < data.length; i++) {
        emaArr.push(data[i] * k + emaArr[i - 1] * (1 - k));
    }
    return emaArr;
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


        // const rsi = calculateRSI(symbolObj.closes, 5);
        // const { adx } = calculateADX(symbolObj.highs, symbolObj.lows, symbolObj.closes, 5);
        //
        //
        //
        // const sidewayCheck = detectSideway({
        //     prices: symbolObj.closes,
        //     volumes: symbolObj.volumes,
        //     rsi: rsi,
        //     adx: adx
        // });
        //


        if (pnl >= 0.05) {
            symbolObj.entryPrice = null;
            await orderPlacing(symbolObj.symbol, symbolObj.position === 'long' ? 'SELL' : 'BUY', symbolObj.rawQty)
                .then(() => {
                    symbolObj.entryPrice = null;
                    symbolObj.hasPosition = false;
                    symbolObj.position = null;
                })
                .catch(console.error);
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
        const data = await fetchWithRetry(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbolObj.symbol}&interval=${settings.interval}&limit=${settings.candleLimit}`);
        // if (!Array.isArray(res)) return;

        // const data = await res.json();
        if (!Array.isArray(data)) return;

        data.forEach(k => {
            symbolObj.candles.push({time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4]});
            symbolObj.closes.push(+k[4]);
            symbolObj.highs.push(+k[2]);
            symbolObj.lows.push(+k[3]);
            symbolObj.volumes.push(+k[5]); // where k[5] is volume
        });
        // await updateIndicators(symbolObj.closes.at(-1));
    }

    // async function updateIndicators(currentPrice) {
    //
    //     return
    //     if (symbolObj.closes.length < settings.maLength + settings.macdSlow + settings.macdSignal) return;
    //     if (!currentPrice) return;
    //
    //     if ((Date.now() - symbolObj.lastSignalTime) < settings.tradeCooldown) return;
    //     symbolObj.lastSignalTime = Date.now();
    //
    //     const ma = ema(symbolObj.closes, settings.maLength);
    //     symbolObj.currentMA = ma[ma.length - 1];
    //
    //     // Calculate indicators
    //     const rsi = calculateRSI(symbolObj.closes, 5);
    //     const {adx} = calculateADX(symbolObj.highs, symbolObj.lows, symbolObj.closes, 5);
    //
    //
    //     const sidewayCheck = detectSideway({
    //         prices: symbolObj.closes,
    //         volumes: symbolObj.volumes,
    //         rsi: rsi,
    //         adx: adx
    //     });
    //
    //     if (sidewayCheck.isSideway) {
    //
    //         if (currentPrice > symbolObj.currentMA && !symbolObj.hasPosition) {
    //             symbolObj.position = 'long';
    //             symbolObj.rawQty = calculateOrderQuantity(currentPrice);
    //             await orderPlacing(symbolObj.symbol, 'BUY', symbolObj.rawQty).catch(err => {
    //                 console.error(`❌ Order failed: ${symbolObj.symbol}`, err);
    //             });
    //             symbolObj.entryPrice = currentPrice;
    //             symbolObj.hasPosition = true;
    //         } else if (currentPrice < symbolObj.currentMA && !symbolObj.hasPosition) {
    //             symbolObj.position = 'short';
    //             symbolObj.rawQty = calculateOrderQuantity(currentPrice);
    //             await orderPlacing(symbolObj.symbol, 'SELL', symbolObj.rawQty).catch(err => {
    //                 console.error(`❌ Order failed: ${symbolObj.symbol}`, err);
    //             });
    //             symbolObj.entryPrice = currentPrice;
    //             symbolObj.hasPosition = true;
    //
    //         }
    //
    //         return
    //     }
    //
    //     if (currentPrice > symbolObj.currentMA && symbolObj.position !== 'long') {
    //         symbolObj.position = 'long';
    //         symbolObj.rawQty = calculateOrderQuantity(currentPrice);
    //         await ocoPlaceOrder(symbolObj.symbol, 'BUY', symbolObj.rawQty).catch(err => {
    //             console.error(`❌ Order failed: ${symbolObj.symbol}`, err);
    //         });
    //         symbolObj.entryPrice = currentPrice;
    //         symbolObj.hasPosition = true;
    //     } else if (currentPrice < symbolObj.currentMA && symbolObj.position !== 'short') {
    //         symbolObj.position = 'short';
    //         symbolObj.rawQty = calculateOrderQuantity(currentPrice);
    //         await ocoPlaceOrder(symbolObj.symbol, 'SELL', symbolObj.rawQty).catch(err => {
    //             console.error(`❌ Order failed: ${symbolObj.symbol}`, err);
    //         });
    //         symbolObj.entryPrice = currentPrice;
    //         symbolObj.hasPosition = true;
    //
    //     }
    // }

    async function start() {
        await loadHistoricalCandles();
        const wsUrl = `wss://fstream.binance.com/ws/${symbolObj.symbol.toLowerCase()}@kline_${settings.interval}`;
        let reconnectTimeout = null;

        function connectWebSocket() {
            const ws = new WebSocket(wsUrl);
            symbolObj.ws = ws;

            ws.onmessage = async ({data}) => {
                const msg = JSON.parse(data);
                takeProfit(parseFloat(msg.k.c), symbolObj).then();
                if (!msg.k || !msg.k.x) return;
                const k = msg.k;
                const candle = {open: +k.o, high: +k.h, low: +k.l, close: +k.c, time: k.t, volume: +k.v};
                symbolObj.candles.push(candle);
                symbolObj.closes.push(candle.close);
                symbolObj.highs.push(candle.high);
                symbolObj.lows.push(candle.low);
                symbolObj.volumes.push(+k.v); // where k[5] is volume


                if (symbolObj.candles.length > settings.candleLimit) {
                    symbolObj.candles.shift();
                    symbolObj.closes.shift();
                    symbolObj.highs.shift();
                    symbolObj.lows.shift();
                    symbolObj.volumes.shift(); // where k[5] is volume

                }

                // await updateIndicators(msg.k.c);
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
    const newSymbolObj = {
        symbol,
        candles: [],
        closes: [],
        highs: [],
        lows: [],
        volumes: [],
        lastSignalTime: 0,
        position: null,
        entryPrice: 0,
        hasPosition: false,
        rawQty: 0,
        currentMA: 0,
        ws: null
    };
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
            candles: [], closes: [], highs: [], lows: [], volumes: [], lastSignalTime: 0,
            position: parseFloat(position.notional) < 0 ? 'short' : 'long',
            entryPrice: parseFloat(position.entryPrice),
            rawQty: Math.abs(parseFloat(position.positionAmt)),
            currentMA: 0, ws: null, hasPosition: true
        });
    }));

   await scanMarkets(250, '12h').then(async trend => {
        console.log(trend);



      // await  Promise.all(trend.downtrends.map(async (down) => {
      //       await new Promise(res => setTimeout(res, 300)); // 300ms delay between API calls
      //       const rawQty = calculateOrderQuantity(parseFloat(down.price))
      //       const findSymbol = symbols.find(s => s.symbol === down.symbol);
      //       if (!findSymbol) {
      //
      //           const pushData = () => {
      //               symbols.push({
      //                   symbol: down.symbol,
      //                   candles: [],
      //                   closes: [],
      //                   highs: [],
      //                   lows: [],
      //                   volumes: [],
      //                   lastSignalTime: 0,
      //                   position: 'short',
      //                   entryPrice: parseFloat(down.price),
      //                   rawQty,
      //                   currentMA: 0,
      //                   hasPosition: true,
      //                   ws: null
      //               });
      //           }
      //
      //           await orderPlacing(down.symbol,   'SELL', rawQty)
      //               .then(() => pushData(down))
      //               .catch(err => {
      //                   console.error(`❌ Order failed: ${down.symbol}`, err);
      //               });
      //
      //       } else {
      //
      //           const filterPosition = symbols.filter(s => s.symbol ===  down.symbol)[0];
      //           if(filterPosition && filterPosition.position === 'long') {
      //           await ocoPlaceOrder(down.symbol,   'SELL', rawQty)
      //               .catch(err => {
      //                   console.error(`❌ Order failed: ${down.symbol}`, err);
      //               });
      //           }
      //
      //       }
      //
      //
      //   }))


       let filterSymbolCount = 0


     await   Promise.all(trend.uptrends.map(async (up, index) => {

         filterSymbolCount += symbols.filter(s => s.symbol === up.symbol).length;

         if(index > filterSymbolCount || index > 5) return


            await new Promise(res => setTimeout(res, 300)); // 300ms delay between API calls
            const rawQty = calculateOrderQuantity(parseFloat(up.price))
            const findSymbol = symbols.find(s => s.symbol === up.symbol);
            if (!findSymbol) {

                const pushData = () => {
                    symbols.push({
                        symbol: up.symbol,
                        candles: [],
                        closes: [],
                        highs: [],
                        lows: [],
                        volumes: [],
                        lastSignalTime: 0,
                        position: 'short',
                        entryPrice: parseFloat(up.price),
                        rawQty,
                        currentMA: 0,
                        hasPosition: true,
                        ws: null
                    });
                }

                await orderPlacing(up.symbol, 'SELL', rawQty)
                    .then(() => pushData(up))
                    .catch(err => {
                        console.error(`❌ Order failed: ${up.symbol}`, err);
                    });

            } else {

                // const filterPosition = symbols.filter(s => s.symbol === up.symbol)[0];
                // if(filterPosition && filterPosition.position === 'short') {
                //     await ocoPlaceOrder(up.symbol, 'BUY', rawQty)
                //         .catch(err => {
                //             console.error(`❌ Order failed: ${up.symbol}`, err);
                //         });
                // }

            }


            // for (const up of trend) {
            //     await new Promise(res => setTimeout(res, 300)); // 300ms delay between API calls
            //     await orderPlacing(...);
            // }


        }))


    }).catch(console.error);

    symbols.map(symbolObj => initializeSymbol(symbolObj));

    invokeOnceAtNextFiveMinuteMark(() => {
        restartBot().catch(console.error);
    })

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
// setInterval(() => {
//     restartBot().catch(console.error);
// }, 30 * 60 * 1000); // 30 minutes in milliseconds


export function invokeOnceAtNextFiveMinuteMark(callback) {
    const now = new Date();
    const delay = (15 - now.getMinutes() % 15) * 60 * 1000 - now.getSeconds() * 1000 - now.getMilliseconds();

    console.log(`⏳ Waiting ${Math.round(delay / 1000)}s to run at next 15-minute mark...`);

    const timeoutId = setTimeout(() => {
        callback();
        console.log("✅ Ran once at aligned 15-minute mark. Done.");
    }, delay);

    // Return cancel function in case user wants to abort
    return () => {
        clearTimeout(timeoutId);
        console.log("⛔ Canceled before execution");
    };
}

async function fetchWithRetry(url, retries = 5, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return await res.json();
        } catch (err) {
            if (err.message.includes('429') && i < retries - 1) {
                console.warn(`⚠️ Rate limited (429). Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // exponential backoff
            } else {
                throw err;
            }
        }
    }
}
