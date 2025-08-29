const { pitchYawToDirection, traceRay } = require('./ray-fast.js');
const intersect = require('./intersect.js');
const models = require('./models.js');
const vec3 = require('vec3');
const { DistanceField, FastDistanceField } = require('./distance-field.js');
const { ShadowMap } = require('./shadows.js');
const { availableParallelism } = require("os");

const Worker = require("worker_threads").Worker;

const THREAD_COUNT = availableParallelism();

const {
    lerp,
    lerpVectors,
    add,
    scale,
    mult,
    dot,
    invert,
    getLength,
    normalize,
} = require('./vector.js');

const PNG = require('pngjs').PNG;
const fs = require('fs');
const { resolve, join } = require('path');

let blocksByID = [];
let materialsByID = [];

const sunDirection = normalize([0.5, 1, 0.5]);
let skyColor = [126/255, 171/255, 255/255];
const horizonColor = [181/255, 209/255, 255/255];

let globby = fs.globSync(join(__dirname, "./models/*.json"));

//globby = globby.map(string=>string.replace("models\\", "").replace(".json", ""))
const modelList = ["azure_bluet", "brown_mushroom", "cactus", "cake", "cornflower", "fern", "lectern", "lily_of_the_valley", "oxeye_daisy", "short_grass"];
//const modelList = globby.map(string=>string.replace(join(__dirname, "./models/"), "").replace(".json", ""));

for (let modelName of modelList) {
    models.get(modelName);
}

const blockField = new FastDistanceField(); // the name "distance field" doesn't really fit in this context but it works
const distanceField = new DistanceField();
//const distanceField = new FastDistanceField();
const shadows = new ShadowMap();

function readTextureFromFile(path) {
    let data = fs.readFileSync(join(__dirname, path));
    let image = PNG.sync.read(data, { filterType: -1 });
    //let image = PNG.sync.read(data);
    return image.data;
}

function textureFromRGB(rgb) {
    let data = new Uint8Array(16 * 16 * 4);

    for (let i = 0; i < data.length; i += 4) {
        data[i] = rgb[0];
        data[i+1] = rgb[1];
        data[i+2] = rgb[2];
        data[i+3] = 255;
    }

    return data;
}

function createImage(w, h) {
    return {
        width: w,
        height: h,
        depth: 8,
        interlace: false,
        palette: false,
        color: true,
        alpha: true,
        bpp: 4,
        colorType: 6,
        data: Buffer.alloc(w * h * 4),
        gamma: 0.45455,
    };
}

//const imageData = createImage(width, height);

const WHITE_TEXTURE = Buffer.alloc(16 * 16 * 4, 1);
const BLACK_TEXTURE = Buffer.alloc(16 * 16 * 4, 0);

const FULL_MASK = Buffer.alloc(16 * 16 * 4, 1);
const EMPTY_MASK = Buffer.alloc(16 * 16 * 4, 0);

const BLOCK_COLORS = {};

function scaleBuffer(buff, scaler=1) {
    const resultBuffer = new Float32Array(buff.length);

    buff.forEach((value, index)=>{
        resultBuffer[index] = value / scaler;
    });

    return resultBuffer;
}

function colourizeTexture(buffer, colour) {
    for (let i = 0; i < buffer.length; i += 4) {
        buffer[i] *= colour[0];
        buffer[i+1] *= colour[1];
        buffer[i+2] *= colour[2];
    }

    return buffer; // not necessary
}

function overlayTexture(source, overlay) {
    for (let i = 0; i < source.length; i += 4) {
        const weight = overlay[i+3] / 255;

        source[i] = lerp(source[i], overlay[i], weight);
        source[i+1] = lerp(source[i+1], overlay[i+1], weight);
        source[i+2] = lerp(source[i+2], overlay[i+2], weight);
    }
}

