let currentId = 1;

function getDomUID(element) {
  if (!element.dataset.uid) {
    element.dataset.uid = ++currentId;
  }
  
  return parseInt(element.dataset.uid, 10);
}

function getElementByUID(uid) {
  return document.querySelector(`[data-uid="${uid}"]`);
}

getDomUID(document.body);

async function main(hexString = "") {
    let exportedMemory;

    const env = {
        write_html: (index, DomUID) => {
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

            getElementByUID(DomUID).innerHTML = htmlString;
        },
        get_nth_child_DomUID: (DomUID, n) => {
            const parent = getElementByUID(DomUID);
            if (!parent) return 0;

            const children = parent.children;

            if (n >= children.length || n < 0) {
                return 0; 
            }
            
            return getDomUID(children[n]);
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