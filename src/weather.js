import {Viewer, Color, Cartesian2, Cartesian3, Rectangle, Math as CMath, HeadingPitchRange, Matrix4, UrlTemplateImageryProvider, GeoJsonDataSource, Cesium3DTileset, LabelStyle, PolylineDashMaterialProperty} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './weather.css';
import {lineChart} from './weather-charts.js';

const $ = id => document.getElementById(id);
const STATION = {longitude:4.4469, latitude:51.9606};
const formatTime = value => new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Amsterdam', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'}).format(new Date(value));
const clockTime = value => new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Amsterdam', hour:'2-digit', minute:'2-digit'}).format(new Date(value));
const monthLabel = value => new Intl.DateTimeFormat('en-GB', {timeZone:'UTC', month:'short'}).format(new Date(value));
const number = value => Number.isFinite(value) ? value.toFixed(2) : '—';
let liveData, lastLiveError = false, historyVersion = 0;
let map, studyCentre, studyRange = 1600, tilted = true, link;
const mapLayers = new Map();
const mapPending = new Map();

async function json(url) {
  const response = await fetch(url, {signal:AbortSignal.timeout(40_000), cache:'no-store'});
  if (!response.ok) {
    let message;
    try {message = (await response.json()).error;} catch { /* Static-only hosts may return HTML. */ }
    throw new Error(message || `HTTP ${response.status}. Run this application with its weather server.`);
  }
  return response.json();
}
function setStatus(id, message, error = false) {
  $(id).textContent = message; $(id).classList.toggle('error', error);
}
function latest(code) { return liveData?.rows.findLast(row => Number.isFinite(row[code])); }
function compass(degrees) {
  return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round((degrees % 360)/22.5)%16];
}
function updateCards() {
  if (!liveData) return;
  const fields = [['ta','temperature'], ['ff','windSpeed'], ['dd','windDirection']];
  const ages = [];
  let missing = false;
  for (const [code, id] of fields) {
    const row = latest(code);
    if (!row) {$(id).textContent = '—'; $(`${id}Time`).textContent = 'No valid reading'; missing = true; continue;}
    const minutes = Math.max(0, Math.floor((Date.now()-Date.parse(row.time))/60_000));
    ages.push(minutes);
    $(id).closest('.metric').classList.toggle('delayed', minutes > 30);
    if (code === 'dd') {
      // A direction of zero is north unless the concurrent speed indicates calm.
      const calm = Number.isFinite(row.ff) && row.ff < 0.5;
      $(id).textContent = calm ? 'Calm' : compass(row.dd);
      $(`${id}Time`).textContent = `${calm ? '' : `${Math.round(row.dd)}° · `}${clockTime(row.time)} · ${minutes} min ago`;
    } else {
      $(id).textContent = row[code].toFixed(1);
      $(`${id}Time`).textContent = `${clockTime(row.time)} · ${minutes} min ago`;
    }
  }
  const badge = $('freshness');
  const failed = lastLiveError || liveData.upstreamError;
  const delayed = ages.some(age => age > 30);
  badge.textContent = failed ? 'Update failed · retained readings' : delayed ? 'Delayed observations' : missing ? 'Some readings unavailable' : 'Recent observations';
  badge.className = `badge${failed ? ' error' : delayed || missing ? ' warning' : ''}`;
  $('observationNote').textContent = `Last successful retrieval: ${formatTime(liveData.checkedAt)}. Checks every 10 minutes while this page is open. Times: Europe/Amsterdam. Provisional KNMI data.`;
}
function tableRow(values) {
  const tr = document.createElement('tr');
  for (const value of values) {const td = document.createElement('td'); td.textContent = value; tr.append(td);}
  return tr;
}
function renderLive() {
  updateCards();
  const times = liveData.rows.map(row => Date.parse(row.time));
  const start = Date.parse(liveData.start), end = Date.parse(liveData.end);
  for (const [code, id, unit, color, title] of [
    ['ta','temperatureChart','°C','#397b5e','Air temperature over the past 24 hours'],
    ['ff','windChart','m/s','#368aa1','Wind speed over the past 24 hours'],
  ]) {
    const points = liveData.rows.map((row,i) => ({time:times[i], value:row[code], label:formatTime(row.time)}));
    // Empty endpoints keep the chart's x axis fixed to the actual 24-hour query window.
    if (!points.length || points[0].time > start) points.unshift({time:start, value:null});
    if (points.at(-1).time < end) points.push({time:end, value:null});
    lineChart($(id), {points, unit, color, title, timeFormat:clockTime});
  }
  $('recentRows').replaceChildren(...liveData.rows.toReversed().map(row => tableRow([formatTime(row.time), number(row.ta), number(row.ff), number(row.dd)])));
  const count = code => liveData.rows.filter(row => Number.isFinite(row[code])).length;
  $('recentCoverage').textContent = `Valid observations: temperature ${count('ta')}, wind speed ${count('ff')}, direction ${count('dd')}. About 144 ten-minute records are expected in 24 hours. Gaps are left blank.`;
  const t = latest('ta'), f = latest('ff'), d = latest('dd');
  if (map) {
    const station = map.entities.getById('knmi-344');
    if (station) station.description = `<p>Rotterdam Airport · KNMI station 344</p><p>Latest valid temperature: ${t ? `${number(t.ta)} °C (${formatTime(t.time)})` : 'Unavailable'}</p><p>Wind speed: ${f ? `${number(f.ff)} m/s (${formatTime(f.time)})` : 'Unavailable'}</p><p>Wind from: ${d ? `${number(d.dd)}° (${formatTime(d.time)})` : 'Unavailable'}</p><p>Regional observations; not pedestrian wind at the study site.</p>`;
    map.scene.requestRender();
  }
}
async function refreshLive() {
  $('refresh').disabled = true;
  try {
    liveData = await json('/api/weather/live'); lastLiveError = false; renderLive();
    setStatus('liveStatus', liveData.upstreamError ? `${liveData.message} Showing retained readings.` : 'Connected to KNMI. Each card shows its latest valid observation.', liveData.upstreamError);
  } catch (error) {
    lastLiveError = true;
    setStatus('liveStatus', `${error.message}${liveData ? ' Showing retained readings.' : ''}`, true);
    if (liveData) updateCards(); else {$('freshness').textContent = 'Weather unavailable'; $('freshness').className = 'badge error';}
  } finally {$('refresh').disabled = false;}
}
async function refreshHistory() {
  const version = ++historyVersion;
  const year = $('historyYear').value;
  setStatus('historyStatus', `Loading validated ${year} observations…`);
  $('monthlyRows').replaceChildren();
  for (const id of ['monthlyTemperatureChart','monthlyWindChart']) {$(id).replaceChildren(); const p=document.createElement('p'); p.className='empty';p.textContent=`Loading ${year}…`;$(id).append(p);}
  try {
    const data = await json(`/api/weather/history?year=${year}`);
    if (version !== historyVersion) return;
    for (const [key, id, unit, color, title] of [
      ['temperature','monthlyTemperatureChart','°C','#397b5e','Monthly mean temperature'],
      ['windSpeed','monthlyWindChart','m/s','#368aa1','Monthly mean wind speed'],
    ]) {
      lineChart($(id), {points:data.months.map(month => ({time:Date.parse(`${month.month}-01T00:00:00Z`), value:month[key].value, label:month.month})), unit, color, title:`${title}, ${data.year}`, timeFormat:monthLabel, monthly:true});
    }
    $('monthlyRows').replaceChildren(...data.months.map(month => tableRow([
      monthLabel(`${month.month}-01T00:00:00Z`),
      Number.isFinite(month.temperature.value) ? number(month.temperature.value) : 'Insufficient data',
      `${month.temperature.validDays}/${month.temperature.expectedDays}`,
      Number.isFinite(month.windSpeed.value) ? number(month.windSpeed.value) : 'Insufficient data',
      `${month.windSpeed.validDays}/${month.windSpeed.expectedDays}`,
    ])));
    setStatus('historyStatus', data.upstreamError ? `${data.message} Showing retained ${data.year} summary.` : `Validated daily observations · ${data.year}. Retrieved ${formatTime(data.checkedAt)}.`, data.upstreamError);
  } catch (error) {
    if (version !== historyVersion) return;
    setStatus('historyStatus', error.message, true);
    for (const id of ['monthlyTemperatureChart','monthlyWindChart']) {$(id).replaceChildren();const p=document.createElement('p');p.className='empty';p.textContent='Historical data unavailable';$(id).append(p);}
  }
}
const tabs = [$('recentTab'), $('historyTab')];
function selectTab(index) {
  tabs.forEach((tab,i) => {tab.setAttribute('aria-selected', String(i===index)); tab.tabIndex = i===index ? 0 : -1; $(tab.getAttribute('aria-controls')).hidden = i!==index;});
}
tabs.forEach((tab,i) => {
  tab.addEventListener('click', () => selectTab(i));
  tab.addEventListener('keydown', event => {
    if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {event.preventDefault(); const next = event.key==='Home' ? 0 : event.key==='End' ? 1 : 1-i; selectTab(next); tabs[next].focus();}
  });
});
$('refresh').addEventListener('click', () => {refreshLive(); refreshHistory();});
$('historyYear').addEventListener('change', refreshHistory);
const lastYear = new Date().getFullYear()-1;
$('historyYear').replaceChildren(...Array.from({length:3}, (_,i) => new Option(String(lastYear-i), String(lastYear-i))));
$('historyYear').value = lastYear >= 2025 && lastYear <= 2027 ? '2025' : String(lastYear);

