const http = require('node:http');
const path = require('node:path');
const express = require('express');
const { Server } = require('socket.io');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

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
const baudRate = Number(process.env.ARDUINO_BAUD || 115200);
const staleAfterMs = Number(process.env.TELEMETRY_STALE_MS || 10000);
const maxHistory = Number(process.env.HISTORY_LIMIT || 500);
let serial = null, latest = null, lastSeen = 0, serialConnected = false;
const history = [];

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
function publish(packet) { latest=packet;lastSeen=Date.now();history.push(packet);if(history.length>maxHistory)history.shift();io.emit('iot:telemetry',packet); }
function status(){return {arduinoConnected:serialConnected,telemetryStale:!lastSeen||Date.now()-lastSeen>staleAfterMs,lastSeen:lastSeen?new Date(lastSeen).toISOString():null};}
app.get('/api/iot/latest',(req,res)=>res.json(latest?{...latest,system:{...latest.system,...status()}}:null));
app.get('/api/iot/history',(req,res)=>res.json(history.slice(-Math.min(Number(req.query.limit)||100,maxHistory))));
app.get('/api/iot/status',(req,res)=>res.json(status()));
function encodeCommand(body) {
  const command = typeof body?.command === 'string' ? body.command.trim().toUpperCase() : '';
  if (/^(STATUS|BUZZER:(ON|OFF)|SERVO:(0|[1-9][0-9]?|1[0-7][0-9]|180)|RGB:(\d{1,3},){2}\d{1,3})$/.test(command)) {
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
async function findPort(){if(process.env.ARDUINO_PORT)return process.env.ARDUINO_PORT;const ports=await SerialPort.list();const likely=ports.find(p=>/arduino|usbmodem|usbserial|wch|ch340/i.test(`${p.manufacturer||''} ${p.path} ${p.pnpId||''}`));if(!likely)throw Error('No likely Arduino serial device found; set ARDUINO_PORT');return likely.path;}
async function connect(){try{const path=await findPort();serial=new SerialPort({path,baudRate,autoOpen:false});serial.open(err=>{if(err){console.error('Serial open failed:',err.message);setTimeout(connect,3000);return;}serialConnected=true;console.log(`Arduino connected: ${path} @ ${baudRate}`);const parser=serial.pipe(new ReadlineParser({delimiter:'\n'}));parser.on('data',line=>{try{publish(normalize(JSON.parse(line.trim())));}catch(e){console.warn('Rejected serial packet:',e.message);}});serial.on('close',()=>{serialConnected=false;console.warn('Arduino disconnected; retrying');setTimeout(connect,2000);});serial.on('error',e=>{serialConnected=false;console.error('Serial error:',e.message);});});}catch(e){serialConnected=false;console.warn(e.message,'Retrying in 3s');setTimeout(connect,3000);}}
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
  connect();
});
server.listen(activePort);
