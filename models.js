const fs = require('fs');
const path = require('path');


// map will probably be faster when using a lot of models
const modelCache = {};
//const modelCache = new Map();

function loadModel(name) {
    const cached = modelCache[name];
    //const cached = modelCache.get(name);
    if (cached) cached;

    const scaleFactor = 1 / 16;

    const model = loadFromFile(name);

    if (model.elements) {
        model.elements = model.elements.map(element=>{
            const aabb = {
                from: element.from.map(coord => coord * scaleFactor),
                to: element.to.map(coord => coord * scaleFactor),
            };
            if (element.rotation) {
                aabb.rotation = element.rotation; // Include rotation if it exists
            }
            return aabb;
        });
    }

    if (model.parent) {
        model.parent = model.parent.replace("block/", "").replace("minecraft:", "");
        const parentModel = loadModel(model.parent);
        modelCache[name] = {
            ...parentModel,
            ...model,
            elements: model.elements || parentModel.elements,
        };
        /*modelCache.set(name, {
            ...parentModel,
            ...model,
            elements: model.elements || parentModel.elements,
        });*/
    } else {
        modelCache[name] = model;
        //modelCache.set(name, model);
    }

    return modelCache[name];
    //return modelCache.get(name);
}

function extractAABBs(name) {
    const model = loadModel(name);
    const elements = model.elements || [];

    /*return elements.map(element => {
        const aabb = {
            from: element.from.map(coord => coord * scaleFactor),
            to: element.to.map(coord => coord * scaleFactor),
        };
        if (element.rotation) {
            aabb.rotation = element.rotation; // Include rotation if it exists
        }
        return aabb;
    });*/
    return elements;
}

// Legit Load From File Function
function loadFromFile(name) {
    const filePath = path.join(__dirname, 'models', `${name}.json`);
    if (!fs.existsSync(filePath)) {
        throw new Error(`Model file not found: ${filePath}`);
    }

    const fileContents = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(fileContents);
}

module.exports = {
    get: extractAABBs,
    cache: modelCache,
};
