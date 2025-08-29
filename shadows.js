/*
    I copied most of this from the DistanceField.
*/

const INFINITY_VALUE = 256;
const COLUMN_SIZE = 512; // Size could be adjusted

function hash(x, z) {
    //const signY = (x | (256 >> 1) | (z >> 2)) & 0xE00;
    const sign = (x | (z >> 1)) & 0xC00;
    //const valueY = ((Math.abs(x) >> 0) & 0xFFF) << 12 | ((Math.abs(z) >> 0) & 0xFFF);
    const value = (Math.abs(x) & 0xFFF) << 12 | (Math.abs(z) & 0xFFF);

    return sign | value;
    /*
    const sign = (x | (z >> 1)) & 0xC00;
    const value = ((Math.abs(x) & 0xFFF) << 6 | (Math.abs(z) & 0xFFF)) & 0xFFFFFF;

    return sign | value;
    */
}

function index(y) {
    return y | 0;
}

function lerp(x1, x2, t) {
    return x1 + ((x2 - x1) * t);
}

function clamp(x, min, max) {
    return Math.min(Math.max(x, min), max);
}

class ShadowMap {
    constructor() {
        this.chunks = new Map();
    }
    
    get(x, y, z) {
        const chunk = this.chunks.get(hash(x, z));
        const chunkX = this.chunks.get(hash(x+1, z));
        const chunkZ = this.chunks.get(hash(x, z+1));
        const chunkXZ = this.chunks.get(hash(x+1, z+1));

        if (!chunk) return 0;
        if (!chunkX) return 0;
        if (!chunkZ) return 0;
        if (!chunkXZ) return 0;

        const i = index(y);
        const iY = index(y+1);

        const tX = x % 1;
        const tY = y % 1;
        const tZ = z % 1;
        
        const vX = lerp(chunk[i], chunkX[i], tX);
        const vXZ = lerp(chunkZ[i], chunkXZ[i], tX);
        const vXY = lerp(chunk[iY], chunkX[iY], tX);
        const vXYZ = lerp(chunkZ[iY], chunkXZ[iY], tX);
        
        const lightUp = lerp(vX, vXZ, tZ);
        const lightDown = lerp(vXY, vXYZ, tZ);

        const value = lerp(lightUp, lightDown, tY);

        return clamp(value, 0, 1);
    }

    getNearest(x, y, z) {
        const key = hash(x, z);
        const chunk = this.chunks.get(key);

        if (!chunk) return 0;

        const i = index(y);

        return chunk[i];
    }

    set(x, y, z, value=0) {
        const key = hash(x, z);

        let chunk = this.chunks.get(key);

        if (!chunk) {
            chunk = new Float32Array(COLUMN_SIZE).fill(INFINITY_VALUE);
            
            this.chunks.set(key, chunk);
        }
        
        const i = index(y);

        chunk[i] = value;
    }
}

module.exports = { ShadowMap };