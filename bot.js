const mineflayer = require('mineflayer');
const { Camera } = require('./index.js');

let camera;

const bot = mineflayer.createBot({
    username: "RayBot",
    host: "localhost",
    port: 25565,
});

bot.on('error', console.log);
bot.on('kicked', console.log);

bot.once("spawn", ()=>{
    bot.chat("I'm a happy little robot.");

    camera = new Camera(bot);

    camera.resize(1920, 1080);
    camera.samplesPerPixel = 32;
    camera.renderDistance = 64;
    camera.maxBounces = 3;
    camera.fov = 90;
});

bot.on("chat", async (username, message)=>{
    if (username === bot.username) return;

    console.log(username, ": ", message);

    const user = bot.players[username];

    if (message === "look") {
        bot.lookAt(user.entity.position.offset(0, user.entity.height, 0));
    } else if (message === "scan") {
        const startTime = performance.now();

        await camera.scan(128, 64, 128);

        const endTime = performance.now();

        const outputMessage = `Scanned ${128 * 64 * 128} blocks in ${endTime - startTime}ms.`;

        console.log(outputMessage);
        bot.chat(outputMessage);
    } else if (message === "snap") {
        const startTime = performance.now();

        await camera.render("render.png");

        const endTime = performance.now();

        const outputMessage = `Rendered ${camera.width}x${camera.height} image in ${endTime - startTime}ms.`;

        console.log(outputMessage);
        bot.chat(outputMessage);
    }
});