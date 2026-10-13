import { barChart, lineChart } from './charts.js';
import { confetti } from './confetti.js';
import { drawDemo } from './demos.js';
import { LOCALES, t } from './i18n.js';
import {
    findExercise, initLibrary, library, loadLibrary, miniFigure, refreshDialog, renderDaily, renderLibrary, tone,
} from './library.js';
import { applySettings, calm, saveSettings, settings } from './settings.js';
import { initTimer, refreshTimer, startTimer } from './timer.js';

const LOCALE_KEY = 'fithelper:locale';
const VIEWS = ['overview', 'exercises', 'workouts', 'weight', 'profile'];

const $ = (selector) => document.querySelector(selector);
const state = { profile: null, summary: null, workouts: [], weights: [], exercises: [], editingId: null, filter: '', daysShown: 6 };
let locale = loadLocale();

const tr = (key, params) => t(key, locale, params);

function loadLocale() {
    try {
        const saved = localStorage.getItem(LOCALE_KEY);
        if (LOCALES.includes(saved)) return saved;
    } catch {
        // ignore
    }
    return navigator.language?.toLowerCase().startsWith('nl') ? 'nl' : 'en';
}

/* ---------- API ---------- */

class ApiError extends Error {
    constructor(status, detail) {
        super(`HTTP ${status}`);
        this.status = status;
        this.detail = detail;
    }
}

async function api(path, { method = 'GET', body } = {}) {
    let response;
    try {
        response = await fetch(`/api${path}`, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : {},
            body: body ? JSON.stringify(body) : undefined,
        });
    } catch {
        throw new ApiError(0, null);
    }
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(response.status, data?.detail);
    return data;
}

async function loadAll() {
    const [profile, summary, workouts, weights, exercises] = await Promise.all([
        api('/profile').catch((error) => (error.status === 404 ? null : Promise.reject(error))),
        api('/stats/summary'),
        api('/workouts?limit=500'),
        api('/weights'),
        api('/workouts/exercises'),
        loadLibrary(),
    ]);
    Object.assign(state, { profile, summary, workouts, weights, exercises });
}

/* ---------- Formatting ---------- */

const intlLocale = () => (locale === 'nl' ? 'nl-NL' : 'en-GB');
const number = (value, digits = 0) => new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: digits }).format(value);
const compact = (value) => new Intl.NumberFormat(intlLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const parseDate = (iso) => new Date(`${iso}T00:00:00`);
const shortDate = (iso) => new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'short' }).format(parseDate(iso));
const longDate = (iso) => new Intl.DateTimeFormat(intlLocale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(parseDate(iso));
const todayIso = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/* ---------- Feedback ---------- */

let toastTimer;
function toast(message, { action, actionLabel, error = false } = {}) {
    const box = $('#toast');
    const button = $('#toast-action');
    $('#toast-text').textContent = message;
    box.classList.toggle('is-error', error);
    button.hidden = !action;
    button.textContent = actionLabel ?? '';
    button.onclick = async () => {
        box.hidden = true;
        await action();
    };
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, 6000);
}

function showError(error) {
    toast(tr(error?.status === 0 ? 'errors.offline' : 'errors.generic'), { error: true });
}

// Mark the inputs FastAPI rejected (422) so the user sees what to fix.
function markInvalid(form, error) {
    form.querySelectorAll('[aria-invalid]').forEach((input) => input.removeAttribute('aria-invalid'));
    if (error?.status !== 422 || !Array.isArray(error.detail)) return false;
    for (const issue of error.detail) {
        const input = form.elements[issue.loc.at(-1)];
        (input?.length ? input[0] : input)?.setAttribute('aria-invalid', 'true');
    }
    form.querySelector('[aria-invalid="true"]')?.focus();
    toast(tr('errors.check'), { error: true });
    return true;
}

function formData(form) {
    const data = Object.fromEntries(new FormData(form));
    for (const input of form.querySelectorAll('input[type=number]')) {
        if (input.name in data) data[input.name] = data[input.name] === '' ? null : Number(data[input.name]);
    }
    return data;
}

/* ---------- Rendering ---------- */

