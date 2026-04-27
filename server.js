// server.js — Valorant Voice Matchmaking Backend
// Run with: node server.js
// Install deps: npm install express socket.io cors

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // In production, set this to your frontend URL
    methods: ["GET", "POST"],
  },
});

// --- State ---
// Queue: array of waiting players { socketId, username, rank, role, region }
let queue = [];

// Active rooms: Map of roomId -> { players: [socketId, socketId], queueVotes: Set }
let rooms = new Map();

// Socket -> player info
let players = new Map();

// --- Helpers ---
function generateRoomId() {
  return Math.random().toString(36).substring(2, 10);
}

function findMatch(player) {
  // Match by same region first, then open to all
  const sameRegion = queue.find(
    (p) => p.socketId !== player.socketId && p.region === player.region
  );
  if (sameRegion) return sameRegion;

  const anyRegion = queue.find((p) => p.socketId !== player.socketId);
  return anyRegion || null;
}

function removeFromQueue(socketId) {
  queue = queue.filter((p) => p.socketId !== socketId);
}

function getRoomForSocket(socketId) {
  for (const [roomId, room] of rooms.entries()) {
    if (room.players.includes(socketId)) return { roomId, room };
  }
  return null;
}

// --- Socket Events ---
io.on("connection", (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // Player joins queue
  socket.on("join_queue", (data) => {
    const player = {
      socketId: socket.id,
      displayName: data.displayName,
      username: data.username,
      rank: data.rank,
      role: data.role,
      region: data.region,
      pic: data.pic,
    };

    players.set(socket.id, player);

    // Check if someone is already waiting
    const match = findMatch(player);

    if (match) {
      // Remove matched player from queue
      removeFromQueue(match.socketId);

      // Create a room
      const roomId = generateRoomId();
      rooms.set(roomId, {
        players: [socket.id, match.socketId],
        queueVotes: new Set(),
      });

      // Join both to the socket.io room
      socket.join(roomId);
      io.sockets.sockets.get(match.socketId)?.join(roomId);

      // Tell both players the room is ready
      // The first player in the array will be the WebRTC "initiator"
      io.to(socket.id).emit("match_found", {
        roomId,
        isInitiator: true,
        peer: {
          displayName: match.displayName,
          username: match.username,
          rank: match.rank,
          role: match.role,
          region: match.region,
          pic: match.pic,
        },
      });

      io.to(match.socketId).emit("match_found", {
        roomId,
        isInitiator: false,
        peer: {
          displayName: player.displayName,
          username: player.username,
          rank: player.rank,
          role: player.role,
          region: player.region,
          pic: player.pic,
        },
      });

      console.log(`[MATCH] Room ${roomId}: ${socket.id} <-> ${match.socketId}`);
    } else {
      // Add to queue and wait
      queue.push(player);
      socket.emit("waiting");
      console.log(`[QUEUE] ${socket.id} waiting. Queue size: ${queue.length}`);
    }
  });

  // --- WebRTC Signaling ---
  // Pass WebRTC offer from initiator to peer
  socket.on("webrtc_offer", ({ roomId, offer }) => {
    socket.to(roomId).emit("webrtc_offer", { offer });
  });

  // Pass WebRTC answer back to initiator
  socket.on("webrtc_answer", ({ roomId, answer }) => {
    socket.to(roomId).emit("webrtc_answer", { answer });
  });

  // Pass ICE candidates between peers
  socket.on("webrtc_ice_candidate", ({ roomId, candidate }) => {
    socket.to(roomId).emit("webrtc_ice_candidate", { candidate });
  });

  // --- Queue / Skip ---
  socket.on("vote_queue", () => {
    const result = getRoomForSocket(socket.id);
    if (!result) return;
    const { roomId, room } = result;

    room.queueVotes.add(socket.id);

    // Notify peer that this player voted queue
    socket.to(roomId).emit("peer_voted_queue");

    // If both voted — it's a match!
    if (room.queueVotes.size === 2) {
      const [p1Id, p2Id] = room.players;
      const p1 = players.get(p1Id);
      const p2 = players.get(p2Id);

      io.to(p1Id).emit("mutual_queue", {
        peerUsername: p2?.username,
      });
      io.to(p2Id).emit("mutual_queue", {
        peerUsername: p1?.username,
      });

      console.log(`[QUEUE] Mutual queue in room ${roomId}`);

      // Clean up room
      rooms.delete(roomId);
    }
  });

  socket.on("vote_skip", () => {
    const result = getRoomForSocket(socket.id);
    if (!result) return;
    const { roomId, room } = result;

    // Notify peer they got skipped
    socket.to(roomId).emit("peer_skipped");

    // Put the skipper back in queue
    socket.emit("searching");
    const player = players.get(socket.id);
    if (player) {
      socket.leave(roomId);
      queue.push(player);
    }

    // Clean up room
    rooms.delete(roomId);

    console.log(`[SKIP] ${socket.id} skipped in room ${roomId}`);
  });

  // Cancel search
  socket.on("cancel_queue", () => {
    removeFromQueue(socket.id);
    socket.emit("cancelled");
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    removeFromQueue(socket.id);
    players.delete(socket.id);

    // Notify peer if in a room
    const result = getRoomForSocket(socket.id);
    if (result) {
      const { roomId } = result;
      socket.to(roomId).emit("peer_disconnected");
      rooms.delete(roomId);
    }
  });
});

// Health check
app.get("/", (req, res) => res.send("VoiceQueue server running ✓"));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🎮 VoiceQueue server running on port ${PORT}\n`);
});
