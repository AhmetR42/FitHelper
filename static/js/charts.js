// Small SVG charts drawn by hand: a bar chart and a line chart.
// They are drawn at the width of their container, so text keeps the same size.

let W = 600;
const H = 240;
const PAD = { top: 24, right: 16, bottom: 28, left: 44 };
const NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}, text) {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
}

// Round numbers for the axis: 0, 2500, 5000…
function niceMax(value) {
    if (value <= 0) return 1;
    const power = 10 ** Math.floor(Math.log10(value));
    const step = [1, 2, 2.5, 5, 10].find((s) => s * power >= value / 4) * power;
    return Math.ceil(value / step) * step;
}

function frame(container, label) {
    W = Math.max(320, Math.round(container.clientWidth) || 600);
    container.replaceChildren();
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label });
    container.append(svg);
    return svg;
}

function gridLines(svg, min, max, format) {
    const grid = el('g', { class: 'grid' });
    const axis = el('g', { class: 'axis' });
    for (let i = 0; i <= 4; i += 1) {
        const value = min + ((max - min) * i) / 4;
        const y = PAD.top + (H - PAD.top - PAD.bottom) * (1 - i / 4);
        grid.append(el('line', { x1: PAD.left, x2: W - PAD.right, y1: y, y2: y }));
        axis.append(el('text', { x: PAD.left - 8, y: y + 4, 'text-anchor': 'end' }, format(value)));
    }
    svg.append(grid, axis);
    return axis;
}

export function empty(container, message) {
    container.replaceChildren();
    const box = document.createElement('div');
    box.className = 'chart-empty';
    box.textContent = message;
    container.append(box);
}

// items: [{ label, value, current }]
export function barChart(container, items, { label, format = String, short = format, emptyText }) {
    if (!items.length || items.every((item) => !item.value)) return empty(container, emptyText);

    const svg = frame(container, label);
    const max = niceMax(Math.max(...items.map((item) => item.value)));
    const axis = gridLines(svg, 0, max, short);
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const slot = innerW / items.length;
    const barW = Math.min(44, slot * 0.62);

    items.forEach((item, index) => {
        const height = (item.value / max) * innerH;
        const x = PAD.left + slot * index + (slot - barW) / 2;
        const y = PAD.top + innerH - height;
        const bar = el('rect', { class: `bar${item.current ? ' is-current' : ''}`, x, y, width: barW, height: Math.max(height, 0) });
        bar.style.animationDelay = `${index * 50}ms`;
        bar.append(el('title', {}, `${item.label}: ${format(item.value)}`));
        svg.append(bar);
        if (item.current && item.value) {
            svg.append(el('text', { class: 'bar-value', x: x + barW / 2, y: y - 6, 'text-anchor': 'middle' }, short(item.value)));
        }
        axis.append(el('text', { x: x + barW / 2, y: H - 8, 'text-anchor': 'middle' }, item.label));
    });
}

// points: [{ label, value }] in time order
export function lineChart(container, points, { label, format = String, emptyText, minPoints = 2 }) {
    if (points.length < minPoints) return empty(container, emptyText);

    const svg = frame(container, label);
    const values = points.map((p) => p.value);
    const spread = Math.max(...values) - Math.min(...values) || 1;
    // Whole-number axis with four equal steps.
    const min = Math.floor(Math.min(...values) - spread * 0.2);
    const max = min + Math.ceil((Math.max(...values) + spread * 0.2 - min) / 4) * 4;
    const axis = gridLines(svg, min, max, (v) => format(Math.round(v)));
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const x = (i) => PAD.left + (points.length === 1 ? innerW / 2 : (innerW * i) / (points.length - 1));
    const y = (v) => PAD.top + innerH * (1 - (v - min) / (max - min));

    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
    const area = `${line} L${x(points.length - 1).toFixed(1)} ${PAD.top + innerH} L${x(0).toFixed(1)} ${PAD.top + innerH} Z`;
    svg.append(el('path', { class: 'area', d: area }));

    const path = el('path', { class: 'line is-animated', d: line });
    svg.append(path);
    const length = path.getTotalLength?.() || 2000;
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;

    // Show at most six dates on the x axis.
    const every = Math.ceil(points.length / 6);
    points.forEach((p, i) => {
        const isLast = i === points.length - 1;
        if (isLast || (i % every === 0 && points.length - 1 - i >= every / 2 + 0.5)) {
            axis.append(el('text', { x: x(i), y: H - 8, 'text-anchor': isLast ? 'end' : 'middle' }, p.label));
        }
    });

    const lastIndex = points.length - 1;
    const last = points[lastIndex];
    const dot = el('circle', { class: 'point is-last', cx: x(lastIndex), cy: y(last.value), r: 6 });
    dot.append(el('title', {}, `${last.label}: ${format(last.value)}`));
    svg.append(dot);
    svg.append(el('text', { class: 'last-label', x: x(lastIndex) - 10, y: y(last.value) - 12, 'text-anchor': 'end' }, format(last.value)));
}
