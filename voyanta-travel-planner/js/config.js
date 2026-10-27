// Public client configuration only. Never place a Firebase service-account key here.
export const FIREBASE_CONFIG = {
  // Copy your Firebase web app config values here to enable Firestore.
  // apiKey: "YOUR_FIREBASE_WEB_API_KEY",
  // authDomain: "YOUR_PROJECT.firebaseapp.com",
  // projectId: "YOUR_PROJECT_ID",
  // appId: "YOUR_FIREBASE_APP_ID"
};
export const APP_CONFIG = {
  NOMINATIM_BASE: "https://nominatim.openstreetmap.org/search",
  OPEN_METEO_BASE: "https://api.open-meteo.com/v1/forecast",
  OSRM_BASE: "https://router.project-osrm.org/route/v1/driving",
  OVERPASS_ENDPOINTS: [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ],
  REQUEST_TIMEOUT_MS: 15000,
  NOMINATIM_MIN_INTERVAL_MS: 1100,
  MAX_TRIPS: 100
};
