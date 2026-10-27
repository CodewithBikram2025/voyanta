export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
export const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const dateOnly = d => d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}) : "Date not set";
export const formatINR = value => new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(value)||0);
export const weatherInfo = code => {
  if (code === 0) return ["Clear sky","☀"];
  if ([1,2].includes(code)) return ["Mainly clear","🌤"];
  if (code === 3) return ["Overcast","☁"];
  if ([45,48].includes(code)) return ["Fog","🌫"];
  if ([51,53,55,56,57].includes(code)) return ["Drizzle","🌦"];
  if ([61,63,65,66,67,80,81,82].includes(code)) return ["Rain","🌧"];
  if ([71,73,75,77,85,86].includes(code)) return ["Snow","❄"];
  if ([95,96,99].includes(code)) return ["Thunderstorm","⛈"];
  return ["Conditions unavailable","🌡"];
};
export function showToast(message, type="success", duration=3500) {
  const region = $("#toast-region");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  region.append(el);
  window.setTimeout(() => el.remove(), duration);
}
export async function fetchJSON(url, {timeout=15000, ...options}={}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {...options, signal: controller.signal, headers: {Accept:"application/json", ...(options.headers||{})}});
    if (!response.ok) {
      const error = new Error(`Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") throw new Error("The request took too long. Please try again.");
    throw error;
  } finally { clearTimeout(timer); }
}
export function safeCoordinates(place) {
  const lat = Number(place?.lat), lon = Number(place?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat)<=90 && Math.abs(lon)<=180 ? {lat,lon} : null;
}
export function debounce(fn, delay=250) {
  let timer;
  return (...args) => { clearTimeout(timer); timer=setTimeout(()=>fn(...args),delay); };
}
