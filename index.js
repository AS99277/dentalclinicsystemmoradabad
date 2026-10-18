const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const dotenv = require('dotenv');

dotenv.config();
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet({ contentSecurityPolicy: false })); // Relaxed for inline scripts/styles in zero-build

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
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    service: { type: String, required: true },
    dentist: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    status: { type: String, default: 'Pending' },
    refId: { type: String, required: true, unique: true }
}, { timestamps: true });

// Concurrency-safe index (prevents double-booking at DB level)
appointmentSchema.index({ date: 1, time: 1, dentist: 1 }, { unique: true, partialFilterExpression: { status: { $ne: 'Cancelled' } } });

const Appointment = mongoose.models.Appointment || mongoose.model('Appointment', appointmentSchema);

// --- PUBLIC ROUTES ---
app.get('/', (req, res) => {
    res.send(renderHomePage());
});

app.post('/api/book', async (req, res) => {
    try {
        await connectDB();
        const { name, email, phone, service, dentist, date, time } = req.body;

        if (!name || !email || !phone || !service || !dentist || !date || !time) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        // Generate Reference
        const refId = 'PSDS-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        const newAppt = new Appointment({ name, email, phone, service, dentist, date, time, refId });
        
        await newAppt.save();
        res.status(201).json({ success: true, refId, message: 'Appointment booked successfully!' });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ error: 'This time slot is already booked for the selected dentist.' });
        }
        res.status(500).json({ error: 'Internal Server Error. Please try again.' });
    }
});

// Start local server if not in Vercel
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log('Public Server running on port ' + PORT));
}
module.exports = app;

