const parent = require('node:worker_threads').parentPort;

const { pitchYawToDirection, traceRay } = require('./ray-fast.js');
const intersect = require('./intersect.js');
const models = require('./models.js');
const { DistanceField, FastDistanceField } = require('./distance-field.js');
const { ShadowMap } = require('./shadows.js');

const {
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
} = require('./vector.js');

let width = 128;
let height = 32;
let FOV = 90;
let maxBounces = 3;
let samplesPerPixel = 32;
let renderDistance = 64;
let exposure = 16;

const sunDirection = normalize([0.5, 1, 0.5]);
const skyColor = [126/255, 171/255, 255/255];
const horizonColor = [181/255, 209/255, 255/255];

let BLOCK_COLORS = {};
//let BLOCK_COLORS = new Map();
//let BLOCK_MATERIALS = {};
let BLOCK_MATERIALS = new Map();
let blocksByID = [];
let materialsByID = [];

const blockField = new FastDistanceField(); // the name doesn't really makes sense in this context but it works
const distanceField = new DistanceField();
//const distanceField = new FastDistanceField();
const shadows = new ShadowMap();

function linearRGB([r, g, b]) {
    return [
        Math.pow(r, 2.2),
        Math.pow(g, 2.2),
        Math.pow(b, 2.2),
    ];
}

function degreesToRadians(x) {
    return (x / 360) * Math.PI * 2;
}

function toneMap(x) {
    return x / (x + 1);
}

function reflect(direction, normal) {
    let random = [
        (Math.random()*2)-1,
        (Math.random()*2)-1,
        (Math.random()*2)-1,
    ];

    normalify(random);

    if (dot(normal, random) < 0) invertify(random);

    return random;
}

function getEnvironmentLight(direction) {
    const skyGradientTransition = Math.pow((direction[1] + 1) / 2, 0.5);
    const skyGradient = lerpVectors(horizonColor, skyColor, skyGradientTransition);
    //let sun = (dot(direction, sunDirection) + 1) * 0.5;

    let sun = Math.max(dot(direction, sunDirection), 0);

    //sun = clamp(sun, 0, 1);

    //sun = Math.pow(sun, 20);
    //sun = Math.pow(sun, 20) * 10;
    sun = sun > 0.95? 20 : 0;

    //const sun = (dot(normalize(direction), normalize(sunDirection)) + 1) * 0.5;//Math.pow(Math.max(0, dot()));
    //const sunRaw = Math.max(0, dot(direction, invert(sunDirection)));
    //const sun = Math.pow(sunRaw, sunFocus) * sunIntensity;

    //const groundToSkyTransition = lerp(-1, 1);
    //const sunMask = 0;

    /*return [
        lerp(1, 0, skyGradientTransition) + sun,
        lerp(1, 0, skyGradientTransition) + sun,
        lerp(1, 1, skyGradientTransition) + sun,
    ];*/

    let gm = 4;

    return [
        Math.pow(lerp(1, 0.3, skyGradientTransition), gm) + sun,
        Math.pow(lerp(1, 0.4, skyGradientTransition), gm) + (sun * 0.75),
        Math.pow(1, gm) + (sun * 0.5),
    ];

    return [
        Math.pow(131/255, gm) + sun,
        Math.pow(168/255, gm) + sun,
        Math.pow(255/255, gm) + sun,
    ]; // TEMP!!!!!

    return lerpVectors([
        Math.pow(131/255, gm),
        Math.pow(168/255, gm),
        Math.pow(255/255, gm)
    ], [10, 10, 10], sun); // TEMP!!!!!

    return lerpVectors(linearRGB([0, 0, 1]), [2, 2, 2], sun); // TEMP!!!!!
    return lerpVectors(skyColor, [2, 2, 2], sun);
}

function getUV(position, normal, output) {
    position[0] = Math.abs(position[0]);
    position[1] = Math.abs(position[1]);
    position[2] = Math.abs(position[2]);

    position[0] %= 1;
    position[1] %= 1;
    position[2] %= 1;

    if (normal[0] !== 0) {
        output[0] = position[2];
        output[1] = 1-position[1];
        return;
    }

    if (normal[1] !== 0) {
        output[0] = position[0];
        output[1] = 1-position[2];
        return;
    }

    output[0] = position[0];
    output[1] = 1-position[1];
}

