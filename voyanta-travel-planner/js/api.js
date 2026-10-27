import {APP_CONFIG} from "./config.js";
import {fetchJSON, safeCoordinates} from "./utils.js";

let lastNominatimRequest = 0;
async function respectNominatimPace() {
  const wait = APP_CONFIG.NOMINATIM_MIN_INTERVAL_MS - (Date.now()-lastNominatimRequest);
  if (wait>0) await new Promise(resolve=>setTimeout(resolve,wait));
  lastNominatimRequest=Date.now();
}
export async function searchPlaces(query) {
  const q = String(query||"").trim();
  if (q.length<2) throw new Error("Enter at least two characters to search.");
  await respectNominatimPace();
  const url = new URL(APP_CONFIG.NOMINATIM_BASE);
  url.search = new URLSearchParams({q,format:"jsonv2",limit:"6",addressdetails:"1",accept_language:"en"}).toString();
  const data = await fetchJSON(url.toString());
  return data.filter(item=>safeCoordinates(item)).map(item=>({
    id:String(item.place_id), name:item.name||item.display_name?.split(",")[0]||"Unnamed place",
    displayName:item.display_name||item.name||"Unknown location",
    lat:Number(item.lat), lon:Number(item.lon), type:item.type||item.class||"place",
    address:item.address||{}
  }));
}
export async function getWeather(lat,lon) {
  const url = new URL(APP_CONFIG.OPEN_METEO_BASE);
  url.search = new URLSearchParams({
    latitude:String(lat),longitude:String(lon),current:"temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m",
    daily:"weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone:"auto",forecast_days:"5",temperature_unit:"celsius",wind_speed_unit:"kmh"
  }).toString();
  return fetchJSON(url.toString());
}
export async function getRoute(start,end) {
  const coords = `${start.lon},${start.lat};${end.lon},${end.lat}`;
  const url = `${APP_CONFIG.OSRM_BASE}/${coords}?overview=full&geometries=geojson&steps=false`;
  const data = await fetchJSON(url);
  if (data.code!=="Ok"||!data.routes?.length) throw new Error("No driving route was found between these locations.");
  return data.routes[0];
}
export async function getNearbyPlaces(lat,lon) {
  const query = `[out:json][timeout:12];(node(around:5000,${lat},${lon})[tourism~"^(attraction|museum|viewpoint|zoo|theme_park|gallery)$"];way(around:5000,${lat},${lon})[tourism~"^(attraction|museum|viewpoint|zoo|theme_park|gallery)$"];node(around:5000,${lat},${lon})[leisure=park];way(around:5000,${lat},${lon})[leisure=park];);out center tags 35;`;
  let lastError;
  for (const endpoint of APP_CONFIG.OVERPASS_ENDPOINTS) {
    try {
      const data=await fetchJSON(endpoint,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({data:query}).toString(),timeout:18000});
      return (data.elements||[]).map(el=>({
        id:`${el.type}/${el.id}`,name:el.tags?.name||el.tags?.["name:en"],
        type:el.tags?.tourism||el.tags?.leisure||"point of interest",
        lat:el.lat??el.center?.lat,lon:el.lon??el.center?.lon
      })).filter(p=>p.name&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)).slice(0,18);
    } catch(e) { lastError=e; }
  }
  throw lastError||new Error("Nearby places are temporarily unavailable.");
}
