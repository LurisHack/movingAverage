function getMMTDate() {
    const now = new Date();

    let mmtHours = now.getUTCHours() + 6;
    let mmtMinutes = now.getUTCMinutes() + 30;
    let mmtDay = now.getUTCDay(); // Sunday = 0, Saturday = 6

    if (mmtMinutes >= 60) {
        mmtMinutes -= 60;
        mmtHours += 1;
    }

    if (mmtHours >= 24) {
        mmtHours -= 24;
        mmtDay = (mmtDay + 1) % 7; // Advance the day if passed midnight
    }

    return { hours: mmtHours, minutes: mmtMinutes, day: mmtDay };
}

export function getMinutesUntilNextSession() {
    const { hours, minutes, day } = getMMTDate();
    const currentMinutes = hours * 60 + minutes;

    // ⛔ Weekend check
    if (day === 6 || day === 0) {
        return -1; // Weekend flag
    }

    // ⛔ Friday night 10:30 PM onwards (22:30)
    if (day === 5 && currentMinutes >= 22 * 60 + 30) {
        return -1;
    }

    // ✅ Define trading sessions in MMT (minutes)
    const tradingIntervals = [
        6 * 60 + 30,   // 06:30 AM
        13 * 60 + 30,  // 01:30 PM
        18 * 60 + 30,  // 06:30 PM
        20 * 60,       // 08:00 PM
        2 * 60 + 30 + 24 * 60 // 02:30 AM next day (treated as 1590 mins)
    ];

    for (let start of tradingIntervals) {
        if (currentMinutes < start) {
            return start - currentMinutes;
        }
    }

    // Next day
    return tradingIntervals[0] + (24 * 60 - currentMinutes);
}

export function formatCountdown(minutesUntil) {
    if (minutesUntil === -1) {
        return "⛔ Market closed for the weekend.";
    }

    const hours = Math.floor(minutesUntil / 60);
    const minutes = minutesUntil % 60;

    return `⏳ Next trading session in: ${hours} hours ${minutes} minutes`;
}

// Example usage
// const minutesLeft = getMinutesUntilNextSession();
// console.log(formatCountdown(minutesLeft));
//