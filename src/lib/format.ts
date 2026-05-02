export function formatMoney(n: number, currency = "EUR") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
}

export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}