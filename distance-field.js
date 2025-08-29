const INFINITY_VALUE = 256;
const CHUNK_VOLUME = Math.pow(16, 3);
const COLUMN_SIZE = 512;

/*
    You might notice this code is a little all over the place.
    FastDistanceField is supposed to be a drop in replacement for DistanceField.
    It currently works for most things but I haven't implemented a good bake method yet.
*/

// computes the distance from an axis aligned unit voxel to a point
function distance(x1, y1, z1, x2, y2, z2) {
    const dX = x2 - Math.max(x1-1, 0);
    const dY = y2 - Math.max(y1-1, 0);
    const dZ = z2 - Math.max(z1-1, 0);

    return Math.hypot(dX, dY, dZ);
}

function hash(x, y, z) {
    const sign = (x | (y >> 1) | (z >> 2)) & 0xE00;
    const value = ((Math.abs(x) >> 4) & 0xFFF) << 12 | ((Math.abs(y) >> 4) & 0xFFF) << 6 | ((Math.abs(z) >> 4) & 0xFFF);

    return sign | value;
}

function hash2D(x, z) {
    const signY = (x | (256 >> 1) | (z >> 2)) & 0xE00;
    //const signY = (x | (z >> 1)) & 0xC00; // <-- TRYME!!!
    const valueY = (Math.abs(x) & 0xFFF) << 12 | (Math.abs(z) & 0xFFF);

    return signY | valueY;
}

function index(y) {
    return y | 0;
}

class DistanceField {
    constructor() {
        this.chunks = new Map();
    }

    get(x, y, z) {
        const key = hash(x, y, z);

        const chunk = this.chunks.get(key);

        if (!chunk) return INFINITY_VALUE;

        x = Math.floor(x);
        y = Math.floor(y);
        z = Math.floor(z);
        x = (Math.abs(x) & 15);
        y = (Math.abs(y) & 15);
        z = (Math.abs(z) & 15);

        return chunk[(((x << 4) + y) << 4) + z];
    }

    set(x, y, z, filled=0) {
        const key = hash(x, y, z);

        let chunk = this.chunks.get(key);

        if (!chunk) {
            chunk = new Int16Array(CHUNK_VOLUME).fill(INFINITY_VALUE);

            this.chunks.set(key, chunk);
        }

        x = Math.floor(x);
        y = Math.floor(y);
        z = Math.floor(z);
        x = Math.abs(x) % 16;
        y = Math.abs(y) % 16;
        z = Math.abs(z) % 16;
        
        chunk[(((x << 4) + y) << 4) + z] = filled;
    }

    bake() {
        const allChunks = this.chunks.values();

        for (let chunk of allChunks) {

            // Calculate distances using jump flooding
            const steps = [8, 4, 2, 1]; // Power of 2 steps
            
            for (let step of steps) {
                for (let x = 0; x < 16; x++) {
                    for (let y = 0; y < 16; y++) {
                        for (let z = 0; z < 16; z++) {
                            let i = (((x << 4) + y) << 4) + z;
                            let minDist = chunk[i];
                            
                            // If this is already a filled point, skip
                            if (minDist === 0) continue;

                            // Check neighboring points at current step size
                            for (let dx = -step; dx <= step; dx += step) {
                                for (let dy = -step; dy <= step; dy += step) {
                                    for (let dz = -step; dz <= step; dz += step) {
                                        const nx = x + dx;
                                        const ny = y + dy;
                                        const nz = z + dz;
                                        
                                        if (nx >= 0 && nx < 16 && ny >= 0 && ny < 16 && nz >= 0 && nz < 16) {
                                            
                                            let j = (((nx << 4) + ny) << 4) + nz;

                                            const neighborDist = chunk[j];

                                            if (neighborDist !== INFINITY_VALUE) {
                                                const dist = distance(x, y, z, nx, ny, nz);
                                                minDist = Math.min(minDist, dist);
                                            }
                                        }
                                    }
                                }
                            }

                            chunk[i] = minDist;
                        }
                    }
                }
            }
        }
    }

