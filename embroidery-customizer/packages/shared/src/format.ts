export function formatCm(value: number): string {
  return `${(Math.round(value * 10) / 10).toFixed(1)} cm`;
}

export function formatDimensions(widthCm: number, heightCm: number): string {
  return `${(Math.round(widthCm * 10) / 10).toFixed(1)} × ${(Math.round(heightCm * 10) / 10).toFixed(1)} cm`;
}

export function formatMoney(minorUnits: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minorUnits / 100);
  } catch {
    return `${(minorUnits / 100).toFixed(2)} ${currency}`;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
