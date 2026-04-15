import { format } from "date-fns";

export function displayCurrency(n: number, maximumFractionDigits = 0, minimumFractionDigits = 0): string {
    return new Intl.NumberFormat('en-US', {style:'currency', currency: 'USD', maximumFractionDigits, minimumFractionDigits}).format(n);
}

export function displayCompactNumber(n: number): string {
    return new Intl.NumberFormat('en', {maximumFractionDigits: 2, minimumFractionDigits: 2, notation: "compact", compactDisplay: "short"}).format(n);
}

export function displayMonthDate(d: Date): string {
    return format(d, 'LLL d');
}

export function displayChangeNumber(n: number): string {
    return new Intl.NumberFormat('en-US', {style: "decimal", signDisplay: "exceptZero", minimumFractionDigits: 2, maximumFractionDigits: 2}).format(n);
}

export function displayPercent(n: number, maximumFractionDigits = 1, minimumFractionDigits = 1): string {
    return `${new Intl.NumberFormat('en-US', {minimumFractionDigits, maximumFractionDigits}).format(n)}%`;
}

export function displaySignedPercent(n: number, maximumFractionDigits = 1, minimumFractionDigits = 1): string {
    return `${new Intl.NumberFormat('en-US', {signDisplay: "exceptZero", minimumFractionDigits, maximumFractionDigits}).format(n)}%`;
}

export function displaySignedCurrency(n: number, maximumFractionDigits = 0, minimumFractionDigits = 0): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        signDisplay: "exceptZero",
        maximumFractionDigits,
        minimumFractionDigits
    }).format(n);
}
