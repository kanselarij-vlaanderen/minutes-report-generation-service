export function weekdayName(date: Date) {
  return [
    "zondag",
    "maandag",
    "dinsdag",
    "woensdag",
    "donderdag",
    "vrijdag",
    "zaterdag",
  ][date.getDay()];
}

export function monthName(date: Date) {
  return [
    "januari",
    "februari",
    "maart",
    "april",
    "mei",
    "juni",
    "juli",
    "september",
    "oktober",
    "november",
    "december"
  ][date.getMonth()]
}

export function formatDate(date: Date) {
  return `${weekdayName(date)} ${date.getDate()} ${monthName(date)} ${date.getFullYear()}`
}

export function addLeadingZeros(number: number, length: number): string {
  return String(number).padStart(length, "0");
}