const BLOCK_MATERIALS = {
    air: {
        albedo: BLACK_TEXTURE,
        emissionColor: BLACK_TEXTURE,
        emissionStrength: EMPTY_MASK,
        emissionMultiplier: 0,
    },
    azure_bluet: {
        albedo: readTextureFromFile("./textures/azure_bluet.png"),
        emissionColor: BLACK_TEXTURE,
        emissionStrength: EMPTY_MASK,
        emissionMultiplier: 0,
    },
    brown_mushroom: {
        albedo: readTextureFromFile("./textures/brown_mushroom.png"),
        emissionColor: BLACK_TEXTURE,
        emissionStrength: EMPTY_MASK,
        emissionMultiplier: 0,
    },
    oxeye_daisy: {
        albedo: readTextureFromFile("./textures/oxeye_daisy.png"),
        emissionColor: BLACK_TEXTURE,
        emissionStrength: EMPTY_MASK,
        emissionMultiplier: 0,
    },
    cornflower: {
        albedo: readTextureFromFile("./textures/cornflower.png"),
        emissionColor: BLACK_TEXTURE,
        emissionStrength: EMPTY_MASK,
        emissionMultiplier: 0,
    },
    fern: {
        albedo: readTextureFromFile("./textures/fern.png"),
        emissionColor: BLACK_TEXTURE,
        emissionStrength: EMPTY_MASK,
        emissionMultiplier: 0,
    },
    cake: {
        albedo: readTextureFromFile("./textures/cake_top.png"),

        albedoTop: readTextureFromFile("./textures/cake_top.png"),
        albedoFront: readTextureFromFile("./textures/cake_side.png"),
        albedoSide: readTextureFromFile("./textures/cake_side.png"),
        albedoBack: readTextureFromFile("./textures/cake_side.png"),
        albedoBottom: readTextureFromFile("./textures/cake_bottom.png"),

        emissionColor: BLACK_TEXTURE,
        emissionStrength: EMPTY_MASK,
        emissionMultiplier: 0,
    },
    crafting_table: {
        albedo: readTextureFromFile("./textures/crafting_table_side.png"),

        albedoTop: readTextureFromFile("./textures/crafting_table_top.png"),
        albedoFront: readTextureFromFile("./textures/crafting_table_front.png"),
        albedoSide: readTextureFromFile("./textures/crafting_table_side.png"),
        albedoBack: readTextureFromFile("./textures/crafting_table_side.png"),
        albedoBottom: readTextureFromFile("./textures/oak_planks.png"),

        emissionColor: BLACK_TEXTURE,
        emissionStrength: EMPTY_MASK,
        emissionMultiplier: 0,
    },
    glass: {
        albedo: readTextureFromFile("./textures/glass.png"),
        emissionColor: BLACK_TEXTURE,
        emissionStrength: EMPTY_MASK,
        emissionMultiplier: 0,
    },
    glowstone: {
        albedo: readTextureFromFile("./textures/glowstone.png"),
        emissionColor: readTextureFromFile("./textures/glowstone.png"),
        emissionStrength: readTextureFromFile("./emission/glowstone.png"),
        emissionMultiplier: 8,
    },
    jack_o_lantern: {
        albedo: readTextureFromFile("./textures/jack_o_lantern.png"),

        albedoTop: readTextureFromFile("./textures/pumpkin_top.png"),
        albedoFront: readTextureFromFile("./textures/jack_o_lantern.png"),
        albedoSide: readTextureFromFile("./textures/pumpkin_side.png"),
        albedoBack: readTextureFromFile("./textures/pumpkin_side.png"),
        albedoBottom: readTextureFromFile("./textures/pumpkin_top.png"),

        emissionColor: readTextureFromFile("./textures/jack_o_lantern.png"),
        emissionStrength: readTextureFromFile("./emission/jack_o_lantern.png"),
        emissionMultiplier: 1,// 5? // 10?
    },
    redstone_block: {
        albedo: readTextureFromFile("./textures/redstone_block.png"),
        emissionColor: textureFromRGB([255, 0, 255]),//readTextureFromFile("./textures/redstone_block.png"),
        emissionStrength: readTextureFromFile("./emission/redstone_block.png"),
        emissionMultiplier: 4,
    },
    sea_lantern: {
        albedo: readTextureFromFile("./textures/sea_lantern.png"),
        emissionColor: textureFromRGB([64, 255, 255]),//readTextureFromFile("./textures/sea_lantern.png"),
        emissionStrength: readTextureFromFile("./emission/sea_lantern.png"),
        emissionMultiplier: 4,
    },
    grass_block: {
        albedo: readTextureFromFile("./textures/grass_block_top.png"),
        emissionColor: BLACK_TEXTURE,
        emissionStrength: EMPTY_MASK,
        emissionMultiplier: 0,
    },
    oak_leaves: {
        albedo: readTextureFromFile("./textures/oak_leaves.png"),
        emissionColor: BLACK_TEXTURE,
        emissionStrength: EMPTY_MASK,
        emissionMultiplier: 0,
    },
    podzol: {
        albedo: readTextureFromFile("./textures/podzol_top.png"),
        emissionColor: BLACK_TEXTURE,
        emissionStrength: EMPTY_MASK,
        emissionMultiplier: 0,
    },
    short_grass: {
        albedo: readTextureFromFile("./textures/grass.png"),
        emissionColor: BLACK_TEXTURE,
        emissionStrength: EMPTY_MASK,
        emissionMultiplier: 0,
    },
    snow: {
        albedo: readTextureFromFile("./textures/snow.png"),
        emissionColor: BLACK_TEXTURE,
        emissionStrength: EMPTY_MASK,
        emissionMultiplier: 0,
    },
    spruce_leaves: {
        albedo: readTextureFromFile("./textures/spruce_leaves.png"),
        emissionColor: BLACK_TEXTURE,
        emissionStrength: EMPTY_MASK,
        emissionMultiplier: 0,
    },
    spruce_log: {
        albedo: readTextureFromFile("./textures/spruce_log.png"),
        emissionColor: BLACK_TEXTURE,
        emissionStrength: EMPTY_MASK,
        emissionMultiplier: 0,
    },
    water: {
        albedo: readTextureFromFile("./textures/water_temporary.png"),
        emissionColor: BLACK_TEXTURE,
        emissionStrength: EMPTY_MASK,
        emissionMultiplier: 0,
    },
};

