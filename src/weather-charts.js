const NS = 'http://www.w3.org/2000/svg';
function node(name, attrs = {}, text) {
  const element = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
}
export function lineChart(container, {points, unit, color, title, timeFormat, monthly = false}) {
  const valid = points.filter(point => Number.isFinite(point.value));
  container.replaceChildren();
  if (!valid.length) {const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'No sufficiently complete data available'; container.append(p); return;}
  const width = 640, height = 206, left = 48, right = 16, top = 20, bottom = 38;
  const minTime = points[0].time, maxTime = points.at(-1).time;
  const values = valid.map(point => point.value);
  const low = Math.min(...values), high = Math.max(...values);
  const pad = Math.max((high - low) * 0.14, 0.5);
  const yMin = unit === 'm/s' ? Math.max(0, low - pad) : low - pad, yMax = high + pad;
  const x = time => left + (time - minTime) / (maxTime - minTime || 1) * (width - left - right);
  const y = value => top + (yMax - value) / (yMax - yMin || 1) * (height - top - bottom);
  const svg = node('svg', {viewBox:`0 0 ${width} ${height}`, role:'img', 'aria-label':title});
  svg.append(node('title', {}, title));
  for (let i = 0; i <= 3; i++) {
    const value = yMin + (yMax - yMin) * i / 3;
    svg.append(node('line', {x1:left, x2:width-right, y1:y(value), y2:y(value), class:'gridline'}));
    svg.append(node('text', {x:left-8, y:y(value)+4, 'text-anchor':'end'}, value.toFixed(1)));
  }
  const tickIndices = monthly ? [0,2,4,6,8,11] : [0,0.25,0.5,0.75,1].map(fraction => Math.round((points.length-1)*fraction));
  for (const i of new Set(tickIndices)) {
    const point = points[Math.min(i, points.length-1)];
    svg.append(node('text', {x:x(point.time), y:height-12, 'text-anchor': i===0 ? 'start' : i===points.length-1 ? 'end':'middle'}, timeFormat(point.time)));
  }
  let path = '', previous;
  for (const point of points) {
    if (!Number.isFinite(point.value)) {previous = undefined; continue;}
    const separated = !previous || (!monthly && point.time - previous.time > 15*60_000);
    path += `${separated ? 'M' : 'L'}${x(point.time).toFixed(2)},${y(point.value).toFixed(2)} `;
    previous = point;
  }
  svg.append(node('path', {d:path, fill:'none', stroke:color, 'stroke-width':2.5, 'stroke-linejoin':'round'}));
  for (const point of valid) {
    const circle = node('circle', {cx:x(point.time), cy:y(point.value), r:monthly?4:2.5, fill:color});
    circle.append(node('title', {}, `${point.label}: ${point.value.toFixed(2)} ${unit}`)); svg.append(circle);
  }
  container.append(svg);
}
