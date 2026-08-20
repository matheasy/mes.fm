function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function hourKey(date) {
  return date.toISOString().slice(0, 13);
}

function lastNDayKeys(n, date) {
  const keys = [];
  for (let i = 0; i < n; i++) {
    keys.push(dayKey(new Date(date.getTime() - i * 86400000)));
  }
  return keys;
}

function lastNHourKeys(n, date) {
  const keys = [];
  for (let i = 0; i < n; i++) {
    keys.push(hourKey(new Date(date.getTime() - i * 3600000)));
  }
  return keys;
}

module.exports = { dayKey, hourKey, lastNDayKeys, lastNHourKeys };
