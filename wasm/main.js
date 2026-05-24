async function main(hexString = "") {
    let exportedMemory;

    const env = {
        writehtml: (index) => {
            if (!exportedMemory) {
                console.error("Memory not initialized yet.");
                return;
            }

            const memoryView = new Uint8Array(exportedMemory.buffer, index);
            
            let length = 0;
            while (memoryView[length] !== 0) {
                length++;
            }

            const stringBytes = memoryView.subarray(0, length);
            const decoder = new TextDecoder('utf-8');
            const htmlString = decoder.decode(stringBytes);

            document.body.innerHTML = htmlString;
        }
    };

    try {
        if (hexString === "") {
            const response = await fetch("./program");
            hexString = await response.text();
        }

        const wasmBytes = new Uint8Array(
            hexString.trim().split(' ').map(byte => parseInt(byte, 16))
        );

        const { instance } = await WebAssembly.instantiate(wasmBytes, { env });
            
        exportedMemory = instance.exports.memory;
        console.log(instance)
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

window.main = main;