// TEMP: manually load grass material
BLOCK_MATERIALS.grass_block.up = {
    albedo: readTextureFromFile(`./textures/grass_block_top.png`),
    emissionColor: BLACK_TEXTURE,
    emissionStrength: EMPTY_MASK,
    emissionMultiplier: 0,
};

BLOCK_MATERIALS.grass_block.down = {
    albedo: readTextureFromFile(`./textures/dirt.png`),
    emissionColor: BLACK_TEXTURE,
    emissionStrength: EMPTY_MASK,
    emissionMultiplier: 0,
};

BLOCK_MATERIALS.grass_block.north = {
    albedo: readTextureFromFile(`./textures/grass_block_side.png`),
    emissionColor: BLACK_TEXTURE,
    emissionStrength: EMPTY_MASK,
    emissionMultiplier: 0,
};

const foliageColour = [37/255, 176/255, 30/255];

let grassOverlay = readTextureFromFile(`./textures/grass_block_side_overlay.png`);
colourizeTexture(grassOverlay, foliageColour);
overlayTexture(BLOCK_MATERIALS.grass_block.north.albedo, grassOverlay);

BLOCK_MATERIALS.grass_block.up.albedo = scaleBuffer(BLOCK_MATERIALS.grass_block.up.albedo, 255);
BLOCK_MATERIALS.grass_block.up.albedo = BLOCK_MATERIALS.grass_block.up.albedo.map(v=>Math.pow(v, 2.2));
BLOCK_MATERIALS.grass_block.down.albedo = scaleBuffer(BLOCK_MATERIALS.grass_block.down.albedo, 255);
BLOCK_MATERIALS.grass_block.down.albedo = BLOCK_MATERIALS.grass_block.down.albedo.map(v=>Math.pow(v, 2.2));
BLOCK_MATERIALS.grass_block.north.albedo = scaleBuffer(BLOCK_MATERIALS.grass_block.north.albedo, 255);
BLOCK_MATERIALS.grass_block.north.albedo = BLOCK_MATERIALS.grass_block.north.albedo.map(v=>Math.pow(v, 2.2));
BLOCK_MATERIALS.grass_block.east = BLOCK_MATERIALS.grass_block.north;
BLOCK_MATERIALS.grass_block.south = BLOCK_MATERIALS.grass_block.north;
BLOCK_MATERIALS.grass_block.west = BLOCK_MATERIALS.grass_block.north;

colourizeTexture(BLOCK_MATERIALS.short_grass.albedo, foliageColour);
colourizeTexture(BLOCK_MATERIALS.fern.albedo, foliageColour);
colourizeTexture(BLOCK_MATERIALS.grass_block.up.albedo, foliageColour);

let blockNames = fs.readFileSync(join(__dirname, "block-names.txt"), 'utf8');

for (let name of blockNames.split('\r\n')) {
    if (BLOCK_MATERIALS[name]) continue;
    
    const material = {};

    material.north = {
        albedo: readTextureFromFile(`./textures/${name}.png`),
        emissionColor: BLACK_TEXTURE,
        emissionStrength: EMPTY_MASK,
        emissionMultiplier: 0,
    };

    material.north.albedo = scaleBuffer(material.north.albedo, 255);
    material.north.albedo = material.north.albedo.map(v=>Math.pow(v, 2.2))

    material.north.emissionColor = scaleBuffer(material.north.albedo, 255);
    material.north.emissionColor = material.north.albedo.map(v=>Math.pow(v, 2.2));

    material.east = material.north;
    material.south = material.north;
    material.west = material.north;
    material.up = material.north;
    material.down = material.north;

    BLOCK_MATERIALS[name] = material;
}