// `value` is a number (it counts up) or a short text such as "No weigh-in yet".
const ICONS = {
    workouts: '<path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/>',
    volume: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    streak: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
    weight: '<path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 9a6 6 0 0 1 8 0l-3 3"/>',
    bmi: '<circle cx="12" cy="12" r="8"/><path d="M12 12l4-3"/>',
    calories: '<path d="M7 3v8a3 3 0 0 0 6 0V3M10 3v18M17 3c-2 2-2 6 0 8v10"/>',
};

function tile({ label, value, decimals = 0, unit, note, noteClass = '', variant = '', icon, toneVar = 'var(--accent)' }) {
    const isNumber = typeof value === 'number';
    const count = isNumber ? ` data-count="${value}" data-decimals="${decimals}"` : '';
    return `<div class="tile ${variant}" style="--tone:${toneVar}">
        <span class="tile-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONS[icon]}</svg></span>
        <span class="tile-label">${label}</span>
        <span class="tile-value"${count}>${isNumber ? number(value, decimals) : value}${unit ? `<small>${unit}</small>` : ''}</span>
        ${note ? `<span class="tile-note ${noteClass}">${note}</span>` : ''}
    </div>`;
}

function renderTiles() {
    const { summary, profile } = state;
    const body = summary.body;
    const change = body.weight_change_30d;
    const changeText = change === null ? '' : tr('tiles.change', { change: `${change > 0 ? '+' : ''}${number(change, 1)}` });

    $('#tiles').innerHTML = [
        tile({ icon: 'workouts', label: tr('tiles.workouts'), value: summary.workouts_this_week, note: tr('tiles.days', { count: summary.total_workouts }) }),
        tile({ icon: 'volume', toneVar: 'var(--m-back)', label: tr('tiles.volume'), value: summary.volume_this_week, unit: 'kg' }),
        tile({ icon: 'streak', toneVar: 'var(--m-cardio)', label: tr('tiles.streak'), value: summary.streak_weeks, note: tr('tiles.weeks') }),
        body.weight_kg === null
            ? tile({ icon: 'weight', toneVar: 'var(--m-legs)', label: tr('tiles.weight'), value: tr('tiles.noWeight'), variant: 'tile-muted' })
            : tile({ icon: 'weight', toneVar: 'var(--m-legs)', label: tr('tiles.weight'), value: body.weight_kg, decimals: 1, unit: 'kg', note: changeText, noteClass: change < 0 && profile?.goal === 'lose' ? 'is-good' : '' }),
        body.bmi === null
            ? tile({ icon: 'bmi', toneVar: 'var(--m-shoulders)', label: tr('tiles.bmi'), value: tr('tiles.needProfile'), variant: 'tile-muted' })
            : tile({ icon: 'bmi', toneVar: 'var(--m-shoulders)', label: tr('tiles.bmi'), value: body.bmi, decimals: 1, note: tr(`bmi.${body.bmi_category}`) }),
        body.calorie_target === null
            ? tile({ icon: 'calories', toneVar: 'var(--m-chest)', label: tr('tiles.calories'), value: tr('tiles.needProfile'), variant: 'tile-muted' })
            : tile({ icon: 'calories', toneVar: 'var(--m-chest)', label: tr('tiles.calories'), value: body.calorie_target, note: tr('tiles.perDay') }),
    ].join('');
    countUp();
}

