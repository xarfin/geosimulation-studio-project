import {
  Viewer,
  Color,
  Cartesian3,
  HeadingPitchRange,
  Matrix4,
  Math as CMath,
  GeoJsonDataSource,
  Cesium3DTileset,
  HeightReference,
  Cartographic,
  ClippingPolygon,
  ClippingPolygonCollection,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { renderNavigation, setStudyAreaFocus } from "./ui/navigation.js";
import { focusOnStudyArea } from './map/study-area.js';
import { addStudyAreaImagery } from './map/imagery.js';
import "./styles/scenarios.css";

renderNavigation("scenarios");

const $ = (id) => document.getElementById(id);
const viewer = new Viewer("cesiumContainer", {
  baseLayer: false,
  baseLayerPicker: false,
  geocoder: false,
  animation: false,
  timeline: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  requestRenderMode: true
});
viewer.scene.globe.baseColor = Color.fromCssColorString("#e5e9e3");
setStudyAreaFocus(() => focusOnStudyArea(viewer));
const cache = new Map();
let summary, baseline, active, centre, tilted = false, version = 0, timer, context, original, treeLayer, roofLayer, gatewayLayer, siteRings = [];
const cellVisuals = new WeakMap(), roofVisuals = new WeakMap(), treeVisuals = new WeakMap();

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw Error(`${url}: ${r.status}`);
  return r.json();
}

function status(message) {
  $("status").textContent = message;
}

function stop() {
  clearInterval(timer);
  timer = undefined;
  $("play").textContent = "Play growth";
}

function camera() {
  if (!centre) return;
  viewer.camera.lookAt(centre, new HeadingPitchRange(0, CMath.toRadians(tilted ? -42 : -90), tilted ? 900 : 760));
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
  viewer.scene.requestRender();
}

async function layer(name) {
  if (!cache.has(name)) cache.set(name, (async () => {
    const d = await GeoJsonDataSource.load("/task47/" + name + ".geojson");
    d.show = false;
    await viewer.dataSources.add(d);
    return d;
  })());
  try {
    return await cache.get(name);
  } catch (e) {
    cache.delete(name);
    throw e;
  }
}

function property(e, name) {
  return e.properties[name]?.getValue(viewer.clock.currentTime);
}

function paint() {
  if (!active) return;
  const key = $("scenario").value, round = Number($("iteration").value), isRun = ["access", "green"].includes(key);
  $("round").textContent = `${round} / ${$("iteration").max}`;
  for (const e of active.entities.values) {
    if (!e.polygon) continue;
    const id = property(e, "cell_id"), birth = property(e, "birth_iteration");
    let code = property(e, "land_use");
    if (isRun && birth > round) code = baseline.get(id);
    const visible = !($("original").checked && key === "supplied" && code === 7);
    let state = cellVisuals.get(e);
    if (!state) {
      state = {};
      cellVisuals.set(e, state);
    }
    const codeChanged = state.code !== code;
    if (codeChanged) {
      e.polygon.material = Color.fromCssColorString(summary.colors[code]).withAlpha(.9);
      state.code = code;
    }
    if (state.visible !== visible) {
      e.show = visible;
      state.visible = visible;
    }
    if (state.tilted !== tilted || state.heightCode !== code) {
      const height = code === 7 ? 30 : code === 14 ? 6 : 0;
      e.polygon.height = .2;
      e.polygon.heightReference = HeightReference.NONE;
      e.polygon.perPositionHeight = false;
      e.polygon.extrudedHeight = tilted ? .2 + height : .2;
      e.polygon.outline = false;
      state.tilted = tilted;
      state.heightCode = code;
    }
  }
  if (gatewayLayer) gatewayLayer.show = isRun;
  if (roofLayer) {
    roofLayer.show = isRun && tilted && $("roofs").checked;
    for (const e of roofLayer.entities.values) if (e.polygon) {
      const visible = round >= Number(property(e, "birth_iteration"));
      let state = roofVisuals.get(e);
      if (!state) {
        state = {};
        roofVisuals.set(e, state);
      }
      if (state.visible !== visible) {
        e.show = visible;
        state.visible = visible;
      }
      if (!state.styled) {
        e.polygon.height = 30.25;
        e.polygon.perPositionHeight = false;
        e.polygon.material = Color.fromCssColorString("#5b9b68");
        e.polygon.outline = false;
        state.styled = true;
      }
    }
  }
  if (treeLayer) {
    treeLayer.show = isRun && $("trees").checked && round >= Number($("iteration").max);
    for (const e of treeLayer.entities.values) {
      if (!e.position) continue;
      let state = treeVisuals.get(e);
      if (!state) {
        state = { carto: Cartographic.fromCartesian(e.position.getValue(viewer.clock.currentTime)) };
        treeVisuals.set(e, state);
      }
      if (state.tilted !== tilted) {
        const c = state.carto;
        e.position = Cartesian3.fromRadians(c.longitude, c.latitude, tilted ? 4.5 : .7);
        e.billboard = undefined;
        e.point = {
          show: !tilted,
          pixelSize: 5,
          color: Color.fromCssColorString("#235c3c"),
          outlineColor: Color.WHITE,
          outlineWidth: .5
        };
        e.ellipsoid = {
          show: tilted,
          radii: new Cartesian3(3, 3, 3.5),
          material: Color.fromCssColorString("#3e7f4f").withAlpha(.9)
        };
        state.tilted = tilted;
      }
    }
  }
  if (context?.clippingPolygons) context.clippingPolygons.enabled = isRun;
  viewer.scene.requestRender();
}