    /*bake() {
        const allChunks = this.chunks.values();
        const storage = new Map();

        // Calculate distances using jump flooding
        const steps = [8, 4, 2, 1]; // Power of 2 steps
        const origin = [280, 78, 472];
        const centerPos = [0, 0, 0];
        const pos = [0, 0, 0];

        for (let x = -16; x < 16; x++) {
            for (let y = -16; y < 16; y++) {
                for (let z = -16; z < 16; z++) {

                    const currentPosition = [
                        origin[0] + x,
                        origin[1] + y,
                        origin[2] + z,
                    ];

                    let center = hash(...currentPosition);

                    if (this.get(...currentPosition) === 0) {
                        storage.set(center, currentPosition);
                    }
                }
            }
        }
        
        for (let step of steps) {
            for (let x = -16; x < 16; x++) {
                for (let y = -16; y < 16; y++) {
                    for (let z = -16; z < 16; z++) {

                        centerPos[0] = origin[0] + x;
                        centerPos[1] = origin[1] + y;
                        centerPos[2] = origin[2] + z;

                        let bestPosition = [origin[0], origin[1], origin[2]];
                        let bestDistance = INFINITY_VALUE;

                        for (let dX = -step; dX <= step; dX += step) {
                            for (let dY = -step; dY <= step; dY += step) {
                                for (let dZ = -step; dZ <= step; dZ += step) {
                                    pos[0] = centerPos[0] + dX;
                                    pos[1] = centerPos[1] + dY;
                                    pos[2] = centerPos[2] + dZ;

                                    let key = hash(...pos);
                                    let storedPos = storage.get(key);

                                    if (!storedPos) continue;

                                    let dis = distance(...centerPos, ...storedPos);

                                    if (dis < bestDistance) {
                                        bestPosition[0] = storedPos[0];
                                        bestPosition[1] = storedPos[1];
                                        bestPosition[2] = storedPos[2];
                                    }
                                }
                            }
                        }

                        let center = hash(...centerPos);

                        storage.set(center, bestPosition);
                        this.set(...centerPos, bestDistance);
                    }
                }
            }
        }
    }*/
}

class FastDistanceField {
    constructor() {
        this.chunks = new Map();
        this.chunkPositions = new Map();
    }

    get(x, y, z) {
        const key = hash2D(x, z);
        const chunk = this.chunks.get(key);

        if (!chunk) return INFINITY_VALUE;

        const i = index(y);

        //return chunk[i];
        return chunk[i] | 0;
    }

    // Alternatively there should also be a setColumn method to avoid hashing multiple times
    set(x, y, z, filled=0) {
        const key = hash2D(x, z);

        let chunk = this.chunks.get(key);

        if (!chunk) {
            //chunk = new Int16Array(COLUMN_SIZE).fill(INFINITY_VALUE);
            chunk = new Float32Array(COLUMN_SIZE).fill(INFINITY_VALUE);

            this.chunks.set(key, chunk);
            this.chunkPositions.set(key, [x, z]);
        }

        const i = index(y);
        
        chunk[i] = filled;
    }

    bake() {
        const allKeys = this.chunks.keys();
        const steps = [32, 16, 8, 4, 2, 1]; // Power of 2 steps

        // Calculate distances using jump flooding
        for (let key of allKeys) {
            const chunk = this.chunks.get(key);
            const [wx, wz] = this.chunkPositions.get(key);
            
            // Assume COLUMN_SIZE = 512 and this.chunkPositions maps chunkKey -> [worldX, worldZ]
            for (let step of steps) {
                for (let y = 0; y < COLUMN_SIZE; y++) {
                    const i = index(y);
                    let minDist = chunk[i];
                    if (minDist === 0) continue;  // already filled

                    for (let dx = -step; dx <= step; dx += step) {
                        for (let dz = -step; dz <= step; dz += step) {
                            const neighbourKey = hash2D(wx + dx, wz + dz);
                            const neighbourChunk = this.chunks.get(neighbourKey);
                            if (!neighbourChunk) continue;

                            // get the neighbour column’s world X/Z
                            const [nwx, nwz] = this.chunkPositions.get(neighbourKey);

                            for (let dy = -step; dy <= step; dy += step) {
                                const ny = y + dy;
                                if (ny < 0 || ny >= COLUMN_SIZE) continue;
                                
                                const neighbourDist = neighbourChunk[index(ny)];
                                
                                if (neighbourDist === INFINITY_VALUE) continue;

                                // call distance with full world coords:
                                //   (wx, y, wz)       = current voxel world position
                                //   (nwx, ny, nwz)    = neighbour voxel world position
                                const d = distance(wx, y, wz, nwx, ny, nwz);
                                minDist = Math.min(minDist, d);
                            }
                        }
                    }

                    chunk[i] = minDist;
                }
            }
        }
    }
}

module.exports = { DistanceField, FastDistanceField };