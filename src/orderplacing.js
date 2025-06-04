// orderplacing.js

import axios from "axios";
import crypto from "crypto";

import dotenv from "dotenv";

dotenv.config()


const BASE_URL = 'https://fapi.binance.com';

const apiKey = process.env.BUY_API_KEY;
const apiSecret = process.env.BUY_API_SECRET;

if (!apiKey || !apiSecret) {
    throw new Error('API Key or Secret not set in environment variables.');
}


function sign(query, apiSecret) {
    return crypto.createHmac('sha256', apiSecret).update(query).digest('hex');

}

function roundStep(value, stepSize) {
    const step = parseFloat(stepSize);
    if (!step || isNaN(step) || step <= 0) {
        throw new Error(`Invalid step size: ${stepSize}`);
    }

    const precision = Math.max(0, Math.min(100, Math.round(Math.log10(1 / step))));
    return parseFloat(parseFloat(value).toFixed(precision));
}

async function getAccountForStrategy(symbol) {



    return new Promise(async (resolve, reject) => {
            try {

                const responseTime = await axios.get(`https://api.binance.com/api/v3/time`)

                let serverTime = responseTime.data.serverTime.toString();


                const params = new URLSearchParams({
                    timestamp: serverTime,
                    recvWindow: '6000'
                }).toString();

                const signature = sign(params, apiSecret);
                const response = await axios.get(`https://fapi.binance.com/fapi/v2/account?${params}&signature=${signature}`, {
                    headers: {
                        'X-MBX-APIKEY': apiKey,
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type'
                    }
                });

                let account = response.data;


                let apiPosition = account.positions.filter((f) => Math.abs(parseFloat(f.notional)) > 0 && f.symbol === symbol);


                resolve({availableBalance: account.availableBalance, position: apiPosition})


            } catch
                (error) {

                reject(error.response ? error.response.data.msg : error.message)
            }
        }
    )


}


// export async function ocoPlaceOrder(symbol, side, rawQty, takeProfit) {
//
//
//     try {
//
//         getAccountForStrategy(symbol.toUpperCase()).then(async (account) => {
//
//             const {stepSize} = await getSymbolInfo(symbol);
//             const quantity = roundStep(rawQty, stepSize);
//
//             if (account && account.position.length) {
//                 await orderPlacing(symbol,(parseFloat(account.position[0].notional)) < 0 ? 'BUY' : 'SELL', Math.abs((parseFloat(account.position[0].positionAmt))),
//                     apiKey, apiSecret)
//                     .then(async () => {
//                         await orderPlacing(symbol, side, rawQty, 0.05).then().catch(console.error);
//                     }).catch();
//
//
//                 return
//
//             }
//
//             await orderPlacing(symbol, side, quantity).then().catch(console.error);
//         }).catch(err => console.log(err));
//
//     } catch (err) {
//         console.error('[OrderManager Error]', err.response?.data || err.message);
//     }
//
//
//
// }

async function getSymbolInfo(symbol) {
    const res = await axios.get(`${BASE_URL}/fapi/v1/exchangeInfo`);
    const info = res.data.symbols.find(s => s.symbol === symbol.toUpperCase());
    if (!info) {
        throw new Error(`Symbol ${symbol} not found in exchangeInfo`);
    }
    const lotSize = info.filters.find(f => f.filterType === 'LOT_SIZE');
    const priceFilter = info.filters.find(f => f.filterType === 'PRICE_FILTER');

    return {
        stepSize: parseFloat(lotSize.stepSize),
        tickSize: parseFloat(priceFilter.tickSize),
    };
}


