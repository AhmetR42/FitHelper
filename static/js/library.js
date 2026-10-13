// The exercise library page, the exercise details dialog and the exercise of the day.

import { drawDemo } from './demos.js';
import { calm } from './settings.js';

const $ = (selector) => document.querySelector(selector);
export const MUSCLES = ['chest', 'back', 'shoulders', 'arms', 'legs', 'glutes', 'core', 'cardio'];
const EQUIPMENT = ['barbell', 'dumbbell', 'kettlebell', 'machine', 'cable', 'bodyweight'];
const LEVELS = ['beginner', 'intermediate', 'advanced'];

export const tone = (muscle) => `var(--m-${MUSCLES.includes(muscle) ? muscle : 'other'})`;

const heartIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>';
const playIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const pauseIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
const closeIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const videoIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="4"/><path d="m10.5 9.5 4 2.5-4 2.5z"/></svg>';
const plusIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

const filters = { q: '', muscle: '', equipment: '', level: '', favorites: false };
let ctx;
let cards = new Map();
let stage = null;
let current = null;

export const library = { list: [], byName: new Map() };

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
const levelDots = (level) => `<span class="level-dots" aria-hidden="true">${LEVELS.map((l, i) => `<i class="${i <= LEVELS.indexOf(level) ? 'on' : ''}"></i>`).join('')}</span>`;
const subName = (exercise) => (ctx.locale() === 'nl' && exercise.name_nl !== exercise.name ? exercise.name_nl : '');

export async function loadLibrary() {
    library.list = await ctx.api('/exercises');
    library.byName = new Map(library.list.map((exercise) => [exercise.name.toLowerCase(), exercise]));
}

export const findExercise = (name) => library.byName.get(String(name).trim().toLowerCase());

function matches(exercise) {
    const q = filters.q.trim().toLowerCase();
    if (q && !exercise.name.toLowerCase().includes(q) && !exercise.name_nl.toLowerCase().includes(q)) return false;
    if (filters.muscle && exercise.muscle !== filters.muscle && !exercise.secondary.includes(filters.muscle)) return false;
    if (filters.equipment && exercise.equipment !== filters.equipment) return false;
    if (filters.level && exercise.level !== filters.level) return false;
    return !filters.favorites || exercise.favorite;
}

function renderFilters() {
    const { tr } = ctx;
    $('#muscle-chips').innerHTML = [['', tr('library.all')], ...MUSCLES.map((m) => [m, tr(`muscles.${m}`)])]
        .map(([value, label]) => `<button type="button" class="chip" data-muscle="${value}" aria-pressed="${filters.muscle === value}" style="--tone:${value ? tone(value) : 'var(--accent)'}">${value ? '<span class="dot" aria-hidden="true"></span>' : ''}${label}</button>`)
        .join('');
    $('#library-equipment').innerHTML = `<option value="">${tr('library.anyEquipment')}</option>`
        + EQUIPMENT.map((e) => `<option value="${e}">${tr(`equipment.${e}`)}</option>`).join('');
    $('#library-equipment').value = filters.equipment;
    $('#library-level').innerHTML = `<option value="">${tr('library.anyLevel')}</option>`
        + LEVELS.map((l) => `<option value="${l}">${tr(`level.${l}`)}</option>`).join('');
    $('#library-level').value = filters.level;
    $('#library-favorites').setAttribute('aria-pressed', String(filters.favorites));
}

function card(exercise, index) {
    const { tr } = ctx;
    const sub = subName(exercise);
    return `<article class="ex-card" style="--tone:${tone(exercise.muscle)};animation-delay:${Math.min(index, 12) * 35}ms" data-slug="${exercise.slug}">
        <button type="button" class="ex-open" data-open="${exercise.slug}" aria-label="${escapeHtml(exercise.name)}: ${tr('library.steps')}"></button>
        <div class="ex-figure" data-figure="${exercise.slug}"></div>
        ${exercise.times_logged ? `<span class="logged-badge">${tr('library.logged', { count: exercise.times_logged })}</span>` : ''}
        <button type="button" class="heart" data-favorite="${exercise.slug}" aria-pressed="${exercise.favorite}" aria-label="${tr(exercise.favorite ? 'library.unfavorite' : 'library.favorite')}: ${escapeHtml(exercise.name)}">${heartIcon}</button>
        <h3>${escapeHtml(exercise.name)}</h3>
        ${sub ? `<span class="ex-sub">${escapeHtml(sub)}</span>` : ''}
        <div class="ex-tags">
            <span class="tag tag-muscle">${tr(`muscles.${exercise.muscle}`)}</span>
            <span class="tag">${tr(`equipment.${exercise.equipment}`)}</span>
            <span class="tag" title="${tr(`level.${exercise.level}`)}">${levelDots(exercise.level)}<span class="visually-hidden">${tr(`level.${exercise.level}`)}</span></span>
        </div>
    </article>`;
}

