import axios from "axios";
import WebSocket from 'ws';
import {dataObject} from "./dataObject.js";
import {orderPlacing} from "../orderplacing.js";
import {calculateQuantity} from "../projectOne/utility/utility.js";
import {detectTrend} from "./detectedTrend.js";
import {buySell, exitSignal, forSideWayOver, getRSI, isOverBought, isOverSold} from "./rsiDetectOver.js";
import {calculateUnrealizedProfit} from "./utility/utility.js";
// import {decisionEngineLive} from "./btcDenominator.js";


export async function fetchHistoricalCandles(index) {

    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
        const response = await axios.get(`https://fapi.binance.com/fapi/v1/klines`, {
            params: {
                symbol: dataObject.coins[index].symbol.toUpperCase(),
                interval: dataObject.interval,
                limit: dataObject.limit,
            },
        });

        dataObject.coins[index].candles = response.data.map(c => [
            c[0],     // Open time
            c[1],     // Open
            c[2],     // High
            c[3],     // Low
            c[4],     // Close
            c[5],     // Volume
        ]);

        console.log(`[INIT] Fetched ${dataObject.coins[index].candles.length} historical candles.`);
        await detectAndLog(index);
        //
        startWebSocket(index); // Start real-time updates after init
    } catch (err) {
        console.error('[ERROR] Fetching historical candles:', err.message);
    }
}

const execute = async (index, side, quantity) => {
    const status = dataObject.coins[index];


    try {
        return await orderPlacing(status.symbol.toUpperCase(), side, quantity);

        // console.log(`[${side}] `);
    } catch (e) {
        console.error(`Order error for ${status.symbol}:`, e);
    }
}


function takeProfit(index, currentPrice) {

    return;
    const status = dataObject.coins[index];

    const now = Date.now();
    if (now - status.lastExitTime < status.coolDownTime) {
        console.log('Cooldown active. Skipping takeProfit.');
        return;
    }

    status.lastExitTime = Date.now();



    if (status.side === 'SELL') {
        if (!status.hasPosition || !status.entryPrice || !status.quantity) return;


        const pnl = calculateUnrealizedProfit(status.entryPrice, currentPrice, status.quantity, status.side);

        // console.log(status.symbol, 'pnl ', pnl)

        if (pnl >= 0.05 || pnl <= -0.05) {
            if(status.profitTaking) return;
                status.profitTaking = true;
            execute(index, 'BUY', status.quantity).then(() => {
                Object.assign(status, { hasPosition: false, entryPrice: 0, quantity: 0 })

            }).finally(() => status.profitTaking = false);
        }
    }

    if (status.side === 'BUY') {
        if (!status.hasPosition || !status.entryPrice || !status.quantity) return;
        const pnl = calculateUnrealizedProfit(status.entryPrice, currentPrice, status.quantity, status.side);

        // console.log(status.symbol, 'pnl ', pnl)

        if (pnl >= 0.1 || pnl <= -0.1) {
            if(status.profitTaking) return;
            status.profitTaking = true;
            execute(index, 'SELL', status.quantity).then(() => {
                Object.assign(status, { hasPosition: false, entryPrice: 0, quantity: 0 });
            }).finally(() => status.profitTaking = false);
        }
    }

}

// Step 3: Start WebSocket to listen to new candles
function startWebSocket(index) {
    const ws = new WebSocket(`wss://fstream.binance.com/ws/${dataObject.coins[index].symbol.toLowerCase()}@kline_${dataObject.interval}`);

    if (dataObject.coins[index].ws) dataObject.coins[index].ws.close();
    dataObject.coins[index].ws = ws;


    dataObject.coins[index].ws.on('message',   msg => {
        const data = JSON.parse(msg);

        // if (data && data.k && data.k.c) {
        //     takeProfit(index, parseFloat(data.k.c))
        // }

        if (data.k.x) { // Candle closed
            const k = data.k;
            const newCandle = [k.t, k.o, k.h, k.l, k.c, k.v];

            const lastCandle = dataObject.coins[index].candles.at(-1);

            if (!lastCandle) return;


            if (!lastCandle || newCandle[0] !== lastCandle[0]) {
                dataObject.coins[index].candles.push(newCandle);

                if (dataObject.coins[index].candles.length > dataObject.limit) {
                    dataObject.coins[index].candles.shift(); // Keep length consistent
                }
                 detectAndLog(index);
            }
        }
    });

    dataObject.coins[index].ws.on('open', () => console.log(`[WS OPEN] Listening to ${dataObject.coins[index].symbol.toUpperCase()} @ ${dataObject.interval}`));
    dataObject.coins[index].ws.on('error', err => console.error(`[WS ERROR]`, err.message));

    let reconnecting = false;

    dataObject.coins[index].ws.on('close', () => {
        if (reconnecting) return;
        reconnecting = true;
        setTimeout(() => {
            startWebSocket(index);
            reconnecting = false;
        }, 5000);
    });
}