colourizeTexture(BLOCK_MATERIALS.birch_leaves.north.albedo, foliageColour);

let block_color_data = fs.readFileSync(join(__dirname, "block-colors.txt"), 'utf8');

for (line of block_color_data.split('\n')) {
    let [block, color] = line.split(' : ');
    let [r, g, b] = color.split(' ').map(parseFloat);

    BLOCK_COLORS[block] = linearRGB([r / 255, g / 255, b / 255]);
    
    if (!BLOCK_MATERIALS[block]) {
        BLOCK_MATERIALS[block] = {
            albedo: readTextureFromFile(`./textures/${block}.png`),
            emissionColor: BLACK_TEXTURE,
            emissionStrength: EMPTY_MASK,
            emissionMultiplier: 0,
        };
    }
}

for (let key of Object.keys(BLOCK_MATERIALS)) {
    if (!BLOCK_MATERIALS[key].albedo) continue;

    BLOCK_MATERIALS[key].albedo = scaleBuffer(BLOCK_MATERIALS[key].albedo, 255);
    BLOCK_MATERIALS[key].albedo = BLOCK_MATERIALS[key].albedo.map(v=>Math.pow(v, 2.2));

    BLOCK_MATERIALS[key].emissionColor = scaleBuffer(BLOCK_MATERIALS[key].emissionColor, 255);
    BLOCK_MATERIALS[key].emissionColor = BLOCK_MATERIALS[key].emissionColor.map(v=>Math.pow(v, 2.2));
}

delete block_color_data;

function linearRGB([r, g, b]) {
    return [
        Math.pow(r, 2.2),
        Math.pow(g, 2.2),
        Math.pow(b, 2.2),
    ];
}

function linearifyRGB(rgb) {
    rgb[0] = Math.pow(rgb[0], 2.2);
    rgb[1] = Math.pow(rgb[1], 2.2);
    rgb[2] = Math.pow(rgb[2], 2.2);
}

function degreesToRadians(x) {
    return (x / 360) * Math.PI * 2;
}

const workers = [];
let piecesCollected = 0;
let resolveRender;
let resolveLighting;

function createWorker() {
    const workerScript = join(__dirname, "./worker.js");
    //const worker = new Worker("./worker.js");
    const worker = new Worker(workerScript);
    
    worker.on("message", (message)=>{
        //console.log("Server recieved message:", message);

        if (message.type === "image-data") {
            //console.log("Recieved image data.");

            worker.image = message.data; // maybe this should be stored somewhere else
            piecesCollected++;

            //console.log("Pieces:", piecesCollected, "/", workers.length);

            if (piecesCollected === workers.length) worker.camera.constructImage();
        }

        if (message.type === "load-lighting") {
            console.log("Lighting chunks recieved.");

            for (let [key, value] of message.chunks.entries()) {
                shadows.chunks.set(key, value);
            }

            resolveLighting();
        }
    });

    workers.push(worker);

    return worker;
}

for (let i = 0; i < THREAD_COUNT; i++) {
    createWorker();
}

class Camera {
	constructor(bot) {
		this.width = 128;
		this.height = 128;

		this.bot = bot;
        this.position = bot.entity.position;
        this.offset = [0, 1.8, 0];

		this.fov = 70;
		this.exposure = 16;
		this.maxBounces = 3;
		this.samplesPerPixel = 8;
		this.renderDistance = 128;

        this.filename = "render.png";

        for (let id of Object.keys(bot.registry.blocks)) {
            let intID = parseInt(id);
            let blockName = bot.registry.blocks[id].name;

            blocksByID[intID] = blockName;
            materialsByID[intID] = BLOCK_MATERIALS[blockName];
        }

        for (let worker of workers) {
            worker.camera = this;

            worker.postMessage({
                type: "load-materials",
                materials: BLOCK_MATERIALS,
                colors: BLOCK_COLORS,
                blockIDs: blocksByID,
            });

            worker.postMessage({
                type: "load-models",
                models: models.cache,
            });
        }
	}

    move(stepSize) { // TODO: add x, y, z axises (with respect to camera rotation)
        let direction = pitchYawToDirection(this.bot.entity.pitch, this.bot.entity.yaw);

        direction = scale(direction, stepSize);

        this.offset = add(this.offset, direction);
    }

    moveToEntity(entity) {
        const pos = entity.position;

        this.position = pos;
        //this.offset = [pos.x, pos.y, pos.z];
    }

    async resize(width, height) {
        this.width = width;
        this.height = height;

        for (let worker of workers) {
            worker.postMessage({
                type: "update-camera",
                width,
                height: Math.round(height / workers.length),
            });
        }
    }