// --- ✅ Main Order Function ---
export async function orderPlacing(SYMBOL, SIDE, QUANTITY, TAKE_PROFIT_PRICE = null) {
    return new Promise(async (resolve, reject) => {
        try {
            // Get server time
            const response = await axios.get(`https://api.binance.com/api/v3/time`);
            const serverTime = response.data.serverTime.toString();

            // Get symbol precision info
            const { stepSize, tickSize } = await getSymbolInfo(SYMBOL.toUpperCase());
            const quantity = roundStep(QUANTITY, stepSize);

            // Get current price to check notional
            const priceRes = await axios.get(`${BASE_URL}/fapi/v1/ticker/price?symbol=${SYMBOL.toUpperCase()}`);
            const currentPrice = parseFloat(priceRes.data.price);
            const notional = currentPrice * quantity;

            // Check if notional >= $5
            if (notional < 5) {
                console.warn(`❌ Skipping ${SYMBOL}: Notional value too low (${notional.toFixed(2)} USDT)`);
                return reject(`Order too small: $${notional.toFixed(2)} < $5`);
            }

            // Place MARKET order
            const query = `symbol=${SYMBOL.toUpperCase()}&side=${SIDE}&type=MARKET&quantity=${quantity}&timestamp=${serverTime}&recvWindow=10000`;
            const signature = sign(query, apiSecret);

            console.log(`[Order] ${SIDE} ${SYMBOL} | Qty: ${quantity} | Price: ${currentPrice} | Notional: ${notional.toFixed(2)} USDT`);

            const placeOrder = await axios.post(`${BASE_URL}/fapi/v1/order?${query}&signature=${signature}`, null, {
                headers: { 'X-MBX-APIKEY': apiKey }
            });

            const entrySide = SIDE.toUpperCase();
            const tpSide = entrySide === 'BUY' ? 'SELL' : 'BUY';

            // --- Take Profit Order ---
            if (TAKE_PROFIT_PRICE) {
                const tpPrice = roundStep(TAKE_PROFIT_PRICE, tickSize);
                const tpNotional = tpPrice * quantity;

                if (tpNotional < 5) {
                    console.warn(`❌ Skipping TP order: Notional too low (${tpNotional.toFixed(2)} USDT)`);
                    return reject(`TP order too small: $${tpNotional.toFixed(2)} < $5`);
                }

                const tpQuery = `symbol=${SYMBOL.toUpperCase()}&side=${tpSide}&type=LIMIT&quantity=${quantity}&price=${tpPrice}&timeInForce=GTC&timestamp=${serverTime}&recvWindow=10000`;
                const tpSignature = sign(tpQuery, apiSecret);

                const tpOrder = await axios.post(`${BASE_URL}/fapi/v1/order?${tpQuery}&signature=${tpSignature}`, null, {
                    headers: { 'X-MBX-APIKEY': apiKey }
                });

                console.log(`[TP] ${tpSide} at ${tpPrice} | TP Notional: ${tpNotional.toFixed(2)} USDT`);
            }

            resolve('✅ Order + Take Profit placed successfully');
        } catch (err) {
            console.error('[OrderManager Error]', err.response?.data || err.message);
            reject(err.response?.data || err.message);
        }
    });
}

// export async function orderPlacing(SYMBOL, SIDE, QUANTITY) {
//
//     return new Promise(async (resolve, reject) => {
//
//         try {
//             const response = await axios.get(`https://api.binance.com/api/v3/time`)
//
//             let serverTime = response.data.serverTime.toString();
//
//             const {stepSize, tickSize} = await getSymbolInfo(SYMBOL.toUpperCase());
//
//             const quantity = roundStep(QUANTITY, stepSize);
//
//             const query = `symbol=${SYMBOL.toUpperCase()}&side=${SIDE}&type=MARKET&quantity=${quantity}&timestamp=${serverTime}&recvWindow=10000`;
//
//
//
//             const signature = sign(query, apiSecret);
//             console.log(`[Order] ${SIDE} ${SYMBOL} | Qty: ${quantity}`);
//
//
//             const placeOrder  =  await axios.post(`${BASE_URL}/fapi/v1/order?${query}&signature=${signature}`, null, {
//                 headers: {'X-MBX-APIKEY': apiKey}
//             });
//
//             resolve('Order successful ', placeOrder );
//
//
//
//         }catch (err) {
//             console.error('[OrderManager Error]', err.response?.data || err.message);
//             reject( err.response?.data || err.message)
//         }
//
//
//
//     })
// }