// Numbers in the tiles count up from zero when the page opens.
function countUp() {
    if (calm()) return;
    document.querySelectorAll('.tile-value[data-count]').forEach((el) => {
        const textNode = el.firstChild;
        const value = Number(el.dataset.count);
        const decimals = Number(el.dataset.decimals);
        if (!value) return;
        const start = performance.now();
        const step = (now) => {
            const progress = Math.min((now - start) / 900, 1);
            textNode.textContent = number(value * (1 - (1 - progress) ** 3), decimals);
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    });
}

function renderOverview() {
    const { summary, profile } = state;
    $('#today-label').textContent = longDate(todayIso());
    $('#greeting').textContent = profile ? tr('helloName') : tr('hello');
    $('#hero-name').textContent = profile ? `${profile.name}.` : '.';
    const welcome = !(profile || state.workouts.length);
    $('#welcome').hidden = !welcome;
    if (welcome && !$('#welcome-figure').firstChild) drawDemo($('#welcome-figure'), 'jumping_jack', { animate: !calm() });

    renderGoal();
    renderTiles();
    renderDaily($('#daily'), todayIso());
    renderBalance();

    const weeks = summary.weekly_volume;
    barChart($('#volume-chart'), weeks.map((week, index) => ({
        label: shortDate(week.week),
        value: week.volume,
        current: index === weeks.length - 1,
    })), { label: tr('charts.volume'), format: (v) => `${number(v)} kg`, short: compact, emptyText: tr('charts.empty') });

    renderWeightChart($('#weight-chart'), summary.weight_history.slice(-30));

    const records = summary.personal_records;
    $('#records').innerHTML = records.length
        ? records.map((r) => `<li>
            <div><strong>${escapeHtml(r.exercise)}</strong>
            <span>${tr('records.detail', { weight: number(r.weight_kg, 2), reps: r.reps, date: shortDate(r.date) })}</span></div>
            <span class="record-value">${number(r.e1rm, 1)}<small>kg</small></span>
        </li>`).join('')
        : `<p class="list-empty">${tr('records.empty')}</p>`;

    const select = $('#progress-exercise');
    const chosen = select.value || records[0]?.exercise || state.exercises[0] || '';
    select.innerHTML = state.exercises.map((name) => `<option>${escapeHtml(name)}</option>`).join('');
    select.value = chosen;
    select.hidden = !state.exercises.length;
    renderProgress();
}

const RING = 2 * Math.PI * 26;

function renderGoal() {
    const done = state.summary.workouts_this_week;
    const goal = settings.weeklyGoal;
    const reached = done >= goal;
    const card = $('#goal-card');
    card.classList.toggle('is-done', reached);
    card.innerHTML = `<svg class="goal-ring" viewBox="0 0 64 64" aria-hidden="true">
            <circle class="ring-bg" cx="32" cy="32" r="26"/>
            <circle class="ring-fg" cx="32" cy="32" r="26" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"/>
        </svg>
        <div><strong>${reached ? tr('weekly.reached') : tr('weekly.title')}</strong>
        <span>${tr('weekly.progress', { done, goal })}${reached ? '' : ` · ${tr('weekly.left', { count: goal - done })}`}</span></div>`;
    const ring = card.querySelector('.ring-fg');
    requestAnimationFrame(() => requestAnimationFrame(() => {
        ring.style.strokeDashoffset = String(RING * (1 - Math.min(done / goal, 1)));
    }));
}

function renderBalance() {
    const muscles = Object.entries(state.summary.muscles_this_week);
    if (!muscles.length) {
        $('#balance').innerHTML = `<p class="list-empty">${tr('balance.empty')}</p>`;
        return;
    }
    const most = Math.max(...muscles.map(([, sets]) => sets));
    $('#balance').innerHTML = `<ul class="balance">${muscles.map(([muscle, sets], i) => `<li style="--tone:${tone(muscle)}">
        <span><span class="dot" aria-hidden="true"></span>${tr(`muscles.${muscle}`)}</span>
        <span class="balance-bar"><span style="width:${(sets / most) * 100}%;animation-delay:${i * 70}ms"></span></span>
        <small>${tr('balance.sets', { count: sets })}</small>
    </li>`).join('')}</ul>`;
}

function renderWeightChart(container, history) {
    lineChart(container, history.map((entry) => ({ label: shortDate(entry.date), value: entry.weight_kg })), {
        label: tr('charts.weight'),
        format: (v) => `${number(v, 1)}`,
        emptyText: tr('charts.empty'),
    });
}

async function renderProgress() {
    const name = $('#progress-exercise').value;
    const container = $('#progress-chart');
    if (!name) {
        lineChart(container, [], { emptyText: tr('progress.empty') });
        return;
    }
    try {
        const history = await api(`/stats/exercise/${encodeURIComponent(name)}`);
        lineChart(container, history.map((p) => ({ label: shortDate(p.date), value: p.e1rm })), {
            label: `${tr('progress.title')}: ${name}`,
            format: (v) => `${number(v, 1)}`,
            emptyText: tr('progress.empty'),
        });
    } catch (error) {
        showError(error);
    }
}

const editIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>';
const deleteIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>';

function renderWorkouts() {
    const filter = $('#workout-filter');
    filter.innerHTML = `<option value="">${tr('workouts.all')}</option>`
        + state.exercises.map((name) => `<option>${escapeHtml(name)}</option>`).join('');
    filter.value = state.exercises.includes(state.filter) ? state.filter : '';

    const names = [...new Set([...state.exercises, ...library.list.map((e) => e.name)])].sort((a, b) => a.localeCompare(b));
    $('#exercise-list').innerHTML = names.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('');

    const list = state.workouts.filter((w) => !state.filter || w.exercise === state.filter);
    if (!list.length) {
        $('#workout-list').innerHTML = `<p class="list-empty">${tr('workouts.empty')}</p>`;
        return;
    }

    const days = [...Map.groupBy(list, (w) => w.date)];
    const shown = days.slice(0, state.daysShown);
    const more = days.length > shown.length
        ? `<button type="button" class="button show-more" id="show-more">${tr('workouts.more', { count: days.length - shown.length })}</button>`
        : '';
    $('#workout-list').innerHTML = shown.map(([day, sets]) => `<section class="day">
        <h3>${longDate(day)}</h3>
        ${sets.map((w) => `<div class="set">
            <span class="set-badge" style="--tone:${tone(findExercise(w.exercise)?.muscle)}" aria-hidden="true"></span>
            <div>
                <strong>${escapeHtml(w.exercise)}</strong>
                <span class="meta">${tr('workouts.setsReps', { sets: w.sets, reps: w.reps, weight: number(w.weight_kg, 2) })} · 1RM ${number(w.e1rm, 1)}</span>
                ${w.notes ? `<span class="notes">${escapeHtml(w.notes)}</span>` : ''}
            </div>
            <span class="volume">${number(w.volume)} kg</span>
            <div class="row-actions">
                <button type="button" class="icon-button" data-edit="${w.id}" title="${tr('edit')}" aria-label="${tr('edit')}: ${escapeHtml(w.exercise)}">${editIcon}</button>
                <button type="button" class="icon-button is-danger" data-delete="${w.id}" title="${tr('delete')}" aria-label="${tr('delete')}: ${escapeHtml(w.exercise)}">${deleteIcon}</button>
            </div>
        </div>`).join('')}
    </section>`).join('') + more;
}

function renderWeight() {
    const history = [...state.weights].reverse();
    renderWeightChart($('#weight-chart-large'), history.slice(-60).map((e) => ({ date: e.date, weight_kg: e.weight_kg })));
    $('#weight-list').innerHTML = state.weights.length
        ? state.weights.map((entry, index) => {
            const previous = state.weights[index + 1];
            const diff = previous ? entry.weight_kg - previous.weight_kg : null;
            const diffText = diff === null ? '' : `${diff > 0 ? '+' : ''}${number(diff, 1)}`;
            return `<li>
                <span>${longDate(entry.date)}</span>
                <strong>${number(entry.weight_kg, 1)} kg</strong>
                <span class="diff${diff < 0 ? ' is-down' : ''}">${diffText}</span>
                <button type="button" class="icon-button is-danger" data-delete-weight="${entry.id}" aria-label="${tr('delete')}: ${longDate(entry.date)}" title="${tr('delete')}">${deleteIcon}</button>
            </li>`;
        }).join('')
        : `<li class="list-empty">${tr('weight.empty')}</li>`;
}

function renderProfile() {
    const form = $('#profile-form');
    const { profile } = state;
    if (profile && !form.dataset.filled) {
        form.elements.name.value = profile.name;
        form.elements.age.value = profile.age;
        form.elements.height_cm.value = profile.height_cm;
        form.elements.activity.value = profile.activity;
        form.querySelector(`[name=sex][value=${profile.sex}]`).checked = true;
        form.querySelector(`[name=goal][value=${profile.goal}]`).checked = true;
        form.dataset.filled = 'true';
    }

    const body = state.summary.body;
    $('#energy').innerHTML = body.calorie_target === null
        ? `<h2>${tr('energy.title')}</h2><p>${tr('energy.missing')}</p>`
        : `<h2>${tr('energy.title')}</h2>
        <dl>
            <div><dt>${tr('energy.bmr')}</dt><dd>${number(body.bmr)}<small>kcal</small></dd></div>
            <div><dt>${tr('energy.tdee')}</dt><dd>${number(body.daily_calories)}<small>kcal</small></dd></div>
            <div class="is-target"><dt>${tr('energy.target')} · ${tr(`goal.${profile.goal}`)}</dt><dd>${number(body.calorie_target)}<small>kcal</small></dd></div>
        </dl>
        <p>${tr('energy.note')}</p>`;
}

function render() {
    renderLibrary();
    renderOverview();
    renderWorkouts();
    renderWeight();
    renderProfile();
}

async function refresh() {
    try {
        await loadAll();
        render();
    } catch (error) {
        showError(error);
    }
}

/* ---------- Navigation ---------- */

function moveIndicator() {
    const active = document.querySelector('.tabs [aria-current="page"]');
    const indicator = $('.tab-indicator');
    if (!active) return;
    indicator.style.width = `${active.offsetWidth}px`;
    indicator.style.transform = `translateX(${active.offsetLeft}px)`;
}

function showView() {
    const name = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
    document.querySelectorAll('.view').forEach((view) => { view.hidden = view.dataset.view !== name; });
    document.querySelectorAll('.tabs a').forEach((link) => {
        if (link.dataset.tab === name) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });
    moveIndicator();
    if (name === 'overview' && state.summary) renderOverview();
}

window.addEventListener('hashchange', () => {
    showView();
    window.scrollTo({ top: 0 });
});
window.addEventListener('resize', moveIndicator);

/* ---------- Language ---------- */

function applyLocale() {
    document.documentElement.lang = locale;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = tr(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = tr(el.dataset.i18nPlaceholder); });
    document.querySelectorAll('[data-i18n-label]').forEach((el) => el.setAttribute('aria-label', tr(el.dataset.i18nLabel)));
    const toggle = $('.lang');
    toggle.dataset.active = locale;
    toggle.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.locale === locale)));
    $('#workout-submit').textContent = tr(state.editingId ? 'workouts.update' : 'workouts.save');
    $('#workout-form-title').textContent = tr(state.editingId ? 'workouts.editing' : 'workouts.new');
    updatePicked();
    refreshTimer();
    requestAnimationFrame(moveIndicator);
}