function detectAndLog(index) {



     const status = dataObject.coins[index];
    status.lastDecisionTime = status.lastDecisionTime || 0;
    const now = Date.now();
    if (now - status.lastDecisionTime < 5000) return; // skip if under 5 seconds
    status.lastDecisionTime = now;

    // const closePrices = status.candles.map(m => parseFloat(m[4]))

    const trend = detectTrend(index);
    // console.log(trend)

    // return

    // const overBought = isOverBought(index)
    // const overSold = isOverSold(index)
     const currentPrice = parseFloat(status.candles.at(-1)[4]); // latest candle close
    const quantity = calculateQuantity(10, currentPrice);

    const hasPosition = dataObject.coins[index].hasPosition

    const { overSold , overBought } = forSideWayOver(index);

    const signal = buySell(0);
    const exits = exitSignal(index);

    // console.log(status.symbol, ' ', trend, ' ', getRSI(index), 'over sold ',  overSold, 'over bought ', overBought, 'buy signal ', signal.buy, 'sell signal ', signal.sell)


    if(trend === 'sideway' && overSold && !hasPosition){

        console.log(`1 [${dataObject.coins[index].symbol.toUpperCase()}] - Last Price: ${dataObject.coins[index].candles[dataObject.coins[index].candles.length - 1][4]}`);

        return execute(index, 'BUY', quantity).then(() => {
            Object.assign(status, {
                hasPosition: true,
                side: 'BUY',
                quantity:  quantity,
                entryPrice: currentPrice
            })
        }).catch((err) => {console.log(err)});
    }

    if(trend === 'sideway' && overBought && !hasPosition){
        console.log(`2 [${dataObject.coins[index].symbol.toUpperCase()}] - Last Price: ${dataObject.coins[index].candles[dataObject.coins[index].candles.length - 1][4]}`);


        return execute(index, 'SELL', quantity).then(() => {
            Object.assign(status, {
                hasPosition: true,
                side: 'SELL',
                quantity:  quantity,
                entryPrice: currentPrice
            })
        }).catch((err) => {console.log(err)});
    }

    if(hasPosition && status.side === 'BUY' && exits.buyExit){
        return execute(index, 'SELL', status.quantity).then(() => {
            Object.assign(status, {
                hasPosition: false,
                side: null,
                quantity:  0,
                entryPrice: 0
            })
        }).catch((err) => {console.log(err)});
    }

    if(hasPosition && status.side === 'SELL' && exits.sellExit){
        return execute(index, 'BUY', status.quantity).then(() => {
            Object.assign(status, {
                hasPosition: false,
                side: null,
                quantity:  0,
                entryPrice: 0
            })
        }).catch((err) => {console.log(err)});
    }


    if(trend === 'uptrend' && signal.buy && !hasPosition){
        console.log(`1 [${dataObject.coins[index].symbol.toUpperCase()}] - Last Price: ${dataObject.coins[index].candles[dataObject.coins[index].candles.length - 1][4]}`);

        // console.log(`Trend ${trend} | Buy: ${buy ? '✅ YES' : '❌ NO'} | Sell:  ${sell ? '✅ YES' : '❌ NO'}`);

        return execute(index, 'BUY', quantity).then(() => {
            Object.assign(status, {
                hasPosition: true,
                side: 'BUY',
                quantity:  quantity,
                entryPrice: currentPrice
            })
        }).catch((err) => {console.log(err)});
    }



    if(trend === 'downtrend' && signal.sell && !hasPosition){
        console.log(`1 [${dataObject.coins[index].symbol.toUpperCase()}] - Last Price: ${dataObject.coins[index].candles[dataObject.coins[index].candles.length - 1][4]}`);

        // console.log(`Trend ${trend} | Buy: ${buy ? '✅ YES' : '❌ NO'} | Sell:  ${sell ? '✅ YES' : '❌ NO'}`);

        return execute(index, 'SELL', quantity).then(() => {
            Object.assign(status, {
                hasPosition: true,
                side: 'SELL',
                quantity:  quantity,
                entryPrice: currentPrice
            })
        }).catch((err) => {console.log(err)});
    }



}