    updateCameraProperties() {
        for (let worker of workers) {
            worker.postMessage({
                type: "update-camera",
                samplesPerPixel: this.samplesPerPixel,
                renderDistance: this.renderDistance,
                maxBounces: this.maxBounces,
                exposure: this.exposure,
                fov: this.fov,
            });
        }
    }

    constructImage() {
        piecesCollected = 0;

        //const imageData = createImage(128, 128);
        const imageData = createImage(this.width, this.height);

        imageData.data = Buffer.concat(workers.map(w=>w.image));
        
        const pngBuffer = PNG.sync.write(imageData);
        fs.writeFileSync(this.filename, pngBuffer);
        
        resolveRender();
    }

    async render(filename) {
        const width = this.width;
		const height = this.height;
		const bot = this.bot;
		const fov = degreesToRadians(this.fov);

        //this.updateCameraProperties();

        if (filename) this.filename = filename;
	
		const ratio = height / width;

		const startPitch = bot.entity.pitch - ((fov * ratio) / 2);
		const endPitch = bot.entity.pitch + ((fov * ratio) / 2);

        const botPos = this.position.offset(...this.offset);
		const rayOrigin = [botPos.x, botPos.y, botPos.z];
        
        for (let i in workers) {
            workers[i].postMessage({
                type: "render",
                pitch: lerp(endPitch, startPitch, (i / workers.length)),
                yaw: bot.entity.yaw,
                origin: rayOrigin,

                samplesPerPixel: this.samplesPerPixel,
                renderDistance: this.renderDistance,
                maxBounces: this.maxBounces,
                exposure: this.exposure,
                fov: this.fov,
            });
        }

        return new Promise((resolve, reject)=>{
            resolveRender = resolve;
        });
    }

    async fastRender(filename) {
        const width = this.width;
		const height = this.height;
		const bot = this.bot;
		const fov = degreesToRadians(this.fov);

        if (filename) this.filename = filename;
	
		const ratio = height / width;

		const startPitch = bot.entity.pitch - ((fov * ratio) / 2);
		const endPitch = bot.entity.pitch + ((fov * ratio) / 2);

        const botPos = bot.entity.position.offset(...this.offset);//this.position.offset(...this.offset);
		const rayOrigin = [botPos.x, botPos.y, botPos.z];
        
        for (let i in workers) {
            workers[i].postMessage({
                type: "fast-render",
                pitch: lerp(endPitch, startPitch, (i / workers.length)),
                yaw: bot.entity.yaw,
                origin: rayOrigin,
            });
        }

        return new Promise((resolve, reject)=>{
            resolveRender = resolve;
        });
    }

    //async scan(startX, startY, startZ, width, height, depth) {
    async scan(width, height, depth) {
        const bot = this.bot;
        const pos = bot.entity.position.clone();

        const startX = Math.floor(pos.x - (width / 2)); 
        const startY = Math.floor(pos.y - (height / 2));
        const startZ = Math.floor(pos.z - (depth / 2));
        const endX = startX + width;
        const endY = startY + height;
        const endZ = startZ + depth;

        //const vec = vec3(0, 0, 0);

        for (let x = startX; x < endX; x++) {
            for (let y = startY; y < endY; y++) {
                for (let z = startZ; z < endZ; z++) {
                    pos.x = x;
                    pos.y = y;
                    pos.z = z;

                    const block = bot.blockAt(pos, false);
                   
                    if (!block) continue;

                    if (block.name === "air" || block.name === "caveair") {
                        blockField.set(x, y, z, 0);
                        continue;
                    }

                    blockField.set(x, y, z, block.type);
                    distanceField.set(x, y, z);
                }
            }
            
            //await this.bot.waitForTicks(1);
        }

        distanceField.bake();

        for (let worker of workers) {
            worker.postMessage({
                type: "load-fields",
                blockChunks: blockField.chunks,
                distanceChunks: distanceField.chunks,
            });
        }

        workers[0].postMessage({
            type: "calculate-lighting",
            zone: [startX, startY, startZ, endX, endY, endZ],
        });

        console.log("Lighting request sent.");
        
        let lightingPromise = new Promise((resolve, reject)=>{
            resolveLighting = resolve;
        });

        await lightingPromise;

        console.log("Recieved lighting information.");
        
        for (let worker of workers) {
            worker.postMessage({
                type: "load-fields",
                blockChunks: blockField.chunks,
                distanceChunks: distanceField.chunks,
                shadows: shadows.chunks,
            });
        }
    }
}

module.exports = {
	Camera,
};