//const UV = [0, 0];

function raycast(incomingLight, origin, direction, maxBounces, renderDistance) {
    incomingLight[0] = incomingLight[1] = incomingLight[2] = 0;

    //const rayColor = [1, 1, 1];
    const rayColor = new Float32Array(3);
    rayColor[0] = rayColor[1] = rayColor[2] = 1;

    let hit;

    //const rayPosition = [0, 0, 0];
    const position = [...origin];
    const normal = [0, 0, 0];
    const UV = [0, 0];
    //UV[0] = UV[1] = 0;

    const checkBlock = (x, y, z, normal, uv, px, py, pz)=>{
        const id = blockField.get(x, y, z);

        //const block = blocksByID[id];
        //if (!block) return 0;
        //const name = block.name;
        
        const name = blocksByID[id];
        
        if (!name) return 0;

        //if (block.name === "air" || block.name === "caveair") return 0;
        //if (block.name === "water") return Math.random() > 0.5? {name: block.name} : 0;
        //if (block.name === "short_grass" || block.name === "tall_grass") return 0;

        //if (name === "air" || name === "caveair") return 0;
        //if (name === "water") return Math.random() > 0.5? { name } : 0;
        //if (!BLOCK_COLORS[name]) return 0;

        //if (block.name === "snow") return (pos[1] % 1) < 0.2? block.name : 0;
        
        //const material = BLOCK_MATERIALS[name];
        const material = BLOCK_MATERIALS.get(name);
        //const material = materialsByID[id];

        //const model = models.cache[block.name];
        
        if (models.cache[name]) {
        //if (models.cache.get(name)) {
            return 0;
            let modelPos = [x, y, z];
            let model = models.cache[name].elements;
            //let model = models.cache.get(name).elements;

            //const checkEnd = addify(scale(direction, 100), origin);
            const checkEnd = add(scale(direction, 100), origin);
            //const checkEnd = scale(direction, 100);
            //addify(checkEnd, origin);

            for (let element of model) {
                let boxStart = add(modelPos, element.from);
                let boxEnd = add(modelPos, element.to);

                //let hitElement = intersect.check(origin, add(origin, scale(direction, 100)), boxStart, boxEnd);
                let hitElement = intersect.check(origin, checkEnd, boxStart, boxEnd, element.rotation);

                if (hitElement) {
                    let isHit = typeof(hitElement.distance) === "number";

                    //return isHit? {name: block.name, normal: hitCake.normal, uv: hitCake.uv} : 0;

                    if (!isHit) return 0;

                    //const material = BLOCK_MATERIALS[block.name];
                    if (!material) return name;

                    const posX = UV[0] * 16;
                    const posY = UV[1] * 16;
                    
                    //const i = ((posY * 16) + posX) * 4;
                    const i = ((posY << 4) + posX) << 2;

                    //return material.mask[i] > 0.5? { name, normal: hitElement.normal, uv: hitElement.uv} : 0;

                    if (material.albedo[i+3] > 0.5) {
                        normal[0] = hitElement.normal[0];
                        normal[1] = hitElement.normal[1];
                        normal[2] = hitElement.normal[2];

                        uv[0] = hitElement.uv[0];
                        uv[1] = hitElement.uv[1];

                        return name;
                    }

                    return 0;
                }
            }

            return 0;
        }

        //const material = BLOCK_MATERIALS[block.name];

        //if (!material) return {name: block.name};
        //if (!material) return { name };
        if (!material) return name;

        //return { name }; // TEMPORARY !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

        //const UV = getUV([px, py, pz], normal);
        //const UV = [0, 0];
        //getUV([px, py, pz], normal, UV);
        const UV = [px, py, pz];
        /*UV[0] = px;
        UV[1] = py;
        UV[2] = pz;*/
        getUV(UV, normal, UV);

        const posX = UV[0] * 16;
        const posY = UV[1] * 16;

        const i = ((posY << 4) + posX) << 2;

        if (material.north) {
            return material.north.albedo[i+3] > 0.5? name : 0; // TODO: get actual face from normal
        } else {
            return material.albedo[i+3] > 0.5? name : 0;
        }

    };

    for (let bounces = 0; bounces < maxBounces; bounces++) {
        //hit = traceRay(checkBlock, ...origin, ...direction, renderDistance, [], [], distanceField);
        hit = traceRay(checkBlock, ...position, ...direction, renderDistance, position, normal, UV, distanceField);
        renderDistance /= 2;
        
        if (hit) {
            //const normal = hit.normal;
            //const id = blocksByID[hit.name];
            //const UV = uv;//hit.uv || getUV(position, normal);

            /*
            const distance = Math.hypot(
                hit.block[0] - origin[0],
                hit.block[1] - origin[1],
                hit.block[2] - origin[2],
            ) / 128;
            */
            
            // update ray heading
            addify(position, scale(normal, 0.01)); // small offset to stop ray from spawning on the edge of the block
            
            /* TODO: test this! (should be faster than above)
            position[0] += (normal[0] * 0.01);
            position[1] += (normal[1] * 0.01);
            position[2] += (normal[2] * 0.01);
            //*/

            direction = reflect(direction, normal);
            //direction = calculateReflection(direction, normal);

            //const material = BLOCK_MATERIALS[hit];
            const material = BLOCK_MATERIALS.get(hit);
            //const material = materialsByID[id];

            // update ray color
            let emissionColor = [1, 1, 1];
            let emissionStrength = 0.0;
            let albedo = BLOCK_COLORS[hit];
            //let albedo = BLOCK_COLORS.get(hit);

            /*
            albedo = albedo || [1, 0, 1];//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            //albedo = lerpVectors([0, 0, 0], albedo, (dot(normal, sunDirection) + 1) * 0.5);//!!!!!!!!!!!!!!!!!!!!!!!!!
            albedo = scale(albedo, (dot(normal, sunDirection) + 1) * 0.5);//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            albedo = lerpVectors(albedo, skyColor, Math.pow(distance, 3));//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            return albedo;//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            */

            //if (albedo) albedo = linearRGB(albedo);

            //const UV = hit.uv || getUV(hit.position, normal);

            if (material) {
                const posX = UV[0] * 16;
                const posY = UV[1] * 16;

                //const i = ((posY * 16) + posX) * 4;
                const i = ((posY << 4) + posX) << 2;

                //let albedoTexture = material.albedo;
                
                if (material.north) {
                    let face;

                    if (normal[0] === 1) face = material.north;
                    else if (normal[0] ===-1) face = material.south;
                    else if (normal[1] === 1) face = material.up;
                    else if (normal[1] ===-1) face = material.down;
                    else if (normal[2] === 1) face = material.east;
                    else face = material.west; // normal[2] === -1

                    albedo = [
                        face.albedo[i],
                        face.albedo[i+1],
                        face.albedo[i+2],
                    ];

                    emissionStrength = Math.sqrt(face.emissionStrength[i]) * face.emissionMultiplier;
                } else {

                    albedo = [
                        material.albedo[i],
                        material.albedo[i+1],
                        material.albedo[i+2],
                    ];

                    emissionColor = [
                        material.emissionColor[i],
                        material.emissionColor[i+1],
                        material.emissionColor[i+2],
                    ];

                    emissionStrength = Math.sqrt(material.emissionStrength[i]) * material.emissionMultiplier;
                }
            }

            if (!albedo) {
                // fast bitwise operations to check UV coordinates
                const uvCheck = ((UV[0] > 0.5) << 1) | (UV[1] > 0.5);
                const L = (uvCheck === 1 || uvCheck === 2) ? 1 : 0;

                // TRYME: should be faster than above (not much)
                //const L = ((UV[1] > 0.5) || (UV[0] > 0.5)) ? 1 : 0;

                albedo = [L, 0, L];
                emissionColor = [1, 0, 1];
                emissionStrength = 0;
            }

            /*
            let emittedLight = scale(emissionColor, emissionStrength);
            const lightStrength = (dot(normal, direction) + 1) * 0.5;
            //incomingLight = add(incomingLight, mult(emittedLight, rayColor)); // <--- Optimize me!!!! (inline*)
            multify(emittedLight, rayColor);
            addify(incomingLight, emittedLight);
            */

            const lightStrength = (dot(normal, direction) + 1) * 0.5;

            scalify(emissionColor, emissionStrength);

            //incomingLight = add(incomingLight, mult(emittedLight, rayColor)); // <--- Optimize me!!!! (inline*)
            multify(emissionColor, rayColor);
            
            addify(incomingLight, emissionColor);

            /*
            const lightChange = mult(emittedLight, rayColor);
            
            incomingLight[0] += lightChange[0];
            incomingLight[1] += lightChange[1];
            incomingLight[2] += lightChange[2];
            //*/

            rayColor[0] *= albedo[0];
            rayColor[1] *= albedo[1];
            rayColor[2] *= albedo[2];

            rayColor[0] *= lightStrength;
            rayColor[1] *= lightStrength;
            rayColor[2] *= lightStrength;

            //albedo = scale(albedo, (dot(normal, sunDirection) + 1) * 0.5);//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            //albedo = lerpVectors(albedo, skyColor, Math.pow(distance, 3));//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            //return albedo;//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        } else {
            let environmentLight = getEnvironmentLight(direction);
            multify(environmentLight, rayColor);

            incomingLight[0] += environmentLight[0];
            incomingLight[1] += environmentLight[1];
            incomingLight[2] += environmentLight[2];

            break;
        }
    }

    /*let environmentLight = getEnvironmentLight(direction);
    multify(environmentLight, rayColor);

    incomingLight[0] += environmentLight[0];
    incomingLight[1] += environmentLight[1];
    incomingLight[2] += environmentLight[2];*/
}

