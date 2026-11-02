export const neighbourhoodStyles = {
  BU05990320: { color: '#397b5e', shortName: 'Delfshaven' },
  BU05990329: { color: '#368aa1', shortName: 'Schiemond' },
};

export function formatValue(value, decimals = 0) {
  return Number.isFinite(value)
    ? value.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : 'Unavailable';
}