$('.lang').addEventListener('click', (event) => {
    const button = event.target.closest('[data-locale]');
    if (!button || button.dataset.locale === locale) return;
    locale = button.dataset.locale;
    try {
        localStorage.setItem(LOCALE_KEY, locale);
    } catch {
        // ignore
    }
    const toggle = $('.lang');
    toggle.dataset.active = locale;
    toggle.classList.remove('is-switching');
    void toggle.offsetWidth;
    toggle.classList.add('is-switching');

    const page = $('.page');
    page.classList.add('is-fading');
    setTimeout(() => {
        applyLocale();
        if (state.summary) render();
        refreshDialog();
        page.classList.remove('is-fading');
    }, 250);
});

/* ---------- Workouts ---------- */

const workoutForm = $('#workout-form');

function resetWorkoutForm() {
    state.editingId = null;
    workoutForm.reset();
    workoutForm.elements.date.value = todayIso();
    $('#workout-cancel').hidden = true;
    applyLocale();
    updatePreview();
}

function updatePreview() {
    const { sets, reps, weight_kg: weight } = formData(workoutForm);
    if (!sets || !reps || weight === null) {
        $('#workout-preview').textContent = '';
        return;
    }
    const e1rm = reps <= 1 ? weight : weight * (1 + reps / 30);
    $('#workout-preview').textContent = tr('workouts.preview', { volume: number(sets * reps * weight), e1rm: number(e1rm, 1) });
}

