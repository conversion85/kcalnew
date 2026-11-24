/* KCAL 2.1: Barcode scan and public product lookup – no telemetry. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const scanArea = $('scannerArea');
  const viewport = $('scannerViewport');
  const startButton = $('startScanner');
  const stopButton = $('stopScanner');
  const lookupButton = $('barcodeLookup');
  const barcodeInput = $('barcodeInput');
  const status = $('scannerStatus');
  const result = $('barcodeResult');
  const applyButton = $('barcodeApply');
  const format = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

  let liveScanner = null;
  let liveStream = null;
  let detectorActive = false;
  let scanning = false;
  let opening = false;
  let scanGeneration = 0;
  let requestGeneration = 0;
  let currentProduct = null;
  let lastScanCode = '';
  let barcodeLibraryPromise = null;
  const productCache = new Map();

  const barcodeFormats = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
  let nativeFormats = barcodeFormats;
  const barcodeDigits = text => String(text || '').trim().replace(/[\s-]/g, '');
  const validBarcode = code => /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code);
  const formatNum = n => format.format(n);
  const setStatus = (message, kind = '') => {
    status.textContent = message;
    status.dataset.kind = kind;
  };
  const showResult = show => { result.hidden = !show; };

  function servingFromText(text) {
    const match = String(text || '').match(/^\s*(\d+(?:[.,]\d+)?)\s*(g|ml)\b/i);
    const serving = match ? Number(match[1].replace(',', '.')) : 100;
    return Number.isFinite(serving) && serving > 0 && serving <= 2000 ? serving : 100;
  }
  function nutrient(nutriments, field) {
    const n = Number(nutriments?.[`${field}_100g`]);
    return nutriments && nutriments[`${field}_100g`] != null && Number.isFinite(n) && n >= 0 ? n : null;
  }
  function calories(nutriments) {
    const kcal = nutrient(nutriments, 'energy-kcal');
    if (kcal !== null) return Math.round(kcal * 100) / 100;
    const kj = nutrient(nutriments, 'energy-kj');
    return kj === null ? null : Math.round(kj / 4.184 * 100) / 100;
  }
  const nutrientLabel = value => value === null ? '–' : `${formatNum(value)} g`;

  function renderProduct(product, code) {
    currentProduct = { ...product, code, kcal: calories(product.nutriments) };
    $('barcodeProductBrand').textContent = String(product.brands || '').split(',')[0].trim() || 'LEBENSMITTEL';
    $('barcodeProductName').textContent = product.product_name_de || product.product_name || 'Produkt ohne Namen';
    $('barcodeProductMeta').textContent = `EAN/UPC: ${code}${product.quantity ? ' · ' + product.quantity : ''}`;
    $('barcodeProductKcal').textContent = currentProduct.kcal === null ? '–' : formatNum(currentProduct.kcal);
    $('barcodeProtein').textContent = nutrientLabel(nutrient(product.nutriments, 'proteins'));
    $('barcodeCarbs').textContent = nutrientLabel(nutrient(product.nutriments, 'carbohydrates'));
    $('barcodeFat').textContent = nutrientLabel(nutrient(product.nutriments, 'fat'));
    $('barcodeProductLink').href = `https://world.openfoodfacts.org/product/${code}`;
    applyButton.disabled = currentProduct.kcal === null;
    applyButton.textContent = currentProduct.kcal === null ? 'Keine Kalorienangabe vorhanden' : 'Nährwerte in Rechner übernehmen  →';
    showResult(true);
    if (currentProduct.kcal === null) {
      setStatus('Produkt gefunden, aber Kalorien fehlen. Prüfe die Verpackung und trage die Werte manuell ein.', 'error');
    } else {
      setStatus('Produkt gefunden. Prüfe die Nährwerte und übernimm sie mit einem Klick.', 'success');
    }
  }

  async function fetchJson(url, signal) {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
    if (response.status === 429) throw new Error('Zu viele Anfragen. Bitte versuche es in einer Minute erneut.');
    if (response.status === 503) throw new Error('Die Lebensmitteldatenbank ist vorübergehend nicht erreichbar.');
    if (!response.ok) throw new Error(`Die Produktabfrage ist gerade nicht verfügbar (HTTP ${response.status}).`);
    return response.json();
  }
  async function productLookup(code, signal) {
    if (productCache.has(code)) return productCache.get(code);
    const internal = `/.netlify/functions/openfoodfacts?barcode=${code}`;
    const direct = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=code,product_name,product_name_de,brands,quantity,serving_size,nutriments`;
    let data;
    // Netlify function sends the identifying User-Agent required by Open Food Facts.
    // A static-only deployment automatically falls back to a public read-only API request.
    try {
      const response = await fetch(internal, { headers: { Accept: 'application/json' }, signal });
      if (!response.ok) throw new Error('Kein Funktions-Endpunkt');
      data = await response.json();
      if (!data || typeof data !== 'object' || typeof data.status === 'undefined') throw new Error('Kein gültiges JSON');
    } catch (error) {
      if (signal.aborted) throw error;
      data = await fetchJson(direct, signal);
    }
    if (data?.status === 1 && data.product) {
      productCache.set(code, data.product);
      if (productCache.size > 25) productCache.delete(productCache.keys().next().value);
    }
    return data?.status === 1 ? data.product : null;
  }

  async function lookup(raw) {
    const code = barcodeDigits(raw);
    if (!validBarcode(code)) {
      setStatus('Bitte gib eine gültige 8-, 12-, 13- oder 14-stellige Barcode-Nummer ein.', 'error');
      showResult(false);
      return;
    }
    barcodeInput.value = code;
    await stopCamera();
    const generation = ++requestGeneration;
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 12000);
    lookupButton.disabled = true;
    startButton.disabled = true;
    currentProduct = null;
    showResult(false);
    setStatus('Produkt wird in Open Food Facts gesucht …');
    try {
      const product = await productLookup(code, abortController.signal);
      if (generation !== requestGeneration) return;
      if (!product) { setStatus('Kein Produkt zu diesem Barcode gefunden. Du kannst die Angaben darunter selbst eintragen.', 'error'); return; }
      renderProduct(product, code);
    } catch (error) {
      if (generation !== requestGeneration) return;
      const message = error?.name === 'AbortError'
        ? 'Die Produktabfrage hat zu lange gedauert. Bitte versuche es erneut.'
        : (navigator.onLine === false ? 'Keine Internetverbindung. Der Rechner funktioniert weiterhin ohne Internet.' : (error?.message?.startsWith('Zu viele Anfragen') ? error.message : 'Produktabfrage fehlgeschlagen. Bitte prüfe deine Verbindung und versuche es erneut.'));
      setStatus(message, 'error');
    } finally {
      clearTimeout(timeout);
      if (generation === requestGeneration) { lookupButton.disabled = false; startButton.disabled = false; }
    }
  }

  async function nativeSupported() {
    if (!('BarcodeDetector' in window)) return false;
    if (typeof BarcodeDetector.getSupportedFormats !== 'function') return true;
    try {
      const formats = await BarcodeDetector.getSupportedFormats();
      nativeFormats = barcodeFormats.filter(format => formats.includes(format));
      return nativeFormats.length > 0;
    } catch { return false; }
  }
  function scannerReady() {
    scanArea.hidden = false;
    startButton.disabled = true;
    stopButton.disabled = false;
    setStatus('Kamera aktiv. Richte sie auf den Strichcode der Verpackung.');
  }
  function scannerStopped() {
    scanArea.hidden = true;
    startButton.disabled = false;
    stopButton.disabled = true;
    viewport.replaceChildren();
  }
  async function stopCamera() {
    ++scanGeneration;
    scanning = false;
    opening = false;
    detectorActive = false;
    if (liveScanner) {
      const old = liveScanner; liveScanner = null;
      try { await old.stop(); } catch { /* already stopped */ }
      try { old.clear(); } catch { /* ignore */ }
    }
    if (liveStream) {
      liveStream.getTracks().forEach(track => track.stop());
      liveStream = null;
    }
    scannerStopped();
  }
  function cameraError(error) {
    const name = error?.name || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Kamerazugriff abgelehnt. Erlaube ihn in den Browser-Einstellungen oder nutze ein Foto.';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'Keine Kamera gefunden. Nutze den Foto-Upload oder die manuelle Eingabe.';
    if (name === 'NotReadableError') return 'Die Kamera ist belegt. Schließe andere Kamera-Apps und versuche es erneut.';
    return 'Die Kamera konnte nicht gestartet werden. Alternativ Foto hochladen oder Barcode eingeben.';
  }
  function onDetected(value) {
    const code = barcodeDigits(value);
    if (!validBarcode(code) || !scanning) return;
    scanning = false; // one scan only, no repeat API requests
    lastScanCode = code;
    void lookup(code);
  }
  async function cameraNative(gen) {
    liveStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    if (gen !== scanGeneration) { liveStream.getTracks().forEach(t => t.stop()); liveStream = null; return; }
    const video = document.createElement('video');
    video.setAttribute('playsinline', ''); video.muted = true; video.autoplay = true;
    video.srcObject = liveStream;
    viewport.replaceChildren(video);
    await video.play();
    if (gen !== scanGeneration) return;
    const detector = new BarcodeDetector({ formats: nativeFormats });
    detectorActive = true;
    scannerReady();
    const loop = async () => {
      if (gen !== scanGeneration || !scanning || !detectorActive) return;
      try {
        if (video.readyState >= 2) {
          const codes = await detector.detect(video);
          if (codes.length) { onDetected(codes[0].rawValue); if (!scanning) return; }
        }
      } catch { /* camera frames can sporadically fail */ }
      if (gen === scanGeneration && scanning) setTimeout(loop, 130);
    };
    void loop();
  }
  function loadScannerLibrary() {
    if (window.Html5Qrcode) return Promise.resolve();
    if (barcodeLibraryPromise) return barcodeLibraryPromise;
    barcodeLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
      script.async = true;
      script.referrerPolicy = 'no-referrer';
      const timer = setTimeout(() => { script.remove(); reject(new Error('Zeitüberschreitung der Scanbibliothek')); }, 12000);
      script.onload = () => { clearTimeout(timer); window.Html5Qrcode ? resolve() : reject(new Error('Scanbibliothek nicht geladen')); };
      script.onerror = () => { clearTimeout(timer); reject(new Error('Scanbibliothek nicht erreichbar')); };
      document.head.append(script);
    }).catch(error => { barcodeLibraryPromise = null; throw error; });
    return barcodeLibraryPromise;
  }
  async function cameraWithLibrary(gen) {
    await loadScannerLibrary();
    if (gen !== scanGeneration) return;
    const F = window.Html5QrcodeSupportedFormats;
    const scanner = new window.Html5Qrcode('scannerViewport', {
      formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E],
      verbose: false
    });
    liveScanner = scanner;
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: (w,h) => ({ width: Math.max(90, Math.min(Math.floor(w * .82), 310)), height: Math.max(65, Math.min(Math.floor(h * .5), 140)) }) },
      decoded => onDetected(decoded),
      () => {}
    );
    if (gen !== scanGeneration) { await stopCamera(); return; }
    scannerReady();
  }
  async function startCamera() {
    if (opening || scanning) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus('Die Kamera benötigt HTTPS oder localhost und einen Browser mit Kamera-Unterstützung.', 'error');
      return;
    }
    opening = true;
    const gen = ++scanGeneration;
    scanning = true;
    scanArea.hidden = false;
    startButton.disabled = true;
    setStatus('Kamera wird gestartet …');
    try {
      if (await nativeSupported()) await cameraNative(gen);
      else await cameraWithLibrary(gen);
    } catch (error) {
      if (gen === scanGeneration) {
        await stopCamera();
        setStatus(cameraError(error), 'error');
      }
    } finally { if (gen === scanGeneration) opening = false; }
  }
  async function detectImage(file) {
    if (!file || !file.type.startsWith('image/')) { setStatus('Bitte wähle eine Bilddatei aus.', 'error'); return; }
    if (file.size > 15 * 1024 * 1024) { setStatus('Das Bild ist zu groß (maximal 15 MB).', 'error'); return; }
    await stopCamera();
    setStatus('Barcode wird im Bild gesucht …');
    try {
      if (await nativeSupported() && 'createImageBitmap' in window) {
        const bitmap = await createImageBitmap(file);
        let matches;
        try { matches = await new BarcodeDetector({ formats: nativeFormats }).detect(bitmap); }
        finally { bitmap.close(); }
        const match = matches.find(m => validBarcode(barcodeDigits(m.rawValue)));
        if (match) { await lookup(match.rawValue); return; }
      }
      await loadScannerLibrary();
      viewport.replaceChildren();
      const F = window.Html5QrcodeSupportedFormats;
      const imageScanner = new window.Html5Qrcode('scannerViewport', {
        formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E], verbose: false
      });
      try {
        const code = await imageScanner.scanFile(file, false);
        try { imageScanner.clear(); } catch {}
        await lookup(code);
      } catch (error) {
        try { imageScanner.clear(); } catch {}
        throw error;
      }
    } catch {
      setStatus('Kein lesbarer Barcode im Bild erkannt. Fotografiere ihn scharf und ohne Spiegelungen, oder gib die Nummer ein.', 'error');
    } finally { viewport.replaceChildren(); }
  }

  $('barcodeLookupForm').addEventListener('submit', event => { event.preventDefault(); void lookup(barcodeInput.value); });
  startButton.addEventListener('click', () => { void startCamera(); });
  stopButton.addEventListener('click', () => { void stopCamera().then(() => setStatus('Kamera geschlossen.')); });
  $('barcodePhoto').addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (file) void detectImage(file);
    event.target.value = '';
  });
  applyButton.addEventListener('click', () => {
    if (!currentProduct || currentProduct.kcal === null) return;
    const name = currentProduct.product_name_de || currentProduct.product_name || 'Lebensmittel';
    $('foodName').value = name.slice(0, 80);
    // Internal calculation uses totalWeight + totalCalories. 100 g/ml is an exact
    // normalization for API values given per 100 g/ml; product pack weight is not needed.
    $('totalWeight').value = '100';
    $('totalCalories').value = String(currentProduct.kcal).replace('.', ',');
    $('servingSize').value = String(servingFromText(currentProduct.serving_size)).replace('.', ',');
    $('totalCalories').dispatchEvent(new Event('input', { bubbles: true }));
    setStatus('Nährwerte übernommen. Passe jetzt deine Portionsgröße an und speichere das Ergebnis.', 'success');
    $('servingSize').focus({ preventScroll: true });
    $('servingSize').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  document.querySelectorAll('[data-tab]').forEach(tab => tab.addEventListener('click', () => {
    if (tab.dataset.tab !== 'calculator') void stopCamera();
  }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) void stopCamera(); });
  window.addEventListener('pagehide', () => { void stopCamera(); });
  $('calorieForm').addEventListener('reset', () => { currentProduct = null; showResult(false); setStatus('Eingaben zurückgesetzt. Du kannst erneut einen Barcode scannen.'); });
  stopButton.disabled = true;
})();