function fastRaycast(incomingLight, origin, direction, _, renderDistance) {
    //let incomingLight = [0, 0, 0];

    incomingLight[0] = incomingLight[1] = incomingLight[2] = 1;
    //incomingLight[0] = incomingLight[1] = incomingLight[2] = 255;

    //let rayColor = [1, 1, 1];
    let hit;

    //const rayPosition = [0, 0, 0];
    const position = [...origin];
    const normal = [0, 0, 0];
    const UV = [0, 0];

    const checkBlock = (x, y, z, normal, uv, px, py, pz)=>{
        const id = blockField.get(x, y, z);
        
        //if (!id) return 0;
        //if (id !== 0) console.log(`${id}: ${blocksByID[id].name}`);
        //const block = bot.registry.blocks[id];
        //const block = bot.blockAt(vec3(x, y, z), false);

        //const block = blocksByID[id];
        //if (!block) return 0;
        //const name = block.name;

        const name = blocksByID[id];
        
        if (!name) return 0;

        //if (block.name === "air" || block.name === "caveair") return 0;
        //if (block.name === "water") return Math.random() > 0.5? {name: block.name} : 0;
        //if (block.name === "short_grass" || block.name === "tall_grass") return 0;

        //if (name === "air" || name === "caveair") return 0;
        //if (name === "water") return Math.random() > 0.5? { name } : 0;
        //if (!BLOCK_COLORS[name]) return 0;

        //if (block.name === "snow") return (pos[1] % 1) < 0.2? block.name : 0;

        //const material = BLOCK_MATERIALS[block.name];
        //const material = BLOCK_MATERIALS[name];
        const material = BLOCK_MATERIALS.get(name);
        //const material = materialsByID[id];

        //const model = models.cache[block.name];
        
        if (models.cache[name]) {
        //if (models.cache.get(name)) {
            let modelPos = [x, y, z];
            let model = models.cache[name].elements;
            //let model = models.cache.get(name).elements;

            //const checkEnd = addify(scale(direction, 100), origin);
            const checkEnd = add(scale(direction, 100), origin);

            for (let element of model) {
                continue; // TEMP!!!!!!!!!!!!!!!!!!!!!
                let boxStart = add(modelPos, element.from);
                let boxEnd = add(modelPos, element.to);

                //let hitElement = intersect.check(origin, add(origin, scale(direction, 100)), boxStart, boxEnd);
                let hitElement = intersect.check(origin, checkEnd, boxStart, boxEnd, element.rotation);

                if (hitElement) {
                    let isHit = typeof(hitElement.distance) === "number";

                    //return isHit? {name: block.name, normal: hitCake.normal, uv: hitCake.uv} : 0;

                    if (!isHit) return 0;

                    //const material = BLOCK_MATERIALS[block.name];

                    //if (!material) return {name: block.name};
                    //if (!material) return { name };
                    if (!material) return name;

                    const posX = Math.floor(hitElement.uv[0] * 16);
                    const posY = Math.floor(hitElement.uv[1] * 16);
                    
                    //const i = ((posY * 16) + posX) * 4;
                    const i = ((posY << 4) + posX) << 2;

                    if (material.albedo[i+3] > 0.5) {
                    //if (material.albedo[i+3] > 127) {
                        normal[0] = hitElement.normal[0];
                        normal[1] = hitElement.normal[1];
                        normal[2] = hitElement.normal[2];

                        uv[0] = hitElement.uv[0];
                        uv[1] = hitElement.uv[1];

                        return name;
                    } else {
                        return 0;
                    }
                }
            }

            return 0;
        }

        //const material = BLOCK_MATERIALS[block.name];

        //if (!material) return {name: block.name};
        //if (!material) return { name };
        if (!material) return name;

        //!!!!!!!!!!!!!!!TEMP!!!!
        if (name === "air") return 0;
        return name;

        //return { name }; // TEMPORARY !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

        //const UV = getUV([px, py, pz], normal);
        //const UV = [0, 0];
        //getUV([px, py, pz], normal, UV);
        const UV = [px, py, pz];
        getUV(UV, normal, UV);

        //if (Math.hypot(UV[0] - 0.5, UV[1] - 0.5) < 0.2) return 0;

        const posX = Math.floor(UV[0] * 16);
        const posY = Math.floor(UV[1] * 16);
        
        //const i = ((posY * 16) + posX) * 4;
        const i = ((posY << 4) + posX) << 2;

        if (material.north) {
            //return material.north.mask[i] > 0.5? { name } : 0; // TODO: get actual face from normal
            //return material.north.mask[i] > 0.5? name : 0; // TODO: get actual face from normal
            return material.north.albedo[i+3] > 0.5? name : 0; // TODO: get actual face from normal
            //return material.north.albedo[i+3] > 127? name : 0;
        } else {
            //return material.mask[i] > 0.5? { name } : 0;
            //return material.mask[i] > 0.5? name : 0;
            return material.albedo[i+3] > 0.5? name : 0;
            //return material.albedo[i+3] > 127? name : 0;
        }

    };

    //hit = traceRay(checkBlock, ...origin, ...direction, renderDistance, [], [], distanceField);
    hit = traceRay(checkBlock, ...position, ...direction, renderDistance, position, normal, UV, distanceField);
    
    //if (hit.name) {
    if (hit) {
        //const normal = hit.normal;
        //const id = blocksByID[hit.name];
        //const UV = uv;//hit.uv || getUV(position, normal);

        const distance = Math.hypot(
            position[0] - origin[0],
            position[1] - origin[1],
            position[2] - origin[2],
        ) / 128;
        
        // update ray heading
        addify(position, scale(normal, 0.001)); // small offset to stop ray from spawning on the edge of the block
        
        /* TRYME: should be faster than above
        position[0] += (normal[0] * 0.01);
        position[1] += (normal[1] * 0.01);
        position[2] += (normal[2] * 0.01);
        //*/

        direction = reflect(direction, normal);
        //direction = calculateReflection(direction, normal);

        //const material = BLOCK_MATERIALS[hit];
        const material = BLOCK_MATERIALS.get(hit);
        //const material = materialsByID[id];

        // update ray color
        let emissionColor = [1, 1, 1];
        let emissionStrength = 0.0;
        let albedo = BLOCK_COLORS[hit];
        //let albedo = BLOCK_COLORS.get(hit);

        /*
        albedo = albedo || [1, 0, 1];//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        //albedo = lerpVectors([0, 0, 0], albedo, (dot(normal, sunDirection) + 1) * 0.5);//!!!!!!!!!!!!!!!!!!!!!!!!!
        albedo = scale(albedo, (dot(normal, sunDirection) + 1) * 0.5);//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        albedo = lerpVectors(albedo, skyColor, Math.pow(distance, 3));//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        //return albedo;//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        //incomingLight[0] = incomingLight[1] = incomingLight[2] = distance / 10;
        incomingLight[0] = albedo[0];
        incomingLight[1] = albedo[1];
        incomingLight[2] = albedo[2];
        return;
        //*/

        //if (albedo) albedo = linearRGB(albedo);

        //const UV = hit.uv || getUV(hit.position, normal);

        if (material) {
            const posX = Math.floor(UV[0] * 16);
            const posY = Math.floor(UV[1] * 16);

            //const posX = Math.floor(UV[0] << 4); // faster as far as I can tell
            //const posY = Math.floor(UV[1] << 4);

            //const i = ((posY * 16) + posX) * 4;
            const i = ((posY << 4) + posX) << 2;

            //let albedoTexture = material.albedo;
            
            if (material.north) {
                let face;

                if (normal[0] === 1) face = material.north;
                else if (normal[0] ===-1) face = material.south;
                else if (normal[1] === 1) face = material.up;
                else if (normal[1] ===-1) face = material.down;
                else if (normal[2] === 1) face = material.east;
                else face = material.west; // normal[2] === -1

                albedo = [
                    face.albedo[i],
                    face.albedo[i+1],
                    face.albedo[i+2],
                ];

                emissionStrength = Math.sqrt(face.emissionStrength[i]) * face.emissionMultiplier;
            } else {

                albedo = [
                    material.albedo[i],
                    material.albedo[i+1],
                    material.albedo[i+2],
                ];

                emissionColor = [
                    material.emissionColor[i],
                    material.emissionColor[i+1],
                    material.emissionColor[i+2],
                ];

                emissionStrength = Math.sqrt(material.emissionStrength[i]) * material.emissionMultiplier;
            }
        }

        if (!albedo) {
            // Fast bitwise operations to check UV coordinates
            const uvCheck = ((UV[0] > 0.5) << 1) | (UV[1] > 0.5);
            const L = (uvCheck === 1 || uvCheck === 2) ? 1 : 0;
            //const L = (uvCheck === 1 || uvCheck === 2) ? 255 : 0;

            albedo = [L, 0, L];
            emissionColor = [1, 0, 1];
            emissionStrength = 0;
        }

        /*
        let emittedLight = scale(emissionColor, emissionStrength);
        const lightStrength = (dot(normal, direction) + 1) * 0.5;
        //incomingLight = add(incomingLight, mult(emittedLight, rayColor)); // <--- Optimize me!!!! (inline*)
        multify(emittedLight, rayColor);
        addify(incomingLight, emittedLight);
        */

        /*
        albedo = albedo || [1, 0, 1];//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        //albedo = lerpVectors([0, 0, 0], albedo, (dot(normal, sunDirection) + 1) * 0.5);//!!!!!!!!!!!!!!!!!!!!!!!!!
        //albedo = scale(albedo, (dot(normal, sunDirection) + 1) * 0.5);//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        //albedo = lerpVectors(albedo, skyColor, Math.pow(distance, 3));//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        //return albedo;//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        //incomingLight[0] = incomingLight[1] = incomingLight[2] = distance / 10;
        incomingLight[0] = albedo[0];
        incomingLight[1] = albedo[1];
        incomingLight[2] = albedo[2];
        return;
        //*/

        const lightStrength = (dot(normal, direction) + 1) * 0.5;

        scalify(emissionColor, emissionStrength);
        
        multify(emissionColor, incomingLight);
        
        addify(incomingLight, emissionColor);

        multify(incomingLight, albedo); // absorb light using albedo

        //scalify(incomingLight, lightStrength);

        //hit = traceRay(checkBlock, ...position, ...direction, renderDistance, position, normal, UV, distanceField);
        //let sunIsBlocked = traceRay(checkBlock, ...position, ...sunDirection, renderDistance, [0, 0, 0], [0, 0, 0], [0, 0], distanceField);
        /*let sunIsBlocked = false;//shadows.get(...position);
        //let shading = (dot(normal, sunDirection) + 1) * 0.5;
        
        if (sunIsBlocked) {
            scalify(incomingLight, Math.min(0.2, shading));
        } else scalify(incomingLight, shading);*/

        const shading = shadows.get(...position);

        scalify(incomingLight, (shading * 0.8) + 0.2);

        multify(incomingLight, skyColor);

        /*let foggy = lerpVectors(incomingLight, skyColor, Math.pow(distance, 3));
        
        incomingLight[0] = foggy[0];
        incomingLight[1] = foggy[1];
        incomingLight[2] = foggy[2];*/

        //albedo = scale(albedo, (dot(normal, sunDirection) + 1) * 0.5);//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        //albedo = lerpVectors(albedo, skyColor, Math.pow(distance, 3));//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        //return albedo;//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    } else {
        let environmentLight = getEnvironmentLight(direction);

        //environmentLight = linearRGB(environmentLight);
        //.....linearifyRGB(environmentLight);

        //incomingLight = add(incomingLight, mult(environmentLight, rayColor));
        
        /*
        let addLight = mult(environmentLight, rayColor);

        incomingLight[0] += addLight[0];
        incomingLight[1] += addLight[1];
        incomingLight[2] += addLight[2];
        */
        
        //multify(environmentLight, incomingLight);

        incomingLight[0] = environmentLight[0];
        incomingLight[1] = environmentLight[1];
        incomingLight[2] = environmentLight[2];
    }
}

