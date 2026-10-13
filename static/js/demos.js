// Animated demonstrations: a small figure that performs each exercise.
//
// A pose places the hip (`p`), tilts the torso (`t`) and positions the limbs.
// Angles are in degrees: 0 points down, 90 points forward (right), 180 up.
// A limb is either [upper, lower] angles or { to: [x, y], b } where the hand or
// ankle goes to that point and the elbow or knee bends to side `b` (1 or -1).
// The figure loops through the frames of a demo and eases between them.

const NS = 'http://www.w3.org/2000/svg';
const SIZE = { torso: 46, neck: 17, head: 11, upper: 26, fore: 24, thigh: 34, shin: 34, foot: 10 };
const FLOOR = 187;

const dir = (deg, length = 1) => {
    const rad = (deg * Math.PI) / 180;
    return [Math.sin(rad) * length, Math.cos(rad) * length];
};
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const angleOf = (from, to) => (Math.atan2(to[0] - from[0], to[1] - from[1]) * 180) / Math.PI;

// Two-bone reach: where the elbow or knee goes when the end must touch `target`.
function reach(root, target, first, second, bend = 1) {
    const dx = target[0] - root[0];
    const dy = target[1] - root[1];
    const d = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(first - second) + 0.01), first + second - 0.01);
    const cos = (first * first + d * d - second * second) / (2 * first * d);
    const offset = (Math.acos(Math.min(Math.max(cos, -1), 1)) * 180) / Math.PI;
    const joint = add(root, dir(angleOf(root, target) + bend * offset, first));
    return [joint, add(joint, dir(angleOf(joint, target), second))];
}

function limb(root, spec, first, second) {
    if (Array.isArray(spec)) {
        const joint = add(root, dir(spec[0], first));
        return [joint, add(joint, dir(spec[1], second))];
    }
    return reach(root, spec.to, first, second, spec.b ?? 1);
}

// Positions of every joint for one pose.
function solve(pose) {
    const scale = pose.as ?? 1;
    const hip = pose.p;
    const shoulder = add(hip, dir(pose.t, SIZE.torso));
    const head = add(shoulder, dir(pose.t + (pose.h ?? 0), SIZE.neck));
    const side = pose.front ? 1 : 0;
    // In the front view the arms and legs start a little to the side of the middle.
    const nearShoulder = add(shoulder, [11 * side, 3 * side]);
    const nearHip = add(hip, [7 * side, 0]);
    const arm = limb(nearShoulder, pose.a, SIZE.upper * scale, SIZE.fore * scale);
    const leg = limb(nearHip, pose.l, SIZE.thigh, SIZE.shin);
    const toe = add(leg[1], dir(pose.fl ?? 90, SIZE.foot));

    let farArm;
    let farLeg;
    let farToe;
    if (pose.front) {
        const mirror = ([x, y]) => [2 * hip[0] - x, y];
        farArm = arm.map(mirror);
        farLeg = leg.map(mirror);
        farToe = mirror(toe);
    } else {
        farArm = limb(shoulder, pose.A ?? pose.a, SIZE.upper * scale, SIZE.fore * scale);
        farLeg = limb(hip, pose.L ?? pose.l, SIZE.thigh, SIZE.shin);
        farToe = add(farLeg[1], dir(pose.FL ?? pose.fl ?? 90, SIZE.foot));
    }
    return {
        hip, shoulder, head,
        nearShoulder, nearHip,
        farShoulder: pose.front ? [2 * hip[0] - nearShoulder[0], nearShoulder[1]] : shoulder,
        farHip: pose.front ? [2 * hip[0] - nearHip[0], nearHip[1]] : hip,
        elbow: arm[0], hand: arm[1], knee: leg[0], ankle: leg[1], toe,
        elbow2: farArm[0], hand2: farArm[1], knee2: farLeg[0], ankle2: farLeg[1], toe2: farToe,
        rope: pose.rope,
    };
}

// Blend two poses. Numbers are mixed, everything else comes from the first pose.
function mix(a, b, k) {
    if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * k;
    if (Array.isArray(a) !== Array.isArray(b)) return k < 0.5 ? a : b;
    if (Array.isArray(a)) return a.map((value, i) => mix(value, b[i], k));
    if (a && b && typeof a === 'object' && typeof b === 'object') {
        const out = { ...a };
        for (const key of Object.keys(a)) if (key in b) out[key] = mix(a[key], b[key], k);
        return out;
    }
    return a;
}

