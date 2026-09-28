const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const express = require('express');
const { Server } = require('socket.io');
const { SerialPort } = require('serialport');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CORS_ORIGIN || '*' } });
const requestedPort = Number(process.env.PORT || 3001);
if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65515) {
  throw Error('PORT must be an integer between 1 and 65515');
}
let activePort = requestedPort;
// Every physical sensor now arrives in one packet from the Uno over USB.
const baudRate = Number(process.env.ARDUINO_BAUD || 115200);
const staleAfterMs = Number(process.env.TELEMETRY_STALE_MS || 10000);
const maxHistory = Number(process.env.HISTORY_LIMIT || 500);
const backendBaseUrl = process.env.BACKEND_URL || 'https://himadri.aus1in.me';
const backendDeviceKey = process.env.BACKEND_DEVICE_KEY || '';
const backendTimeoutMs = Number(process.env.BACKEND_TIMEOUT_MS || 5000);
if (!Number.isFinite(backendTimeoutMs) || backendTimeoutMs < 250) {
  throw Error('BACKEND_TIMEOUT_MS must be a number of at least 250');
}
let serial = null, latest = null, lastSeen = 0, serialConnected = false;
let backendInFlight = false, pendingBackendPacket = null;
let backendLastSuccess = 0, backendLastError = null;
let backendFailureCount = 0, backendNextAttemptAt = 0, backendRetryTimer = null;
let rejectedSerialPackets = 0, lastSerialWarningAt = 0;
const history = [];

function resolveBackendIngestUrls(baseUrl) {
  if (!baseUrl) return [];
  const parsed = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw Error('BACKEND_URL must use http:// or https://');
  parsed.search = '';
  parsed.hash = '';
  const path = parsed.pathname.replace(/\/$/, '');
  const paths = path.endsWith('/api/v1/telemetry/ingest') || path.endsWith('/api/telemetry/ingest')
    ? [path]
    : path.endsWith('/api/v1')
      ? [`${path}/telemetry/ingest`, `${path.slice(0, -3)}/telemetry/ingest`]
      : [`${path}/api/v1/telemetry/ingest`, `${path}/api/telemetry/ingest`];
  return [...new Set(paths)].map(pathname => {
    const url = new URL(parsed);
    url.pathname = pathname.replace(/\/{2,}/g, '/');
    return url;
  });
}
const backendIngestUrls = resolveBackendIngestUrls(backendBaseUrl);
let preferredBackendIngestIndex = 0;

