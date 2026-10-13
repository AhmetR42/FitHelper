import { barChart, lineChart } from './charts.js';
import { LOCALES, t } from './i18n.js';

const LOCALE_KEY = 'fithelper:locale';
const VIEWS = ['overview', 'workouts', 'weight', 'profile'];

const $ = (selector) => document.querySelector(selector);
const state = { profile: null, summary: null, workouts: [], weights: [], exercises: [], editingId: null, filter: '' };
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
        api('/workouts?limit=200'),
        api('/weights'),
        api('/workouts/exercises'),
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
function tile({ label, value, decimals = 0, unit, note, noteClass = '', variant = '' }) {
    const isNumber = typeof value === 'number';
    const count = isNumber ? ` data-count="${value}" data-decimals="${decimals}"` : '';
    return `<div class="tile ${variant}">
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
        tile({ label: tr('tiles.workouts'), value: summary.workouts_this_week, note: tr('tiles.days', { count: summary.total_workouts }) }),
        tile({ label: tr('tiles.volume'), value: summary.volume_this_week, unit: 'kg', variant: 'tile-highlight' }),
        tile({ label: tr('tiles.streak'), value: summary.streak_weeks, note: tr('tiles.weeks') }),
        body.weight_kg === null
            ? tile({ label: tr('tiles.weight'), value: tr('tiles.noWeight'), variant: 'tile-muted' })
            : tile({ label: tr('tiles.weight'), value: body.weight_kg, decimals: 1, unit: 'kg', note: changeText, noteClass: change < 0 && profile?.goal === 'lose' ? 'is-good' : '' }),
        body.bmi === null
            ? tile({ label: tr('tiles.bmi'), value: tr('tiles.needProfile'), variant: 'tile-muted' })
            : tile({ label: tr('tiles.bmi'), value: body.bmi, decimals: 1, note: tr(`bmi.${body.bmi_category}`) }),
        body.calorie_target === null
            ? tile({ label: tr('tiles.calories'), value: tr('tiles.needProfile'), variant: 'tile-muted' })
            : tile({ label: tr('tiles.calories'), value: body.calorie_target, note: tr('tiles.perDay') }),
    ].join('');
    countUp();
}

// Numbers in the tiles count up from zero when the page opens.
function countUp() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
    $('#welcome').hidden = Boolean(profile || state.workouts.length);

    renderTiles();

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

    $('#exercise-list').innerHTML = state.exercises.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('');

    const list = state.workouts.filter((w) => !state.filter || w.exercise === state.filter);
    if (!list.length) {
        $('#workout-list').innerHTML = `<p class="list-empty">${tr('workouts.empty')}</p>`;
        return;
    }

    const days = Map.groupBy(list, (w) => w.date);
    $('#workout-list').innerHTML = [...days].map(([day, sets]) => `<section class="day">
        <h3>${longDate(day)}</h3>
        ${sets.map((w) => `<div class="set">
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
    </section>`).join('');
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

workoutForm.addEventListener('input', updatePreview);

workoutForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = formData(workoutForm);
    const button = $('#workout-submit');
    button.disabled = true;
    try {
        if (state.editingId) await api(`/workouts/${state.editingId}`, { method: 'PUT', body: data });
        else await api('/workouts', { method: 'POST', body: data });
        markInvalid(workoutForm);
        // Keep the date and exercise so the next set is quick to add.
        const keep = { date: data.date, exercise: data.exercise };
        resetWorkoutForm();
        Object.assign(workoutForm.elements.date, { value: keep.date });
        workoutForm.elements.exercise.value = keep.exercise;
        toast(tr('workouts.saved'));
        await refresh();
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

weightForm.elements.date.value = todayIso();
resetWorkoutForm();
applyLocale();
showView();
refresh();
