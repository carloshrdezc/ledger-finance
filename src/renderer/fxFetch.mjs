export async function fetchRatesFromFrankfurter(currencies, abortSignal) {
  const requested = Array.isArray(currencies)
    ? currencies.filter((ccy) => ccy && ccy !== 'USD')
    : [];
  const url = `https://api.frankfurter.app/latest?from=USD${requested.length > 0 ? `&to=${requested.join(',')}` : ''}`;

  const response = await fetch(url, { signal: abortSignal });
  if (!response.ok) {
    throw new Error(`Frankfurter API request failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || typeof payload !== 'object' || payload.rates == null || typeof payload.rates !== 'object') {
    throw new Error('Frankfurter API response was missing rates');
  }

  return {
    rates: { USD: 1, ...payload.rates },
    fetchedAt: new Date().toISOString(),
    source: 'frankfurter.app',
  };
}
