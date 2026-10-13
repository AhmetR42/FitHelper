// A short burst of confetti for personal records and reached goals.

import { calm } from './settings.js';

export function confetti() {
    if (calm()) return;
    const canvas = document.getElementById('confetti');
    const ctx = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    canvas.width = innerWidth * ratio;
    canvas.height = innerHeight * ratio;
    ctx.scale(ratio, ratio);

    const style = getComputedStyle(document.documentElement);
    const colours = ['--accent', '--m-chest', '--m-arms', '--m-legs', '--m-glutes', '--m-core']
        .map((name) => style.getPropertyValue(name).trim());
    const pieces = Array.from({ length: 140 }, () => ({
        x: innerWidth / 2 + (Math.random() - 0.5) * 200,
        y: innerHeight * 0.45,
        vx: (Math.random() - 0.5) * 14,
        vy: -Math.random() * 15 - 5,
        size: Math.random() * 7 + 5,
        spin: Math.random() * 360,
        turn: (Math.random() - 0.5) * 18,
        colour: colours[Math.floor(Math.random() * colours.length)],
        round: Math.random() < 0.3,
    }));

    const start = performance.now();
    function frame(now) {
        const t = now - start;
        ctx.clearRect(0, 0, innerWidth, innerHeight);
        for (const p of pieces) {
            p.vy += 0.42;
            p.vx *= 0.99;
            p.x += p.vx;
            p.y += p.vy;
            p.spin += p.turn;
            ctx.save();
            ctx.globalAlpha = Math.max(0, 1 - t / 2400);
            ctx.translate(p.x, p.y);
            ctx.rotate((p.spin * Math.PI) / 180);
            ctx.fillStyle = p.colour;
            if (p.round) {
                ctx.beginPath();
                ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            }
            ctx.restore();
        }
        if (t < 2400) requestAnimationFrame(frame);
        else ctx.clearRect(0, 0, innerWidth, innerHeight);
    }
    requestAnimationFrame(frame);
}
