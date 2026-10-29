const dgram = require("dgram");
const os = require("os");

const ARTNET_PORT = 6454;
const HEADER = "Art-Net\0";
const OP_POLL = 0x2000;
const OP_POLL_REPLY = 0x2100;
const OP_DMX = 0x5000;

function parseIpv4(ip) {
  const parts = String(ip || "127.0.0.1").split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return [127, 0, 0, 1];
  }
  return parts;
}

function getPrimaryMac() {
  const interfaces = os.networkInterfaces();
  for (const list of Object.values(interfaces)) {
    for (const net of list || []) {
      if (net.mac && net.mac !== "00:00:00:00:00:00" && !net.internal) {
        return net.mac.split(":").map((part) => parseInt(part, 16));
      }
    }
  }
  return [0, 0, 0, 0, 0, 0];
}

function isArtNet(buffer) {
  return buffer.length >= 12 && buffer.toString("ascii", 0, 8) === HEADER;
}

function subnetBroadcast(ip) {
  const parts = parseIpv4(ip);
  return `${parts[0]}.${parts[1]}.${parts[2]}.255`;
}

function buildPoll() {
  const buf = Buffer.alloc(18);
  buf.write(HEADER, 0, 8, "ascii");
  buf.writeUInt16LE(OP_POLL, 8);
  buf[10] = 0;
  buf[11] = 14;
  buf[12] = 0x02;
  buf[13] = 0;
  return buf;
}

function buildPollReply(ip) {
  const buf = Buffer.alloc(239);
  buf.write(HEADER, 0, 8, "ascii");
  buf.writeUInt16LE(OP_POLL_REPLY, 8);

  const ipParts = parseIpv4(ip);
  buf[10] = ipParts[0];
  buf[11] = ipParts[1];
  buf[12] = ipParts[2];
  buf[13] = ipParts[3];
  buf.writeUInt16LE(ARTNET_PORT, 14);

  buf[16] = 0;
  buf[17] = 14;
  buf[18] = 0;
  buf[19] = 0;
  buf[20] = 0x00;
  buf[21] = 0xff;
  buf[23] = 0xd0;
  buf.writeUInt16LE(0, 24);

  buf.write("DJ Carl Viz", 26, "ascii");
  buf.write("DJ Carl SoundSwitch Visualizer", 44, "ascii");
  buf.write("#0001 [0000] Ready", 108, "ascii");

  buf[172] = 0;
  buf[173] = 4;
  buf[174] = 0x80;
  buf[175] = 0x80;
  buf[176] = 0x80;
  buf[177] = 0x80;
  buf[182] = 0x80;
  buf[183] = 0x80;
  buf[184] = 0x80;
  buf[185] = 0x80;
  buf[190] = 0;
  buf[191] = 1;
  buf[192] = 2;
  buf[193] = 3;
  buf[200] = 0x00;

  const mac = getPrimaryMac();
  for (let i = 0; i < 6; i += 1) {
    buf[201 + i] = mac[i];
  }

  buf[207] = ipParts[0];
  buf[208] = ipParts[1];
  buf[209] = ipParts[2];
  buf[210] = ipParts[3];
  buf[211] = 1;
  buf[212] = 0x08;

  return buf;
}

function startArtNetReceiver({ getBindIp, onDmx, onStatus } = {}) {
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  const universes = new Map();
  function currentIp() {
    const ip = typeof getBindIp === "function" ? getBindIp() : "127.0.0.1";
    return ip === "localhost" ? "127.0.0.1" : ip;
  }

  const status = {
    listening: false,
    port: ARTNET_PORT,
    bindIp: "0.0.0.0",
    localIp: currentIp(),
    lastPacketAt: 0,
    lastPeer: "",
    packets: 0,
    error: ""
  };

  let advertiseTimer = null;
  let connectTimer = null;

  function destinationList(extra) {
    const ip = currentIp();
    const destinations = new Set([
      "127.0.0.1",
      ip,
      subnetBroadcast(ip),
      "255.255.255.255",
      "2.255.255.255",
      status.lastPeer
    ]);
    (extra || []).forEach((address) => destinations.add(address));
    destinations.delete("");
    destinations.delete(undefined);
    return [...destinations];
  }

  function sendPacket(buf, destinations, port = ARTNET_PORT) {
    destinations.forEach((address) => {
      try {
        socket.send(buf, port, address);
      } catch {
        // ignore unreachable broadcast targets
      }
    });
  }

  function advertise(target, port = ARTNET_PORT) {
    const reply = buildPollReply(currentIp());
    const destinations = target ? [target] : destinationList();
    sendPacket(reply, destinations, port);
  }

  function connectSoundSwitch() {
    const destinations = destinationList();
    const poll = buildPoll();
    const reply = buildPollReply(currentIp());
    let burst = 0;

    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }

    function pulse() {
      sendPacket(poll, destinations);
      sendPacket(reply, destinations);
      burst += 1;
      if (burst < 8) {
        connectTimer = setTimeout(pulse, 200);
      } else {
        connectTimer = null;
      }
    }

    pulse();
    return { destinations, status: { ...status, localIp: currentIp() } };
  }

  function emitStatus() {
    if (typeof onStatus === "function") {
      onStatus({ ...status });
    }
  }

  socket.on("error", (error) => {
    status.listening = false;
    status.error = error.message || "Erreur Art-Net";
    emitStatus();
  });

  socket.on("message", (msg, rinfo) => {
    if (!isArtNet(msg)) return;

    const opcode = msg.readUInt16LE(8);

    status.lastPeer = rinfo.address;

    if (opcode === OP_POLL) {
      advertise(rinfo.address, rinfo.port || ARTNET_PORT);
      advertise("127.0.0.1");
      return;
    }

    if (opcode !== OP_DMX || msg.length < 18) return;

    const length = Math.min(512, msg.readUInt16BE(16));
    const universe = msg[14] | (msg[15] << 8);
    const data = Buffer.alloc(512);
    msg.copy(data, 0, 18, 18 + length);

    universes.set(universe, data);
    status.packets += 1;
    status.lastPacketAt = Date.now();
    status.error = "";

    if (typeof onDmx === "function") {
      onDmx(universe, data);
    }
  });

  socket.bind(ARTNET_PORT, () => {
    try {
      socket.setBroadcast(true);
    } catch {
      // some interfaces refuse broadcast; unicast/localhost still work
    }

    status.listening = true;
    status.error = "";
    emitStatus();
    advertise();
    advertiseTimer = setInterval(() => advertise(), 3000);
  });

  return {
    getStatus() {
      return { ...status, localIp: currentIp() };
    },
    getUniverses() {
      const snapshot = {};
      for (const [universe, data] of universes.entries()) {
        snapshot[universe] = Buffer.from(data);
      }
      return snapshot;
    },
    connectSoundSwitch,
    stop() {
      if (advertiseTimer) {
        clearInterval(advertiseTimer);
        advertiseTimer = null;
      }
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
      socket.close();
    }
  };
}

module.exports = {
  ARTNET_PORT,
  startArtNetReceiver
};