function render(pitch, yaw, origin) {
    const imageSize = width * height * 4;

    const rays = new Float32Array(imageSize);
    const imageData = new Uint8Array(imageSize);

    const ratio = height / width;
    const lightScale = (1 / samplesPerPixel) * exposure;

    const fov = degreesToRadians(FOV);

    const startYaw = yaw - (fov / 2);
    const endYaw = yaw + (fov / 2);
    const startPitch = pitch - ((fov * ratio) / 2);
    const endPitch = pitch + ((fov * ratio) / 2);

    //const botPos = this.position.offset(...this.offset);
    //const rayOrigin = [origin.x, origin.y, origin.z];

    const light = [0, 0, 0];
    const ray = [0, 0, 0];

    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            //const i = (((height-y) * width) + (width-x)) * 4;
            const i = ((y * width) + x) * 4;
            //const i = x * 4;

            //const rayYaw = lerp(startYaw, endYaw, x / width);
            //const rayPitch = lerp(startPitch, endPitch, y / height);
            const rayYaw = lerp(startYaw, endYaw, 1-(x / width));
            const rayPitch = lerp(startPitch, endPitch, 1-(y / height));
            
            const rayDirection = pitchYawToDirection(rayPitch, rayYaw);

            //let light = [0, 0, 0];
            light[0] = 0;
            light[1] = 0;
            light[2] = 0;

            for (let j = 0; j < samplesPerPixel; j++) {
                //const ray = raycast(origin, rayDirection, maxBounces, renderDistance);
                raycast(ray, origin, rayDirection, maxBounces, renderDistance);
                //const ray = raycast(origin, [1, 0, 0], 3, 64);
                //const ray = [x / width, 0, y / height];

                light[0] += ray[0];
                light[1] += ray[1];
                light[2] += ray[2];
            }

            rays[i] = light[0] * lightScale;
            rays[i+1] = light[1] * lightScale;
            rays[i+2] = light[2] * lightScale;
        }
    }

    //const light = [0, 0, 0];

    for (let i = 0; i < imageSize; i += 4) {
        light[0] = toneMap(rays[i]);
        light[1] = toneMap(rays[i+1]);
        light[2] = toneMap(rays[i+2]);

        imageData[i] = light[0] * 255;
        imageData[i+1] = light[1] * 255;
        imageData[i+2] = light[2] * 255;
        imageData[i+3] = 255;
    }
    
    parent.postMessage({
        type: "image-data",
        data: imageData,
    });
}