function metrics(key) {
  const m = summary.metrics.find((x) => x.scenario === ({ supplied: "supplied_proposal" }[key] || key));
  if (!m) {
    $("metrics").textContent = "Existing land use. No new programme applied.";
    return;
  }
  const value = (v) => v == null ? "Not supplied" : Number(v).toLocaleString("en-GB", { maximumFractionDigits: 1 });
  const fields = key === "supplied" ? [["Reference footprint", value(m.housing_area_m2) + " m²"], ["Estimated capacity", value(m.capacity_estimate) + " homes"]] : [
    ["Housing programme", value(m.planned_homes) + " homes"],
    ["Residential footprint", value(m.housing_area_m2) + " m²"],
    ["Ground-level green", value(m.ground_green_m2) + " m² (" + value(m.ground_green_percent) + "%)"],
    ["Green roofs", value(m.green_roof_m2) + " m²"],
    ["Planting positions", value(m.proposed_tree_positions)],
    ["Outdoor sports reserve", value(m.outdoor_sports_reserve_m2) + " m²"],
    ["Indoor sports", value(m.indoor_sports_m2) + " m²"],
    ["Public entrances", value(m.public_gateways)],
    ["Entrances reaching sports", m.sports_reachable_from_all_gateways ? "All three" : "Check required"],
    ["North entrance to sports", value(m.north_gate_to_sports_m) + " m"]
  ];
  $("metrics").innerHTML = "<strong>Final layout</strong><dl>" + fields.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("") + "</dl><p class=\"muted\">Housing capacity depends on floor-area assumptions. Public distances follow the proposed internal path graph; they do not confirm safe crossings outside the site. Indicators describe the final layout during playback.</p>";
}

async function select() {
  stop();
  const v = ++version, key = $("scenario").value;
  status("Loading scenario…");
  $("iteration").disabled = true;
  $("play").disabled = true;
  $("original").checked = false;
  $("original").disabled = key !== "supplied";
  if (original) original.show = false;
  if (treeLayer) treeLayer.show = false;
  if (roofLayer) roofLayer.show = false;
  try {
    const next = await layer(key);
    let nextTrees, nextRoofs;
    if (["access", "green"].includes(key)) [nextTrees, nextRoofs] = await Promise.all([layer(key + "_trees"), layer(key + "_green_roofs")]);
    if (v !== version) return;
    treeLayer = nextTrees;
    roofLayer = nextRoofs;
    if (active) active.show = false;
    active = next;
    active.show = true;
    const max = Math.max(0, ...active.entities.values.map((e) => Number(property(e, "birth_iteration")) || 0));
    $("iteration").max = max;
    $("iteration").value = max;
    $("evolution").hidden = !["access", "green"].includes(key);
    $("iteration").disabled = false;
    $("play").disabled = false;
    metrics(key);
    paint();
    status("Ready. Click a cell to inspect its data.");
  } catch (e) {
    console.error(e);
    if (v === version) status("Could not load the scenario. Check public/task47, then select it again.");
  }
}

