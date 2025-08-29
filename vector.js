function lerp (x1, x2, t) {
    return x1 + ((x2-x1) * t);
}

function lerpVectors([r1, g1, b1], [r2, b2, g2], t=0.5) {
    return [
        lerp(r1, r2, t),
        lerp(g1, g2, t),
        lerp(b1, b2, t),
    ];
}

function add(vec1, vec2) {
    return [
        vec1[0] + vec2[0],
        vec1[1] + vec2[1],
        vec1[2] + vec2[2],
    ];
}

function addify(vec1, vec2) {
    vec1[0] += vec2[0];
    vec1[1] += vec2[1];
    vec1[2] += vec2[2];
}

function scale(vec, x) {
    return [
        vec[0] * x,
        vec[1] * x,
        vec[2] * x,
    ];
}

function scalify(vec, x) {
    vec[0] *= x;
    vec[1] *= x;
    vec[2] *= x;
}

function mult(vec1, vec2) {
    return [
        vec1[0] * vec2[0],
        vec1[1] * vec2[1],
        vec1[2] * vec2[2],
    ];
}

function multify(vec1, vec2) {
    vec1[0] *= vec2[0];
    vec1[1] *= vec2[1];
    vec1[2] *= vec2[2];
}

function dot(vec1, vec2) {
    return (vec1[0] * vec2[0]) + (vec1[1] * vec2[1]) + (vec1[2] * vec2[2]);
}

function invert(vec) {
    return [
        -vec[0],
        -vec[1],
        -vec[2],
    ];
}

function invertify(vec) {
    vec[0] = -vec[0];
    vec[1] = -vec[1];
    vec[2] = -vec[2];
}

function getLength(vec) {
    return Math.hypot(...vec);
}

function normalize(vec) {
    return scale(vec, 1 / getLength(vec));
}

function normalify(vec) {
    const size = 1 / getLength(vec);

    vec[0] *= size;
    vec[1] *= size;
    vec[2] *= size;
}

module.exports = {
    lerp,
    lerpVectors,
    add,
    addify,
    scale,
    scalify,
    mult,
    multify,
    dot,
    invert,
    invertify,
    getLength,
    normalize,
    normalify,
};