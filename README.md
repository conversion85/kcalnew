# KCAL 2.2 – Barcode-Scanner Fix

Modernisierte Kalorien-App mit Lebensmittel-Barcode-Scanner und automatischem Abruf der Nährwerte aus **Open Food Facts** (offene Datenbank unter ODbL).

## Neu in Version 2.1

- **Kamera-Scanner** für EAN-13, EAN-8 und UPC (mit nativer BarcodeDetector-API; auf anderen Browsern wird bei Bedarf `html5-qrcode` 2.3.8 von jsDelivr nachgeladen)
- **Barcode aus einem Foto lesen** oder eine **Barcode-Nummer manuell eingeben**
- Produkt, Marke, kcal und Makronährwerte aus Open Food Facts abrufen
- **Kcal mit einem Klick übernehmen**: 100 g/ml als Bezugsmenge, Kalorien je 100 g/ml als Gesamtkalorien, verfügbare Portionsangabe als Portionsgröße (sonst 100)
- Produkte ohne Kalorienangabe werden angezeigt, aber nicht automatisch in den Rechner eingefügt
- Bisherige Funktionen bleiben: Live-Rechner, Verlauf, Export, Teilen, Taschenrechner, PWA, Hell-/Dunkelmodus

## Veröffentlichen

1. ZIP-Datei **entpacken** und die Dateien wie bisher als Website bei Netlify veröffentlichen. Für Kamerazugriff ist eine **HTTPS-Adresse** oder `http://localhost` erforderlich.
2. Barcode-Daten kommen online von `https://world.openfoodfacts.org/api/v2/product/{barcode}.json`.
3. Optional: Für Netlify Builds/CLI liegt unter `netlify/functions/openfoodfacts.mjs` eine Function bei. Sie setzt eine eigene User-Agent-Kennung. In Netlify kann zusätzlich die Umgebungsvariable `OFF_CONTACT_EMAIL` mit einer gültigen Kontakt-E-Mail konfiguriert werden. Bei einfachen statischen Deployments ohne Functions nutzt die App automatisch die öffentliche Open-Food-Facts-API direkt.
4. Die allgemeine Berechnung und der lokale Verlauf bleiben weiterhin offline nutzbar. **Die Produktabfrage erfordert Internet.** Auf Safari oder anderen Browsern ohne BarcodeDetector benötigt auch die Code-Erkennung die Scannerbibliothek von jsDelivr.

## Bedienung

- „Kamera öffnen“ → Berechtigung erteilen → EAN-/UPC-Strichcode gerade vor die Kamera halten.
- Alternativ „Foto auswählen“ oder die 8-, 12-, 13- bzw. 14-stellige Nummer eintippen.
- Nach dem Fund die Daten am Verpackungsetikett überprüfen und auf „Nährwerte in Rechner übernehmen“ klicken.
- Eine Portionsgröße eingeben und das Ergebnis wie gewohnt speichern.

## Datenschutz und Datenquellen

- Kamerabilder und ausgewählte lokale Bilddateien werden **nicht** an Open Food Facts hochgeladen. Die Erkennung erfolgt im Browser.
- Bei einer **Produktabfrage wird der Barcode** über das Internet an Open Food Facts gesendet. Dabei fallen technisch bedingt Serverzugriffe mit IP-Adresse an; bei aktivierter Netlify Function geht die Abfrage zunächst über die eigene Website.
- Auf Browsern ohne native Barcode-Erkennung wird erst nach Aktivierung des Scanners eine externe Javascript-Bibliothek von jsDelivr geladen.
- Verlauf und Farbauswahl werden weiterhin lokal im Browser gespeichert (bestehende Daten bleiben erhalten). Keine Analytics-, Werbe- oder Tracking-Skripte integriert.
- Nährwerte sind Community-Daten, können fehlen oder veraltet sein. **Mit dem Produktetikett vergleichen.**
- Datenquelle und Lizenz: https://world.openfoodfacts.org/ , Open Database License (ODbL). Es gelten die Nutzungsbedingungen von Open Food Facts sowie eventuelle Anforderungen für die Nutzung größerer Datenausschnitte.

Wenn die App auf einer eigenen Website veröffentlicht wird, sind die tatsächlichen Hosting-, Drittanbieter- und Übertragungsvorgänge in der Datenschutzerklärung zu berücksichtigen. Ein Kamerazugriff erfolgt erst durch Nutzeraktion.

## Technische Hinweise

- Statischer Modus benötigt keine Zugangsdaten oder API-Schlüssel.
- Open Food Facts begrenzt lesende Produktabfragen (laut API-Dokumentation 15/min/IP). KCAL startet nur bei aktivem Scan/Lookup eine einzelne Produktabfrage und vermeidet doppelte API-Aufrufe in derselben Sitzung.
- Camera-Berechtigungen unterscheiden sich nach Gerät, Browser und System. Den Scanner vor Veröffentlichung auf dem Zielgerät testen.
- Das Web-Frontend benötigt für den automatischen API-Abruf eine aktive Internetverbindung. Ein direkter lokaler `file://`-Aufruf ist nur für den Offline-Rechner geeignet.

## Version 2.2
Die Kamera nutzt bevorzugt html5-qrcode mit ZXing statt der nativen BarcodeDetector-API. Das gesamte Kamerabild wird durchsucht. Die erkannte Nummer wird sofort angezeigt und die Produktsuche startet ohne auf das Schließen der Kamera zu warten. Für den Decoder-Download und die Produktsuche wird Internet benötigt.

## Version 2.3
Autofokus falls unterstützt, höhere angeforderte Kameraauflösung, parallele native Erkennung falls verfügbar. Smartphone-Livetest erforderlich.
