import axios from 'axios';
import ti from 'technicalindicators';

async function getFuturesUSDTMarkets() {
    const res = await axios.get('https://fapi.binance.com/fapi/v1/exchangeInfo');
    const symbols = res.data.symbols
        .filter(s => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
        .map(s => s.symbol);
    return symbols;
}

async function fetchOHLCV(symbol = 'BTCUSDT', interval = '15m', limit = 100) {
    try {
        const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const { data } = await axios.get(url);
        return data.map(d => ({
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]),
        }));
    } catch (err) {
        console.error(`Error fetching ${symbol}: ${err.message}`);
        return null;
    }
}

function calculateIndicators(candles) {
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume);

    const rsi = ti.RSI.calculate({ period: 14, values: closes });
    const adx = ti.ADX.calculate({ period: 14, close: closes, high: highs, low: lows });
    const emaFast = ti.EMA.calculate({ period: 9, values: closes });
    const emaSlow = ti.EMA.calculate({ period: 21, values: closes });
    const macd = ti.MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    });
    const bb = ti.BollingerBands.calculate({
        period: 20,
        values: closes,
        stdDev: 2
    });

    return { rsi, adx, emaFast, emaSlow, macd, bb, closes, volumes };
}

function getVolumeProfile(volumes) {
    const totalVolume = volumes.reduce((sum, v) => sum + v, 0);
    return volumes[volumes.length - 1] / totalVolume;
}

function getSignal(indicators) {
    const { rsi, adx, emaFast, emaSlow, macd, bb, closes, volumes } = indicators;
    const i = rsi.length - 1;

    const lastClose = closes[closes.length - 1];
    const lastRSI = rsi[i];
    const lastADX = adx[i]?.adx;
    const lastMACD = macd[i];
    const lastBB = bb[i];
    const lastVolProfile = getVolumeProfile(volumes);

    const emaCrossUp = emaFast[i] > emaSlow[i] && emaFast[i - 1] <= emaSlow[i - 1];
    const emaCrossDown = emaFast[i] < emaSlow[i] && emaFast[i - 1] >= emaSlow[i - 1];

    const longSignal =
        lastRSI > 50 &&
        lastADX > 20 &&
        emaCrossUp &&
        lastMACD.MACD > lastMACD.signal &&
        lastClose > lastBB.middle &&
        lastVolProfile > 0.01;

    const shortSignal =
        lastRSI < 50 &&
        lastADX > 20 &&
        emaCrossDown &&
        lastMACD.MACD < lastMACD.signal &&
        lastClose < lastBB.middle &&
        lastVolProfile > 0.01;

    return { long: longSignal, short: shortSignal };
}

async function scanAllCoins(limit, interval) {
    const symbols = await getFuturesUSDTMarkets();
    // const interval = '15m';
    // const limit = 100;

    const results = [];

    for (const symbol of symbols) {
        const candles = await fetchOHLCV(symbol, interval, limit);
        if (!candles || candles.length < 50) continue;

        const indicators = calculateIndicators(candles);
        const signal = getSignal(indicators);

        if (signal.long || signal.short) {
            results.push({ symbol, signal: signal.long ? 'LONG' : 'SHORT' });
        }
    }

    if (results.length === 0) {
        console.log('📉 No signals found.');
    } else {
        console.log('📊 Detected Signals:');
        results.forEach(r => console.log(`${r.symbol}: ${r.signal}`));
    }
}

scanAllCoins(300, '1h');