/* ---------- Poses that several demos share ---------- */

const STAND = { p: [98, 114], t: 180, a: [4, 4], A: [-3, -3], l: { to: [102, 182] }, L: { to: [96, 182] } };
const pose = (extra) => ({ ...STAND, ...extra });
const BENCH = [
    { type: 'pad', from: [30, 141], to: [136, 141] },
    { type: 'post', from: [48, 141], to: [48, FLOOR] },
    { type: 'post', from: [120, 141], to: [120, FLOOR] },
];
const LYING = { p: [116, 132], t: 270, l: { to: [152, 182] }, L: { to: [146, 182] } };
const FLOOR_BACK = { p: [112, 177], t: 270, h: 0 };
const PUSH_TOP = { p: [86, 151], t: 114, a: { to: [128, 182], b: -1 }, l: { to: [24, 178] }, fl: 20 };
const HANG = { p: [103, 126], t: 177, a: { to: [112, 30], b: -1 }, A: { to: [108, 30], b: -1 }, l: [8, -10], L: [2, -14] };
const PULL_BAR = [
    { type: 'post', from: [40, 30], to: [160, 30], w: 5 },
];

export const DEMOS = {
    bench_press: {
        props: BENCH,
        frames: [
            { ...LYING, a: [180, 180], A: [178, 178] },
            { ...LYING, a: [35, 172], A: [33, 170] },
        ],
    },
    incline_press: {
        props: [
            { type: 'pad', from: [104, 157], to: [58, 130] },
            { type: 'pad', from: [100, 157], to: [124, 157] },
            { type: 'post', from: [112, 157], to: [112, FLOOR] },
        ],
        frames: [
            { p: [108, 149], t: 240, a: [178, 178], A: [175, 175], l: { to: [146, 182] }, L: { to: [140, 182] } },
            { p: [108, 149], t: 240, a: [40, 168], A: [36, 166], l: { to: [146, 182] }, L: { to: [140, 182] } },
        ],
    },
    push_up: {
        frames: [
            PUSH_TOP,
            { p: [92, 171], t: 96, a: { to: [128, 182], b: -1 }, l: { to: [24, 178] }, fl: 20 },
        ],
    },
    fly: {
        props: BENCH,
        frames: [
            { ...LYING, a: [180, 182], A: [178, 180] },
            { ...LYING, a: [130, 150], A: [128, 148], as: 0.55 },
        ],
    },
    dip: {
        props: [
            { type: 'post', from: [76, 102], to: [140, 102], w: 6 },
            { type: 'post', from: [136, 102], to: [136, FLOOR] },
        ],
        frames: [
            { p: [98, 98], t: 172, a: { to: [106, 102], b: -1 }, l: [8, -55], L: [4, -60] },
            { p: [93, 120], t: 156, a: { to: [106, 102], b: -1 }, l: [14, -50], L: [10, -55] },
        ],
    },
    cable_fly: {
        props: [{ type: 'pulley', at: [56, 14] }],
        cable: { from: [56, 14], to: 'hand' },
        hold: { type: 'handle', at: 'hand' },
        frames: [
            pose({ t: 166, a: [125, 120], A: [122, 117], as: 0.7 }),
            pose({ t: 166, a: [40, 30], A: [36, 26] }),
        ],
    },
    deadlift: {
        hold: { type: 'plate', at: 'hand' },
        frames: [
            pose({ p: [94, 115], t: 178, a: [3, 3], A: [1, 1], l: { to: [104, 182] }, L: { to: [100, 182] } }),
            pose({ p: [72, 138], t: 118, a: [2, 2], A: [0, 0], l: { to: [104, 182] }, L: { to: [100, 182] } }),
        ],
        hold_ms: 200,
    },
    bent_row: {
        frames: [
            pose({ p: [80, 122], t: 112, a: [2, 2], A: [0, 0], l: { to: [104, 182] }, L: { to: [98, 182] } }),
            pose({ p: [80, 122], t: 112, a: [-62, 4], A: [-64, 2], l: { to: [104, 182] }, L: { to: [98, 182] } }),
        ],
    },
    pull_up: {
        props: PULL_BAR,
        frames: [
            HANG,
            { ...HANG, p: [96, 86], t: 174, l: [14, -20], L: [8, -24] },
        ],
    },
    pulldown: {
        props: [
            { type: 'pad', from: [62, 147], to: [104, 147] },
            { type: 'post', from: [82, 147], to: [82, FLOOR] },
            { type: 'roller', at: [118, 128] },
            { type: 'pulley', at: [100, 8] },
        ],
        cable: { from: [100, 8], to: 'hand' },
        hold: { type: 'bar', at: 'hand' },
        frames: [
            { p: [86, 139], t: 184, a: { to: [104, 44], b: -1 }, A: { to: [100, 44], b: -1 }, l: { to: [124, 182] }, L: { to: [120, 182] } },
            { p: [86, 139], t: 192, a: { to: [100, 100], b: -1 }, A: { to: [96, 100], b: -1 }, l: { to: [124, 182] }, L: { to: [120, 182] } },
        ],
    },
    seated_row: {
        props: [
            { type: 'pad', from: [44, 166], to: [96, 166] },
            { type: 'post', from: [60, 166], to: [60, FLOOR] },
            { type: 'pad', from: [146, 150], to: [150, 186] },
            { type: 'pulley', at: [172, 150] },
        ],
        cable: { from: [172, 150], to: 'hand' },
        hold: { type: 'handle', at: 'hand' },
        frames: [
            { p: [74, 158], t: 162, a: { to: [134, 132], b: -1 }, l: { to: [140, 168], b: -1 }, L: { to: [138, 172], b: -1 } },
            { p: [74, 158], t: 186, a: { to: [96, 132], b: -1 }, l: { to: [140, 168], b: -1 }, L: { to: [138, 172], b: -1 } },
        ],
    },
    superman: {
        frames: [
            { p: [96, 177], t: 90, h: 6, a: [90, 90], A: [92, 92], l: [-90, -90], L: [-88, -88], fl: -20 },
            { p: [96, 177], t: 104, h: 4, a: [108, 108], A: [106, 106], l: [-104, -104], L: [-102, -102], fl: -40 },
        ],
        hold_ms: 400,
    },
    overhead_press: {
        hold: { type: 'plate', at: 'hand' },
        frames: [
            pose({ a: [22, 172], A: [20, 170] }),
            pose({ a: [176, 180], A: [174, 178] }),
        ],
    },
    seated_press: {
        props: [
            { type: 'pad', from: [84, 148], to: [122, 148] },
            { type: 'pad', from: [82, 148], to: [82, 72] },
            { type: 'post', from: [104, 148], to: [104, FLOOR] },
        ],
        frames: [
            { p: [96, 140], t: 180, a: [28, 166], A: [26, 164], l: { to: [138, 182] }, L: { to: [132, 182] } },
            { p: [96, 140], t: 180, a: [176, 178], A: [174, 176], l: { to: [138, 182] }, L: { to: [132, 182] } },
        ],
    },
    lateral_raise: {
        frames: [
            { p: [100, 114], t: 180, front: true, a: [8, 6], l: { to: [110, 182], b: -1 }, fl: 100 },
            { p: [100, 114], t: 180, front: true, a: [86, 92], l: { to: [110, 182], b: -1 }, fl: 100 },
        ],
    },
    front_raise: {
        frames: [
            pose({ a: [8, 8], A: [6, 6] }),
            pose({ a: [92, 92], A: [90, 90] }),
        ],
    },
    face_pull: {
        props: [{ type: 'pulley', at: [184, 62] }],
        cable: { from: [184, 62], to: 'hand' },
        hold: { type: 'handle', at: 'hand' },
        frames: [
            pose({ a: [82, 82], A: [80, 80] }),
            pose({ a: [96, 236], A: [94, 234] }),
        ],
    },
    curl: {
        frames: [
            pose({ a: [3, 3], A: [0, 0] }),
            pose({ a: [6, 162], A: [3, 160] }),
        ],
    },
    pushdown: {
        props: [{ type: 'pulley', at: [124, 6] }],
        cable: { from: [124, 6], to: 'hand' },
        hold: { type: 'handle', at: 'hand' },
        frames: [
            pose({ t: 174, a: [4, 152], A: [2, 150] }),
            pose({ t: 174, a: [4, 8], A: [2, 6] }),
        ],
    },
    overhead_extension: {
        frames: [
            pose({ a: [172, 178], A: [170, 176] }),
            pose({ a: [174, 322], A: [172, 320] }),
        ],
    },
    skull_crusher: {
        hold: { type: 'plate', at: 'hand' },
        props: BENCH,
        frames: [
            { ...LYING, a: [182, 182], A: [180, 180] },
            { ...LYING, a: [196, 312], A: [194, 310] },
        ],
    },
    bench_dip: {
        props: [
            { type: 'pad', from: [26, 128], to: [84, 128] },
            { type: 'post', from: [40, 128], to: [40, FLOOR] },
            { type: 'post', from: [74, 128], to: [74, FLOOR] },
        ],
        frames: [
            { p: [93, 127], t: 180, a: { to: [80, 122], b: 1 }, l: { to: [134, 182] }, L: { to: [128, 182] } },
            { p: [93, 150], t: 178, a: { to: [80, 122], b: 1 }, l: { to: [134, 182] }, L: { to: [128, 182] } },
        ],
    },
    squat: {
        hold: { type: 'plate', at: 'shoulder' },
        frames: [
            pose({ p: [96, 115], t: 178, a: [-40, 165], A: [-42, 163], l: { to: [104, 182] }, L: { to: [98, 182] } }),
            pose({ p: [76, 146], t: 140, a: [-78, 127], A: [-80, 125], l: { to: [104, 182] }, L: { to: [98, 182] } }),
        ],
    },
    goblet_squat: {
        frames: [
            pose({ p: [96, 115], t: 180, a: [12, 150], A: [10, 148], l: { to: [104, 182] }, L: { to: [98, 182] } }),
            pose({ p: [78, 148], t: 150, a: [-16, 120], A: [-18, 118], l: { to: [104, 182] }, L: { to: [98, 182] } }),
        ],
    },
    leg_press: {
        props: [
            { type: 'pad', from: [64, 160], to: [26, 133] },
            { type: 'pad', from: [62, 160], to: [96, 160] },
            { type: 'post', from: [78, 160], to: [78, FLOOR] },
            { type: 'post', from: [120, 182], to: [176, 120], w: 4 },
        ],
        hold: { type: 'platform', at: 'ankle', angle: 40 },
        frames: [
            { p: [70, 151], t: 235, a: [30, 30], l: { to: [118, 106], b: -1 }, L: { to: [114, 104], b: -1 }, fl: 220 },
            { p: [70, 151], t: 235, a: [30, 30], l: { to: [96, 126], b: -1 }, L: { to: [92, 124], b: -1 }, fl: 220 },
        ],
    },
    lunge: {
        frames: [
            pose({ p: [80, 114], t: 180, l: { to: [84, 182] }, L: { to: [76, 182] } }),
            pose({ p: [106, 147], t: 180, l: { to: [138, 182] }, L: { to: [76, 182], b: 1 }, FL: 40 }),
        ],
    },
    split_squat: {
        props: [
            { type: 'pad', from: [16, 150], to: [56, 150] },
            { type: 'post', from: [24, 150], to: [24, FLOOR] },
            { type: 'post', from: [50, 150], to: [50, FLOOR] },
        ],
        frames: [
            pose({ p: [100, 121], t: 178, l: { to: [130, 182] }, L: { to: [54, 143], b: 1 }, FL: 260 }),
            pose({ p: [94, 148], t: 168, l: { to: [130, 182] }, L: { to: [54, 143], b: 1 }, FL: 260 }),
        ],
    },
    leg_extension: {
        props: [
            { type: 'pad', from: [52, 148], to: [100, 148] },
            { type: 'pad', from: [52, 148], to: [44, 82] },
            { type: 'post', from: [76, 148], to: [76, FLOOR] },
        ],
        hold: { type: 'roller', at: 'ankle' },
        frames: [
            { p: [80, 140], t: 186, a: [14, 10], l: [88, 6], L: [86, 4] },
            { p: [80, 140], t: 186, a: [14, 10], l: [88, 82], L: [86, 80] },
        ],
    },
    leg_curl: {
        props: [
            { type: 'pad', from: [36, 160], to: [154, 160] },
            { type: 'post', from: [60, 160], to: [60, FLOOR] },
            { type: 'post', from: [136, 160], to: [136, FLOOR] },
        ],
        hold: { type: 'roller', at: 'ankle' },
        frames: [
            { p: [96, 151], t: 90, h: 8, a: [20, 4], l: [-90, -90], L: [-88, -88], fl: 0 },
            { p: [96, 151], t: 90, h: 8, a: [20, 4], l: [-90, -176], L: [-88, -174], fl: -90 },
        ],
    },
    rdl: {
        hold: { type: 'plate', at: 'hand' },
        frames: [
            pose({ p: [94, 115], t: 178, a: [3, 3], A: [1, 1], l: { to: [102, 182] }, L: { to: [98, 182] } }),
            pose({ p: [76, 121], t: 102, a: [0, 0], A: [-2, -2], l: { to: [102, 182] }, L: { to: [98, 182] } }),
        ],
    },
    calf_raise: {
        props: [{ type: 'box', x: 64, y: 170, w: 50, h: 17 }],
        frames: [
            pose({ p: [98, 100], l: { to: [100, 168] }, L: { to: [96, 168] }, fl: 102 }),
            pose({ p: [102, 90], l: { to: [104, 158] }, L: { to: [100, 158] }, fl: 48 }),
        ],
        hold_ms: 250,
    },
    step_up: {
        props: [{ type: 'box', x: 112, y: 158, w: 58, h: 29 }],
        frames: [
            pose({ p: [100, 119], l: { to: [132, 154] }, L: { to: [94, 182] } }),
            pose({ p: [126, 86], l: { to: [132, 154] }, L: { to: [116, 140], b: -1 } }),
        ],
    },
    hip_thrust: {
        props: [
            { type: 'pad', from: [18, 152], to: [76, 152] },
            { type: 'post', from: [30, 152], to: [30, FLOOR] },
            { type: 'post', from: [66, 152], to: [66, FLOOR] },
        ],
        hold: { type: 'plate', at: 'hip' },
        frames: [
            { p: [128, 168], t: 252, a: { to: [124, 156], b: 1 }, l: { to: [146, 182], b: 1 }, L: { to: [140, 182], b: 1 } },
            { p: [112, 146], t: 268, a: { to: [110, 134], b: 1 }, l: { to: [146, 182], b: 1 }, L: { to: [140, 182], b: 1 } },
        ],
        hold_ms: 250,
    },
    glute_bridge: {
        frames: [
            { ...FLOOR_BACK, a: [90, 90], l: { to: [140, 182], b: 1 }, L: { to: [134, 182], b: 1 } },
            { p: [108, 152], t: 298, h: -28, a: [70, 90], l: { to: [140, 182], b: 1 }, L: { to: [134, 182], b: 1 } },
        ],
        hold_ms: 300,
    },
    kb_swing: {
        frames: [
            pose({ p: [78, 124], t: 116, a: [-24, -24], A: [-26, -26], l: { to: [104, 182] }, L: { to: [96, 182] } }),
            pose({ p: [96, 115], t: 182, a: [96, 96], A: [94, 94], l: { to: [104, 182] }, L: { to: [96, 182] } }),
        ],
    },
    kickback: {
        props: [
            { type: 'post', from: [164, 50], to: [164, FLOOR], w: 6 },
            { type: 'pulley', at: [160, 178] },
        ],
        cable: { from: [160, 178], to: 'ankle' },
        frames: [
            pose({ p: [100, 114], t: 166, a: { to: [158, 104], b: -1 }, l: [10, 4], L: { to: [96, 182] } }),
            pose({ p: [100, 114], t: 160, a: { to: [158, 104], b: -1 }, l: [-46, -40], L: { to: [96, 182] }, fl: 30 }),
        ],
    },
    plank: {
        frames: [
            { p: [78, 164], t: 101, a: [0, 90], A: [-2, 88], l: { to: [12, 178] }, fl: 20 },
            { p: [78, 161], t: 99, a: [0, 90], A: [-2, 88], l: { to: [12, 178] }, fl: 20 },
        ],
        speed: 2,
    },
    crunch: {
        frames: [
            { ...FLOOR_BACK, a: [218, 300], l: { to: [146, 182], b: 1 }, L: { to: [140, 182], b: 1 } },
            { ...FLOOR_BACK, t: 242, a: [190, 272], l: { to: [146, 182], b: 1 }, L: { to: [140, 182], b: 1 } },
        ],
    },
    hanging_leg_raise: {
        props: PULL_BAR,
        frames: [
            HANG,
            { ...HANG, t: 174, l: [90, 92], L: [88, 90] },
        ],
    },
    leg_raise: {
        frames: [
            { ...FLOOR_BACK, a: [90, 90], l: [96, 96], L: [94, 94] },
            { ...FLOOR_BACK, a: [90, 90], l: [176, 176], L: [174, 174] },
        ],
    },
    dead_bug: {
        frames: [
            { ...FLOOR_BACK, a: [180, 180], A: [178, 178], l: [168, 90], L: [166, 88] },
            { ...FLOOR_BACK, a: [180, 180], A: [262, 262], l: [100, 98], L: [166, 88] },
            { ...FLOOR_BACK, a: [180, 180], A: [178, 178], l: [168, 90], L: [166, 88] },
            { ...FLOOR_BACK, a: [262, 262], A: [178, 178], l: [168, 90], L: [100, 98] },
        ],
    },
    mountain_climber: {
        frames: [
            { ...PUSH_TOP, l: { to: [92, 172], b: -1 }, L: { to: [24, 178] }, FL: 20, fl: 60 },
            { ...PUSH_TOP, l: { to: [24, 178], b: -1 }, L: { to: [92, 172], b: -1 }, FL: 60 },
        ],
        speed: 0.45,
    },
    jumping_jack: {
        frames: [
            { p: [100, 114], t: 180, front: true, a: [8, 6], l: { to: [106, 182], b: -1 }, fl: 100 },
            { p: [100, 108], t: 180, front: true, a: [150, 166], l: { to: [128, 178], b: -1 }, fl: 100 },
        ],
        speed: 0.45,
    },
    burpee: {
        frames: [
            pose({ p: [96, 114], l: { to: [104, 182] }, L: { to: [98, 182] } }),
            pose({ p: [84, 150], t: 128, a: { to: [126, 182], b: -1 }, A: { to: [122, 182], b: -1 }, l: { to: [104, 182] }, L: { to: [98, 182] } }),
            { ...PUSH_TOP, L: { to: [24, 178] }, FL: 20 },
            pose({ p: [84, 150], t: 128, a: { to: [126, 182], b: -1 }, A: { to: [122, 182], b: -1 }, l: { to: [104, 182] }, L: { to: [98, 182] } }),
            pose({ p: [98, 98], a: [176, 178], A: [174, 176], l: { to: [102, 166] }, L: { to: [98, 166] }, fl: 60 }),
        ],
        speed: 0.6,
    },
    high_knees: {
        frames: [
            pose({ p: [98, 112], a: [-30, 70], A: [30, 160], l: [92, 4], L: [-3, -3] }),
            pose({ p: [98, 112], a: [30, 160], A: [-30, 70], l: [3, 3], L: [92, 4] }),
        ],
        speed: 0.4,
    },
    jump_rope: {
        hold: { type: 'rope' },
        frames: [
            { p: [100, 108], t: 180, front: true, a: [24, 50], l: { to: [104, 176], b: -1 }, fl: 100, rope: 214 },
            { p: [100, 114], t: 180, front: true, a: [24, 50], l: { to: [104, 182], b: -1 }, fl: 100, rope: -24 },
        ],
        speed: 0.45,
    },
    box_jump: {
        props: [{ type: 'box', x: 120, y: 146, w: 56, h: 41 }],
        frames: [
            pose({ p: [72, 114], l: { to: [76, 182] }, L: { to: [70, 182] } }),
            pose({ p: [56, 142], t: 140, a: [-40, -40], A: [-44, -44], l: { to: [76, 182] }, L: { to: [70, 182] } }),
            pose({ p: [104, 92], t: 168, a: [150, 150], A: [146, 146], l: { to: [116, 140] }, L: { to: [110, 140] } }),
            pose({ p: [126, 112], t: 150, a: [60, 60], A: [56, 56], l: { to: [146, 146] }, L: { to: [140, 146] } }),
            pose({ p: [140, 79], l: { to: [146, 146] }, L: { to: [140, 146] } }),
            { ...pose({ p: [72, 114], l: { to: [76, 182] }, L: { to: [70, 182] } }), cut: true },
        ],
        speed: 0.8,
    },
    jump_squat: {
        frames: [
            pose({ p: [96, 115], l: { to: [104, 182] }, L: { to: [98, 182] } }),
            pose({ p: [76, 146], t: 140, a: [-30, -20], A: [-34, -24], l: { to: [104, 182] }, L: { to: [98, 182] } }),
            pose({ p: [98, 94], t: 180, a: [170, 175], A: [166, 170], l: { to: [104, 160] }, L: { to: [98, 160] }, fl: 60 }),
        ],
        speed: 0.7,
    },
};

