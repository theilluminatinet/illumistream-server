import express from 'express';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import http from 'http';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Store active streams per room
const activeStreams = new Map();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', activeStreams: activeStreams.size });
});

// Get stream status for a room
app.get('/stream/:roomCode/status', (req, res) => {
  const { roomCode } = req.params;
  const stream = activeStreams.get(roomCode);
  
  if (stream) {
    res.json({
      active: true,
      destinations: stream.destinations.map(d => ({
        platform: d.platform,
        status: d.status
      }))
    });
  } else {
    res.json({ active: false });
  }
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomCode = url.searchParams.get('room');
  const destinationsParam = url.searchParams.get('destinations');
  
  if (!roomCode || !destinationsParam) {
    ws.close(1008, 'Missing room code or destinations');
    return;
  }

  let destinations;
  try {
    destinations = JSON.parse(decodeURIComponent(destinationsParam));
  } catch (e) {
    ws.close(1008, 'Invalid destinations format');
    return;
  }

  if (!destinations.length) {
    ws.close(1008, 'No stream destinations provided');
    return;
  }

  console.log(`[${roomCode}] New stream connection with ${destinations.length} destination(s)`);

  // Create FFmpeg processes for each destination
  const ffmpegProcesses = destinations.map(dest => {
    const rtmpUrl = `${dest.serverUrl}/${dest.streamKey}`;
    
    console.log(`[${roomCode}] Starting FFmpeg for ${dest.platform}: ${dest.serverUrl}/****`);

    // FFmpeg command to receive WebM/Matroska input and output to RTMP
    const ffmpeg = spawn('ffmpeg', [
      '-i', 'pipe:0',                    // Input from stdin
      '-c:v', 'libx264',                 // Video codec
      '-preset', 'veryfast',             // Encoding speed
      '-tune', 'zerolatency',            // Low latency
      '-c:a', 'aac',                     // Audio codec
      '-ar', '44100',                    // Audio sample rate
      '-b:a', '128k',                    // Audio bitrate
      '-b:v', '2500k',                   // Video bitrate
      '-maxrate', '2500k',               // Max bitrate
      '-bufsize', '5000k',               // Buffer size
      '-pix_fmt', 'yuv420p',             // Pixel format for compatibility
      '-g', '60',                        // Keyframe interval
      '-f', 'flv',                       // Output format
      rtmpUrl                            // RTMP destination
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    ffmpeg.stderr.on('data', (data) => {
      const message = data.toString();
      // Only log important messages, not frame updates
      if (message.includes('Error') || message.includes('error') || message.includes('Opening')) {
        console.log(`[${roomCode}][${dest.platform}] ${message.trim()}`);
      }
    });

    ffmpeg.on('close', (code) => {
      console.log(`[${roomCode}][${dest.platform}] FFmpeg exited with code ${code}`);
      dest.status = 'stopped';
    });

    ffmpeg.on('error', (err) => {
      console.error(`[${roomCode}][${dest.platform}] FFmpeg error:`, err);
      dest.status = 'error';
    });

    return {
      platform: dest.platform,
      process: ffmpeg,
      status: 'streaming'
    };
  });

  // Store the stream info
  activeStreams.set(roomCode, {
    ws,
    destinations: ffmpegProcesses,
    startTime: Date.now()
  });

  ws.on('message', (data) => {
    // Forward video data to all FFmpeg processes
    ffmpegProcesses.forEach(({ process, platform }) => {
      if (process.stdin.writable) {
        try {
          process.stdin.write(data);
        } catch (err) {
          console.error(`[${roomCode}][${platform}] Error writing to FFmpeg:`, err);
        }
      }
    });
  });

  ws.on('close', () => {
    console.log(`[${roomCode}] Stream connection closed`);
    
    // Clean up FFmpeg processes
    ffmpegProcesses.forEach(({ process, platform }) => {
      console.log(`[${roomCode}][${platform}] Stopping FFmpeg`);
      process.stdin.end();
      process.kill('SIGTERM');
    });

    activeStreams.delete(roomCode);
  });

  ws.on('error', (err) => {
    console.error(`[${roomCode}] WebSocket error:`, err);
  });

  // Send confirmation
  ws.send(JSON.stringify({ type: 'connected', destinations: destinations.length }));
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Illumistream Server running on port ${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
});
