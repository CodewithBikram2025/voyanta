# Voyanta — Travel & Trip Planner

**Tagline:** Every journey, intelligently planned.

Voyanta is a responsive travel planning web application built for the GDG BPPIMT Tech Team selection process. The core application uses HTML, CSS, and vanilla JavaScript (ES modules), with Leaflet maps and public travel APIs.

## Features

- User-triggered destination search with OpenStreetMap Nominatim
- Interactive Leaflet map with OpenStreetMap attribution
- Current conditions and a five-day forecast from Open-Meteo
- Approximate driving route, distance, and duration from OSRM
- Nearby named points of interest from OpenStreetMap Overpass, when available
- Create, edit, and delete trips
- Add, date, reorder, edit, and remove itinerary stops
- Save favourite destinations
- Trip budget planner in INR
- Light/dark theme
- Export trip JSON, export all app data, and print a trip plan
- LocalStorage demo mode and optional Firebase Firestore persistence
- Responsive layout, accessible focus states, error messages, and loading states

## Technology

- HTML5, CSS3, vanilla JavaScript ES modules
- Leaflet 1.9.4 and OpenStreetMap tiles
- Nominatim geocoding/search
- Open-Meteo forecast API
- OSRM public routing demo
- Overpass API for nearby points of interest
- Firebase Authentication (anonymous) and Cloud Firestore (optional)

## Run locally

JavaScript modules should be served over HTTP, not opened as a `file://` URL.

### Python

```bash
python -m http.server 8000
```

Open http://localhost:8000.

### VS Code

Use the Live Server extension and open `index.html`.

No build step or npm install is required. A working internet connection is needed for CDN assets and public APIs.

## API details and attribution

- **Nominatim:** `https://nominatim.openstreetmap.org/search`. Searches happen only after the user submits a query; the app does not implement autocomplete. The app paces requests to avoid rapid repeated calls. The public service has a usage policy and may throttle requests.
- **OpenStreetMap tiles:** `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`. Visible map attribution is provided. Public tile servers have a usage policy and are not an unrestricted production CDN.
- **Open-Meteo:** `https://api.open-meteo.com/v1/forecast`. The app requests current temperature, humidity, apparent temperature, precipitation, wind, weather code, and daily forecast. API availability and forecast coverage vary.
- **OSRM:** `https://router.project-osrm.org/route/v1/driving/`. Distances and durations are routing estimates, not live traffic or guaranteed navigation.
- **Overpass:** public instances are queried for nearby named attractions and parks. They may be slow, rate-limited, or unavailable. The application falls back to a second public instance.
- **Leaflet:** map library distributed via CDN.

Use these public services respectfully. For production traffic, review each service's terms and consider an appropriate paid/hosted provider.

## Firebase Firestore setup (optional)

Without Firebase configuration, Voyanta uses LocalStorage demo mode. LocalStorage data belongs to the current browser and is not cloud-synced.

1. Create a project in the [Firebase Console](https://console.firebase.google.com/).
2. Add a Web App and copy its web configuration.
3. Enable **Authentication → Sign-in method → Anonymous**.
4. Create a Cloud Firestore database.
5. Open `js/config.js` and fill in `FIREBASE_CONFIG` with the web app values:

```js
export const FIREBASE_CONFIG = {
  apiKey: "YOUR_FIREBASE_WEB_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  appId: "YOUR_FIREBASE_APP_ID"
};
```

Firebase web configuration values identify the project; they are not service-account credentials. Still apply authentication, security rules, and any appropriate API restrictions.

6. Deploy the rules in `firestore.rules` to Firestore. They allow authenticated users to access only documents beneath their own `users/{uid}` path.
7. Serve the app over HTTP and reload. The app attempts anonymous authentication and stores trips and favourites under the authenticated UID.

**Important:** This simple starter synchronizes the signed-in anonymous browser identity. Clearing site data or switching browsers can make an anonymous account difficult to recover. If users need accounts across devices, add an explicit sign-in/linking flow and account recovery before production use.

If Firebase initialization or authentication fails, the app logs the reason and continues in LocalStorage demo mode. Check the browser console and Firebase configuration when testing cloud storage. Do not put service-account keys in frontend code or commit them to GitHub.

## Deploy to Netlify

1. Push the project to a public GitHub repository.
2. In Netlify, import the repository.
3. No build command is needed; publish directory is the repository root (`.`).
4. Deploy and open the HTTPS URL.
5. If using Firebase, ensure your deployed domain is permitted in Firebase Authentication settings and test Firestore rules.
6. Test destination search, weather, routing, saving, and exports on the deployed site.

## Deploy to GitHub Pages

1. Push all project files to a GitHub repository.
2. Open repository **Settings → Pages**.
3. Select the branch and root folder, then save.
4. Wait for the published HTTPS URL.
5. Configure Firebase Authentication authorized domains if using Firestore.

GitHub Pages serves static files; it does not provide a private backend. Firebase is optional and supplies cloud persistence.

## Project structure

```text
voyanta-travel-planner/
├── index.html
├── styles.css
├── README.md
├── firestore.rules
├── .gitignore
├── js/
│   ├── app.js
│   ├── api.js
│   ├── config.js
│   ├── storage.js
│   └── utils.js
└── assets/
```

## Testing checklist

- [ ] Run over HTTP and confirm there are no startup errors.
- [ ] Search for a real city and select a result.
- [ ] Confirm the map marker and coordinates update.
- [ ] Confirm weather and forecast appear when Open-Meteo responds.
- [ ] Calculate a route between two known locations.
- [ ] Create a trip and add a destination stop.
- [ ] Reorder, edit, and remove stops.
- [ ] Refresh the browser and confirm LocalStorage data persists.
- [ ] Configure Firebase and verify authenticated Firestore writes and reads.
- [ ] Save and remove favourites.
- [ ] Save a budget and confirm totals.
- [ ] Toggle dark mode, export JSON, and print a plan.
- [ ] Test mobile layout and failure messages.

## Limitations

- Public APIs can throttle or temporarily fail; the application reports errors instead of fabricating live data.
- Weather forecasts depend on the provider's data coverage and are not a guarantee of conditions on a future travel date.
- OSRM estimates do not include live traffic and are not turn-by-turn navigation.
- Nearby place data is contributed by OpenStreetMap users and may be incomplete.
- LocalStorage mode is device/browser-specific. Cloud persistence requires a configured Firebase project and correctly deployed security rules.
- Curated destination cards use remote Unsplash images for visual presentation; the live search, weather, and routing data come from their respective APIs.

## License

For educational use and the GDG BPPIMT Tech Team selection submission. Review the licenses and attribution requirements of third-party libraries, tile providers, APIs, and images before commercial use.
