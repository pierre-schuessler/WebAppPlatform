async function main() {
    let env = {
    };

    try {
        const response = await fetch("./program");
        const hexString = await response.text();

        const wasmBytes = new Uint8Array(
            hexString.split(' ').map(byte => parseInt(byte, 16))
        );

        const { instance } = await WebAssembly.instantiate(wasmBytes, { env });
            
        const entryPoint = instance.exports.main || instance.exports._start;

        if (typeof entryPoint === 'function') {
            const result = entryPoint();
            console.log("Program returned:", result);
            return result;
        } else {
            console.error("Could not find an exported 'main' or '_start' function.");
            console.log("Available exports:", Object.keys(instance.exports));
        }
    } catch (err) {
        console.error("Failed to load or execute WebAssembly:", err);
    }
}

main();