// Show which library exercise was picked, with a small moving figure.
let pickedName = null;
let pickedFigure = null;
function updatePicked() {
    const exercise = findExercise(workoutForm.elements.exercise.value);
    const box = $('#picked-exercise');
    $('#label-reps').textContent = tr(exercise?.unit === 'seconds' ? 'form.seconds' : 'form.reps');
    if (!exercise) {
        pickedFigure?.pause();
        pickedName = null;
        box.hidden = true;
        return;
    }
    const key = `${exercise.slug}:${locale}`;
    if (pickedName === key) return;
    pickedName = key;
    pickedFigure?.pause();
    box.hidden = false;
    box.style.setProperty('--tone', tone(exercise.muscle));
    box.innerHTML = `<span class="mini-fig"></span>
        <div><strong>${escapeHtml(exercise.name)}</strong><span>${tr(`muscles.${exercise.muscle}`)} · ${tr(`equipment.${exercise.equipment}`)}</span></div>
        <button type="button" class="button" data-open="${exercise.slug}">${tr('howTo')}</button>`;
    pickedFigure = miniFigure(box.querySelector('.mini-fig'), exercise);
}

workoutForm.addEventListener('input', () => {
    updatePreview();
    updatePicked();
});

// The − and + buttons next to number fields.
document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-step]');
    if (!button) return;
    const input = button.closest('form').elements[button.dataset.step];
    const step = Number(button.dataset.delta);
    const min = Number(input.min || 0);
    const max = Number(input.max || 9999);
    const value = Math.min(max, Math.max(min, (Number(input.value) || 0) + step));
    input.value = String(Math.round(value * 100) / 100);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
});

workoutForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = formData(workoutForm);
    const button = $('#workout-submit');
    button.disabled = true;
    const isNew = !state.editingId;
    const previousBest = Math.max(0, ...state.workouts.filter((w) => w.exercise.toLowerCase() === String(data.exercise).trim().toLowerCase()).map((w) => w.e1rm));
    const goalBefore = state.summary?.workouts_this_week ?? 0;
    try {
        const saved = state.editingId
            ? await api(`/workouts/${state.editingId}`, { method: 'PUT', body: data })
            : await api('/workouts', { method: 'POST', body: data });
        markInvalid(workoutForm);
        // Keep the date and exercise so the next set is quick to add.
        const keep = { date: data.date, exercise: data.exercise };
        resetWorkoutForm();
        Object.assign(workoutForm.elements.date, { value: keep.date });
        workoutForm.elements.exercise.value = keep.exercise;
        toast(tr('workouts.saved'));
        await refresh();
        const goalReached = goalBefore < settings.weeklyGoal && state.summary.workouts_this_week >= settings.weeklyGoal;
        if (isNew && previousBest > 0 && saved.e1rm > previousBest) {
            confetti();
            toast(tr('newRecord', { exercise: saved.exercise }));
        } else if (goalReached) {
            confetti();
            toast(tr('weekly.reached'));
        }
        if (isNew && settings.autoTimer) startTimer();
    } catch (error) {
        if (!markInvalid(workoutForm, error)) showError(error);
    } finally {
        button.disabled = false;
    }
});

$('#workout-cancel').addEventListener('click', resetWorkoutForm);

$('#workout-filter').addEventListener('change', (event) => {
    state.filter = event.target.value;
    renderWorkouts();
});

