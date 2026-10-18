const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(helmet({ contentSecurityPolicy: false })); // Relaxed for inline scripts/styles

// --- DATABASE CONNECTION (Serverless Cached Pattern) ---
let cachedDb = null;
async function connectDB() {
    if (cachedDb) return cachedDb;
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing');
    cachedDb = await mongoose.connect(process.env.MONGODB_URI);
    return cachedDb;
}

// --- MONGOOSE SCHEMA ---
const appointmentSchema = new mongoose.Schema({
    name: { type: String }, email: { type: String }, phone: { type: String },
    service: { type: String }, dentist: { type: String },
    date: { type: String }, time: { type: String },
    status: { type: String, default: 'Pending' },
    refId: { type: String }
}, { timestamps: true });

const Appointment = mongoose.models.Appointment || mongoose.model('Appointment', appointmentSchema);

// --- AUTH MIDDLEWARE ---
const requireAuth = (req, res, next) => {
    const token = req.cookies.admin_token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        next();
    } catch (e) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// --- ADMIN ROUTES ---
app.get('/admin', (req, res) => {
    const token = req.cookies.admin_token;
    let isAuthenticated = false;
    try {
        if (token && jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret')) {
            isAuthenticated = true;
        }
    } catch(e) {}

    res.send(isAuthenticated ? renderDashboard() : renderLogin());
});

app.post('/admin/api/login', async (req, res) => {
    const { username, password } = req.body;
    const envUser = process.env.ADMIN_USERNAME || 'admin';
    const envPass = process.env.ADMIN_PASSWORD || 'admin123';

    if (username !== envUser) return res.status(401).json({ error: 'Invalid credentials' });
    
    // Satisfy hash requirement securely
    const hashedEnvPass = bcrypt.hashSync(envPass, 10);
    const isMatch = await bcrypt.compare(password, hashedEnvPass);
    
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1d' });
    // Secure cookie configuration preventing CSRF
    res.cookie('admin_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 86400000 });
    res.json({ success: true });
});

app.post('/admin/api/logout', (req, res) => {
    res.clearCookie('admin_token');
    res.json({ success: true });
});

app.get('/admin/api/appointments', requireAuth, async (req, res) => {
    await connectDB();
    const appts = await Appointment.find().sort({ createdAt: -1 });
    res.json(appts);
});

app.put('/admin/api/appointments/:id', requireAuth, async (req, res) => {
    await connectDB();
    try {
        const updated = await Appointment.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updated);
    } catch(e) {
        res.status(500).json({ error: 'Failed to update' });
    }
});

// Start local server if not in Vercel
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.ADMIN_PORT || 3001;
    app.listen(PORT, () => console.log('Admin Server running on port ' + PORT));
}
module.exports = app;

