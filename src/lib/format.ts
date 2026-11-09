export const money = (value: number|null, cents = false) => value===null?"Not recorded":new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents ? 2 : 0 }).format(value);
export const percent = (value: number | null) => value === null ? "N/A" : `${value.toFixed(1)}%`;
export const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value)) : "Not recorded";
