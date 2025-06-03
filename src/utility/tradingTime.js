export function isTradingTime() {
    const now = new Date();

    // Weekend check (0 = Sunday, 6 = Saturday)
    const day = now.getDay();
    if (day === 0 || day === 6) {
        return false; // ⛔ Weekend - no trading
    }

    // MMT is UTC+6:30 so we adjust current UTC time to MMT
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();

    // Convert UTC to MMT (+6:30)
    let mmtHours = utcHours + 6;
    let mmtMinutes = utcMinutes + 30;

    if (mmtMinutes >= 60) {
        mmtHours += 1;
        mmtMinutes -= 60;
    }
    if (mmtHours >= 24) {
        mmtHours -= 24;
    }

    const currentMinutes = mmtHours * 60 + mmtMinutes;

    // Define allowed trading time intervals (in minutes)
    const tradingIntervals = [
        { start: 6 * 60 + 30, end: 9 * 60 + 30 },   // 06:30 - 09:30
        { start: 13 * 60 + 30, end: 16 * 60 + 30 }, // 13:30 - 16:30
        { start: 18 * 60 + 30, end: 22 * 60 + 30 }, // 18:30 - 22:30
        { start: 20 * 60, end: 22 * 60 },           // 20:00 - 22:00
        { start: 2 * 60 + 30, end: 4 * 60 + 30 }    // 02:30 - 04:30 (early morning)
    ];

    // Check if current time falls into any trading interval
    return tradingIntervals.some(interval => {
        if (interval.start < interval.end) {
            return currentMinutes >= interval.start && currentMinutes <= interval.end;
        } else {
            // for intervals that span midnight
            return currentMinutes >= interval.start || currentMinutes <= interval.end;
        }
    });
}

// console.log(isTradingTime())