function fastRender(pitch, yaw, origin) { // Should probably be renamed to defferedRender or something
    const imageSize = width * height * 4;

    const rays = new Float32Array(imageSize);
    const imageData = new Uint8Array(imageSize);

    const ratio = height / width;
    //const lightScale = (1 / samplesPerPixel) * exposure;

    const fov = degreesToRadians(FOV);

    const startYaw = yaw - (fov / 2);
    const endYaw = yaw + (fov / 2);
    const startPitch = pitch - ((fov * ratio) / 2);
    const endPitch = pitch + ((fov * ratio) / 2);

    //const botPos = this.position.offset(...this.offset);
    //const rayOrigin = [origin.x, origin.y, origin.z];

    const light = [0, 0, 0];
    const ray = [0, 0, 0];

    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            //const i = (((height-y) * width) + (width-x)) * 4;
            const i = ((y * width) + x) * 4;
            //const i = x * 4;

            //const rayYaw = lerp(startYaw, endYaw, x / width);
            //const rayPitch = lerp(startPitch, endPitch, y / height);
            const rayYaw = lerp(startYaw, endYaw, 1-(x / width));
            const rayPitch = lerp(startPitch, endPitch, 1-(y / height));
            
            const rayDirection = pitchYawToDirection(rayPitch, rayYaw);

            fastRaycast(light, origin, rayDirection, 1, renderDistance);

            rays[i] = light[0] * exposure;
            rays[i+1] = light[1] * exposure;
            rays[i+2] = light[2] * exposure;
        }
    }

    //const light = [0, 0, 0];

    for (let i = 0; i < imageSize; i += 4) {
        light[0] = toneMap(rays[i]);
        light[1] = toneMap(rays[i+1]);
        light[2] = toneMap(rays[i+2]);

        imageData[i] = light[0] * 255;
        imageData[i+1] = light[1] * 255;
        imageData[i+2] = light[2] * 255;
        imageData[i+3] = 255;
    }
    
    parent.postMessage({
        type: "image-data",
        data: imageData,
    });
}