/* ---------- Drawing ---------- */

function el(name, attrs = {}) {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
}

const line = (points) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

function staticProp(prop) {
    switch (prop.type) {
        case 'pad':
            return el('path', { class: 'fig-pad', d: line([prop.from, prop.to]) });
        case 'post':
            return el('path', { class: 'fig-post', d: line([prop.from, prop.to]), 'stroke-width': prop.w ?? 4 });
        case 'box':
            return el('rect', { class: 'fig-box', x: prop.x, y: prop.y, width: prop.w, height: prop.h, rx: 4 });
        case 'pulley':
            return el('circle', { class: 'fig-pulley', cx: prop.at[0], cy: prop.at[1], r: 5 });
        case 'roller':
            return el('circle', { class: 'fig-roller', cx: prop.at[0], cy: prop.at[1], r: 7 });
        default:
            return el('g');
    }
}

// What the hands hold, from the demo or else from the equipment.
function holdFor(demo, equipment) {
    if (demo.hold !== undefined) return demo.hold;
    if (equipment === 'barbell') return { type: 'plate', at: 'hand' };
    if (equipment === 'dumbbell') return { type: 'dumbbell', at: 'hands' };
    if (equipment === 'kettlebell') return { type: 'kettlebell', at: 'hand' };
    return null;
}

