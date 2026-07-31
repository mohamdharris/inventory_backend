// Formats a JS Date into "yyyy-mm-dd hh:mm:ss" in Indian Standard Time (Asia/Kolkata)
function formatIST(date) {
  if (!date) return null;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(date));

  const get = (type) => parts.find((p) => p.type === type).value;

  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

module.exports = { formatIST };
