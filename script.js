// CONFIGURACIÓN
const BLOCK_SIZE = 30;
const ROWS = 10;
const COLS = 10;
const COLORS = [
    [255,0,0],   // rojo
    [0,255,0],   // verde
    [0,0,255],   // azul
    [255,255,0]  // amarillo
];
const END_MARKER = [128,128,128]; // gris = fin de transmisión

let encodedData = [];
let txIndex = 0;
let txInterval = null;
let fileName = "";

let rxBytes = [];
let receiving = false;
let finished = false;

const txCanvas = document.getElementById('txCanvas');
const txCtx = txCanvas.getContext('2d');

const video = document.getElementById('video');
const cameraSelect = document.getElementById('cameraSelect');

// RELLENAR SELECTOR DE CAMARAS
async function listCameras(){
    const devices = await navigator.mediaDevices.enumerateDevices();
    cameraSelect.innerHTML = '';
    devices.filter(d=>d.kind==='videoinput').forEach((device, i)=>{
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.text = device.label || `Cámara ${i+1}`;
        cameraSelect.appendChild(option);
    });
}
listCameras();

// INICIAR CÁMARA AUTOMÁTICA
async function startCamera(deviceId=null){
    if(video.srcObject){
        video.srcObject.getTracks().forEach(track=>track.stop());
    }
    const constraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" }
    };
    try{
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
    }catch(e){
        console.error("Error cámara:", e);
    }
}

// CAMBIO DE CÁMARA
cameraSelect.onchange = ()=>startCamera(cameraSelect.value);

// INICIAR CÁMARA AL ABRIR LA WEB
startCamera();

// BOTONES TRANSMISOR
document.getElementById('startTxBtn').onclick = () => {
    const file = document.getElementById('fileInput').files[0];
    if(!file){ alert("Selecciona un archivo"); return; }
    fileName = file.name;
    const reader = new FileReader();
    reader.onload = () => {
        const bytes = new Uint8Array(reader.result);
        encodedData = [];
        for(let b of bytes){
            let high = (b >> 4) & 0xF;
            let low = b & 0xF;
            encodedData.push(COLORS[high%4]);
            encodedData.push(COLORS[low%4]);
        }
        encodedData.push(END_MARKER);
        txIndex = 0;
        document.getElementById('output').innerText = "Comenzando transmisión en 5 segundos...";
        setTimeout(()=>{ txInterval = setInterval(drawNextFrame, 150); },5000);
    };
    reader.readAsArrayBuffer(file);
};

document.getElementById('stopTxBtn').onclick = () => clearInterval(txInterval);

// DIBUJA FRAME
function drawNextFrame(){
    txCtx.fillStyle = "black";
    txCtx.fillRect(0,0,txCanvas.width,txCanvas.height);
    let row=0, col=0;
    for(let i=txIndex; i<encodedData.length && row<ROWS; i++){
        const color = encodedData[i];
        txCtx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
        txCtx.fillRect(col*BLOCK_SIZE,row*BLOCK_SIZE,BLOCK_SIZE,BLOCK_SIZE);
        col++;
        if(col>=COLS){ col=0; row++; }
    }
    txIndex += ROWS*COLS;
    if(txIndex >= encodedData.length) txIndex = 0;
}

// RECEPCIÓN AUTOMÁTICA
function capture(){
    if(video.videoWidth===0 || receiving || finished){ requestAnimationFrame(capture); return; }
    receiving = true;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video,0,0);
    const frame = ctx.getImageData(0,0,canvas.width,canvas.height);
    const chunk = decodeFrame(frame);
    if(chunk.length>0){
        for(let b of chunk){
            if(b===255){ finished=true; reconstructFile(); break; }
            else rxBytes.push(b);
        }
        document.getElementById('output').innerText = `Recibiendo ${rxBytes.length} bytes...`;
    }
    receiving = false;
    requestAnimationFrame(capture);
}
requestAnimationFrame(capture);

// DECODIFICACIÓN DE FRAME
function decodeFrame(frame){
    const data = frame.data;
    const blocks = [];
    for(let y=0;y<ROWS;y++){
        for(let x=0;x<COLS;x++){
            const px = (y*COLS + x)*BLOCK_SIZE*4;
            const r=data[px], g=data[px+1], b=data[px+2];
            if(r===128 && g===128 && b===128){ blocks.push(255); continue; }
            let minDist=1e9, idx=0;
            for(let c=0;c<COLORS.length;c++){
                const d=(r-COLORS[c][0])**2+(g-COLORS[c][1])**2+(b-COLORS[c][2])**2;
                if(d<minDist){ minDist=d; idx=c; }
            }
            blocks.push(idx);
        }
    }
    let out=[];
    for(let i=0;i<blocks.length;i+=2){
        const b = ((blocks[i]&0x3)<<4)|((blocks[i+1]&0x3));
        out.push(b);
    }
    return out;
}

// RECONSTRUCCIÓN DEL ARCHIVO
function reconstructFile(){
    const arr = new Uint8Array(rxBytes);
    const blob = new Blob([arr]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || "archivo_recibido";
    a.innerText = "Archivo recibido - Descargar";
    document.getElementById('output').appendChild(document.createElement('br'));
    document.getElementById('output').appendChild(a);
}
