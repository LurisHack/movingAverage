import axios from "axios";

export function calculateQuantity(notional, price) {
    return notional / price;
}

// Example:
// const quantity = calculateQuantity(10, 0.1440);
// console.log("Quantity:", quantity.toFixed(4)); // Output: 69.4444



export function calculateTargetSellPrice(entryPrice, desiredProfit, quantity) {
    return entryPrice + (desiredProfit / quantity);
}

// Example:
// const targetPrice = calculateTargetSellPrice(0.1440, 0.5, 69.4444);
// console.log("Target Sell Price:", targetPrice.toFixed(6)); // 0.1512

export function calculateStopLossPrice(entryPrice, targetLoss, quantity) {
    return entryPrice + (targetLoss / quantity); // For SHORT
}


export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function getTopSymbols(limit = 20) {
    const url = `https://fapi.binance.com/fapi/v1/ticker/24hr`;
    const res = await axios.get(url);
    return res.data
        .filter(s =>
            s.symbol.endsWith('USDT') &&
            !s.symbol.includes('BUSD') &&
            !s.symbol.includes('DOWN') &&
            !s.symbol.includes('UP')
        )
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, limit)
        .map(s => s.symbol);
}

export async function getTicker() {
    const url = `https://fapi.binance.com/fapi/v1/ticker/24hr`;
    const res = await axios.get(url);
    return res.data
        .filter(s =>
            s.symbol.endsWith('USDT') &&
            !s.symbol.includes('BUSD') &&
            !s.symbol.includes('DOWN') &&
            !s.symbol.includes('UP')
        )
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        // .slice(0, limit)
        .map(s => s);
}

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