async function tiles(checkbox, url, kind) {
  try {
    let obj = kind === "context" ? context : original;
    if (!obj && checkbox.checked) {
      obj = await Cesium3DTileset.fromUrl(url, { show: false });
      viewer.scene.primitives.add(obj);
      if (kind === "context") {
        context = obj;
        context.clippingPolygons = new ClippingPolygonCollection({
          polygons: siteRings.map((r) => new ClippingPolygon({ positions: r.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat)) })),
          enabled: ["access", "green"].includes($("scenario").value)
        });
      } else original = obj;
    }
    if (obj) obj.show = checkbox.checked && (kind !== "original" || $("scenario").value === "supplied");
    paint();
  } catch (e) {
    console.error(e);
    checkbox.checked = false;
    paint();
    status("3D reference could not load. Check the original model files.");
  }
}

async function start() {
  summary = await json("/task47/summary.json");
  const current = await layer("current");
  baseline = new Map(current.entities.values.map((e) => [property(e, "cell_id"), property(e, "land_use")]));
  const b = await layer("development_site");
  b.show = true;
  const coords = [];
  const geo = await json("/task47/development_site.geojson");
  function collect(v) {
    if (typeof v[0] === "number") coords.push(v);
    else v.forEach(collect);
  }
  geo.features.forEach((f) => {
    collect(f.geometry.coordinates);
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    polys.forEach((poly) => siteRings.push(poly[0].slice(0, -1)));
  });
  centre = Cartesian3.fromDegrees(coords.reduce((s, c) => s + c[0], 0) / coords.length, coords.reduce((s, c) => s + c[1], 0) / coords.length);
  for (const e of b.entities.values) {
    e.polygon.fill = false;
    e.polygon.outline = true;
    e.polygon.outlineColor = Color.fromCssColorString("#203b3e");
    e.polygon.height = .4;
  }
  gatewayLayer = await layer("public_gateways");
  for (const e of gatewayLayer.entities.values) {
    e.billboard = undefined;
    e.point = {
      pixelSize: 10,
      color: Color.fromCssColorString("#233f50"),
      outlineColor: Color.WHITE,
      outlineWidth: 2
    };
  }
  $("trees").onchange = paint;
  $("roofs").onchange = paint;
  $("legend").innerHTML = Object.entries(summary.labels).map(([k, v]) => `<i style="background:${summary.colors[k]}"></i><span>${v}</span>`).join("");
  $("scenario").disabled = false;
  $("scenario").addEventListener("change", select);
  $("iteration").addEventListener("input", () => {
    stop();
    paint();
  });
  $("plan").onclick = () => {
    tilted = false;
    paint();
    camera();
  };
  $("massing").onclick = () => {
    tilted = true;
    paint();
    camera();
  };
  $("reset").onclick = camera;
  $("context").onchange = () => tiles($("context"), "/data/buildings/rotterdam/tileset.json", "context");
  $("original").onchange = () => tiles($("original"), "/models/proposed-complex/tileset.json", "original");
  $("play").onclick = () => {
    if (timer) {
      stop();
      return;
    }
    if (Number($("iteration").value) >= Number($("iteration").max)) $("iteration").value = 0;
    $("play").textContent = "Pause";
    timer = setInterval(() => {
      $("iteration").value = Math.min(Number($("iteration").max), Number($("iteration").value) + 2);
      paint();
      if (Number($("iteration").value) >= Number($("iteration").max)) stop();
    }, 160);
  };
  await select();
  camera();
  addStudyAreaImagery(viewer).catch((e) => {
    console.error(e);
    status("Model ready. Aerial imagery unavailable; check the original aerial folder.");
  });
}
start().catch((e) => {
  console.error(e);
  status("Could not initialise. Check that the complete task47 output folder was copied.");
});
