// CONFIGURACIÓN MEJORADA
const BLOCK_SIZE = 40; // Un poco más grande para que la cámara lo vea mejor
const ROWS = 8;        // Reducimos densidad para ganar fiabilidad
const COLS = 8;
const COLORS = [
    [255, 0, 0],   // 00: Rojo
    [0, 255, 0],   // 01: Verde
    [0, 0, 255],   // 10: Azul
    [255, 255, 0]  // 11: Amarillo
];
const SYNC_COLOR = [255, 255, 255]; // Blanco para el "reloj"
const END_MARKER = [128, 128, 128]; // Gris: Fin

let encodedData = [];
let txIndex = 0;
let txInterval = null;
let syncBit = false; // Alterna para que el receptor detecte cambio de frame

// ... (listCameras y startCamera se mantienen igual que en tu código) ...

// BOTÓN TRANSMISOR (CORREGIDO)
document.getElementById('startTxBtn').onclick = () => {
    const file = document.getElementById('fileInput').files[0];
    if(!file){ alert("Selecciona un archivo"); return; }
    
    const reader = new FileReader();
    reader.onload = () => {
        const bytes = new Uint8Array(reader.result);
        encodedData = [];
        // Ahora cada byte se divide en 4 bloques (2 bits cada uno)
        for(let b of bytes){
            for(let i=0; i<4; i++) {
                let bits = (b >> (i * 2)) & 0x03;
                encodedData.push(COLORS[bits]);
            }
        }
        encodedData.push(END_MARKER);
        txIndex = 0;
        document.getElementById('output').innerText = "Transmitiendo...";
        txInterval = setInterval(drawNextFrame, 200); // 200ms es más seguro para cámaras estándar
    };
    reader.readAsArrayBuffer(file);
};

// DIBUJA FRAME CON RELOJ DE SINCRONIZACIÓN
function drawNextFrame(){
    txCtx.fillStyle = "black";
    txCtx.fillRect(0,0,txCanvas.width,txCanvas.height);
    
    // Dibujamos el "Reloj" en la posición (0,0)
    txCtx.fillStyle = syncBit ? "white" : "black";
    txCtx.fillRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
    syncBit = !syncBit;

    let r=0, c=1; // Empezamos en c=1 para dejar sitio al reloj
    for(let i=txIndex; i<encodedData.length && r<ROWS; i++){
        const color = encodedData[i];
        txCtx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
        txCtx.fillRect(c*BLOCK_SIZE, r*BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
        c++;
        if(c>=COLS){ c=0; r++; }
    }
    
    txIndex += (ROWS * COLS) - 1; // -1 por el hueco del reloj
    if(txIndex >= encodedData.length) clearInterval(txInterval);
}

// RECEPCIÓN (CORREGIDA)
let lastSyncState = null;

function capture(){
    if(video.videoWidth===0 || finished) {
        requestAnimationFrame(capture);
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // 1. Detectar el estado del reloj (píxel arriba a la izquierda)
    const r = frame.data[0], g = frame.data[1], b = frame.data[2];
    const currentSyncState = (r + g + b) > 380; // Si es brillante, es "white"

    // 2. Solo procesar si el reloj ha cambiado
    if(currentSyncState !== lastSyncState) {
        lastSyncState = currentSyncState;
        const chunk = decodeFrame(frame);
        
        if(chunk.length > 0) {
            for(let byte of chunk) {
                if(byte === "END") { finished = true; reconstructFile(); break; }
                rxBytes.push(byte);
            }
            document.getElementById('output').innerText = `Recibido: ${rxBytes.length} bytes`;
        }
    }
    
    requestAnimationFrame(capture);
}

// DECODIFICACIÓN (CORREGIDA PARA 8 BITS)
function decodeFrame(frame){
    const data = frame.data;
    const blocks = [];
    
    // Saltamos el primer bloque (reloj)
    for(let y=0; y<ROWS; y++){
        for(let x=(y===0?1:0); x<COLS; x++){
            const px = (y * video.videoWidth * BLOCK_SIZE + x * BLOCK_SIZE) * 4;
            const r=data[px], g=data[px+1], b=data[px+2];

            if(r > 100 && r < 150 && g > 100 && g < 150) return ["END"];

            let minDist = 1e9, idx = 0;
            for(let c=0; c<COLORS.length; c++){
                const d = Math.pow(r-COLORS[c][0], 2) + Math.pow(g-COLORS[c][1], 2) + Math.pow(b-COLORS[c][2], 2);
                if(d < minDist){ minDist = d; idx = c; }
            }
            blocks.push(idx);
        }
    }

    let out = [];
    for(let i=0; i<blocks.length; i+=4){
        if(i+3 < blocks.length) {
            const byte = (blocks[i+3]<<6) | (blocks[i+2]<<4) | (blocks[i+1]<<2) | blocks[i];
            out.push(byte);
        }
    }
    return out;
}