export function renderLibrary() {
    if (!ctx) return;
    const { tr } = ctx;
    renderFilters();
    cards.forEach((controller) => controller.pause());
    cards = new Map();

    const list = library.list.filter(matches);
    $('#library-count').textContent = list.length === 1 ? tr('library.countOne') : tr('library.count', { count: list.length });
    const grid = $('#exercise-grid');
    if (!list.length) {
        grid.innerHTML = `<div class="list-empty">${tr('library.empty')}<br><button type="button" class="button" id="library-reset" style="margin-top:12px">${tr('library.reset')}</button></div>`;
        return;
    }
    grid.innerHTML = list.map(card).join('');
    for (const exercise of list) {
        const box = grid.querySelector(`[data-figure="${exercise.slug}"]`);
        cards.set(exercise.slug, drawDemo(box, exercise.demo, { equipment: exercise.equipment, animate: false, label: exercise.name }));
    }
}

/* ---------- Dialog ---------- */

function setSpeed(speed) {
    stage?.setSpeed(speed);
    document.querySelectorAll('#exercise-detail [data-speed]').forEach((button) => {
        button.setAttribute('aria-pressed', String(Number(button.dataset.speed) === speed));
    });
}

function renderDetail(exercise) {
    const { tr, locale } = ctx;
    const lang = locale();
    const sub = subName(exercise);
    const best = exercise.best_e1rm ? `${new Intl.NumberFormat(lang === 'nl' ? 'nl-NL' : 'en-GB', { maximumFractionDigits: 1 }).format(exercise.best_e1rm)} kg` : '–';
    const detail = $('#exercise-detail');
    detail.style.setProperty('--tone', tone(exercise.muscle));
    detail.innerHTML = `
        <button type="button" class="icon-button sheet-close" data-close aria-label="${tr('library.close')}">${closeIcon}</button>
        <div class="sheet-stage">
            <div class="stage-figure" id="stage-figure"></div>
            <div class="stage-controls">
                <button type="button" class="button" id="stage-play">${pauseIcon}<span>${tr('library.pause')}</span></button>
                <div class="speed" role="group" aria-label="${tr('library.speed')}">
                    ${[0.5, 1, 1.5].map((s) => `<button type="button" data-speed="${s}" aria-pressed="${s === 1}">${s}×</button>`).join('')}
                </div>
            </div>
        </div>
        <div class="sheet-info">
            <div>
                <h2 id="dialog-title">${escapeHtml(exercise.name)}</h2>
                ${sub ? `<p class="muted">${escapeHtml(sub)}</p>` : ''}
            </div>
            <div class="ex-tags">
                <span class="tag tag-muscle">${tr(`muscles.${exercise.muscle}`)}</span>
                <span class="tag">${tr(`equipment.${exercise.equipment}`)}</span>
                <span class="tag">${levelDots(exercise.level)} ${tr(`level.${exercise.level}`)}</span>
                ${exercise.secondary.length ? `<span class="tag">${tr('library.also')}: ${exercise.secondary.map((m) => tr(`muscles.${m}`).toLowerCase()).join(', ')}</span>` : ''}
            </div>
            <div>
                <h3>${tr('library.steps')}</h3>
                <ol class="steps">${exercise.steps[lang].map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
            </div>
            <p class="tip"><span aria-hidden="true">💡</span><span><strong>${tr('library.tip')}:</strong> ${escapeHtml(exercise.tip[lang])}</span></p>
            <dl class="stats-row">
                <div><dt>${tr('library.times')}</dt><dd>${exercise.times_logged || tr('library.never')}</dd></div>
                <div><dt>${tr('library.best')}</dt><dd>${best}</dd></div>
            </dl>
            <div class="actions">
                <button type="button" class="button button-primary" data-log="${exercise.slug}">${plusIcon}${tr('library.log')}</button>
                <a class="button" href="${exercise.video_url}" target="_blank" rel="noopener">${videoIcon}${tr('library.video')}</a>
                <button type="button" class="heart" style="position:static" data-favorite="${exercise.slug}" aria-pressed="${exercise.favorite}" aria-label="${tr(exercise.favorite ? 'library.unfavorite' : 'library.favorite')}">${heartIcon}</button>
            </div>
        </div>`;
    stage = drawDemo($('#stage-figure'), exercise.demo, { equipment: exercise.equipment, animate: !calm(), label: exercise.name });
    updatePlayButton();
}

function updatePlayButton() {
    const button = $('#stage-play');
    if (!button) return;
    button.innerHTML = `${stage.playing ? pauseIcon : playIcon}<span>${ctx.tr(stage.playing ? 'library.pause' : 'library.play')}</span>`;
}

export function openExercise(slug) {
    const exercise = library.list.find((e) => e.slug === slug);
    if (!exercise) return;
    current = slug;
    renderDetail(exercise);
    const dialog = $('#exercise-dialog');
    if (!dialog.open) dialog.showModal();
}

function closeDialog() {
    stage?.pause();
    stage = null;
    current = null;
    $('#exercise-dialog').close();
}

