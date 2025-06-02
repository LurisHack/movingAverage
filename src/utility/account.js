import axios from "axios";
import crypto from "crypto";

export function sign(query, apiSecret) {
    return crypto.createHmac('sha256', apiSecret).update(query).digest('hex');
}

export async function getAccount(apiKey, apiSecret) {
    try {
        // Get server time from Binance Futures API to sync timestamps
        const timeResponse = await axios.get("https://fapi.binance.com/fapi/v1/time");
        const serverTime = timeResponse.data.serverTime.toString();

        // Prepare query string with timestamp and recvWindow
        const params = new URLSearchParams({
            timestamp: serverTime,
            recvWindow: '10000'
        }).toString();

        // Generate signature using HMAC SHA256
        const signature = sign(params, apiSecret);

        // Fetch account info from Binance Futures API with signature
        const response = await axios.get(`https://fapi.binance.com/fapi/v2/account?${params}&signature=${signature}`, {
            headers: {
                'X-MBX-APIKEY': apiKey
            }
        });

        const account = response.data;

        // Filter positions with non-zero notional value (active positions)
        const positions = account.positions.filter(p => {
            const notional = parseFloat(p.notional);
            return !isNaN(notional) && Math.abs(notional) > 0;
        });

        return {
            positions,
            totalWalletBalance: account.totalWalletBalance,
            availableBalance: account.availableBalance,
            totalUnrealizedProfit: account.totalUnrealizedProfit,
            totalPositionInitialMargin: account.totalPositionInitialMargin
        };
    } catch (error) {
        console.error("Failed to fetch account data:", error.message);
        throw error;  // propagate error to caller
    }
}