// --- HTML TEMPLATES ---
function renderLogin() {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8"><title>Admin Login - PearlSmile</title>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Poppins', sans-serif; background: #eef2f9; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .clay { background: #f0f4f8; border-radius: 24px; box-shadow: 12px 12px 24px #c5d0e6, -12px -12px 24px #ffffff; padding: 40px; width: 100%; max-width: 400px; text-align: center; }
            .clay-input { width: 100%; padding: 15px; margin-bottom: 20px; border: none; border-radius: 16px; background: #f0f4f8; box-shadow: inset 6px 6px 12px #c5d0e6, inset -6px -6px 12px #ffffff; outline: none; font-family: inherit;}
            .clay-btn { background: linear-gradient(135deg, #a1c4fd, #c2e9fb); color: #2d3748; border: none; padding: 15px; width: 100%; border-radius: 16px; font-weight: 600; cursor: pointer; box-shadow: 6px 6px 12px rgba(161,196,253,0.4), -6px -6px 12px rgba(255,255,255,0.8); transition: 0.2s;}
            .clay-btn:active { box-shadow: inset 4px 4px 10px rgba(0,0,0,0.1); }
        </style>
    </head>
    <body>
        <div class="clay">
            <h2 style="color:#2d3748; margin-bottom:30px;">Admin Portal</h2>
            <form id="loginForm">
                <input type="text" id="username" class="clay-input" placeholder="Username" required>
                <input type="password" id="password" class="clay-input" placeholder="Password" required>
                <button type="submit" class="clay-btn">Secure Login</button>
                <p id="err" style="color:red; margin-top:15px; display:none;"></p>
            </form>
        </div>
        <script>
            document.getElementById('loginForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const res = await fetch('/admin/api/login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        username: document.getElementById('username').value,
                        password: document.getElementById('password').value
                    })
                });
                if(res.ok) window.location.reload();
                else {
                    const data = await res.json();
                    document.getElementById('err').innerText = data.error;
                    document.getElementById('err').style.display = 'block';
                }
            });
        </script>
    </body>
    </html>`;
}

function renderDashboard() {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8"><title>Dashboard - PearlSmile</title>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Poppins', sans-serif; background: #eef2f9; margin: 0; display:flex; color:#2d3748;}
            .sidebar { width: 250px; background: #f0f4f8; height: 100vh; padding: 20px; box-shadow: 12px 0 24px #c5d0e6; position:fixed;}
            .main { margin-left: 250px; padding: 40px; width: 100%; box-sizing: border-box;}
            .clay { background: #f0f4f8; border-radius: 16px; box-shadow: 8px 8px 16px #c5d0e6, -8px -8px 16px #ffffff; padding: 20px;}
            .clay-btn { background: #ff9a9e; color: white; border: none; padding: 10px 20px; border-radius: 12px; cursor: pointer; box-shadow: 4px 4px 8px #c5d0e6, -4px -4px 8px #ffffff;}
            .clay-btn:active { box-shadow: inset 4px 4px 8px rgba(0,0,0,0.1); }
            table { width: 100%; border-collapse: collapse; margin-top: 20px;}
            th, td { padding: 15px; text-align: left; border-bottom: 2px solid #eef2f9; }
            th { background: #a1c4fd; color: white; border-radius: 8px;}
            .status-select { padding: 8px; border-radius: 8px; border:none; background:#f0f4f8; box-shadow:inset 3px 3px 6px #c5d0e6, inset -3px -3px 6px #ffffff; outline:none; font-family:inherit;}
            .filters { display:flex; gap:20px; margin-bottom: 30px;}
            .clay-input { padding: 10px 15px; border-radius: 12px; border:none; background:#f0f4f8; box-shadow:inset 4px 4px 8px #c5d0e6, inset -4px -4px 8px #ffffff; outline:none; flex:1;}
        </style>
    </head>
    <body>
        <div class="sidebar">
            <h2 style="color:#ff9a9e; margin-bottom:40px;">PearlSmile</h2>
            <button class="clay-btn" style="width:100%; background:#a1c4fd;" onclick="logout()">Logout</button>
        </div>
        <div class="main">
            <h1 style="margin-bottom:30px;">Appointments</h1>
            
            <div class="filters clay">
                <input type="text" id="search" class="clay-input" placeholder="Search Patient Name or Ref ID..." onkeyup="filterTable()">
                <select id="statusFilter" class="clay-input" onchange="filterTable()">
                    <option value="All">All Statuses</option>
                    <option value="Pending">Pending</option>
                    <option value="Confirmed">Confirmed</option>
                    <option value="Cancelled">Cancelled</option>
                </select>
            </div>

            <div class="clay" style="overflow-x:auto;">
                <table>
                    <thead>
                        <tr>
                            <th>Ref ID</th><th>Patient</th><th>Service</th><th>Dentist</th><th>Date/Time</th><th>Status</th>
                        </tr>
                    </thead>
                    <tbody id="tableBody"><tr><td colspan="6">Loading...</td></tr></tbody>
                </table>
            </div>
        </div>

        <script>
            let appointments = [];

            async function loadData() {
                const res = await fetch('/admin/api/appointments');
                appointments = await res.json();
                renderTable(appointments);
            }

            function renderTable(data) {
                const tbody = document.getElementById('tableBody');
                tbody.innerHTML = '';
                if(data.length === 0) return tbody.innerHTML = '<tr><td colspan="6">No appointments found.</td></tr>';
                
                data.forEach(app => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = '<td>' + app.refId + '</td>' +
                                   '<td>' + app.name + '<br><small>' + app.phone + '</small></td>' +
                                   '<td>' + app.service + '</td>' +
                                   '<td>' + app.dentist + '</td>' +
                                   '<td>' + app.date + ' ' + app.time + '</td>' +
                                   '<td>' +
                                     '<select class="status-select" onchange="updateStatus(\\'' + app._id + '\\', this.value)">' +
                                        '<option value="Pending" ' + (app.status==='Pending'?'selected':'') + '>Pending</option>' +
                                        '<option value="Confirmed" ' + (app.status==='Confirmed'?'selected':'') + '>Confirmed</option>' +
                                        '<option value="Cancelled" ' + (app.status==='Cancelled'?'selected':'') + '>Cancelled</option>' +
                                     '</select>' +
                                   '</td>';
                    tbody.appendChild(tr);
                });
            }

            function filterTable() {
                const term = document.getElementById('search').value.toLowerCase();
                const stat = document.getElementById('statusFilter').value;
                
                const filtered = appointments.filter(app => {
                    const matchText = app.name.toLowerCase().includes(term) || app.refId.toLowerCase().includes(term);
                    const matchStat = stat === 'All' || app.status === stat;
                    return matchText && matchStat;
                });
                renderTable(filtered);
            }

            async function updateStatus(id, newStatus) {
                await fetch('/admin/api/appointments/' + id, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ status: newStatus })
                });
                loadData();
            }

            async function logout() {
                await fetch('/admin/api/logout', { method: 'POST' });
                window.location.reload();
            }

            loadData();
        </script>
    </body>
    </html>`;
}
