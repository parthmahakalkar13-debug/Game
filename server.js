// Serves the game AND relays player state between devices in the same room.
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(",") : true }
});

app.use(express.static(path.join(__dirname, "public")));

const MAX_PLAYERS = 6;
const rooms = new Map(); // roomName -> Map(socketId -> presence)

const num = (v) => (Number.isFinite(v) && Math.abs(v) < 1e7 ? v : undefined);
const ALLOWED = ["x", "z", "h", "vf", "st", "br", "idx", "lap", "fin", "ft", "g", "go", "col"];

function clean(d) {
  const out = {};
  if (!d || typeof d !== "object") return out;
  for (const k of ALLOWED) {
    if (k in d) {
      const v = num(Number(d[k]));
      if (v !== undefined) out[k] = v;
    }
  }
  return out;
}

function leave(socket) {
  const name = socket.data.room;
  if (!name) return;
  const room = rooms.get(name);
  socket.leave(name);
  socket.data.room = null;
  if (!room) return;
  room.delete(socket.id);
  if (room.size === 0) rooms.delete(name);
  else io.to(name).emit("peer-leave", { id: socket.id });
}

io.on("connection", (socket) => {
  socket.on("join", (rawName, ack) => {
    const name = String(rawName || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20);
    if (!name) return ack?.({ ok: false, error: "bad room code" });
    leave(socket);
    let room = rooms.get(name);
    if (!room) rooms.set(name, (room = new Map()));
    if (room.size >= MAX_PLAYERS) return ack?.({ ok: false, error: "room full" });

    const peers = [...room.entries()].map(([id, presence]) => ({ id, presence }));
    room.set(socket.id, {});
    socket.join(name);
    socket.data.room = name;
    socket.to(name).emit("peer-join", { id: socket.id, presence: {} });
    ack?.({ ok: true, peers: [...peers, { id: socket.id, presence: {} }] });
  });

  socket.on("presence", (d) => {
    const name = socket.data.room;
    const room = name && rooms.get(name);
    if (!room) return;
    const data = clean(d);
    Object.assign(room.get(socket.id), data);
    socket.to(name).emit("presence", { id: socket.id, data });
  });

  socket.on("disconnect", () => leave(socket));
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, "0.0.0.0", () => console.log("Apex Drive server on port " + PORT));