function cameraSite() {
  if (!map || !studyCentre) return;
  map.camera.lookAt(studyCentre, new HeadingPitchRange(0, CMath.toRadians(tilted ? -45 : -90), studyRange));
  map.camera.lookAtTransform(Matrix4.IDENTITY); map.scene.requestRender();
}
function geoCoords(geo) {
  const coords=[];
  function collect(value) {if (typeof value?.[0] === 'number') coords.push(value); else if (Array.isArray(value)) value.forEach(collect);}
  for (const feature of geo.features || []) collect(feature.geometry?.coordinates);
  if (!coords.length) throw new Error('The study boundary is empty.');
  return coords;
}
async function aerial() {
  const url = '/data/background/luchtfoto';
  const [metadata, available] = await Promise.all([json(`${url}/tiles.json`), json(`${url}/available-tiles.json`)]);
  const provider = new UrlTemplateImageryProvider({url:`${url}/{z}/{x}/{reverseY}.png`, rectangle:Rectangle.fromDegrees(...metadata.bounds), minimumLevel:metadata.minzoom, maximumLevel:metadata.maxzoom, credit:'Supplied study-area aerial imagery'});
  const paths=new Set(available), blank=document.createElement('canvas');blank.width=blank.height=256;
  const request=provider.requestImage.bind(provider);
  provider.requestImage=(x,y,z,r) => paths.has(`${z}/${x}/${2**z-y-1}.png`) ? request(x,y,z,r) : Promise.resolve(blank);
  provider.errorEvent.addEventListener(() => setStatus('mapStatus', 'Some aerial tiles could not load. Station and boundary remain available.'));
  map.imageryLayers.addImageryProvider(provider);
}
async function boundary(url, color, width = 2) {
  const data = await GeoJsonDataSource.load(url, {clampToGround:true});
  for (const e of data.entities.values) if(e.polygon) {
    e.polygon.fill=false;
    const ring=e.polygon.hierarchy.getValue(map.clock.currentTime).positions;
    e.polyline={positions:[...ring,ring[0]], width, material:Color.fromCssColorString(color), clampToGround:true};
  }
  await map.dataSources.add(data);
}
function distanceKm(a, b) {
  const rad=x=>x*Math.PI/180, dLat=rad(b.latitude-a.latitude), dLon=rad(b.longitude-a.longitude);
  const h=Math.sin(dLat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dLon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
async function toggleTiles(id, url) {
  const box=$(id);
  try {
    if (!mapLayers.has(id) && box.checked) {
      if (!mapPending.has(id)) mapPending.set(id, Cesium3DTileset.fromUrl(url, {show:false}).then(layer => {map.scene.primitives.add(layer);mapLayers.set(id,layer);return layer;}).finally(() => mapPending.delete(id)));
      await mapPending.get(id);
    }
    const layer=mapLayers.get(id); if(layer) layer.show=box.checked;
    map.scene.requestRender();
  } catch {box.checked=false;setStatus('mapStatus','Could not load that model. Check the original 3D Tiles files.');}
}
async function startMap() {
  map = new Viewer('weatherMap', {baseLayer:false, baseLayerPicker:false, geocoder:false, animation:false, timeline:false, homeButton:false, sceneModePicker:false, navigationHelpButton:false, requestRenderMode:true});
  map.scene.globe.baseColor=Color.fromCssColorString('#dfe6dd');
  const geo = await json('/data/landUse/study-area/doc.geojson');
  const coords=geoCoords(geo);
  const rectangle=Rectangle.fromCartographicArray(coords.map(([lon,lat])=>({longitude:CMath.toRadians(lon),latitude:CMath.toRadians(lat)})));
  const center=Rectangle.center(rectangle);
  studyCentre=Cartesian3.fromRadians(center.longitude,center.latitude);
  const site={longitude:CMath.toDegrees(center.longitude),latitude:CMath.toDegrees(center.latitude)};
  studyRange=Cartesian3.distance(Cartesian3.fromRadians(rectangle.west,rectangle.south),Cartesian3.fromRadians(rectangle.east,rectangle.north))*1.6;
  $('distance').textContent=`· ${distanceKm(site,STATION).toFixed(1)} km from the study-area centre`;
  for (const [id,name,position,color] of [
    ['knmi-344','KNMI 344 · Rotterdam Airport',Cartesian3.fromDegrees(STATION.longitude,STATION.latitude,8),'#167e9a'],
    ['schiehaven','Schiehaven Noord',studyCentre,'#d8a942'],
  ]) map.entities.add({id,name,position,point:{pixelSize:12,color:Color.fromCssColorString(color),outlineColor:Color.WHITE,outlineWidth:2,disableDepthTestDistance:Number.POSITIVE_INFINITY},label:{text:name,font:'13px sans-serif',fillColor:Color.WHITE,outlineColor:Color.fromCssColorString('#173f36'),outlineWidth:3,style:LabelStyle.FILL_AND_OUTLINE,pixelOffset:new Cartesian2(0,-24),disableDepthTestDistance:Number.POSITIVE_INFINITY}});
  link=map.entities.add({name:'Regional weather observation station',show:false,polyline:{positions:[studyCentre,Cartesian3.fromDegrees(STATION.longitude,STATION.latitude)],width:2,material:new PolylineDashMaterialProperty({color:Color.fromCssColorString('#167e9a')}),clampToGround:true}});
  $('siteView').addEventListener('click',()=>{link.show=false;cameraSite();});
  $('tiltView').addEventListener('click',()=>{tilted=!tilted;$('tiltView').textContent=tilted?'Plan view':'3D view';link.show=false;cameraSite();});
  $('regionView').addEventListener('click',()=>{link.show=true;map.camera.flyTo({destination:Rectangle.fromDegrees(Math.min(site.longitude,STATION.longitude)-0.035,Math.min(site.latitude,STATION.latitude)-0.018,Math.max(site.longitude,STATION.longitude)+0.035,Math.max(site.latitude,STATION.latitude)+0.018)});});
  $('contextBuildings').addEventListener('change',()=>toggleTiles('contextBuildings','/data/buildings/rotterdam/tileset.json'));
  $('proposalBuildings').addEventListener('change',()=>toggleTiles('proposalBuildings','/models/proposed-complex/tileset.json'));
  $('tiltView').textContent='Plan view';
  cameraSite(); if(liveData) renderLive();
  const results=await Promise.allSettled([aerial(),boundary(geo,'#d8a942',3),boundary('/data/landUse/development-site/doc.geojson','#db668e')]);
  const missing=results.filter(result=>result.status==='rejected').length;
  setStatus('mapStatus', missing ? 'Some study layers could not load. Check the original public/data files.' : 'Study boundary in gold; development site in pink. Toggle the 3D models above.');
}
// Data retrieval and map loading are independent: one failure must not hide the other.
startMap().catch(error => {console.error(error);setStatus('mapStatus','Map unavailable. Check study-area files or WebGL support; weather remains usable.');});
refreshLive(); refreshHistory();
setInterval(refreshLive,600_000);
setInterval(updateCards,60_000);
let lastVisibilityCheck=Date.now();
document.addEventListener('visibilitychange',()=>{if(!document.hidden && Date.now()-lastVisibilityCheck>600_000){lastVisibilityCheck=Date.now();refreshLive();}});
