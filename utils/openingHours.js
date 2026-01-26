// /utils/openingHours.js
const dayjs = require('dayjs');
const utc   = require('dayjs/plugin/utc');       // ← NEW
const tz    = require('dayjs/plugin/timezone');

dayjs.extend(utc);                               // ← NEW (must come first)
dayjs.extend(tz);

/* Single source of truth for default 9‑5, Monday‑Friday */
const DEFAULT_WEEKLY_TEMPLATE = [
  { day_of_week: 1, start: "09:00:00", end: "17:00:00" },
  { day_of_week: 2, start: "09:00:00", end: "17:00:00" },
  { day_of_week: 3, start: "09:00:00", end: "17:00:00" },
  { day_of_week: 4, start: "09:00:00", end: "17:00:00" },
  { day_of_week: 5, start: "09:00:00", end: "17:00:00" },
];

/* Convert template → Google Places `opening_hours` */
function toGoogleOpeningHours(weekly, timezone = "UTC") {
  const dayNames = [
    "Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"
  ];

  const periods = weekly.map(w => ({
    open:  { day: w.day_of_week, time: w.start.slice(0,5).replace(":","") },
    close: { day: w.day_of_week, time: w.end.slice(0,5).replace(":","") },
  }));

  const weekday_text = weekly.map(w => {
    const today = dayjs().tz(timezone).format("YYYY-MM-DD");
    const s = dayjs.tz(`${today} ${w.start}`, "YYYY-MM-DD HH:mm:ss", timezone);
    const e = dayjs.tz(`${today} ${w.end}`,   "YYYY-MM-DD HH:mm:ss", timezone);
    return `${dayNames[w.day_of_week]}: ${s.format("h:mm A")} – ${e.format("h:mm A")}`;
  });

  return { periods, weekday_text };
}

module.exports = { DEFAULT_WEEKLY_TEMPLATE, toGoogleOpeningHours };
