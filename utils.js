const ddmmyy = (date) => `${date.getDate()}-${date.getMonth()+1}-${date.getFullYear()}`
const nextWeekSameDay = (date) => new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000);
const capitalize = (s) => {
  if (typeof s !== 'string') return ''
  return s.charAt(0).toUpperCase() + s.toLowerCase().slice(1)
}

module.exports = { ddmmyy, nextWeekSameDay, capitalize };