function calculateLighting(startX, startY, startZ, endX, endY, endZ) {

    const checkBlock = (x, y, z, normal, uv, px, py, pz)=>{
        const id = blockField.get(x, y, z);
        return id !== 0;
    };
    
    for (let x = startX; x < endX; x++) {
        for (let y = startY; y < endY; y++) {
            for (let z = startZ; z < endZ; z++) {

                const sunIsBlocked = traceRay(checkBlock, x, y, z, ...sunDirection, 32, [0, 0, 0], [0, 0, 0], [0, 0], distanceField);

                shadows.set(x, y, z, !sunIsBlocked);

            }
        }
    }

    console.log("Sending lighting.");

    parent.postMessage({
        type: "load-lighting",
        chunks: shadows.chunks,
    });
}

parent.on("message", async (message)=>{
    //console.log("Message:", message);

    if (message.type === "load-materials") {

        //BLOCK_MATERIALS = {...BLOCK_MATERIALS, ...message.materials};
        BLOCK_COLORS = {...BLOCK_COLORS, ...message.colors};
        blocksByID = message.blockIDs;

        for (let [key, value] of Object.entries(message.materials)) {
            BLOCK_MATERIALS.set(key, value);
        }

        /*for (let [key, value] of Object.entries(message.colors)) {
            BLOCK_COLORS.set(key, value);
        }*/

        /*
        parent.postMessage({
            type: "image-data",
            data: message.data,
        });
        */

        //console.log(BLOCK_MATERIALS);
        //console.log(blocksByID);
    }

    if (message.type === "load-models") {
        for (let [key, value] of Object.entries(message.models)) {
            models.cache[key] = value;
            //models.cache.set(key, value);
        }
    }

    if (message.type === "load-fields") {
        blockField.chunks = message.blockChunks;
        distanceField.chunks = message.distanceChunks;

        // Add a seperate "load-lighting" method
        if (message.shadows) shadows.chunks = message.shadows;

        //console.log("Loaded fields.");
    }

    if (message.type === "render") {
        const { pitch, yaw, origin } = message;

        exposure = message.exposure || exposure;
        FOV = message.fov || FOV;
        maxBounces = message.maxBounces || maxBounces;
        renderDistance = message.renderDistance || renderDistance;
        samplesPerPixel = message.samplesPerPixel || samplesPerPixel;

        render(pitch, yaw, origin);
    }

    if (message.type === "fast-render") {
        const { pitch, yaw, origin } = message;

        fastRender(pitch, yaw, origin);
    }

    if (message.type === "update-camera") {
        width = message.width;
        height = message.height;

        /*
        FOV = message.FOV;
        maxBounces = message.maxBounces;
        samplesPerPixel = message.samplesPerPixel;
        renderDistance = message.renderDistance;
        exposure = message.exposure;
        */
    }

    /*if (message.type === "test") {
        parent.postMessage({
            type: "image-data",
            data: message.data,
        });

        console.log(message.data);
    }*/

    if (message.type === "calculate-lighting") {
        calculateLighting(...message.zone);
    }
});
