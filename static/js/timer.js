// Rest timer: a floating button with a ring that counts down between sets.

import { settings } from './settings.js';

const $ = (selector) => document.querySelector(selector);
const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

let total = settings.restSeconds;
let left = total;
let endsAt = null;
let interval = null;
let tr = (key) => key;

const clock = (seconds) => {
    const whole = Math.ceil(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

function draw() {
    $('#timer-time').textContent = clock(left);
    $('#timer-ring').style.strokeDashoffset = String(CIRCUMFERENCE * (1 - left / total));
    const fab = $('#timer-fab');
    const running = endsAt !== null;
    fab.classList.toggle('is-running', running);
    $('#timer-fab-time').hidden = !running;
    $('#timer-fab-time').textContent = clock(left);
    $('#timer-toggle').textContent = tr(running ? 'timer.pause' : 'timer.start');
    document.querySelectorAll('#timer-presets button').forEach((button) => {
        button.setAttribute('aria-pressed', String(Number(button.dataset.seconds) === total));
    });
}

function beep() {
    if (!settings.sound) return;
    try {
        const audio = new AudioContext();
        [0, 0.22, 0.44].forEach((delay, i) => {
            const osc = audio.createOscillator();
            const gain = audio.createGain();
            osc.frequency.value = i === 2 ? 880 : 660;
            gain.gain.setValueAtTime(0.0001, audio.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + delay + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + delay + 0.18);
            osc.connect(gain).connect(audio.destination);
            osc.start(audio.currentTime + delay);
            osc.stop(audio.currentTime + delay + 0.2);
        });
    } catch {
        // No audio available.
    }
    navigator.vibrate?.([200, 100, 200]);
}

function finish(onDone) {
    clearInterval(interval);
    endsAt = null;
    left = 0;
    draw();
    beep();
    const fab = $('#timer-fab');
    fab.classList.remove('is-done');
    void fab.offsetWidth;
    fab.classList.add('is-done');
    onDone?.(tr('timer.done'));
    setTimeout(() => {
        fab.classList.remove('is-done');
        left = total;
        draw();
    }, 2200);
}

let notify;

function run() {
    endsAt = performance.now() + left * 1000;
    clearInterval(interval);
    interval = setInterval(() => {
        left = Math.max(0, (endsAt - performance.now()) / 1000);
        if (left <= 0) finish(notify);
        else draw();
    }, 200);
    draw();
}

function pause() {
    clearInterval(interval);
    endsAt = null;
    draw();
}

function set(seconds) {
    pause();
    total = seconds;
    left = seconds;
    draw();
}

export function startTimer(seconds = settings.restSeconds) {
    set(seconds);
    run();
}

export function initTimer({ translate, onDone }) {
    tr = translate;
    notify = onDone;
    $('#timer-ring').style.strokeDasharray = String(CIRCUMFERENCE);
    const panel = $('#timer-panel');
    const fab = $('#timer-fab');

    fab.addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        fab.setAttribute('aria-expanded', String(!panel.hidden));
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !panel.hidden) {
            panel.hidden = true;
            fab.setAttribute('aria-expanded', 'false');
            fab.focus();
        }
    });
    $('#timer-presets').addEventListener('click', (event) => {
        const button = event.target.closest('[data-seconds]');
        if (button) set(Number(button.dataset.seconds));
    });
    $('#timer-toggle').addEventListener('click', () => (endsAt === null ? run() : pause()));
    $('#timer-add').addEventListener('click', () => {
        left += 15;
        total = Math.max(total, left);
        if (endsAt !== null) endsAt += 15000;
        draw();
    });
    $('#timer-reset').addEventListener('click', () => set(total));
    draw();
}

export function refreshTimer() {
    if (endsAt === null && left === total) {
        total = settings.restSeconds;
        left = total;
    }
    draw();
}
