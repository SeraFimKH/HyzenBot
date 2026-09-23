const WEEKDAY_START_MINUTES = 8 * 60; // 08:00, segunda a sábado
const WEEKDAY_END_MINUTES = 22 * 60 + 30; // 22:30, segunda a sábado
const SUNDAY_START_MINUTES = 8 * 60; // 08:00, domingo
const SUNDAY_END_MINUTES = 12 * 60 + 30; // 12:30, domingo

export function isWithinSupportHours(date = new Date()) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const isSunday = date.getDay() === 0;

  if (isSunday) {
    return minutes >= SUNDAY_START_MINUTES && minutes < SUNDAY_END_MINUTES;
  }
  return minutes >= WEEKDAY_START_MINUTES && minutes < WEEKDAY_END_MINUTES;
}
