function pitchYawToDirection(pitch, yaw) {
    const z = -Math.cos(pitch) * Math.cos(yaw);
    const y = Math.sin(pitch);
    const x = -Math.cos(pitch) * Math.sin(yaw);

    return [ x, y, z ];

    /*
    output[0] = -Math.cos(pitch) * Math.sin(yaw);
    output[1] = Math.sin(pitch);
    output[2] = -Math.cos(pitch) * Math.cos(yaw);
    */
}

const tempPosition = [0, 0, 0];

function getUV(position, normal, output) {
    //position = position.map(Math.abs);

    tempPosition[0] = Math.abs(position[0]);
    tempPosition[1] = Math.abs(position[1]);
    tempPosition[2] = Math.abs(position[2]);
    
    position = tempPosition;

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

const normal = [0, 0, 0];
const uv = [0, 0];

function traceRay(getVoxel, px, py, pz, dx, dy, dz, maxDistance, hitPosition, hitNormal, hitUV, distanceField) {
    let t = 0.0;
    let fieldDistance = Infinity;

    while (fieldDistance > 0) {
        fieldDistance = distanceField.get(Math.floor(px), Math.floor(py), Math.floor(pz));

        px += dx * fieldDistance;
        py += dy * fieldDistance;
        pz += dz * fieldDistance;

        t += fieldDistance;

        if (t > maxDistance) {
            // no voxel hit, out of range
            hitPosition[0] = px;
            hitPosition[1] = py;
            hitPosition[2] = pz;

            hitNormal[0] = hitNormal[1] = hitNormal[2] = 0;

            getUV(hitPosition, hitNormal, hitUV);

            return 0;
        }
    }
    
    let ix = Math.floor(px);
    let iy = Math.floor(py);
    let iz = Math.floor(pz);

    // Determine step direction based on ray direction
    let stepX = dx > 0 ? 1 : -1;
    let stepY = dy > 0 ? 1 : -1;
    let stepZ = dz > 0 ? 1 : -1;

    // Precompute delta distances for stepping in each direction
    let deltaX = Math.abs(1 / dx);
    let deltaY = Math.abs(1 / dy);
    let deltaZ = Math.abs(1 / dz);
    
    // Compute initial distances to the nearest voxel boundary
    let distToNextX = (stepX > 0) ? ix + 1 - px : px - ix;
    let distToNextY = (stepY > 0) ? iy + 1 - py : py - iy;
    let distToNextZ = (stepZ > 0) ? iz + 1 - pz : pz - iz;

    /*
    let maxX = deltaX < Infinity ? deltaX * distToNextX : Infinity;
    let maxY = deltaY < Infinity ? deltaY * distToNextY : Infinity;
    let maxZ = deltaZ < Infinity ? deltaZ * distToNextZ : Infinity;
    */
    let maxX = deltaX * distToNextX;
    let maxY = deltaY * distToNextY;
    let maxZ = deltaZ * distToNextZ;

    let steppedIndex = -1; // Tracks which axis was stepped along

    // Main ray traversal loop
    while (t <= maxDistance) {
        
        let fieldDistance = distanceField.get(ix, iy, iz);

        normal[0] = normal[1] = normal[2] = 0;
        uv[0] = uv[1] = 0;

        if (steppedIndex === 0) normal[0] = -stepX;
        else if (steppedIndex === 1) normal[1] = -stepY;
        else normal[2] = -stepZ;

        let voxel;

        if (fieldDistance === 0) {
            voxel = getVoxel(ix, iy, iz, normal, uv,
                px + (t * dx),
                py + (t * dy),
                pz + (t * dz)
            );

            //fieldDistance = 1;
        
            if (voxel) {
                // Update hit position
                hitPosition[0] = px + t * dx;
                hitPosition[1] = py + t * dy;
                hitPosition[2] = pz + t * dz;

                hitNormal[0] = normal[0];
                hitNormal[1] = normal[1];
                hitNormal[2] = normal[2];

                // TODO: set voxel.normal using refrence to make this faster / unnecessary
                //if (voxel.normal) {
                //if (normal[0] !== 0 && normal[1] !== 0 && normal[2] !== 0) {
                if (uv[0] !== 0 && uv[1] !== 0) {
                    hitUV[0] = uv[0];
                    hitUV[1] = uv[1];
                } else {
                    getUV(hitPosition, hitNormal, hitUV);
                }

                // Return hit information
                return voxel;
            }
        }

        // Advance to the next voxel boundary
        if (maxX < maxY && maxX < maxZ) {
            ix += stepX;
            t = maxX;
            maxX += deltaX;
            steppedIndex = 0;
        } else if (maxY < maxZ) {
            iy += stepY;
            t = maxY;
            maxY += deltaY;
            steppedIndex = 1;
        } else {
            iz += stepZ;
            t = maxZ;
            maxZ += deltaZ;
            steppedIndex = 2;
        }
    }

    // No voxel hit
    hitPosition[0] = px + t * dx;
    hitPosition[1] = py + t * dy;
    hitPosition[2] = pz + t * dz;

    hitNormal[0] = hitNormal[1] = hitNormal[2] = 0;

    /*
    const tempUV = getUV(hitPosition, hitNormal);
    hitUV[0] = tempUV[0];
    hitUV[1] = tempUV[1];
    */
    return 0;
}

module.exports = {
    pitchYawToDirection,
    traceRay,
};
