import {scanMarkets} from "../utility/trendDetector.js";
import {
    calculateQuantity,
    calculateStopLossPrice,
    calculateTargetSellPrice,
    getTicker, invokeOnceAtNextFiveMinuteMark,
    sleep
} from "./utility/utility.js";
import {getAccount} from "../utility/account.js";
import dotenv from "dotenv";
import {orderPlacing} from "../orderplacing.js";

dotenv.config();


let symbols = []

export async function initOne() {
    const account = await getAccount(process.env.BUY_API_KEY, process.env.BUY_API_SECRET);
    await Promise.all(account.positions.map((position) => {
        symbols.push({
            symbol: position.symbol,
            position: parseFloat(position.notional) < 0 ? 'short' : 'long',
            entryPrice: parseFloat(position.entryPrice),
            rawQty: Math.abs(parseFloat(position.positionAmt)),
            currentMA: 0, ws: null, hasPosition: true
        });
    }));

    scanMarkets(250, '1h')
        .then((res) => {

            // symbols = []
            console.log(res);
            res.uptrends.forEach(uptrend => {

                const findSymbol = symbols.find(s => s.symbol === uptrend.symbol);
                const quantity = calculateQuantity(10, uptrend.price)

                if (!findSymbol) {
                    const entryTargetPrice = calculateTargetSellPrice(uptrend.price, 0.5, quantity)
                    const removeSymbolPrice = calculateStopLossPrice(uptrend.price, -0.3, quantity);

                    symbols.push({
                        ...uptrend,
                        hasPosition: false,
                        entryTargetPrice,
                        removeSymbolPrice
                    })
                }

            })

            console.log(symbols)

        })
}


setInterval(() => {

    getTicker().then(tickers => {
        // console.log(ticker);

        tickers.forEach(async ticker => {

            await sleep(200);


            const currentPrice = parseFloat(ticker.lastPrice)


            symbols.forEach(symbol => {

                if (ticker.symbol === symbol.symbol) {



                    //Add order
                    if (currentPrice > symbol.entryTargetPrice && !symbol.hasPosition) {

                        symbol.hasPosition = true;

                        console.log('Order placement ', symbol)


                        orderPlacing(symbol.symbol, 'SELL', calculateQuantity(10, currentPrice), 0.05)
                            .then(() => {
                                symbol.entryPrice = currentPrice;
                                symbol.hasPosition = true;
                        symbol.position = 'short'
                            }).catch((err) => {
                            console.error(err)
                            symbol.hasPosition = false;
                            symbols = symbols.filter(s => s.symbol !== ticker.symbol);
                        })

                    }

                    //Remove symbol for -pnl
                    // const quantity = calculateQuantity(10, currentPrice);

                    console.log(`Stop Loss Price: ${symbol.removeSymbolPrice}`);

                    if (symbol.removeSymbolPrice && (currentPrice < symbol.removeSymbolPrice) && !symbol.hasPosition) {
                        console.log(`❌ Stop loss hit for ${symbol.symbol} at ${currentPrice}, removing.`);
                        symbol.hasPosition = false;
                        symbols = symbols.filter(s => s.symbol !== ticker.symbol);

                        console.log(symbols);
                    }
                }


            })


        })

    })


}, 60000)


export async function restartBot() {
    console.log("♻️ Restarting bot...");


    // Force garbage collection if available (Node must be run with `--expose-gc`)
    if (global.gc) {
        global.gc();
        console.log("🧹 Garbage collected");
    }

    await initOne();

}

invokeOnceAtNextFiveMinuteMark(() => {
    restartBot().catch(console.error);
})


// await initOne();

// symbol: '1000PEPEUSDT',
//     priceChange: '-0.0003644',
//     priceChangePercent: '-2.839',
//     weightedAvgPrice: '0.0124555',
//     lastPrice: '0.0124729',
//     lastQty: '39591',
//     openPrice: '0.0128373',
//     highPrice: '0.0128882',
//     lowPrice: '0.0121393',
//     volume: '88611079105',
//     quoteVolume: '1103697084.4772426',
//     openTime: 1748963280000,
//     closeTime: 1749049686821,
//     firstId: 1921766406,
//     lastId: 1924216913,
//     count: 2450209
// }


