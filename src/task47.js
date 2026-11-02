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
  Resource,
  Credit,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { renderNavigation, setStudyAreaFocus } from "./ui/navigation.js";
import { focusOnStudyArea, readStudyArea, createStudyAreaClip } from './map/study-area.js';
import { addStudyAreaImagery } from './map/imagery.js';
import { studyBuildingsUrl, studyBuildingsCredit } from './map/buildings.js';
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
let summary, baseline, active, centre, studyArea, boundaryLayer;
let context, contextRequest, contextClipMode, treeLayer, roofLayer, gatewayLayer;
let tilted = false, version = 0, timer;
const siteRings = [];
const cellVisuals = new WeakMap(), roofVisuals = new WeakMap(), treeVisuals = new WeakMap();

function isGeneratedScenario(key = $("scenario").value) {
  return key === "access" || key === "green";
}

function updateContext() {
  if (!context) return;
  const key = $("scenario").value;
  const hideDevelopmentSite = isGeneratedScenario(key);
  if (contextClipMode !== hideDevelopmentSite) {
    context.clippingPolygons = createStudyAreaClip(studyArea, hideDevelopmentSite ? siteRings : []);
    contextClipMode = hideDevelopmentSite;
  }
  context.show = $("context").checked && key !== "satellite";
  viewer.scene.requestRender();
}

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error(`${url}: ${response.status}`);
  return response.json();
}

function status(message = "") {
  $("status").textContent = message;
  $("status").hidden = !message;
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
    const data = await GeoJsonDataSource.load("/task47/" + name + ".geojson");
    data.show = false;
    await viewer.dataSources.add(data);
    return data;
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
  const key = $("scenario").value, round = Number($("iteration").value), isRun = isGeneratedScenario(key);
  $("round").textContent = `${round} / ${$("iteration").max}`;
  for (const e of active.entities.values) {
    if (!e.polygon) continue;
    const id = property(e, "cell_id"), birth = property(e, "birth_iteration");
    let code = property(e, "land_use");
    if (isRun && birth > round) code = baseline.get(id);
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
    roofLayer.show = isRun && tilted;
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
  viewer.scene.requestRender();
}

function metrics(key) {
  const m = summary.metrics.find((x) => x.scenario === ({ supplied: "supplied_proposal" }[key] || key));
  if (!m) {
    $("metrics").textContent = "Existing use. No new programme applied.";
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
  $("metrics").innerHTML = "<dl>" + fields.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("") + "</dl>";
}

async function select() {
  stop();
  const selectionVersion = ++version;
  const key = $("scenario").value;
  const satelliteOnly = key === "satellite";
  const isRun = isGeneratedScenario(key);
  viewer.selectedEntity = undefined;
  for (const data of [active, treeLayer, roofLayer, gatewayLayer, boundaryLayer]) {
    if (data) data.show = false;
  }
  active = treeLayer = roofLayer = undefined;
  $("context").disabled = satelliteOnly;
  $("trees").disabled = !isRun;
  $("legendPanel").hidden = satelliteOnly;
  $("finalLayout").hidden = satelliteOnly;
  $("evolution").hidden = true;
  $("iteration").disabled = true;
  $("play").disabled = true;
  updateContext();
  viewer.scene.requestRender();
  if (satelliteOnly) {
    status("Satellite view.");
    return;
  }
  status("Loading scenario…");
  try {
    const next = await layer(key);
    let nextTrees, nextRoofs;
    if (isRun) {
      [nextTrees, nextRoofs] = await Promise.all([layer(key + "_trees"), layer(key + "_green_roofs")]);
    }
    if (selectionVersion !== version) return;
    treeLayer = nextTrees;
    roofLayer = nextRoofs;
    active = next;
    active.show = true;
    boundaryLayer.show = true;
    const max = Math.max(0, ...active.entities.values.map(entity => Number(property(entity, "birth_iteration")) || 0));
    $("iteration").max = max;
    $("iteration").value = max;
    $("evolution").hidden = !isRun;
    $("iteration").disabled = !isRun;
    $("play").disabled = !isRun;
    metrics(key);
    paint();
    status();
  } catch (error) {
    console.error(error);
    if (selectionVersion === version) status("Could not load the scenario. Please select it again.");
  }
}

async function showContextBuildings() {
  try {
    if (!context && $("context").checked) {
      if (!contextRequest) contextRequest = (async () => {
        const resource = new Resource({ url: studyBuildingsUrl, credits: [new Credit(studyBuildingsCredit, true)] });
        const buildings = await Cesium3DTileset.fromUrl(resource, { show: false, showCreditsOnScreen: true });
        viewer.scene.primitives.add(buildings);
        context = buildings;
        buildings.tileFailed.addEventListener(() => status("Some background buildings could not load. Please refresh the page."));
      })();
      await contextRequest;
    }
    updateContext();
  } catch (error) {
    console.error(error);
    contextRequest = undefined;
    $("context").checked = false;
    status("Background buildings could not load. Please try again.");
  }
}

async function start() {
  summary = await json("/task47/summary.json");
  studyArea = (await readStudyArea()).geojson;
  const current = await layer("current");
  baseline = new Map(current.entities.values.map((e) => [property(e, "cell_id"), property(e, "land_use")]));
  boundaryLayer = await layer("development_site");
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
  for (const e of boundaryLayer.entities.values) {
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
  $("context").onchange = showContextBuildings;
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
    status("The satellite background could not load. Please refresh the page.");
  });
}
start().catch((e) => {
  console.error(e);
  status("Could not initialise. Check that the complete task47 output folder was copied.");
});
