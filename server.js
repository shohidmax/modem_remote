const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// ড্যাশবোর্ড স্টেট ম্যানেজমেন্ট
let espSocketId = null;
let systemStats = {
    espOnline: false,
    lastCommand: "None",
    lastCommandTime: "-",
    modemSignal: "N/A",
    logs: []
};

// হেল্পার ফাংশন: লগ আপডেট করা
function addLog(msg) {
    const time = new Date().toLocaleTimeString();
    systemStats.logs.unshift({ time, msg });
    if (systemStats.logs.length > 10) systemStats.logs.pop(); // শেষ ১০টি লগ রাখা
    io.emit('update_logs', systemStats.logs);
}

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="bn">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>রিয়েল-টাইম মডেম কন্ট্রোল</title>
            <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
            <style>
                :root {
                    --primary: #2563eb;
                    --bg: #0f172a;
                    --card: #1e293b;
                    --text: #f1f5f9;
                    --success: #22c55e;
                    --danger: #ef4444;
                    --accent: #38bdf8;
                }
                body { 
                    font-family: 'Segoe UI', sans-serif; 
                    background-color: var(--bg); 
                    color: var(--text);
                    margin: 0; padding: 20px;
                    display: flex; flex-direction: column; align-items: center;
                }
                .container { max-width: 600px; width: 100%; }
                .card {
                    background: var(--card);
                    padding: 20px; border-radius: 16px;
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
                    margin-bottom: 20px; border: 1px solid #334155;
                }
                .status-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
                .badge { padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: bold; }
                .online { background: rgba(34, 197, 94, 0.2); color: var(--success); }
                .offline { background: rgba(239, 68, 68, 0.2); color: var(--danger); }
                
                .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px; }
                .stat-box { background: rgba(255,255,255,0.05); padding: 15px; border-radius: 12px; text-align: center; }
                .stat-val { display: block; font-size: 20px; font-weight: bold; color: var(--accent); }
                .stat-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; }

                .btn-group { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
                .btn {
                    padding: 15px; border: none; border-radius: 12px;
                    font-size: 15px; font-weight: 600; cursor: pointer;
                    display: flex; align-items: center; justify-content: center; gap: 8px;
                    transition: all 0.2s; color: white;
                }
                .btn-restart { background: var(--danger); }
                .btn-refresh { background: var(--primary); }
                .btn:disabled { opacity: 0.5; cursor: not-allowed; }

                .log-container { height: 150px; overflow-y: auto; background: #000; border-radius: 8px; padding: 10px; font-family: monospace; font-size: 12px; color: #4ade80; }
                .log-item { margin-bottom: 5px; border-bottom: 1px solid #1e293b; padding-bottom: 2px; }
                .log-time { color: #94a3b8; margin-right: 8px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="status-row">
                    <h2 style="margin:0"><i class="fas fa-microchip"></i> ড্যাশবোর্ড</h2>
                    <div id="espBadge" class="badge ${systemStats.espOnline ? 'online' : 'offline'}">
                        ${systemStats.espOnline ? '● ESP-01 যুক্ত' : '○ ডিসকানেক্টেড'}
                    </div>
                </div>

                <div class="stats-grid">
                    <div class="stat-box">
                        <span class="stat-label">সিগন্যাল</span>
                        <span id="signalVal" class="stat-val">${systemStats.modemSignal}</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-label">শেষ অ্যাকশন</span>
                        <span id="lastActionVal" class="stat-val" style="font-size:14px">${systemStats.lastCommand}</span>
                    </div>
                </div>

                <div class="card">
                    <h4 style="margin-top:0"><i class="fas fa-bolt"></i> দ্রুত কমান্ড</h4>
                    <div class="btn-group">
                        <button id="restartBtn" class="btn btn-restart" onclick="sendCommand('restart')" ${!systemStats.espOnline ? 'disabled' : ''}>
                            <i class="fas fa-power-off"></i> রিস্টার্ট
                        </button>
                        <button id="refreshBtn" class="btn btn-refresh" onclick="sendCommand('check_signal')" ${!systemStats.espOnline ? 'disabled' : ''}>
                            <i class="fas fa-sync"></i> রিফ্রেশ
                        </button>
                    </div>
                </div>

                <div class="card">
                    <h4 style="margin-top:0"><i class="fas fa-list-ul"></i> লাইভ ইভেন্ট লগ</h4>
                    <div id="logBox" class="log-container">
                        <div class="log-item">সিস্টেম চালু হয়েছে...</div>
                    </div>
                </div>
            </div>

            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                
                function sendCommand(action) {
                    const time = new Date().toLocaleTimeString();
                    socket.emit('control_modem', { action, time });
                }

                // স্ট্যাটাস আপডেট রিসিভ করা
                socket.on('stats_update', (data) => {
                    const badge = document.getElementById('espBadge');
                    const restartBtn = document.getElementById('restartBtn');
                    const refreshBtn = document.getElementById('refreshBtn');
                    const signalVal = document.getElementById('signalVal');
                    const lastActionVal = document.getElementById('lastActionVal');

                    // অনলাইন/অফলাইন হ্যান্ডলিং
                    if(data.espOnline) {
                        badge.className = 'badge online';
                        badge.innerText = '● ESP-01 যুক্ত';
                        restartBtn.disabled = false;
                        refreshBtn.disabled = false;
                    } else {
                        badge.className = 'badge offline';
                        badge.innerText = '○ ডিসকানেক্টেড';
                        restartBtn.disabled = true;
                        refreshBtn.disabled = true;
                    }

                    signalVal.innerText = data.modemSignal;
                    lastActionVal.innerText = data.lastCommand;
                });

                // লাইভ লগ আপডেট
                socket.on('update_logs', (logs) => {
                    const logBox = document.getElementById('logBox');
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
    console.log('User connected:', socket.id);

    // ESP-01 আইডেন্টিফিকেশন
    socket.on('esp_online', () => {
        espSocketId = socket.id;
        systemStats.espOnline = true;
        addLog("ESP-01 সংযুক্ত হয়েছে");
        io.emit('stats_update', systemStats);
    });

    // মডেম থেকে ডেটা আসলে (যেমন সিগন্যাল স্ট্রেন্থ)
    socket.on('modem_data', (data) => {
        systemStats.modemSignal = data.signal || "N/A";
        addLog(`মডেম ডেটা: সিগন্যাল \${data.signal}`);
        io.emit('stats_update', systemStats);
    });

    // ইউজার কমান্ড পাঠালে
    socket.on('control_modem', (data) => {
        systemStats.lastCommand = data.action;
        systemStats.lastCommandTime = data.time;
        addLog(`কমান্ড পাঠানো হয়েছে: \${data.action}`);
        
        // শুধু ESP কে কমান্ড পাঠানো
        io.emit('command_to_esp', data);
        io.emit('stats_update', systemStats);
    });

    socket.on('disconnect', () => {
        if (socket.id === espSocketId) {
            systemStats.espOnline = false;
            espSocketId = null;
            addLog("ESP-01 ডিসকানেক্ট হয়েছে!");
            io.emit('stats_update', systemStats);
        }
    });
});

server.listen(PORT, () => {
    addLog(`সার্ভার পোর্ট \${PORT}-এ চালু হয়েছে`);
});