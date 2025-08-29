/**
 * Checks if a line segment intersects with an Axis-Aligned Bounding Box (AABB)
 * @param {number[]} start - Start point of line [x,y,z]
 * @param {number[]} end - End point of line [x,y,z]
 * @param {number[]} min - Min point of AABB [x,y,z]
 * @param {number[]} max - Max point of AABB [x,y,z]
 * @returns {Object|null} Intersection data or null if no intersection
 */

/**
 * Rotate a 3D vector around a given axis through a given origin.
 * @param {[number,number,number]} vec     The [x,y,z] vector to rotate.
 * @param {{origin:[number,number,number], axis:string, angle:number, rescale:boolean}} t
 *        origin – center of rotation,
 *        axis   – 'x','y', or 'z' (for principal axes),
 *        angle  – degrees,
 *        rescale– whether to restore original length.
 * @returns {[number,number,number]} The rotated vector.
 */

/*
function rotateVector(vec, t) {
    //console.log("Rotating!");

    const [x, y, z] = vec;
    const [oX, oY, oZ] = t.origin;
    // 1) translate to origin
    let vx = x - oX, vy = y - oY, vz = z - oZ;
    // 2) rotate about axis
    const θ = t.angle * Math.PI/180;
    const c = Math.cos(θ), s = Math.sin(θ);
    let rx, ry, rz;
    switch (t.axis) {
      case 'x':
        rx = vx;
        ry = vy * c - vz * s;
        rz = vy * s + vz * c;
        break;
      case 'y':
        rx = vx * c + vz * s;
        ry = vy;
        rz = -vx * s + vz * c;
        break;
      case 'z':
        rx = vx * c - vy * s;
        ry = vx * s + vy * c;
        rz = vz;
        break;
      default:
        throw new Error(`Unknown axis '${t.axis}'`);
    }
    // 3) translate back
    rx += oX; ry += oY; rz += oZ;
    // 4) optional rescale
    if (t.rescale) {
      const origLen = Math.hypot(x - oX, y - oY, z - oZ);
      const newLen  = Math.hypot(rx - oX, ry - oY, rz - oZ);
      const f = origLen / newLen;
      rx = oX + (rx - oX)*f;
      ry = oY + (ry - oY)*f;
      rz = oZ + (rz - oZ)*f;
    }
    return [rx, ry, rz];
  }
  
function lineIntersectsAABB(start, end, min, max, rotation) {
    const AXES = 3;
    let nearDistance = 0;
    let farDistance = 1;
    let hitNormal = [0, 0, 0];

    //if (!rotation) rotation = [0, 0, 0];
    //else console.log(rotation);

    //console.log("Intersect:", start, end, min, max, rotation);
    
    let direction = [
        end[0] - start[0],
        end[1] - start[1],
        end[2] - start[2]
    ];

    if (rotation) direction = rotateVector(direction, rotation);
    
    for (let axis = 0; axis < AXES; axis++) {
        if (direction[axis] === 0) {
            if (start[axis] < min[axis] || start[axis] > max[axis]) {
                return null;
            }
            continue;
        }

        const t1 = (min[axis] - start[axis]) / direction[axis];
        const t2 = (max[axis] - start[axis]) / direction[axis];
        
        const tNear = Math.min(t1, t2);
        const tFar = Math.max(t1, t2);

        if (tNear > nearDistance) {
            nearDistance = tNear;
            hitNormal = [0, 0, 0];
            hitNormal[axis] = t1 < t2 ? -1 : 1;
        }
        farDistance = Math.min(farDistance, tFar);

        if (nearDistance > farDistance) return null;
    }

    if (nearDistance >= 0 && nearDistance <= 1) {
        const hitPoint = [
            start[0] + nearDistance * direction[0],
            start[1] + nearDistance * direction[1],
            start[2] + nearDistance * direction[2]
        ];

        // Calculate UVs based on the hit face
        let uv;
        if (hitNormal[0] !== 0) {
            // X-facing face - use Y,Z
            uv = [
                1-((hitPoint[2] - min[2]) / (max[2] - min[2])),
                1-((hitPoint[1] - min[1]) / (max[1] - min[1]))
            ];
        } else if (hitNormal[1] !== 0) {
            // Y-facing face - use X,Z
            uv = [
                (hitPoint[0] - min[0]) / (max[0] - min[0]),
                (hitPoint[2] - min[2]) / (max[2] - min[2])
            ];
        } else {
            // Z-facing face - use X,Y
            uv = [
                1-((hitPoint[0] - min[0]) / (max[0] - min[0])),
                1-((hitPoint[1] - min[1]) / (max[1] - min[1])),
            ];
        }

        return {
            distance: nearDistance,
            normal: hitNormal,
            uv: uv
        };
    }

    return null;
}
*/

