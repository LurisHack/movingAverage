export function calculateUnrealizedProfit(entryPrice, currentPrice, quantity, side) {
    if (!entryPrice || !currentPrice || !quantity) return 0;
    return side === 'BUY'
        ? quantity * (currentPrice - entryPrice)
        : quantity * (entryPrice - currentPrice);
}