function finite(v, lo, hi) { return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi; }
function bool(v) { return typeof v === 'boolean'; }
function normalize(p) {
  if (!p || p.device !== 'polar-twin-uno' || !Number.isInteger(p.timestamp_ms) ||
      p.timestamp_ms < 0 || p.timestamp_ms > 0xffffffff) throw Error('invalid identity/timestamp');
  if (!Number.isInteger(p.gas_raw) || p.gas_raw < 0 || p.gas_raw > 1023) throw Error('invalid gas_raw');
  if (p.temperature_c !== null && !finite(p.temperature_c,-40,80)) throw Error('invalid temperature_c');
  if (p.humidity_pct !== null && !finite(p.humidity_pct,0,100)) throw Error('invalid humidity_pct');
  if (p.distance_cm !== null && !finite(p.distance_cm,0,500)) throw Error('invalid distance_cm');
  for (const key of ['ir_detected','hall_detected']) if (!bool(p[key])) throw Error(`invalid ${key}`);
  if (!p.acceleration || typeof p.acceleration !== 'object') throw Error('invalid acceleration');
  const accelerationValid = ['x','y','z','tilt_deg'].every(key => finite(p.acceleration[key], key === 'tilt_deg' ? 0 : -100, key === 'tilt_deg' ? 180 : 100));
  const accelerationNull = ['x','y','z','tilt_deg'].every(key => p.acceleration[key] === null);
  if (!accelerationValid && !accelerationNull) throw Error('invalid acceleration fields');
  if (!p.alerts || !p.state || !p.system) throw Error('missing state objects');
  for (const key of ['high_temperature','gas','proximity','structural']) if (!bool(p.alerts[key])) throw Error(`invalid alert ${key}`);
  for (const key of ['occupancy','hall_event']) if (!bool(p.state[key])) throw Error(`invalid state ${key}`);
  if (!bool(p.system.alarm) || !bool(p.system.buzzer_on) ||
      !['NORMAL','WARNING'].includes(p.system.status) ||
      !Number.isInteger(p.system.servo_angle) || p.system.servo_angle < 0 ||
      p.system.servo_angle > 180) throw Error('invalid system state');
  return { deviceId:p.device, timestamp:new Date().toISOString(), deviceTimestampMs:p.timestamp_ms,
    environment:{temperature:p.temperature_c,temperatureValid:p.temperature_c!==null,humidity:p.humidity_pct,humidityValid:p.humidity_pct!==null,gasRaw:p.gas_raw,gasAlarm:p.alerts.gas},
    occupancy:{distanceCm:p.distance_cm,distanceValid:p.distance_cm!==null,obstacleDetected:p.alerts.proximity,irDetected:p.ir_detected,hallDetected:p.hall_detected},
    equipment:{acceleration:{x:p.acceleration.x,y:p.acceleration.y,z:p.acceleration.z,valid:accelerationValid},tiltDeg:p.acceleration.tilt_deg,structuralAlert:p.alerts.structural},
    actuators:{servo:{angle:p.system.servo_angle},buzzer:{state:p.system.buzzer_on}},
    states:{occupancy:p.state.occupancy,hallEvent:p.state.hall_event},
    alerts:{...p.alerts},
    system:{arduinoConnected:true,telemetryStale:false,status:p.system.status,alarm:p.system.alarm,source:'physical'} };
}
const backendDevices = [
  ['sensor-dht-01', packet => packet.environment.temperatureValid ? packet.environment.temperature : null, '°C'],
  ['sensor-humidity-01', packet => packet.environment.humidityValid ? packet.environment.humidity : null, '%'],
  ['sensor-mq2-01', packet => packet.environment.gasRaw, 'ADC'],
  ['buzzer-01', packet => packet.actuators.buzzer.state ? 1 : 0, 'state'],
  ['sensor-ultrasonic-01', packet => packet.occupancy.distanceValid ? packet.occupancy.distanceCm : null, 'cm'],
  ['sensor-ir-01', packet => packet.occupancy.irDetected ? 1 : 0, 'state'],
  ['sensor-door-01', packet => packet.occupancy.hallDetected ? 1 : 0, 'state'],
  ['sensor-vibration-01', packet => Number.isFinite(packet.equipment.tiltDeg) ? packet.equipment.tiltDeg : null, 'deg'],
];
function telemetryReadings(packet) {
  return backendDevices.flatMap(([deviceId, readValue, unit]) => {
    const value = readValue(packet);
    return Number.isFinite(value) ? [{deviceId, value, unit}] : [];
  });
}
function postBackendTelemetryTo(url, body) {
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const headers = {'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(body)};
    if (backendDeviceKey) headers['X-Device-Key'] = backendDeviceKey;
    const request = transport.request(url, {method:'POST', headers, timeout:backendTimeoutMs}, response => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { if (responseBody.length < 512) responseBody += chunk; });
      response.on('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.statusCode);
        else {
          const error = Error(`backend returned HTTP ${response.statusCode}${responseBody ? `: ${responseBody.slice(0, 200)}` : ''}`);
          error.statusCode = response.statusCode;
          reject(error);
        }
      });
    });
    request.on('timeout', () => request.destroy(Error('backend request timed out')));
    request.on('error', reject);
    request.end(body);
  });
}
async function postBackendTelemetry(packet) {
  if (!backendIngestUrls.length) return;
  const readings = telemetryReadings(packet);
  if (!readings.length) return;
  const body = JSON.stringify({
    gatewayId: packet.deviceId,
    timestamp: packet.timestamp,
    readings,
  });
  let lastError;
  for (let offset = 0; offset < backendIngestUrls.length; offset += 1) {
    const index = (preferredBackendIngestIndex + offset) % backendIngestUrls.length;
    try {
      await postBackendTelemetryTo(backendIngestUrls[index], body);
      preferredBackendIngestIndex = index;
      return;
    } catch (error) {
      lastError = error;
      if (![404, 405].includes(error.statusCode)) throw error;
    }
  }
  throw Error(`telemetry ingest route is unavailable on the deployed backend (${lastError.message}); redeploy the backend`);
}
function forwardBackendTelemetry(packet) {
  if (!backendIngestUrls.length) return;
  pendingBackendPacket = packet;
  if (backendInFlight || Date.now() < backendNextAttemptAt) return;
  backendInFlight = true;
  const next = pendingBackendPacket;
  pendingBackendPacket = null;
  postBackendTelemetry(next)
    .then(() => {
      backendLastSuccess = Date.now(); backendLastError = null;
      backendFailureCount = 0; backendNextAttemptAt = 0;
    })
    .catch(error => {
      backendLastError = error.message;
      backendFailureCount += 1;
      const retryMs = Math.min(60000, 2000 * (2 ** Math.min(backendFailureCount - 1, 5)));
      backendNextAttemptAt = Date.now() + retryMs;
      console.warn(`Backend relay error: ${error.message}; retrying in ${Math.round(retryMs / 1000)}s`);
      if (!backendRetryTimer) {
        backendRetryTimer = setTimeout(() => {
          backendRetryTimer = null;
          if (pendingBackendPacket) forwardBackendTelemetry(pendingBackendPacket);
        }, retryMs);
        backendRetryTimer.unref();
      }
    })
    .finally(() => {
      backendInFlight = false;
      if (pendingBackendPacket) forwardBackendTelemetry(pendingBackendPacket);
    });
}
function publish(packet) {
  latest=packet;lastSeen=Date.now();history.push(packet);if(history.length>maxHistory)history.shift();
  io.emit('iot:telemetry',packet);
  forwardBackendTelemetry(packet);
}
function status(){return {arduinoConnected:serialConnected,dhtConnected:serialConnected&&Boolean(latest?.environment?.temperatureValid)&&Boolean(latest?.environment?.humidityValid),telemetryStale:!lastSeen||Date.now()-lastSeen>staleAfterMs,lastSeen:lastSeen?new Date(lastSeen).toISOString():null,source:'arduino-only',serial:{rejectedPackets:rejectedSerialPackets},backendRelay:{enabled:Boolean(backendIngestUrls.length),connected:Boolean(backendLastSuccess)&&!backendLastError,lastSuccess:backendLastSuccess?new Date(backendLastSuccess).toISOString():null,lastError:backendLastError,nextAttempt:backendNextAttemptAt?new Date(backendNextAttemptAt).toISOString():null}};}
app.get('/api/iot/latest',(req,res)=>res.json(latest?{...latest,system:{...latest.system,...status()}}:null));
app.get('/api/iot/history',(req,res)=>res.json(history.slice(-Math.min(Number(req.query.limit)||100,maxHistory))));
app.get('/api/iot/status',(req,res)=>res.json(status()));
function encodeCommand(body) {
  const command = typeof body?.command === 'string' ? body.command.trim().toUpperCase() : '';
  if (/^(STATUS|ACCEL:ZERO|BUZZER:(ON|OFF)|SERVO:(0|[1-9][0-9]?|1[0-7][0-9]|180)|RGB:(\d{1,3},){2}\d{1,3})$/.test(command)) {
    if (command.startsWith('RGB:') && command.slice(4).split(',').some(v => Number(v) > 255)) return null;
    return command;
  }
  const legacy = {DOOR_OPEN:'SERVO:90',DOOR_CLOSE:'SERVO:0',BUZZER_ON:'BUZZER:ON',BUZZER_OFF:'BUZZER:OFF'};
  if (legacy[command]) return legacy[command];
  if (command === 'SERVO' && Number.isInteger(body.value) && body.value >= 0 && body.value <= 180) return `SERVO:${body.value}`;
  if (command === 'RGB' && Array.isArray(body.value) && body.value.length === 3 && body.value.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) return `RGB:${body.value.join(',')}`;
  return null;
}
app.post('/api/iot/command',(req,res)=>{const wireCommand=encodeCommand(req.body||{});if(!wireCommand)return res.status(400).json({error:'Unsupported or invalid command'});if(!serialConnected)return res.status(503).json({error:'Arduino disconnected'});serial.write(wireCommand+'\n');res.json({sent:true,command:wireCommand});});
io.on('connection',socket=>{if(latest)socket.emit('iot:telemetry',{...latest,system:{...latest.system,...status()}});});
async function findPort(){if(process.env.ARDUINO_PORT)return process.env.ARDUINO_PORT;const ports=await SerialPort.list();const likely=ports.find(p=>/arduino|usbmodem|usbserial|wch|ch340|ftdi/i.test(`${p.manufacturer||''} ${p.path} ${p.pnpId||''}`));if(!likely)throw Error('No likely Arduino serial device found; set ARDUINO_PORT');return likely.path;}
function handleSerialLine(rawLine) {
  const line = rawLine.trim();
  if (!line) return;
  const start = line.indexOf('{');
  const end = line.lastIndexOf('}');
  try {
    if (start < 0 || end <= start) throw Error('incomplete JSON frame');
    publish(normalize(JSON.parse(line.slice(start, end + 1))));
  } catch (error) {
    rejectedSerialPackets += 1;
    const now = Date.now();
    if (now - lastSerialWarningAt >= 10000) {
      const suffix = rejectedSerialPackets > 1 ? ` (${rejectedSerialPackets} rejected total)` : '';
      console.warn(`Rejected serial packet: ${error.message}${suffix}`);
      lastSerialWarningAt = now;
    }
  }
}
async function connect(){try{const path=await findPort();serial=new SerialPort({path,baudRate,autoOpen:false});serial.open(err=>{if(err){console.error('Serial open failed:',err.message);setTimeout(connect,3000);return;}serialConnected=true;console.log(`Arduino connected: ${path} @ ${baudRate}`);let serialBuffer='';serial.on('data',chunk=>{serialBuffer+=chunk.toString('utf8');if(serialBuffer.length>16384){const lastNewline=serialBuffer.lastIndexOf('\n');serialBuffer=lastNewline>=0?serialBuffer.slice(lastNewline+1):'';rejectedSerialPackets+=1;}const lines=serialBuffer.split(/\r?\n/);serialBuffer=lines.pop()||'';for(const line of lines)handleSerialLine(line);});serial.on('close',()=>{serialConnected=false;console.warn('Arduino disconnected; retrying');setTimeout(connect,2000);});serial.on('error',e=>{serialConnected=false;console.error('Serial error:',e.message);});});}catch(e){serialConnected=false;console.warn(e.message,'Retrying in 3s');setTimeout(connect,3000);}}
setInterval(()=>{if(latest){const stale=Date.now()-lastSeen>staleAfterMs;io.emit('iot:status',{...status(),deviceId:latest.deviceId});}},2000).unref();
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && activePort < requestedPort + 20) {
    console.warn(`Port ${activePort} is in use; trying ${activePort + 1}`);
    server.listen(++activePort);
    return;
  }
  console.error(`Cannot start PolarTwin API: ${error.message}`);
  process.exitCode = 1;
});
server.on('listening', () => {
  console.log(`PolarTwin dashboard: http://localhost:${activePort}/`);
  console.log(`PolarTwin API: http://localhost:${activePort}/api/iot/status`);
  if (backendIngestUrls.length) console.log(`Backend relay enabled: ${backendIngestUrls.map(url => `${url.origin}${url.pathname}`).join(' (fallback: ') + (backendIngestUrls.length > 1 ? ')' : '')}`);
  else console.log('Backend relay disabled; set BACKEND_URL to the deployed HIMADRI backend.');
  connect();
});
server.listen(activePort);