$('#workout-list').addEventListener('click', async (event) => {
    if (event.target.closest('#show-more')) {
        state.daysShown += 10;
        renderWorkouts();
        return;
    }
    const edit = event.target.closest('[data-edit]');
    const remove = event.target.closest('[data-delete]');

    if (edit) {
        const workout = state.workouts.find((w) => w.id === Number(edit.dataset.edit));
        state.editingId = workout.id;
        for (const key of ['date', 'exercise', 'sets', 'reps', 'weight_kg', 'notes']) workoutForm.elements[key].value = workout[key];
        $('#workout-cancel').hidden = false;
        applyLocale();
        updatePreview();
        workoutForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        workoutForm.elements.exercise.focus({ preventScroll: true });
    }

    if (remove) {
        const workout = state.workouts.find((w) => w.id === Number(remove.dataset.delete));
        try {
            await api(`/workouts/${workout.id}`, { method: 'DELETE' });
            if (state.editingId === workout.id) resetWorkoutForm();
            await refresh();
            const { id, volume, e1rm, ...copy } = workout;
            toast(tr('workouts.deleted'), {
                actionLabel: tr('undo'),
                action: async () => {
                    await api('/workouts', { method: 'POST', body: copy });
                    await refresh();
                },
            });
        } catch (error) {
            showError(error);
        }
    }
});

/* ---------- Weight ---------- */

const weightForm = $('#weight-form');

weightForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
        await api('/weights', { method: 'POST', body: formData(weightForm) });
        markInvalid(weightForm);
        weightForm.elements.weight_kg.value = '';
        toast(tr('weight.saved'));
        await refresh();
    } catch (error) {
        if (!markInvalid(weightForm, error)) showError(error);
    }
});

$('#weight-list').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-delete-weight]');
    if (!button) return;
    const entry = state.weights.find((w) => w.id === Number(button.dataset.deleteWeight));
    try {
        await api(`/weights/${entry.id}`, { method: 'DELETE' });
        await refresh();
        toast(tr('weight.deleted'), {
            actionLabel: tr('undo'),
            action: async () => {
                await api('/weights', { method: 'POST', body: { date: entry.date, weight_kg: entry.weight_kg } });
                await refresh();
            },
        });
    } catch (error) {
        showError(error);
    }
});

/* ---------- Profile ---------- */

const profileForm = $('#profile-form');

profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
        await api('/profile', { method: 'PUT', body: formData(profileForm) });
        markInvalid(profileForm);
        toast(tr('profile.saved'));
        await refresh();
    } catch (error) {
        if (!markInvalid(profileForm, error)) showError(error);
    }
});

$('#progress-exercise').addEventListener('change', renderProgress);

$('#load-demo').addEventListener('click', async () => {
    try {
        await api('/demo', { method: 'POST' });
        delete profileForm.dataset.filled;
        toast(tr('demoLoaded'));
        await refresh();
    } catch (error) {
        showError(error);
    }
});

/* ---------- Start ---------- */

/* ---------- Settings ---------- */

const settingsForm = $('#settings-form');

function fillSettings() {
    for (const [key, value] of Object.entries(settings)) {
        const field = settingsForm.elements[key];
        if (!field) continue;
        if (field instanceof RadioNodeList) field.value = value;
        else if (field.type === 'checkbox') field.checked = value;
        else field.value = value;
    }
}

settingsForm.addEventListener('change', () => {
    const goal = Math.min(7, Math.max(1, Number(settingsForm.elements.weeklyGoal.value) || 3));
    saveSettings({
        theme: settingsForm.elements.theme.value,
        accent: settingsForm.elements.accent.value,
        weeklyGoal: goal,
        restSeconds: Number(settingsForm.elements.restSeconds.value),
        sound: settingsForm.elements.sound.checked,
        autoTimer: settingsForm.elements.autoTimer.checked,
        motion: settingsForm.elements.motion.value,
    });
    settingsForm.elements.weeklyGoal.value = goal;
    refreshTimer();
    if (state.summary) renderGoal();
});
settingsForm.addEventListener('submit', (event) => event.preventDefault());

/* ---------- Start ---------- */

applySettings();
fillSettings();
initTimer({ translate: tr, onDone: (message) => toast(message) });
initLibrary({
    api,
    tr,
    locale: () => locale,
    showError,
    onLog(exercise) {
        if (state.editingId) resetWorkoutForm();
        workoutForm.elements.exercise.value = exercise.name;
        location.hash = '#workouts';
        updatePreview();
        updatePicked();
        setTimeout(() => workoutForm.elements.sets.focus(), 300);
    },
});
weightForm.elements.date.value = todayIso();
resetWorkoutForm();
applyLocale();
showView();
refresh();
