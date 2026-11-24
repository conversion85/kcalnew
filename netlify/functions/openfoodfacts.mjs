/** Optional Netlify Functions proxy: supplies an identifying custom User-Agent.
 *  If deployed as static-only files, KCAL falls back to the public browser API.
 *  Set OFF_CONTACT_EMAIL in Netlify environment to satisfy OFF's identification format.
 */
export default async (request) => {
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' }
  });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const { searchParams } = new URL(request.url);
  const barcode = searchParams.get('barcode') || '';
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(barcode)) return json({ error: 'Ungültiger Barcode' }, 400);
  const email = process.env.OFF_CONTACT_EMAIL;
  const host = new URL(request.url).hostname;
  const identifier = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email : `https://${host}`;
  const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=code,product_name,product_name_de,brands,quantity,serving_size,nutriments`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': `KCAL/2.1 (${identifier})`, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(9500)
    });
    if (!response.ok) return json({ error: 'Open Food Facts temporär nicht erreichbar' }, response.status === 429 ? 429 : 502);
    const result = await response.json();
    return json({ status: result.status === 1 ? 1 : 0, product: result.status === 1 ? result.product : null });
  } catch {
    return json({ error: 'Produktabfrage temporär fehlgeschlagen' }, 502);
  }
};
export const config = { path: '/.netlify/functions/openfoodfacts' };