// --- HTML TEMPLATE ---
function renderHomePage() {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PearlSmile Dental Studio | Dehradun</title>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
            :root {
                --bg: #eef2f9;
                --primary: #ff9a9e;
                --secondary: #a1c4fd;
                --text: #2d3748;
                --clay-card: #f0f4f8;
                --clay-shadow: 12px 12px 24px #c5d0e6, -12px -12px 24px #ffffff;
                --clay-inset: inset 6px 6px 12px #c5d0e6, inset -6px -6px 12px #ffffff;
            }
            * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Poppins', sans-serif; scroll-behavior: smooth; }
            body { background: var(--bg); color: var(--text); overflow-x: hidden; }
            
            /* UI Classes */
            .clay { background: var(--clay-card); border-radius: 24px; box-shadow: var(--clay-shadow); border: 2px solid rgba(255,255,255,0.5); }
            .clay-btn { 
                background: linear-gradient(135deg, var(--primary), var(--secondary)); 
                color: white; border: none; padding: 12px 30px; border-radius: 30px; font-weight: 600; font-size: 1rem;
                box-shadow: 6px 6px 12px rgba(161, 196, 253, 0.4), -6px -6px 12px rgba(255,255,255,0.8); cursor: pointer; transition: all 0.2s; 
            }
            .clay-btn:active { box-shadow: inset 4px 4px 10px rgba(0,0,0,0.1), inset -4px -4px 10px rgba(255,255,255,0.3); transform: scale(0.98); }
            .clay-input { width: 100%; padding: 14px; border: none; border-radius: 16px; background: var(--clay-card); box-shadow: var(--clay-inset); outline: none; margin-bottom: 20px; font-size: 1rem; color: var(--text); }
            .title { text-align: center; font-size: 2.5rem; margin-bottom: 30px; background: linear-gradient(135deg, var(--primary), var(--secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            
            /* Animations */
            .float { animation: float 4s ease-in-out infinite; }
            @keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-15px); } 100% { transform: translateY(0px); } }
            
            /* Navbar */
            nav { display: flex; justify-content: space-between; padding: 20px 5%; align-items: center; position: fixed; width: 100%; top: 0; background: rgba(238, 242, 249, 0.8); backdrop-filter: blur(10px); z-index: 1000; }
            .logo { font-size: 1.5rem; font-weight: 700; color: var(--primary); display: flex; align-items: center; gap: 10px; }
            .nav-links a { text-decoration: none; color: var(--text); margin-left: 20px; font-weight: 600; transition: color 0.3s; }
            .nav-links a:hover { color: var(--primary); }

            /* Sections */
            section { padding: 100px 5% 50px; min-height: 100vh; display: flex; flex-direction: column; justify-content: center; }
            
            /* Hero */
            .hero { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-top: 50px; }
            .hero-text { flex: 1; min-width: 300px; padding-right: 40px; }
            .hero-text h1 { font-size: 3.5rem; line-height: 1.2; margin-bottom: 20px; }
            .hero-text p { font-size: 1.1rem; margin-bottom: 30px; color: #5a6a85; }
            .hero-img { flex: 1; min-width: 300px; text-align: center; }
            .hero-img img { width: 100%; max-width: 500px; border-radius: 40px; }

            /* Services */
            .services-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 30px; }
            .service-card { padding: 30px; text-align: center; transition: transform 0.3s; }
            .service-card:hover { transform: translateY(-10px); }
            .service-icon { font-size: 3rem; color: var(--secondary); margin-bottom: 20px; }
            .price { font-weight: 700; color: var(--primary); font-size: 1.2rem; margin-top: 10px; }

            /* Booking Form */
            .booking-container { display: flex; flex-wrap: wrap; gap: 40px; align-items: flex-start; }
            .booking-info { flex: 1; min-width: 300px; padding: 40px; }
            .booking-form { flex: 1; min-width: 300px; padding: 40px; }
            
            /* Modal */
            #modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); backdrop-filter: blur(5px); z-index: 2000; justify-content: center; align-items: center; }
            .modal-content { text-align: center; padding: 40px; max-width: 400px; }
            .modal-content i { font-size: 4rem; color: #4ade80; margin-bottom: 20px; }
            
            /* Responsive */
            @media(max-width: 768px) {
                .hero-text h1 { font-size: 2.5rem; }
                .nav-links { display: none; } /* Simplified for demo */
            }
        </style>
    </head>
    <body>

    <nav class="clay" style="border-radius: 0 0 24px 24px;">
        <div class="logo"><i class="fa-solid fa-tooth"></i> PearlSmile</div>
        <div class="nav-links">
            <a href="#home">Home</a>
            <a href="#services">Services</a>
            <a href="#team">Our Team</a>
            <a href="#book" class="clay-btn" style="padding: 8px 20px; color: white;">Book Now</a>
        </div>
    </nav>

    <section id="home" class="hero">
        <div class="hero-text">
            <h1>Your Perfect Smile <br><span style="color: #a1c4fd;">Starts Here.</span></h1>
            <p>Experience premium dental care in Dehradun with our expert team, modern technology, and a soothing environment.</p>
            <a href="#book"><button class="clay-btn">Schedule Consultation</button></a>
        </div>
        <div class="hero-img">
            <img src="https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&w=800&q=80" alt="Dental Clinic" class="clay float">
        </div>
    </section>

    <section id="services">
        <h2 class="title">Our Premium Services</h2>
        <div class="services-grid">
            <div class="service-card clay">
                <i class="fa-solid fa-stethoscope service-icon"></i>
                <h3>Dental Consultation</h3>
                <p>Complete oral checkup</p>
                <div class="price">₹500</div>
            </div>
            <div class="service-card clay">
                <i class="fa-solid fa-teeth service-icon"></i>
                <h3>Teeth Cleaning</h3>
                <p>Scaling & Polishing</p>
                <div class="price">₹1200</div>
            </div>
            <div class="service-card clay">
                <i class="fa-regular fa-face-smile service-icon"></i>
                <h3>Teeth Whitening</h3>
                <p>Laser whitening</p>
                <div class="price">₹2500</div>
            </div>
            <div class="service-card clay">
                <i class="fa-solid fa-tooth service-icon"></i>
                <h3>Root Canal</h3>
                <p>Painless RCT</p>
                <div class="price">₹4500</div>
            </div>
        </div>
    </section>

    <section id="team" style="min-height: auto;">
        <h2 class="title">Meet Our Experts</h2>
        <div class="services-grid">
            <div class="service-card clay">
                <div style="width:100px;height:100px;border-radius:50%;background:var(--primary);margin:0 auto 20px;display:flex;align-items:center;justify-content:center;color:white;font-size:2rem;">👩‍⚕️</div>
                <h3>Dr. Anjali Sharma</h3>
                <p>Orthodontist (Braces)</p>
            </div>
            <div class="service-card clay">
                <div style="width:100px;height:100px;border-radius:50%;background:var(--secondary);margin:0 auto 20px;display:flex;align-items:center;justify-content:center;color:white;font-size:2rem;">👨‍⚕️</div>
                <h3>Dr. Rohan Kapoor</h3>
                <p>Endodontist (RCT)</p>
            </div>
            <div class="service-card clay">
                <div style="width:100px;height:100px;border-radius:50%;background:#ffb6b9;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;color:white;font-size:2rem;">👩‍⚕️</div>
                <h3>Dr. Priya Singh</h3>
                <p>Pediatric Dentist</p>
            </div>
        </div>
    </section>

    <section id="book">
        <h2 class="title">Book Your Appointment</h2>
        <div class="booking-container">
            <div class="booking-info clay">
                <h3 style="margin-bottom: 20px; color: var(--primary);">Contact Information</h3>
                <p><i class="fa-solid fa-location-dot"></i> Rajpur Road, Dehradun, India</p>
                <p style="margin: 15px 0;"><i class="fa-solid fa-phone"></i> +91 98765 43210</p>
                <p><i class="fa-solid fa-envelope"></i> hello@pearlsmile.example</p>
                <h3 style="margin-top: 30px; margin-bottom: 20px; color: var(--secondary);">Clinic Hours</h3>
                <p><i class="fa-solid fa-clock"></i> Monday - Saturday<br>9:00 AM to 7:00 PM</p>
            </div>
            <div class="booking-form clay">
                <form id="bookForm">
                    <input type="text" id="name" class="clay-input" placeholder="Full Name" required>
                    <input type="email" id="email" class="clay-input" placeholder="Email Address" required>
                    <input type="tel" id="phone" class="clay-input" placeholder="Phone Number" required>
                    
                    <select id="service" class="clay-input" required>
                        <option value="" disabled selected>Select Service</option>
                        <option value="Dental Consultation">Dental Consultation - ₹500</option>
                        <option value="Teeth Cleaning">Teeth Cleaning - ₹1200</option>
                        <option value="Teeth Whitening">Teeth Whitening - ₹2500</option>
                        <option value="Dental Filling">Dental Filling - ₹1500</option>
                        <option value="Root Canal">Root Canal - ₹4500</option>
                        <option value="Tooth Extraction">Tooth Extraction - ₹1000</option>
                        <option value="Braces Consultation">Braces Consultation - ₹800</option>
                        <option value="Pediatric Checkup">Pediatric Checkup - ₹700</option>
                    </select>

                    <select id="dentist" class="clay-input" required>
                        <option value="" disabled selected>Select Dentist</option>
                        <option value="Dr. Anjali Sharma">Dr. Anjali Sharma</option>
                        <option value="Dr. Rohan Kapoor">Dr. Rohan Kapoor</option>
                        <option value="Dr. Priya Singh">Dr. Priya Singh</option>
                    </select>

                    <div style="display:flex; gap:10px;">
                        <input type="date" id="date" class="clay-input" required style="flex:1;">
                        <select id="time" class="clay-input" required style="flex:1;">
                            <option value="" disabled selected>Select Time</option>
                            <option value="09:00 AM">09:00 AM</option>
                            <option value="10:00 AM">10:00 AM</option>
                            <option value="11:00 AM">11:00 AM</option>
                            <option value="12:00 PM">12:00 PM</option>
                            <option value="02:00 PM">02:00 PM</option>
                            <option value="04:00 PM">04:00 PM</option>
                            <option value="06:00 PM">06:00 PM</option>
                        </select>
                    </div>
                    
                    <button type="submit" class="clay-btn" style="width: 100%;" id="submitBtn">Confirm Appointment</button>
                    <p id="formError" style="color: #ef4444; margin-top:10px; display:none;"></p>
                </form>
            </div>
        </div>
    </section>

    <!-- Success Modal -->
    <div id="modal">
        <div class="modal-content clay float">
            <i class="fa-solid fa-circle-check"></i>
            <h2 style="color: var(--text); margin-bottom: 10px;">Booking Confirmed!</h2>
            <p>Your reference ID is:</p>
            <h3 id="refIdDisplay" style="color: var(--primary); margin: 15px 0;"></h3>
            <p style="margin-bottom: 20px; font-size:0.9rem;">We have saved your slot. See you soon!</p>
            <button class="clay-btn" onclick="document.getElementById('modal').style.display='none'">Close</button>
        </div>
    </div>

    <script>
        // Set minimum date to today
        document.getElementById('date').min = new Date().toISOString().split('T')[0];

        document.getElementById('bookForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const btn = document.getElementById('submitBtn');
            const err = document.getElementById('formError');
            btn.innerText = 'Processing...';
            btn.disabled = true;
            err.style.display = 'none';

            const payload = {
                name: document.getElementById('name').value,
                email: document.getElementById('email').value,
                phone: document.getElementById('phone').value,
                service: document.getElementById('service').value,
                dentist: document.getElementById('dentist').value,
                date: document.getElementById('date').value,
                time: document.getElementById('time').value
            };

            try {
                const res = await fetch('/api/book', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();

                if(res.ok) {
                    document.getElementById('bookForm').reset();
                    document.getElementById('refIdDisplay').innerText = data.refId;
                    document.getElementById('modal').style.display = 'flex';
                } else {
                    err.innerText = data.error || 'An error occurred';
                    err.style.display = 'block';
                }
            } catch(error) {
                err.innerText = 'Network error. Try again.';
                err.style.display = 'block';
            } finally {
                btn.innerText = 'Confirm Appointment';
                btn.disabled = false;
            }
        });
    </script>
    </body>
    </html>
    `;
}