function rotateVector(vec, t) {
    const [x, y, z] = vec;
    const [oX, oY, oZ] = t.origin;
    const angleRad = (t.angle || 0) * Math.PI / 180;
  
    // translate to pivot
    let vx = x - oX, vy = y - oY, vz = z - oZ;
    const c = Math.cos(angleRad), s = Math.sin(angleRad);
    let rx, ry, rz;
  
    // rotate about principal axis
	switch (t.axis) {
		case 'x':
			rx = vx;
			ry = vy * c - vz * s;
			rz = vy * s + vz * c;
			break;
		case 'y':
			rx = vx * c + vz * s;
			ry = vy;
			rz = -vx * s + vz * c;
			break;
		case 'z':
			rx = vx * c - vy * s;
			ry = vx * s + vy * c;
			rz = vz;
			break;
		default:
			throw new Error(`Unknown axis '${t.axis}'`);
	}
  
    // translate back from pivot
    rx += oX; ry += oY; rz += oZ;
  
    // optional uniform rescale to preserve original distance from pivot
    if (t.rescale) {
		const origLen = Math.hypot(vx, vy, vz);
		const newLen  = Math.hypot(rx - oX, ry - oY, rz - oZ);
		if (newLen !== 0) {
			const f = origLen / newLen;
			rx = oX + (rx - oX) * f;
			ry = oY + (ry - oY) * f;
			rz = oZ + (rz - oZ) * f;
		}
    }
  
    return [rx, ry, rz];
  }
  
  /**
   * Intersect a segment [start,end] with a rotated AABB.
   * rotation: { origin:[i,i,i] relative to box min in 16th units, axis:'x'|'y'|'z', angle:deg, rescale:bool }
   */
function lineIntersectsAABB(start, end, min, max, rotation) {
	rotation = rotation || { origin: [0,0,0], axis: 'x', angle: 0, rescale: false };

	// compute pivot in world space: min + (origin/16) * (max - min)
	const frac = rotation.origin.map(v => v / 16);
	const pivot = [
		min[0] + frac[0] * (max[0] - min[0]),
		min[1] + frac[1] * (max[1] - min[1]),
		min[2] + frac[2] * (max[2] - min[2])
	];

	// helper to rotate a point about pivot
	const unrot = { origin: [0,0,0], axis: rotation.axis, angle: -rotation.angle, rescale: false };
	function applyRot(p, t) {
		const q = rotateVector([p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]], t);
		return [q[0] + pivot[0], q[1] + pivot[1], q[2] + pivot[2]];
	}

	// 1) un-rotate segment ends
	const s = applyRot(start, unrot);
	const e = applyRot(end,   unrot);

	// 2) slab intersection in local AABB space
	const dir = [e[0]-s[0], e[1]-s[1], e[2]-s[2]];
	let near = 0, far = 1;
	let normalLocal = [0,0,0];

	for (let i = 0; i < 3; i++) {
		if (dir[i] === 0) {
			if (s[i] < min[i] || s[i] > max[i]) return null;
			continue;
		}
		const t1 = (min[i] - s[i]) / dir[i], t2 = (max[i] - s[i]) / dir[i];
		const tN = Math.min(t1, t2), tF = Math.max(t1, t2);
		if (tN > near) { near = tN; normalLocal = [0,0,0]; normalLocal[i] = t1 < t2 ? -1 : 1; }
		far = Math.min(far, tF);
		if (near > far) return null;
	}
	if (near < 0 || near > 1) return null;

	// 3) compute local hit point
	const hitLocal = [s[0]+near*dir[0], s[1]+near*dir[1], s[2]+near*dir[2]];

	// 4) rotate normal back (pure rotation)
	const worldNormal = rotateVector(normalLocal, { origin: [0,0,0], axis: rotation.axis, angle: rotation.angle, rescale: false });

	// 5) compute world hit point
	const hitWorld = [ start[0]+near*(end[0]-start[0]), start[1]+near*(end[1]-start[1]), start[2]+near*(end[2]-start[2]) ];

	// 6) UVs in local box
	let uv;
	if (Math.abs(normalLocal[0])>0) uv = [1-(hitLocal[2]-min[2])/(max[2]-min[2]), 1-(hitLocal[1]-min[1])/(max[1]-min[1])];
	else if (Math.abs(normalLocal[1])>0) uv = [(hitLocal[0]-min[0])/(max[0]-min[0]), (hitLocal[2]-min[2])/(max[2]-min[2])];
	else uv = [1-(hitLocal[0]-min[0])/(max[0]-min[0]), 1-(hitLocal[1]-min[1])/(max[1]-min[1])];

	return { distance: near, point: hitWorld, normal: worldNormal, uv };
}
  
module.exports = {
    check: lineIntersectsAABB,
}