function heldShape(type) {
    const g = el('g', { class: `fig-held fig-${type}` });
    if (type === 'plate') {
        g.append(el('circle', { r: 16 }), el('circle', { r: 4, class: 'fig-hub' }));
    } else if (type === 'dumbbell') {
        g.append(el('circle', { r: 7.5 }), el('circle', { r: 2.5, class: 'fig-hub' }));
    } else if (type === 'kettlebell') {
        g.append(el('path', { d: 'M-6 2 Q0 -10 6 2', class: 'fig-handle' }), el('circle', { cy: 10, r: 9 }));
    } else if (type === 'handle' || type === 'bar') {
        const width = type === 'bar' ? 22 : 9;
        g.append(el('path', { d: `M${-width} 0 H${width}`, class: 'fig-handle' }));
    } else if (type === 'roller') {
        g.append(el('circle', { r: 7 }));
    } else if (type === 'platform') {
        g.append(el('path', { d: 'M0 -24 V24', class: 'fig-platform' }));
    }
    return g;
}

/**
 * Draw a demo into `container`. Returns a controller with play(), pause(),
 * setSpeed() and stop(). `animate: false` draws one still frame.
 */
export function drawDemo(container, key, { equipment, animate = true, label = '' } = {}) {
    const demo = DEMOS[key] ?? DEMOS.squat;
    const svg = el('svg', { viewBox: '0 0 200 200', class: 'fig', role: 'img', 'aria-label': label });
    svg.append(el('path', { class: 'fig-floor', d: `M8 ${FLOOR + 4} H192` }));
    for (const prop of demo.props ?? []) svg.append(staticProp(prop));

    const hold = holdFor(demo, equipment);
    const cable = demo.cable ? el('path', { class: 'fig-cable' }) : null;
    const rope = hold?.type === 'rope' ? el('path', { class: 'fig-rope' }) : null;
    // In the front view both sides are equally close, so they share a colour.
    const far = demo.frames[0].front ? 'fig-limb' : 'fig-limb is-far';
    const farLeg = el('path', { class: far });
    const farArm = el('path', { class: far });
    const farHeld = hold?.at === 'hands' ? heldShape(hold.type) : null;
    if (farHeld) farHeld.classList.add('is-far');
    const torso = el('path', { class: 'fig-torso' });
    const head = el('circle', { class: 'fig-head', r: SIZE.head });
    const nearLeg = el('path', { class: 'fig-limb' });
    const nearArm = el('path', { class: 'fig-limb' });
    const held = hold && hold.type !== 'rope' ? heldShape(hold.type) : null;

    if (rope) svg.append(rope);
    svg.append(...[farLeg, farArm, farHeld, torso, head, nearLeg].filter(Boolean));
    // A barbell plate sits behind the near arm; everything else is in front.
    if (held && hold.type === 'plate') svg.append(held, nearArm);
    else svg.append(...[nearArm, held].filter(Boolean));
    if (cable) svg.append(cable);
    container.replaceChildren(svg);

    const place = (node, point, angle = 0) => node?.setAttribute('transform', `translate(${point[0].toFixed(1)} ${point[1].toFixed(1)}) rotate(${angle})`);

    function render(pose) {
        const j = solve(pose);
        farLeg.setAttribute('d', line([j.farHip, j.knee2, j.ankle2, j.toe2]));
        farArm.setAttribute('d', line([j.farShoulder, j.elbow2, j.hand2]));
        torso.setAttribute('d', line([j.hip, j.shoulder]));
        head.setAttribute('cx', j.head[0].toFixed(1));
        head.setAttribute('cy', j.head[1].toFixed(1));
        nearLeg.setAttribute('d', line([j.nearHip, j.knee, j.ankle, j.toe]));
        nearArm.setAttribute('d', line([j.nearShoulder, j.elbow, j.hand]));
        if (held) {
            const at = { hand: j.hand, hands: j.hand, shoulder: add(j.shoulder, dir(pose.t - 90, 4)), hip: add(j.hip, [0, -12]), ankle: j.ankle }[hold.at];
            place(held, at, hold.type === 'platform' ? -(hold.angle ?? 0) + 90 : 0);
        }
        if (farHeld) place(farHeld, j.hand2);
        if (cable) cable.setAttribute('d', line([demo.cable.from, demo.cable.to === 'ankle' ? j.ankle : j.hand]));
        if (rope) {
            const mid = [(j.hand[0] + j.hand2[0]) / 2, j.rope];
            rope.setAttribute('d', `M${j.hand2[0].toFixed(1)} ${j.hand2[1].toFixed(1)} Q${mid[0]} ${mid[1].toFixed(1)} ${j.hand[0].toFixed(1)} ${j.hand[1].toFixed(1)}`);
        }
    }

    const frames = demo.frames;
    const step = 900 * (demo.speed ?? 1);
    const pause = demo.hold_ms ?? 120;
    let speed = 1;
    let elapsed = 0;
    let last = null;
    let raf = null;

    function frameAt(time) {
        const cycle = step + pause;
        const index = Math.floor(time / cycle) % frames.length;
        const within = time % cycle;
        const next = frames[(index + 1) % frames.length];
        if (next.cut && within > 0) return next;
        const k = Math.max(0, within - pause) / step;
        const eased = 0.5 - Math.cos(Math.PI * k) / 2;
        return mix(frames[index], next, eased);
    }

    function tick(now) {
        if (last !== null) elapsed += (now - last) * speed;
        last = now;
        render(frameAt(elapsed));
        raf = requestAnimationFrame(tick);
    }

    const controller = {
        playing: false,
        play() {
            if (raf) return;
            last = null;
            controller.playing = true;
            raf = requestAnimationFrame(tick);
        },
        pause() {
            cancelAnimationFrame(raf);
            raf = null;
            controller.playing = false;
        },
        setSpeed(value) {
            speed = value;
        },
        // Show the still frame that explains the exercise best: the hardest point.
        still() {
            controller.pause();
            render(frames.length > 2 ? frames[1] : mix(frames[0], frames[1] ?? frames[0], 0.85));
        },
    };

    controller.still();
    if (animate) controller.play();
    return controller;
}
