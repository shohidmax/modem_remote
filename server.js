const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Socket.io সেটআপ (CORS সাপোর্টসহ)
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// সিস্টেম স্টেট
let espSocketId = null;
let systemStats = {
    espOnline: false,
    lastCommand: "None",
    lastCommandTime: "-",
    logs: []
};

// লগ ফাংশন (কনসোল এবং ড্যাশবোর্ড উভয়ের জন্য)
function addLog(msg) {
    const time = new Date().toLocaleTimeString();
    const logEntry = { time, msg };
    systemStats.logs.unshift(logEntry);
    if (systemStats.logs.length > 20) systemStats.logs.pop();
    
    io.emit('update_logs', systemStats.logs);
    console.log(`[${time}] ${msg}`);
}

app.get('/', (req, res) => {
    // এখানে ${} এর জায়গায় \${} ব্যবহার করা হয়েছে যাতে Node.js এরর না দেয়
    res.send(`
        <!DOCTYPE html>
        <html lang="bn">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>রিয়েল-টাইম মডেম কন্ট্রোল</title>
            <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
            <style>
                :root { --primary: #2563eb; --bg: #0f172a; --card: #1e293b; --text: #f1f5f9; --success: #22c55e; --danger: #ef4444; }
                body { font-family: 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); padding: 20px; display: flex; flex-direction: column; align-items: center; }
                .container { max-width: 600px; width: 100%; }
                .status-badge { padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 14px; display: inline-flex; align-items: center; gap: 8px; }
                .online { background: rgba(34, 197, 94, 0.2); color: var(--success); }
                .offline { background: rgba(239, 68, 68, 0.2); color: var(--danger); }
                .card { background: var(--card); padding: 20px; border-radius: 16px; margin-bottom: 20px; border: 1px solid #334155; }
                .btn-group { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
                .btn { padding: 15px; border: none; border-radius: 12px; font-weight: bold; cursor: pointer; color: white; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
                .btn-restart { background: var(--danger); }
                .btn-refresh { background: var(--primary); }
                .btn:disabled { opacity: 0.3; cursor: not-allowed; }
                .log-box { height: 180px; overflow-y: auto; background: #000; border-radius: 8px; padding: 12px; font-family: 'Courier New', monospace; font-size: 13px; color: #4ade80; border: 1px solid #334155; }
                .log-item { margin-bottom: 5px; border-bottom: 1px solid #1e293b; padding-bottom: 2px; }
                .log-time { color: #94a3b8; }
            </style>
        </head>
        <body>
            <div class="container">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:25px;">
                    <h2 style="margin:0"><i class="fas fa-satellite-dish"></i> মডেম প্যানেল</h2>
                    <div id="statusBadge" class="status-badge offline">
                        <i class="fas fa-circle"></i> <span>অফলাইন</span>
                    </div>
                </div>

                <div class="card">
                    <h3 style="margin-top:0">কন্ট্রোল অ্যাকশন</h3>
                    <div class="btn-group">
                        <button id="restartBtn" class="btn btn-restart" onclick="sendCommand('restart')" disabled>
                            <i class="fas fa-power-off"></i> রিস্টার্ট মডেম
                        </button>
                        <button id="refreshBtn" class="btn btn-refresh" onclick="sendCommand('check_signal')" disabled>
                            <i class="fas fa-sync-alt"></i> সিগন্যাল চেক
                        </button>
                    </div>
                </div>

                <div class="card">
                    <h3 style="margin-top:0"><i class="fas fa-history"></i> লাইভ ইভেন্ট লগ</h3>
                    <div id="logBox" class="log-box">
                        <div class="log-item">সার্ভার কানেক্ট হচ্ছে...</div>
                    </div>
                </div>
            </div>

            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                
                function sendCommand(action) {
                    socket.emit('control_modem', { action });
                }

                socket.on('stats_update', (data) => {
                    const badge = document.getElementById('statusBadge');
                    const rBtn = document.getElementById('restartBtn');
                    const fBtn = document.getElementById('refreshBtn');
                    
                    if(data.espOnline) {
                        badge.className = 'status-badge online';
                        badge.querySelector('span').innerText = 'ESP-01 যুক্ত';
                        rBtn.disabled = fBtn.disabled = false;
                    } else {
                        badge.className = 'status-badge offline';
                        badge.querySelector('span').innerText = 'অফলাইন';
                        rBtn.disabled = fBtn.disabled = true;
                    }
                });

                socket.on('update_logs', (logs) => {
                    const logBox = document.getElementById('logBox');
                    // এখানে \${ ব্যবহার করা হয়েছে যাতে সার্ভার সাইডে এরর না আসে
                    logBox.innerHTML = logs.map(l => \`
                        <div class="log-item">
                            <span class="log-time">[\${l.time}]</span> \${l.msg}
                        </div>
                    \`).join('');
                });
            </script>
        </body>
        </html>
    `);
});

io.on('connection', (socket) => {
    addLog("ইউজার ড্যাশবোর্ড ওপেন করেছে");
    
    // বর্তমান স্ট্যাটাস নতুন ইউজারকে পাঠানো
    socket.emit('stats_update', systemStats);
    socket.emit('update_logs', systemStats.logs);

    socket.on('esp_online', () => {
        espSocketId = socket.id;
        systemStats.espOnline = true;
        addLog("ESP-01 ড্যাশবোর্ডে যুক্ত হয়েছে!");
        io.emit('stats_update', systemStats);
    });

    socket.on('control_modem', (data) => {
        addLog("কমান্ড পাঠানো হয়েছে: " + data.action);
        io.emit('command_to_esp', data);
    });

    socket.on('disconnect', () => {
        if (socket.id === espSocketId) {
            systemStats.espOnline = false;
            espSocketId = null;
            addLog("সতর্কতা: ESP-01 ডিসকানেক্ট হয়েছে");
            io.emit('stats_update', systemStats);
        }
    });
});

server.listen(PORT, () => {
    console.log("-----------------------------------------");
    console.log("🚀 সার্ভার চালু হয়েছে!");
    console.log("🌐 ড্যাশবোর্ড দেখুন: http://localhost:" + PORT);
    console.log("-----------------------------------------");
});