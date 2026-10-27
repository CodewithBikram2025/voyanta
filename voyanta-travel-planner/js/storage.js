import {FIREBASE_CONFIG} from "./config.js";
import {uid} from "./utils.js";

const STORAGE_KEY="voyanta.v1.data";
let db=null, firebaseModules=null, currentUserId=null, firebaseEnabled=false;
function isConfigured() { return Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId); }
function readLocal() {
  try {
    const data=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{"trips":[],"favorites":[]}');
    return {trips:Array.isArray(data.trips)?data.trips:[],favorites:Array.isArray(data.favorites)?data.favorites:[]};
  } catch { return {trips:[],favorites:[]}; }
}
function writeLocal(data) {
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify(data)); }
  catch { throw new Error("Browser storage is full or unavailable. Export your trips and try again."); }
}
export async function initializeStorage() {
  if (!isConfigured()) { firebaseEnabled=false; return {mode:"Local demo mode"}; }
  try {
    firebaseModules=await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js");
    const fs=await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const auth=await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    const app=firebaseModules.initializeApp(FIREBASE_CONFIG);
    db=fs.getFirestore(app);
    const authInstance=auth.getAuth(app);
    await new Promise((resolve,reject)=>{
      const unsub=auth.onAuthStateChanged(authInstance,user=>{
        currentUserId=user?.uid||null; unsub(); resolve();
      },reject);
      setTimeout(()=>{unsub();resolve();},2500);
    });
    // Anonymous sign-in provides per-install user-scoped data. Enable Anonymous auth in Firebase.
    if (!currentUserId) {
      try { const credential=await auth.signInAnonymously(authInstance); currentUserId=credential.user.uid; }
      catch (e) { throw new Error("Firebase is configured, but authentication failed. Enable Anonymous sign-in in Firebase Authentication."); }
    }
    firebaseModules={...firebaseModules,...fs};
    firebaseEnabled=true;
    return {mode:"Firebase cloud storage"};
  } catch(error) {
    console.error("Firebase initialization failed; using local demo mode:",error);
    firebaseEnabled=false;
    return {mode:"Local demo mode",warning:"Firebase could not connect. Local demo mode is active."};
  }
}
export function storageMode() { return firebaseEnabled?"Firebase cloud storage":"Local demo mode"; }
export async function loadData() {
  if (!firebaseEnabled) return readLocal();
  const fs=firebaseModules;
  try {
    const [tripsSnap,favSnap]=await Promise.all([
      fs.getDocs(fs.collection(db,"users",currentUserId,"trips")),
      fs.getDocs(fs.collection(db,"users",currentUserId,"favorites"))
    ]);
    const trips=tripsSnap.docs.map(d=>({...d.data(),id:d.id}));
    const favorites=favSnap.docs.map(d=>({...d.data(),id:d.id}));
    const data={trips,favorites};
    // Keep a local read cache for resilience; cloud remains the source of truth while connected.
    writeLocal(data);
    return data;
  } catch(e) { throw new Error(`Could not load cloud data: ${e.message}`); }
}
export async function saveData(data) {
  if (!firebaseEnabled) { writeLocal(data); return; }
  const fs=firebaseModules;
  try {
    const tripCollection=fs.collection(db,"users",currentUserId,"trips");
    const favCollection=fs.collection(db,"users",currentUserId,"favorites");
    const [tripSnap,favSnap]=await Promise.all([fs.getDocs(tripCollection),fs.getDocs(favCollection)]);
    const batch=fs.writeBatch(db);
    const existingTrips=new Set(data.trips.map(x=>x.id)), existingFavs=new Set(data.favorites.map(x=>x.id));
    for (const doc of tripSnap.docs) if (!existingTrips.has(doc.id)) batch.delete(doc.ref);
    for (const doc of favSnap.docs) if (!existingFavs.has(doc.id)) batch.delete(doc.ref);
    for (const item of data.trips) {
      const ref=fs.doc(tripCollection,item.id||uid());
      batch.set(ref,{...item,id:ref.id,updatedAt:fs.serverTimestamp()});
    }
    for (const item of data.favorites) {
      const ref=fs.doc(favCollection,item.id||uid());
      batch.set(ref,{...item,id:ref.id,updatedAt:fs.serverTimestamp()});
    }
    await batch.commit();
    writeLocal(data);
  } catch(e) { throw new Error(`Could not save cloud data: ${e.message}`); }
}
export function exportData(data) {
  const blob=new Blob([JSON.stringify({app:"Voyanta",exportedAt:new Date().toISOString(),...data},null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=`voyanta-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