async function toggleFavorite(slug, button) {
    const exercise = library.list.find((e) => e.slug === slug);
    try {
        const updated = await ctx.api(`/exercises/${slug}/favorite`, { method: 'PUT', body: { favorite: !exercise.favorite } });
        Object.assign(exercise, updated);
        button.setAttribute('aria-pressed', String(updated.favorite));
        button.classList.remove('is-popping');
        void button.offsetWidth;
        button.classList.add('is-popping');
        if (filters.favorites) renderLibrary();
        else document.querySelectorAll(`[data-favorite="${slug}"]`).forEach((b) => b.setAttribute('aria-pressed', String(updated.favorite)));
    } catch (error) {
        ctx.showError(error);
    }
}

/* ---------- Exercise of the day ---------- */

let daily = null;

export function renderDaily(container, dateIso) {
    if (!library.list.length) return;
    const { tr } = ctx;
    // The same exercise all day, a different one tomorrow.
    const seed = [...dateIso].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7);
    const exercise = library.list[Math.abs(seed) % library.list.length];
    daily?.pause();
    container.style.setProperty('--tone', tone(exercise.muscle));
    container.innerHTML = `
        <header class="panel-head"><h2>${tr('daily.title')}</h2></header>
        <div class="daily-figure" id="daily-figure"></div>
        <h3>${escapeHtml(exercise.name)}</h3>
        <div class="ex-tags"><span class="tag tag-muscle">${tr(`muscles.${exercise.muscle}`)}</span><span class="tag">${tr(`equipment.${exercise.equipment}`)}</span></div>
        <button type="button" class="button button-primary" data-open="${exercise.slug}">${tr('daily.open')}</button>`;
    daily = drawDemo($('#daily-figure'), exercise.demo, { equipment: exercise.equipment, animate: !calm(), label: exercise.name });
}

export function miniFigure(container, exercise) {
    return drawDemo(container, exercise.demo, { equipment: exercise.equipment, animate: !calm(), label: exercise.name });
}

/* ---------- Events ---------- */

export function initLibrary(context) {
    ctx = context;

    $('#library-search').addEventListener('input', (event) => {
        filters.q = event.target.value;
        renderLibrary();
    });
    $('#muscle-chips').addEventListener('click', (event) => {
        const chip = event.target.closest('[data-muscle]');
        if (!chip) return;
        filters.muscle = chip.dataset.muscle;
        renderLibrary();
    });
    $('#library-equipment').addEventListener('change', (event) => {
        filters.equipment = event.target.value;
        renderLibrary();
    });
    $('#library-level').addEventListener('change', (event) => {
        filters.level = event.target.value;
        renderLibrary();
    });
    $('#library-favorites').addEventListener('click', () => {
        filters.favorites = !filters.favorites;
        renderLibrary();
    });

    const grid = $('#exercise-grid');
    // Cards stand still until you point at them, so fifty figures do not move at once.
    grid.addEventListener('pointerover', (event) => {
        const slug = event.target.closest('.ex-card')?.dataset.slug;
        if (slug && !calm()) cards.get(slug)?.play();
    });
    grid.addEventListener('pointerout', (event) => {
        const cardEl = event.target.closest('.ex-card');
        if (cardEl && !cardEl.contains(event.relatedTarget)) cards.get(cardEl.dataset.slug)?.still();
    });
    grid.addEventListener('focusin', (event) => {
        const slug = event.target.closest('.ex-card')?.dataset.slug;
        if (slug && !calm()) cards.get(slug)?.play();
    });
    grid.addEventListener('focusout', (event) => {
        const slug = event.target.closest('.ex-card')?.dataset.slug;
        if (slug) cards.get(slug)?.still();
    });

    document.addEventListener('click', (event) => {
        const open = event.target.closest('[data-open]');
        const favorite = event.target.closest('[data-favorite]');
        if (favorite) {
            toggleFavorite(favorite.dataset.favorite, favorite);
        } else if (open) {
            openExercise(open.dataset.open);
        } else if (event.target.closest('#library-reset')) {
            Object.assign(filters, { q: '', muscle: '', equipment: '', level: '', favorites: false });
            $('#library-search').value = '';
            renderLibrary();
        }
    });

    const dialog = $('#exercise-dialog');
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog || event.target.closest('[data-close]')) closeDialog();
        const speed = event.target.closest('[data-speed]');
        if (speed) setSpeed(Number(speed.dataset.speed));
        if (event.target.closest('#stage-play')) {
            if (stage.playing) stage.pause();
            else stage.play();
            updatePlayButton();
        }
        const log = event.target.closest('[data-log]');
        if (log) {
            const exercise = library.list.find((e) => e.slug === log.dataset.log);
            closeDialog();
            ctx.onLog(exercise);
        }
    });
    dialog.addEventListener('close', () => {
        stage?.pause();
        stage = null;
        current = null;
    });
}

// Re-render an open dialog after the language changes.
export function refreshDialog() {
    if (current) renderDetail(library.list.find((e) => e.slug === current));
}
