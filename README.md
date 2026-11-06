# RL Player (RadioLogik PWA)

Een lichtgewicht, mobile-first Progressive Web App (PWA) voor het naadloos streamen van (private) online radiostreams. Deze speler is gebouwd zonder zware frameworks of externe afhankelijkheden en is geoptimaliseerd voor prestaties, stabiliteit en wisselende netwerkomstandigheden.

## Functionaliteiten

- **Onafhankelijk & Snel:** Volledig gebouwd in Vanilla JavaScript en lokaal gehoste Bootstrap 5.3. Geen afhankelijkheid van jQuery of externe CDN's.
- **Robuuste PWA / Service Worker:** Volledig installeerbaar op iOS en Android. Blijft werken bij slechte verbindingen dankzij lokale caching van assets en lettertypen.
- **Slimme Netwerk- en Achtergrondafhandeling:**
  - Herstelt de audiostream automatisch en naadloos bij het wisselen van netwerken (bijv. van Wifi naar 4G).
  - Gooit dode buffers direct leeg en laadt een verse stream wanneer het besturingssysteem de audio pauzeert of de app naar de achtergrond verplaatst.
- **Verfijnde UI/UX:**
  - Vloeiende hardware-versnelde tracktitel-marquee met CSS-maskers (geen harde afsnijdingen op grotere schermen).
  - Ingebouwde dark- en lightmode (`nightshift`).
  - Sneltoets-ondersteuning (spatiebalk voor play/pauze) voor desktopgebruikers.

## Configuratie & Setup

Deze applicatie bevat geen automatische installatiescripts. Om de speler werkend te maken voor jouw eigen radiostation of stream, gebruik je de meegeleverde `.example` bestanden als basis.

### 1. Applicatie-instellingen (URL's)

In de hoofdmap (root) van het project vind je het bestand `.env.example`.

1. Hernoem of kopieer dit bestand naar de juiste bestandsnaam (bijvoorbeeld `.env` of afhankelijk van hoe het in je structuur laadt).
2. Open het bestand en vul je eigen gegevens in, waaronder:
   - `URL_STREAMING`: De actuele link naar jouw Icecast/Shoutcast stream.

### 2. RadioLogik Configuratie (Now Playing Data)

Om de huidige artiest en titel in de speler te tonen, heeft de app een actueel `playlist.json` bestand nodig. RadioLogik genereert dit en uploadt het bij elke trackwissel naar je server.

1. Ga in de projectmap van deze app naar de map `template/`.
2. Kopieer het template-bestand dat daarin staat.
3. Plak dit bestand op de Mac waar RadioLogik op draait in de volgende map:
   `~/Music/Radiologik/Web/Templates`
4. Stel RadioLogik zo in dat deze template wordt gebruikt en configureer de FTP-gegevens zodat het gegenereerde `playlist.json` bestand telkens in de root (hoofdmap) van deze webapp op je server wordt geplaatst.

### 3. PWA & Branding (Manifest & HTML)

Om de app jouw eigen merknaam te geven, pas je de volgende bestanden aan:

- **`manifest.json`**: In de root van de map vind je het bestand `manifest.example.json`. Hernoem dit naar `manifest.json` en wijzig daarin minimaal de `name`, `short_name` en het `theme_color`.
- **`index.html`**: Pas de `<title>`, `meta name="description"` en overige SEO/metadata tags aan.
- **Afbeeldingen**: Vervang de bestanden in de mappen `img/` en `assets/icons/` door je eigen logo's en app-iconen, maar behoud dezelfde bestandsnamen en afmetingen.

### 4. Service Worker Caching (Optioneel)

Als je eigen afbeeldingsnamen of extra bestanden toevoegt, vergeet deze dan niet toe te voegen aan de `cacheAssets` array in `service-worker.js` om volledige offline-ondersteuning te garanderen.

## Installatie (Hosting)

Upload de volledige projectmap naar een webserver. Omdat dit een Progressive Web App is die gebruik maakt van Service Workers, **vereist dit project een beveiligde HTTPS-verbinding** om correct te functioneren (of `localhost` voor lokaal testen).

## Licentie

Copyright 2026 PNCH/Erik Kroon
Bekijk het `LICENSE` bestand in de root van dit project voor de volledige licentievoorwaarden.
