import { $, $$, uid, escapeHTML, dateOnly, formatINR, weatherInfo, showToast, safeCoordinates } from "./utils.js";
import { searchPlaces, getWeather, getRoute, getNearbyPlaces } from "./api.js";
import { initializeStorage, loadData, saveData, storageMode, exportData } from "./storage.js";

const state = {
  data:{trips:[],favorites:[]}, currentPlace:null, currentWeather:null,
  destinationMap:null,destinationMarker:null,routeMap:null,routeLine:null,routeMarkers:[],
  routeStart:null,routeEnd:null, selectedTripId:null, selectedBudgetTripId:"", activeView:"explore",
  searchSequence:0, attractionMarkers:[]
};
const moneyFields=[["transport","Transportation"],["stay","Accommodation"],["food","Food & drinks"],["activities","Activities"],["misc","Miscellaneous"]];
const todayISO=()=>new Date().toISOString().slice(0,10);
function initMaps(){
  if (!window.L) { showToast("Map library could not load. Check your connection and refresh.","error",6000);return; }
  state.destinationMap=L.map("destination-map",{scrollWheelZoom:true}).setView([22.5726,88.3639],5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'}).addTo(state.destinationMap);
  state.routeMap=L.map("route-map").setView([22.5726,88.3639],5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'}).addTo(state.routeMap);
}
function invalidateVisibleMap(){
  requestAnimationFrame(()=>{if(state.destinationMap&&$("#view-explore").classList.contains("active"))state.destinationMap.invalidateSize();if(state.routeMap&&$("#view-route").classList.contains("active"))state.routeMap.invalidateSize();});
}
function setView(name){
  state.activeView=name;
  $$(".view").forEach(el=>el.classList.toggle("active",el.id===`view-${name}`));
  $$(".nav-item[data-view]").forEach(el=>el.classList.toggle("active",el.dataset.view===name));
  $("#page-title").textContent=({explore:"Explore",trips:"My trips",route:"Route planner",favorites:"Favourites",budget:"Budget planner"})[name]||name;
  $("#sidebar").classList.remove("open");
  if(name==="trips")renderTrips();
  if(name==="favorites")renderFavorites();
  if(name==="budget")renderBudget();
  invalidateVisibleMap();
  window.scrollTo({top:0,behavior:"smooth"});
}
function toastError(error, prefix="Something went wrong"){
  console.error(prefix,error);
  showToast(`${prefix}: ${error?.message||"Please try again."}`,"error",5000);
}
function confirmAction(title,message){
  return new Promise(resolve=>{
    const dialog=$("#confirm-dialog");$("#confirm-title").textContent=title;$("#confirm-message").textContent=message;
    const action=$("#confirm-action");
    const cleanup=()=>{dialog.removeEventListener("close",onClose);};
    const onClose=()=>{cleanup();resolve(dialog.returnValue==="confirm");};
    dialog.addEventListener("close",onClose);dialog.showModal();
    action.focus();
  });
}
function updateCounts(){$("#trip-count").textContent=state.data.trips.length;$("#storage-mode").textContent=storageMode();}
async function persist(successMessage="Changes saved"){
  try{await saveData(state.data);updateCounts();if(successMessage)showToast(successMessage,"success");return true;}
  catch(error){toastError(error,"Could not save");return false;}
}
function renderSearchResults(places){
  const host=$("#search-results");host.classList.remove("empty-results");
  if(!places.length){host.classList.add("empty-results");host.innerHTML='<div class="empty-illustration">⌖</div><strong>No places found.</strong><p>Try a nearby city, a landmark, or a more specific search.</p>';return;}
  host.innerHTML=places.map((p,i)=>`<article class="result-item"><div class="result-pin">⌖</div><div class="result-copy"><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(p.displayName)}</small></div><div class="result-actions"><button class="secondary-button small" data-select-place="${i}">View details</button><button class="secondary-button small" data-favorite-place="${i}">♡ Save</button></div></article>`).join("");
  host.querySelectorAll("[data-select-place]").forEach(btn=>btn.addEventListener("click",()=>selectPlace(places[Number(btn.dataset.selectPlace)])));
  host.querySelectorAll("[data-favorite-place]").forEach(btn=>btn.addEventListener("click",()=>addFavorite(places[Number(btn.dataset.favoritePlace)])));
}
async function searchDestination(query){
  const sequence=++state.searchSequence;
  $("#result-title").textContent="Search results";
  $("#result-description").textContent=`Looking for “${query.trim()}”…`;
  $("#search-results").classList.remove("empty-results");
  $("#search-results").innerHTML='<div class="result-item"><div class="result-pin">⌕</div><div class="result-copy"><strong>Searching destinations…</strong><small>Checking OpenStreetMap location data</small></div></div>';
  $("#search-button").disabled=true;
  try{
    const places=await searchPlaces(query);
    if(sequence!==state.searchSequence)return;
    state.lastSearchPlaces=places;
    $("#result-description").textContent=`${places.length} result${places.length===1?"":"s"} for “${query.trim()}”.`;
    renderSearchResults(places);
    if(places.length) await selectPlace(places[0]);
  }catch(error){
    if(sequence!==state.searchSequence)return;
    $("#search-results").classList.add("empty-results");
    $("#search-results").innerHTML=`<div class="empty-illustration">!</div><strong>We couldn't search right now.</strong><p>${escapeHTML(error.message)} Check your connection and try again.</p>`;
    toastError(error,"Destination search failed");
  }finally{if(sequence===state.searchSequence)$("#search-button").disabled=false;}
}
async function selectPlace(place){
  if(!safeCoordinates({lat:place.lat,lon:place.lon})){showToast("This result has invalid coordinates.","error");return;}
  state.currentPlace=place;state.currentWeather=null;
  $("#destination-detail").classList.remove("hidden");
  $("#detail-name").textContent=place.name;
  $("#detail-address").textContent=place.displayName;
  $("#coordinates").textContent=`Latitude ${place.lat.toFixed(5)} · Longitude ${place.lon.toFixed(5)}`;
  $("#weather-location").textContent=place.name;
  $("#weather-content").innerHTML='<div class="loading-line"></div><p class="muted-text">Fetching live weather conditions…</p>';
  $("#forecast-content").innerHTML="";
  $("#attractions-list").innerHTML='<p class="muted-text">Choose “Find nearby places” to search the area.</p>';
  if(state.destinationMarker)state.destinationMap.removeLayer(state.destinationMarker);
  state.destinationMap.setView([place.lat,place.lon],12);
  state.destinationMarker=L.marker([place.lat,place.lon]).addTo(state.destinationMap).bindPopup(`<strong>${escapeHTML(place.name)}</strong><br>${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}`).openPopup();
  $("#favorite-current").textContent=state.data.favorites.some(f=>f.id===place.id||f.displayName===place.displayName)?"♥ Saved favourite":"♡ Save favourite";
  invalidateVisibleMap();
  try{
    const weather=await getWeather(place.lat,place.lon);
    if(state.currentPlace!==place)return;
    state.currentWeather=weather;renderWeather(weather);
  }catch(error){
    $("#weather-content").innerHTML=`<p class="muted-text">Weather is temporarily unavailable. ${escapeHTML(error.message)}</p>`;
    toastError(error,"Weather unavailable");
  }
  $("#destination-detail").scrollIntoView({behavior:"smooth",block:"start"});
}
function renderWeather(data){
  const c=data.current||{},daily=data.daily||{},[desc,icon]=weatherInfo(c.weather_code);
  $("#weather-content").innerHTML=`<div class="weather-main"><div><div class="weather-temp">${Number.isFinite(c.temperature_2m)?Math.round(c.temperature_2m):"—"}°</div><div class="weather-desc">${escapeHTML(desc)} · Feels like ${Number.isFinite(c.apparent_temperature)?Math.round(c.apparent_temperature):"—"}°C</div></div><div class="weather-icon" aria-hidden="true">${icon}</div></div><div class="weather-stats"><div class="weather-stat"><span>Humidity</span><strong>${c.relative_humidity_2m??"—"}%</strong></div><div class="weather-stat"><span>Wind</span><strong>${c.wind_speed_10m??"—"} km/h</strong></div><div class="weather-stat"><span>Precipitation</span><strong>${c.precipitation??"—"} mm</strong></div></div>`;
  const days=daily.time||[];
  $("#forecast-content").innerHTML=days.slice(0,5).map((date,i)=>{
    const [d,ico]=weatherInfo(daily.weather_code?.[i]);
    return `<div class="forecast-row"><span class="forecast-day">${i===0?"Today":new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{weekday:"short",day:"numeric"})}</span><span class="forecast-icon" title="${escapeHTML(d)}">${ico}</span><strong>${Math.round(daily.temperature_2m_max?.[i]??0)}° / ${Math.round(daily.temperature_2m_min?.[i]??0)}°</strong></div>`;
  }).join("")||'<p class="muted-text">Forecast unavailable for this location.</p>';
}
async function loadAttractions(){
  const place=state.currentPlace;if(!place)return showToast("Search and select a destination first.","error");
  $("#attractions-list").innerHTML='<p class="muted-text">Searching nearby points of interest…</p>';
  try{
    const places=await getNearbyPlaces(place.lat,place.lon);
    if(state.currentPlace!==place)return;
    state.attractionMarkers.forEach(m=>state.destinationMap.removeLayer(m));state.attractionMarkers=[];
    if(!places.length){$("#attractions-list").innerHTML='<p class="muted-text">No named attractions were found nearby. Try another destination.</p>';return;}
    $("#attractions-list").innerHTML=places.map(p=>`<div class="attraction-card"><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(p.type.replaceAll("_"," "))}</small><small>${(distanceKm(place.lat,place.lon,p.lat,p.lon)).toFixed(1)} km away · OpenStreetMap</small></div>`).join("");
    places.forEach(p=>{const marker=L.marker([p.lat,p.lon]).addTo(state.destinationMap).bindPopup(`<strong>${escapeHTML(p.name)}</strong><br>${escapeHTML(p.type)}`);state.attractionMarkers.push(marker);});
    showToast(`Found ${places.length} nearby places.`);
  }catch(error){$("#attractions-list").innerHTML=`<p class="muted-text">Nearby places are unavailable right now. ${escapeHTML(error.message)}</p>`;toastError(error,"Nearby search failed");}
}
function distanceKm(lat1,lon1,lat2,lon2){const r=6371,rad=x=>x*Math.PI/180,dLat=rad(lat2-lat1),dLon=rad(lon2-lon1),a=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;return 2*r*Math.asin(Math.sqrt(a));}
function addFavorite(place){
  if(!place)return;
  const exists=state.data.favorites.some(f=>f.id===place.id||f.displayName===place.displayName);
  if(exists){showToast("That destination is already in your favourites.");return;}
  state.data.favorites.unshift({...place,id:String(place.id||uid()),savedAt:new Date().toISOString()});
  persist("Destination saved to favourites").then(()=>{renderFavorites();if(state.currentPlace)$("#favorite-current").textContent="♥ Saved favourite";});
}
async function toggleCurrentFavorite(){
  const p=state.currentPlace;if(!p)return;
  const index=state.data.favorites.findIndex(f=>f.id===p.id||f.displayName===p.displayName);
  if(index>=0){state.data.favorites.splice(index,1);await persist("Removed from favourites");}
  else{state.data.favorites.unshift({...p,id:String(p.id||uid()),savedAt:new Date().toISOString()});await persist("Added to favourites");}
  $("#favorite-current").textContent=state.data.favorites.some(f=>f.id===p.id||f.displayName===p.displayName)?"♥ Saved favourite":"♡ Save favourite";
  renderFavorites();
}
function renderFavorites(){
  const host=$("#favorites-grid");
  if(!state.data.favorites.length){host.innerHTML='<div class="empty-results" style="grid-column:1/-1"><div class="empty-illustration">♡</div><strong>No favourites just yet.</strong><p>Search for a destination and save the places you love.</p><button class="primary-button" data-view="explore">Explore destinations →</button></div>';host.querySelector("[data-view]")?.addEventListener("click",()=>setView("explore"));return;}
  host.innerHTML=state.data.favorites.map((p,i)=>`<article class="favorite-card"><div class="result-pin">⌖</div><h3>${escapeHTML(p.name)}</h3><p>${escapeHTML(p.displayName)}</p><div class="favorite-card-actions"><button class="primary-button small" data-fav-explore="${i}">Explore →</button><button class="secondary-button small" data-fav-remove="${i}">Remove</button></div></article>`).join("");
  host.querySelectorAll("[data-fav-explore]").forEach(b=>b.addEventListener("click",()=>{setView("explore");selectPlace(state.data.favorites[Number(b.dataset.favExplore)]);}));
  host.querySelectorAll("[data-fav-remove]").forEach(b=>b.addEventListener("click",async()=>{state.data.favorites.splice(Number(b.dataset.favRemove),1);await persist("Favourite removed");renderFavorites();}));
}
function blankBudget(){return {transport:0,stay:0,food:0,activities:0,misc:0};}
function renderTrips(){
  updateCounts();const host=$("#trips-grid");
  $("#trips-summary").textContent=state.data.trips.length?`${state.data.trips.length} trip${state.data.trips.length===1?"":"s"} in your travel journal.`:"No trips planned yet.";
  if(!state.data.trips.length){host.innerHTML='<div class="empty-results" style="grid-column:1/-1"><div class="empty-illustration">▤</div><strong>Your next adventure starts here.</strong><p>Create a trip to start collecting destinations and planning each day.</p><button class="primary-button" id="empty-create-trip">＋ Create your first trip</button></div>';$("#empty-create-trip")?.addEventListener("click",showTripForm);$("#itinerary-editor").classList.add("hidden");return;}
  host.innerHTML=state.data.trips.map(t=>`<article class="trip-card"><div class="trip-card-top"><div class="trip-symbol">✳</div><span class="trip-dates">${escapeHTML(dateOnly(t.startDate))} – ${escapeHTML(dateOnly(t.endDate))}</span></div><h3>${escapeHTML(t.name)}</h3><p>${escapeHTML(t.description||"A new journey waiting to happen.")}</p><div class="trip-card-stats"><span>⌖ ${t.stops?.length||0} stops</span><span>▦ ${tripDays(t)} days</span><span>₹ ${formatINR(totalBudget(t.budget)).replace("₹","").trim()} budget</span></div><div class="trip-card-actions"><button class="primary-button small" data-trip-open="${t.id}">Edit itinerary →</button><button class="secondary-button small" data-trip-export="${t.id}">Export</button><button class="secondary-button small" data-trip-delete="${t.id}">Delete</button></div></article>`).join("");
  host.querySelectorAll("[data-trip-open]").forEach(b=>b.addEventListener("click",()=>openTrip(b.dataset.tripOpen)));
  host.querySelectorAll("[data-trip-export]").forEach(b=>b.addEventListener("click",()=>exportTrip(b.dataset.tripExport)));
  host.querySelectorAll("[data-trip-delete]").forEach(b=>b.addEventListener("click",()=>deleteTrip(b.dataset.tripDelete)));
  if(state.selectedTripId&&state.data.trips.some(t=>t.id===state.selectedTripId))renderItineraryEditor();else $("#itinerary-editor").classList.add("hidden");
}
function tripDays(t){if(!t.startDate||!t.endDate)return 1;return Math.max(1,Math.round((new Date(`${t.endDate}T12:00:00`)-new Date(`${t.startDate}T12:00:00`))/86400000)+1);}
function totalBudget(b={}){return moneyFields.reduce((sum,[k])=>sum+Math.max(0,Number(b[k])||0),0);}
function showTripForm(){setView("trips");$("#trip-create-card").classList.remove("hidden");$("#trip-start").value=todayISO();$("#trip-end").value=todayISO();$("#trip-name").focus();}
function createTrip(event){
  event.preventDefault();const name=$("#trip-name").value.trim(),startDate=$("#trip-start").value,endDate=$("#trip-end").value;
  if(!name)return showToast("Please enter a trip name.","error");
  if(!startDate||!endDate||endDate<startDate)return showToast("Choose a valid date range; the end date must be on or after the start date.","error");
  if(state.data.trips.length>=100)return showToast("This demo supports up to 100 trips. Export older trips to keep a backup.","error");
  const trip={id:uid(),name,startDate,endDate,description:$("#trip-description").value.trim(),stops:[],budget:blankBudget(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  state.data.trips.unshift(trip);state.selectedTripId=trip.id;$("#trip-form").reset();$("#trip-create-card").classList.add("hidden");
  persist("Your trip has been created").then(()=>{renderTrips();renderBudget();renderBudgetSelect();renderItineraryEditor();});
}
function openTrip(id){state.selectedTripId=id;renderTrips();$("#itinerary-editor").classList.remove("hidden");renderItineraryEditor();$("#itinerary-editor").scrollIntoView({behavior:"smooth",block:"start"});}
function selectedTrip(){return state.data.trips.find(t=>t.id===state.selectedTripId);}
function renderItineraryEditor(){
  const trip=selectedTrip(),host=$("#itinerary-editor");if(!trip){host.classList.add("hidden");return;}
  host.classList.remove("hidden");
  const days=tripDays(trip),dates=Array.from({length:days},(_,i)=>{const d=new Date(`${trip.startDate}T12:00:00`);d.setDate(d.getDate()+i);return d.toISOString().slice(0,10);});
  const grouped=dates.map((date,i)=>({date,day:i+1,stops:(trip.stops||[]).filter(s=>s.date===date)}));
  const unscheduled=(trip.stops||[]).filter(s=>!dates.includes(s.date));
  host.innerHTML=`<div class="editor-header"><div><div class="eyebrow">ITINERARY EDITOR</div><h2>${escapeHTML(trip.name)}</h2><p>${escapeHTML(trip.description||"Add places and shape your journey.")}</p></div><div class="editor-actions"><button class="secondary-button small" id="edit-trip-details">Edit details</button><button class="secondary-button small" id="print-trip">Print plan</button><button class="primary-button small" id="save-trip-now">Save changes ✓</button></div></div><div class="editor-controls"><button class="primary-button small" id="add-stop-from-current">＋ Add selected destination</button><button class="secondary-button small" id="add-stop-search">Search a place</button><button class="secondary-button small" id="export-all-trips">Export all data</button></div><div class="add-stop-inline hidden" id="add-stop-inline"><form id="add-stop-form" class="form-grid"><label>Destination name<input id="stop-name" required placeholder="Place name"></label><label>Travel date<select id="stop-date">${dates.map((d,i)=>`<option value="${d}">Day ${i+1} · ${escapeHTML(dateOnly(d))}</option>`).join("")}</select></label><label>Notes<input id="stop-notes" placeholder="Optional plan or reminder"></label><div class="form-actions full-field"><button class="secondary-button" type="button" id="cancel-add-stop">Cancel</button><button class="primary-button" type="submit">Add stop</button></div></form></div>${grouped.map(g=>`<section class="day-section"><div class="day-heading"><div><strong>Day ${g.day}</strong><br><small>${escapeHTML(dateOnly(g.date))}</small></div><small>${g.stops.length} stop${g.stops.length===1?"":"s"}</small></div>${g.stops.length?g.stops.map(s=>stopMarkup(s,trip)).join(""):'<div class="empty-day">Nothing planned yet. Add a destination to this day.</div>'}</section>`).join("")}${unscheduled.length?`<section class="day-section"><div class="day-heading"><strong>Unscheduled stops</strong><small>${unscheduled.length}</small></div>${unscheduled.map(s=>stopMarkup(s,trip)).join("")}</section>`:""}<div class="form-actions"><button class="danger-button" id="delete-trip-from-editor">Delete this trip</button></div>`;
  $("#add-stop-from-current",host).addEventListener("click",()=>{if(!state.currentPlace){showToast("Search and select a destination first.","error");setView("explore");return;}showAddStopForm(state.currentPlace.name);});
  $("#add-stop-search",host).addEventListener("click",()=>{setView("explore");$("#destination-query").focus();showToast("Search a place, then return to your itinerary and add it.");});
  $("#add-stop-inline",host).classList.add("hidden");
  $("#save-trip-now",host).addEventListener("click",()=>{trip.updatedAt=new Date().toISOString();persist("Itinerary saved");});
  $("#edit-trip-details",host).addEventListener("click",editTripDetails);
  $("#print-trip",host).addEventListener("click",()=>printTrip(trip));
  $("#export-all-trips",host).addEventListener("click",()=>exportData(state.data));
  $("#delete-trip-from-editor",host).addEventListener("click",()=>deleteTrip(trip.id));
  $("#add-stop-form",host).addEventListener("submit",event=>{event.preventDefault();addStop($("#stop-name",host).value.trim(),$("#stop-date",host).value,$("#stop-notes",host).value.trim());});
  $("#cancel-add-stop",host).addEventListener("click",()=>$("#add-stop-inline",host).classList.add("hidden"));
  host.querySelectorAll("[data-stop-action]").forEach(btn=>btn.addEventListener("click",()=>handleStopAction(btn.dataset.stopAction,btn.dataset.stopId)));
}
function stopMarkup(s,trip){return `<div class="stop-row"><div class="stop-number">${(trip.stops||[]).findIndex(x=>x.id===s.id)+1}</div><div class="stop-main"><strong>${escapeHTML(s.name)}</strong><small>${s.lat!=null&&s.lon!=null?`${Number(s.lat).toFixed(4)}, ${Number(s.lon).toFixed(4)} · `:""}${escapeHTML(s.date?dateOnly(s.date):"Date not set")}</small>${s.notes?`<div class="stop-note">${escapeHTML(s.notes)}</div>`:""}</div><div class="stop-actions"><button class="tiny-button" title="Move up" data-stop-action="up" data-stop-id="${s.id}">↑</button><button class="tiny-button" title="Move down" data-stop-action="down" data-stop-id="${s.id}">↓</button><button class="tiny-button" title="Edit stop" data-stop-action="edit" data-stop-id="${s.id}">Edit</button><button class="tiny-button" title="Remove stop" data-stop-action="remove" data-stop-id="${s.id}">×</button></div></div>`;}
function showAddStopForm(defaultName=""){
  const form=$("#add-stop-inline");if(!form){showToast("Open a trip itinerary first.","error");return;}
  form.classList.remove("hidden");$("#stop-name").value=defaultName;$("#stop-notes").value="";
  const trip=selectedTrip();const date=$("#stop-date");date.innerHTML=Array.from({length:tripDays(trip)},(_,i)=>{const d=new Date(`${trip.startDate}T12:00:00`);d.setDate(d.getDate()+i);const iso=d.toISOString().slice(0,10);return `<option value="${iso}">Day ${i+1} · ${escapeHTML(dateOnly(iso))}</option>`;}).join("");
  $("#stop-name").focus();
}
function addStop(name,date,notes="",place=null){
  const trip=selectedTrip();if(!trip)return showToast("Choose a trip first.","error");if(!name)return showToast("Enter a destination name.","error");
  const stop={id:uid(),name,date,notes,lat:place?.lat??null,lon:place?.lon??null,displayName:place?.displayName||name,order:trip.stops.length};
  trip.stops.push(stop);trip.updatedAt=new Date().toISOString();persist("Destination added to itinerary").then(()=>{renderTrips();renderItineraryEditor();});
}
async function handleStopAction(action,id){
  const trip=selectedTrip();if(!trip)return;const i=trip.stops.findIndex(s=>s.id===id);if(i<0)return;
  if(action==="remove"){if(!(await confirmAction("Remove this stop?","This destination will be removed from your itinerary.")))return;trip.stops.splice(i,1);}
  else if(action==="up"&&i>0){[trip.stops[i-1],trip.stops[i]]=[trip.stops[i],trip.stops[i-1]];}
  else if(action==="down"&&i<trip.stops.length-1){[trip.stops[i+1],trip.stops[i]]=[trip.stops[i],trip.stops[i+1]];}
  else if(action==="edit"){
    const s=trip.stops[i];const name=prompt("Destination name:",s.name);if(name===null)return;if(!name.trim())return showToast("Destination name cannot be empty.","error");
    const notes=prompt("Notes:",s.notes||"");if(notes===null)return;s.name=name.trim();s.notes=notes.trim();
    const date=prompt("Travel date (YYYY-MM-DD):",s.date||trip.startDate);if(date===null)return;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<trip.startDate||date>trip.endDate)return showToast("Choose a date within the trip date range.","error");s.date=date;
  }
  trip.stops.forEach((s,index)=>s.order=index);trip.updatedAt=new Date().toISOString();
  await persist(action==="remove"?"Stop removed":"Itinerary updated");renderTrips();renderItineraryEditor();
}
async function editTripDetails(){
  const t=selectedTrip();if(!t)return;
  const name=prompt("Trip name:",t.name);if(name===null)return;if(!name.trim())return showToast("Trip name cannot be empty.","error");
  const description=prompt("Trip description:",t.description||"");if(description===null)return;
  const start=prompt("Start date (YYYY-MM-DD):",t.startDate);if(start===null)return;
  const end=prompt("End date (YYYY-MM-DD):",t.endDate);if(end===null)return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<start)return showToast("Enter valid dates; end date must be on or after start date.","error");
  t.name=name.trim();t.description=description.trim();t.startDate=start;t.endDate=end;
  for(const s of t.stops)if(s.date<start||s.date>end)s.date=start;
  await persist("Trip details updated");renderTrips();renderItineraryEditor();renderBudgetSelect();
}
async function deleteTrip(id){
  const trip=state.data.trips.find(t=>t.id===id);if(!trip)return;
  if(!(await confirmAction(`Delete “${trip.name}”?`,"This trip and its itinerary will be permanently removed from the current storage.")))return;
  state.data.trips=state.data.trips.filter(t=>t.id!==id);if(state.selectedTripId===id)state.selectedTripId=null;
  await persist("Trip deleted");renderTrips();renderBudgetSelect();renderBudget();
}
function exportTrip(id){
  const t=state.data.trips.find(x=>x.id===id);if(!t)return;
  const blob=new Blob([JSON.stringify({app:"Voyanta",exportedAt:new Date().toISOString(),trip:t},null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`${t.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"voyanta-trip"}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function printTrip(t){
  const w=window.open("","_blank","noopener,noreferrer");if(!w)return showToast("Allow pop-ups to print your itinerary.","error");
  const rows=(t.stops||[]).map(s=>`<li><strong>${escapeHTML(s.name)}</strong> — ${escapeHTML(dateOnly(s.date))}<p>${escapeHTML(s.notes||"")}</p></li>`).join("");
  w.document.write(`<!doctype html><html><head><title>${escapeHTML(t.name)} — Voyanta</title><meta charset="utf-8"><style>body{font:15px Arial,sans-serif;max-width:760px;margin:45px auto;color:#24332b;padding:0 20px}h1{color:#176b52}small{color:#68756e}li{padding:12px 0;border-bottom:1px solid #ddd}p{color:#66736c}footer{margin-top:35px;color:#777;font-size:12px}@media print{button{display:none}}</style></head><body><h1>Voyanta</h1><h2>${escapeHTML(t.name)}</h2><small>${escapeHTML(dateOnly(t.startDate))} – ${escapeHTML(dateOnly(t.endDate))}</small><p>${escapeHTML(t.description||"")}</p><h3>Itinerary</h3><ol>${rows||"<li>No stops added yet.</li>"}</ol><h3>Estimated budget: ${escapeHTML(formatINR(totalBudget(t.budget)))}</h3><footer>Generated by Voyanta · Verify routes, hours, and bookings independently.</footer><script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}
function printCurrentTrip(){const t=selectedTrip();if(t)printTrip(t);}
function renderBudgetSelect(){
  const select=$("#budget-trip-select"),old=state.selectedBudgetTripId||select.value;
  select.innerHTML='<option value="">Select a trip</option>'+state.data.trips.map(t=>`<option value="${t.id}">${escapeHTML(t.name)}</option>`).join("");
  if(state.data.trips.some(t=>t.id===old))select.value=old;else if(state.data.trips.length)select.value=state.data.trips[0].id;
  state.selectedBudgetTripId=select.value;
}
function renderBudget(){
  renderBudgetSelect();const t=state.data.trips.find(x=>x.id===$("#budget-trip-select").value);
  const b=t?.budget||blankBudget();
  for(const [key] of moneyFields) $(`#budget-${key}`).value=Number(b[key])||0;
  updateBudgetTotals(t,b);
}
function updateBudgetTotals(trip,b){
  const total=totalBudget(b);
  $("#budget-total").textContent=formatINR(total);
  $("#budget-caption").textContent=trip?`${trip.name} · ${tripDays(trip)} day${tripDays(trip)===1?"":"s"} · estimated expenses`:"Choose a trip to start planning its budget.";
  $("#budget-breakdown").innerHTML=moneyFields.map(([key,label])=>{const amount=Math.max(0,Number(b[key])||0),percent=total?amount/total*100:0;return `<div><div class="breakdown-row"><span>${label}</span><strong>${escapeHTML(formatINR(amount))}</strong></div><div class="breakdown-track"><span style="width:${percent}%"></span></div></div>`;}).join("");
}
async function saveBudget(){
  const trip=state.data.trips.find(t=>t.id===$("#budget-trip-select").value);if(!trip)return showToast("Create or select a trip before saving a budget.","error");
  const budget={};for(const [key] of moneyFields){const v=Number($(`#budget-${key}`).value);if(!Number.isFinite(v)||v<0)return showToast("Budget amounts must be zero or more.","error");budget[key]=v;}
  trip.budget=budget;await persist("Budget estimate saved");updateBudgetTotals(trip,budget);renderTrips();
}
async function geocodeRoutePoint(query){
  const places=await searchPlaces(query);if(!places.length)throw new Error(`No location found for “${query}”.`);
  return places[0];
}
function formatDuration(seconds){const mins=Math.round(seconds/60),h=Math.floor(mins/60),m=mins%60;return h?`${h} hr ${m} min`:`${m} min`;}
async function calculateRoute(event){
  event.preventDefault();const startQ=$("#route-start").value.trim(),endQ=$("#route-end").value.trim();if(!startQ||!endQ)return;
  const host=$("#route-summary");host.innerHTML='<div class="loading-line"></div><p class="muted-text">Finding both places and calculating a route…</p>';
  try{
    const [start,end]=await Promise.all([geocodeRoutePoint(startQ),geocodeRoutePoint(endQ)]);
    const route=await getRoute(start,end);state.routeStart=start;state.routeEnd=end;
    if(state.routeLine)state.routeMap.removeLayer(state.routeLine);state.routeMarkers.forEach(m=>state.routeMap.removeLayer(m));state.routeMarkers=[];
    const latlngs=route.geometry.coordinates.map(([lon,lat])=>[lat,lon]);
    state.routeLine=L.polyline(latlngs,{color:"#176b52",weight:5,opacity:.82}).addTo(state.routeMap);
    state.routeMarkers.push(L.marker([start.lat,start.lon]).addTo(state.routeMap).bindPopup(`<strong>Start</strong><br>${escapeHTML(start.name)}`));
    state.routeMarkers.push(L.marker([end.lat,end.lon]).addTo(state.routeMap).bindPopup(`<strong>Destination</strong><br>${escapeHTML(end.name)}`));
    state.routeMap.fitBounds(state.routeLine.getBounds(),{padding:[25,25]});invalidateVisibleMap();
    host.innerHTML=`<div class="eyebrow">ROUTE CALCULATED</div><strong>${escapeHTML(start.name)} → ${escapeHTML(end.name)}</strong><p>Approximate driving estimate</p><div class="route-stats"><div class="route-stat"><small>Distance</small><strong>${(route.distance/1000).toLocaleString(undefined,{maximumFractionDigits:1})} km</strong></div><div class="route-stat"><small>Driving time</small><strong>${formatDuration(route.duration)}</strong></div></div>`;
    showToast("Route calculated successfully.");
  }catch(error){host.innerHTML=`<div class="empty-illustration">!</div><strong>We couldn't calculate that route.</strong><p>${escapeHTML(error.message)}</p>`;toastError(error,"Route planning failed");}
}
function applyTheme(dark){
  document.body.classList.toggle("dark-mode",dark);localStorage.setItem("voyanta.theme",dark?"dark":"light");
  $("#theme-icon").textContent=dark?"☼":"◐";$("#theme-toggle").lastChild.textContent=dark?" Switch to light mode":" Switch to dark mode";
  $("#header-theme").textContent=dark?"☼":"◐";
}
function setupEvents(){
  $$(".nav-item[data-view], [data-view]").forEach(btn=>btn.addEventListener("click",()=>setView(btn.dataset.view)));
  $("#destination-search-form").addEventListener("submit",e=>{e.preventDefault();searchDestination($("#destination-query").value);});
  $$(".destination-card[data-destination]").forEach(btn=>btn.addEventListener("click",()=>{$("#destination-query").value=btn.dataset.destination;searchDestination(btn.dataset.destination);}));
  $("#favorite-current").addEventListener("click",toggleCurrentFavorite);
  $("#add-current-trip").addEventListener("click",()=>{
    if(!state.currentPlace)return;
    if(!state.data.trips.length){showTripForm();showToast("Create a trip first, then add this destination.");return;}
    const trip=selectedTrip()||state.data.trips[0];state.selectedTripId=trip.id;setView("trips");renderTrips();renderItineraryEditor();showAddStopForm(state.currentPlace.name);
    const dates=Array.from({length:tripDays(trip)},(_,i)=>{const d=new Date(`${trip.startDate}T12:00:00`);d.setDate(d.getDate()+i);return d.toISOString().slice(0,10);});
    if(!dates.includes(todayISO()))$("#stop-date").value=trip.startDate;
  });
  $("#load-attractions").addEventListener("click",loadAttractions);
  $("#create-trip").addEventListener("click",showTripForm);$("#close-trip-form").addEventListener("click",()=>$("#trip-create-card").classList.add("hidden"));$("#cancel-trip").addEventListener("click",()=>$("#trip-create-card").classList.add("hidden"));$("#trip-form").addEventListener("submit",createTrip);
  $("#route-form").addEventListener("submit",calculateRoute);
  $("#budget-trip-select").addEventListener("change",()=>{state.selectedBudgetTripId=$("#budget-trip-select").value;renderBudget();});
  $("#save-budget").addEventListener("click",saveBudget);
  for(const [key] of moneyFields)$(`#budget-${key}`).addEventListener("input",()=>{const t=state.data.trips.find(x=>x.id===$("#budget-trip-select").value),b={};for(const [k] of moneyFields)b[k]=Number($(`#budget-${k}`).value)||0;updateBudgetTotals(t,b);});
  $("#theme-toggle").addEventListener("click",()=>applyTheme(!document.body.classList.contains("dark-mode")));
  $("#header-theme").addEventListener("click",()=>applyTheme(!document.body.classList.contains("dark-mode")));
  $("#mobile-menu").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
  document.addEventListener("click",e=>{if(window.innerWidth<=760&&$("#sidebar").classList.contains("open")&&!$("#sidebar").contains(e.target)&&!$("#mobile-menu").contains(e.target))$("#sidebar").classList.remove("open");});
}
async function init(){
  $("#today-label").textContent=new Date().toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"short"});
  $("#year").textContent=new Date().getFullYear();
  applyTheme(localStorage.getItem("voyanta.theme")==="dark");
  initMaps();setupEvents();
  const mode=await initializeStorage();$("#storage-mode").textContent=mode.mode;
  if(mode.warning){$("#notice-region").innerHTML=`<div class="notice">${escapeHTML(mode.warning)} Trips are being saved in this browser only.</div>`;}
  try{state.data=await loadData();}catch(error){toastError(error,"Data loading failed");state.data={trips:[],favorites:[]};}
  updateCounts();renderTrips();renderFavorites();renderBudget();
  if(location.protocol==="file:")$("#notice-region").innerHTML='<div class="notice">Run this project through a local web server (for example, <code>python -m http.server 8000</code>) because JavaScript modules do not work reliably from file:// URLs.</div>';
}
init().catch(error=>{console.error(error);showToast("The app could not start. Refresh the page and check the console.","error",6000);});
