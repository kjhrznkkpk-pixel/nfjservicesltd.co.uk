const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production" || process.env.RENDER === "true";

const jobs = [];
const files = [];
const photos = [];
const notes = [];
const invoices = [];

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 8;
const failedLogins = new Map();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(express.urlencoded({ extended: true, limit: "100kb" }));

app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
});

app.use(session({
    secret: process.env.SESSION_SECRET || "local-dev-secret-change-this",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        maxAge: 1000 * 60 * 60 * 4
    }
}));

function getAdminUsers() {
    const users = [
        {
            username: "keith",
            password: process.env.KEITH_ADMIN_PASSWORD
        },
        {
            username: "chris",
            password: process.env.CHRIS_ADMIN_PASSWORD
        }
    ]
        .filter(user => user.password)
        .map(user => ({
            username: user.username,
            passwordHash: bcrypt.hashSync(user.password, 10)
        }));

    if (users.length === 0) {
        console.warn("No admin passwords set. Add KEITH_ADMIN_PASSWORD and CHRIS_ADMIN_PASSWORD in Render environment variables.");
    }

    return users;
}

const adminUsers = getAdminUsers();

function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function safeUrl(value) {
    try {
        const url = new URL(String(value || ""));

        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return "#";
        }

        return escapeHtml(url.toString());
    } catch {
        return "#";
    }
}

function getLoginKey(req) {
    return req.ip || req.socket.remoteAddress || "unknown";
}

function isLoginBlocked(req) {
    const key = getLoginKey(req);
    const entry = failedLogins.get(key);

    if (!entry) {
        return false;
    }

    if (Date.now() > entry.resetAt) {
        failedLogins.delete(key);
        return false;
    }

    return entry.count >= MAX_LOGIN_ATTEMPTS;
}

function recordFailedLogin(req) {
    const key = getLoginKey(req);
    const now = Date.now();
    const entry = failedLogins.get(key);

    if (!entry || now > entry.resetAt) {
        failedLogins.set(key, {
            count: 1,
            resetAt: now + LOGIN_WINDOW_MS
        });
        return;
    }

    entry.count += 1;
    failedLogins.set(key, entry);
}

function clearFailedLogin(req) {
    failedLogins.delete(getLoginKey(req));
}

function requireLogin(req, res, next) {
    if (!req.session.loggedIn) {
        return res.redirect("/admin");
    }

    next();
}

function accessDeniedPage(message = "Invalid credentials detected") {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Access Denied</title>

            <style>
                body {
                    margin: 0;
                    min-height: 100vh;
                    background: #000000;
                    color: #ff1f1f;
                    font-family: "Courier New", monospace;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 24px;
                    overflow: hidden;
                }

                body::before {
                    content: "";
                    position: fixed;
                    inset: 0;
                    background:
                        repeating-linear-gradient(
                            to bottom,
                            rgba(255, 0, 0, 0.08),
                            rgba(255, 0, 0, 0.08) 1px,
                            transparent 1px,
                            transparent 6px
                        );
                    pointer-events: none;
                    animation: scan 3s linear infinite;
                }

                .denied-box {
                    width: min(760px, 100%);
                    border: 3px solid #ff1f1f;
                    padding: 32px;
                    text-align: center;
                    box-shadow:
                        0 0 18px rgba(255, 0, 0, 0.7),
                        inset 0 0 18px rgba(255, 0, 0, 0.25);
                    background: radial-gradient(circle at center, #260000 0%, #000000 70%);
                    animation: pulse 0.9s infinite;
                }

                .warning {
                    font-size: clamp(48px, 10vw, 96px);
                    font-weight: bold;
                    letter-spacing: 4px;
                    text-transform: uppercase;
                    text-shadow:
                        0 0 8px #ff0000,
                        0 0 18px #ff0000,
                        0 0 28px #ff0000;
                    animation: flash 0.55s infinite;
                }

                .subtext {
                    margin-top: 18px;
                    color: #ff9b9b;
                    font-size: 18px;
                    line-height: 1.6;
                    text-transform: uppercase;
                }

                .code {
                    margin-top: 20px;
                    display: inline-block;
                    border: 1px solid #ff1f1f;
                    padding: 10px 14px;
                    color: #ffb3b3;
                    background: rgba(255, 0, 0, 0.08);
                }

                .retry {
                    display: inline-block;
                    margin-top: 28px;
                    color: #000000;
                    background: #ff1f1f;
                    padding: 12px 18px;
                    text-decoration: none;
                    font-weight: bold;
                    text-transform: uppercase;
                    box-shadow: 0 0 12px rgba(255, 0, 0, 0.8);
                }

                .retry:hover {
                    background: white;
                    color: #b00000;
                }

                @keyframes flash {
                    0%, 100% {
                        opacity: 1;
                    }

                    50% {
                        opacity: 0.35;
                    }
                }

                @keyframes pulse {
                    0%, 100% {
                        transform: scale(1);
                    }

                    50% {
                        transform: scale(1.015);
                    }
                }

                @keyframes scan {
                    from {
                        transform: translateY(-20px);
                    }

                    to {
                        transform: translateY(20px);
                    }
                }
            </style>
        </head>

        <body>
            <main class="denied-box">
                <div class="warning">ACCESS DENIED</div>

                <div class="subtext">
                    ${escapeHtml(message)}<br>
                    NFJ private system locked
                </div>

                <div class="code">
                    ERROR CODE: NFJ-403-UNAUTHORISED
                </div>

                <br>

                <a class="retry" href="/admin">Retry Login</a>
            </main>
        </body>
        </html>
    `;
}

function terminalPage(title, systemName, content) {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${escapeHtml(title)}</title>

            <style>
                body {
                    margin: 0;
                    min-height: 100vh;
                    font-family: "Courier New", monospace;
                    background: #000000;
                    color: #00ff66;
                    padding: 24px;
                }

                .screen {
                    max-width: 1100px;
                    margin: 0 auto;
                    border: 2px solid #00ff66;
                    padding: 24px;
                    box-shadow: 0 0 18px rgba(0, 255, 102, 0.45);
                    background: radial-gradient(circle at center, #001a0a 0%, #000000 70%);
                }

                .top-bar {
                    border-bottom: 1px solid #00ff66;
                    padding-bottom: 12px;
                    margin-bottom: 24px;
                    display: flex;
                    justify-content: space-between;
                    gap: 12px;
                    flex-wrap: wrap;
                }

                h1, h2 {
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    text-shadow: 0 0 8px #00ff66;
                }

                p {
                    color: #9cffb8;
                    line-height: 1.5;
                }

                form, .card {
                    border: 1px solid #00ff66;
                    padding: 18px;
                    margin-bottom: 18px;
                    background: rgba(0, 255, 102, 0.05);
                }

                label {
                    display: block;
                    margin-bottom: 14px;
                    color: #9cffb8;
                }

                input, textarea, select {
                    width: 100%;
                    margin-top: 6px;
                    padding: 12px;
                    box-sizing: border-box;
                    background: #000000;
                    color: #00ff66;
                    border: 1px solid #00ff66;
                    font-family: "Courier New", monospace;
                    font-size: 15px;
                }

                textarea {
                    min-height: 100px;
                    resize: vertical;
                }

                button, .terminal-link, .back-link {
                    display: inline-block;
                    background: transparent;
                    color: #00ff66;
                    border: 1px solid #00ff66;
                    padding: 11px 14px;
                    font-family: "Courier New", monospace;
                    text-decoration: none;
                    cursor: pointer;
                    margin-top: 8px;
                    margin-right: 8px;
                }

                button:hover, .terminal-link:hover, .back-link:hover {
                    background: #00ff66;
                    color: #000000;
                }

                .grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                    gap: 16px;
                }

                .item-top {
                    display: flex;
                    justify-content: space-between;
                    gap: 12px;
                    flex-wrap: wrap;
                    border-bottom: 1px solid #00ff66;
                    padding-bottom: 8px;
                    margin-bottom: 12px;
                }

                .job-photo {
                    width: 100%;
                    aspect-ratio: 4 / 3;
                    object-fit: cover;
                    border: 1px solid #00ff66;
                    background: #020617;
                    margin-bottom: 12px;
                }

                .blink {
                    animation: blink 1s steps(2, start) infinite;
                }

                @keyframes blink {
                    50% {
                        opacity: 0;
                    }
                }

                @media (max-width: 600px) {
                    body {
                        padding: 12px;
                    }

                    .screen {
                        padding: 16px;
                    }
                }
            </style>
        </head>

        <body>
            <main class="screen">
                <div class="top-bar">
                    <strong>NFJ SERVICES LTD :: ${escapeHtml(systemName)}</strong>
                    <span>STATUS: READY</span>
                </div>

                ${content}
            </main>
        </body>
        </html>
    `;
}

app.get("/", (req, res) => {
    res.redirect("/admin");
});

app.get("/admin", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>NFJ Admin Login</title>
        </head>
        <body style="font-family: Arial; background: #0f172a; color: white; display: flex; align-items: center; justify-content: center; min-height: 100vh;">
            <form method="POST" action="/admin/login" style="background: #1e293b; padding: 25px; border-radius: 10px; width: 320px;">
                <h1>NFJ Admin</h1>
                <p>Private access only</p>

                <input type="text" name="username" placeholder="Username" required autocomplete="username" style="width: 100%; padding: 12px; margin-bottom: 10px; box-sizing: border-box;">
                <input type="password" name="password" placeholder="Password" required autocomplete="current-password" style="width: 100%; padding: 12px; margin-bottom: 10px; box-sizing: border-box;">

                <button type="submit" style="width: 100%; padding: 12px; background: #3b82f6; color: white; border: none; border-radius: 6px;">Login</button>
            </form>
        </body>
        </html>
    `);
});

app.post("/admin/login", (req, res) => {
    if (isLoginBlocked(req)) {
        return res.status(429).send(accessDeniedPage("Too many failed attempts. Please wait and try again."));
    }

    const { username, password } = req.body;
    const user = adminUsers.find(admin => admin.username === username);

    if (!user || !bcrypt.compareSync(password || "", user.passwordHash)) {
        recordFailedLogin(req);
        return res.status(401).send(accessDeniedPage());
    }

    clearFailedLogin(req);
    req.session.regenerate(error => {
        if (error) {
            return res.status(500).send("Login error. Please try again.");
        }

        req.session.loggedIn = true;
        req.session.username = user.username;
        res.redirect("/admin/dashboard");
    });
});

app.get("/admin/dashboard", requireLogin, (req, res) => {
    res.send(terminalPage("NFJ Admin Dashboard", "ADMIN SYSTEM", `
        <h1>Admin Dashboard <span class="blink">_</span></h1>

        <p>Private operations system loaded. Select a module below.</p>

        <div class="grid">
            <a class="terminal-link card" href="/admin/jobs">
                CURRENT JOBS
                <p>Booked work and site details</p>
            </a>

            <a class="terminal-link card" href="/admin/files">
                FILES
                <p>Documents, certificates and receipts</p>
            </a>

            <a class="terminal-link card" href="/admin/photos">
                PHOTOS
                <p>Job photos and site evidence</p>
            </a>

            <a class="terminal-link card" href="/admin/notes">
                NOTES
                <p>Work notes and customer sign-off</p>
            </a>

            <a class="terminal-link card" href="/admin/invoices">
                INVOICES
                <p>Create and manage invoices</p>
            </a>
        </div>

        <a class="back-link" href="/admin/logout">LOG OUT</a>
    `));
});

app.get("/admin/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/admin");
    });
});

app.get("/admin/jobs", requireLogin, (req, res) => {
    const jobList = jobs.map(job => `
        <article class="card">
            <div class="item-top">
                <strong>${escapeHtml(job.customerName)}</strong>
                <span>${escapeHtml(job.date)} ${escapeHtml(job.time)}</span>
            </div>

            <p><strong>Status:</strong> ${escapeHtml(job.status)}</p>
            <p><strong>Contact:</strong> ${escapeHtml(job.contactNumber) || "Not recorded"}</p>
            <p><strong>Address:</strong> ${escapeHtml(job.jobAddress)}</p>
            <p><strong>Details:</strong> ${escapeHtml(job.details)}</p>
        </article>
    `).join("");

    res.send(terminalPage("NFJ Current Jobs", "CURRENT JOBS", `
        <h1>Current Jobs <span class="blink">_</span></h1>

        <p>Book and record upcoming work.</p>

        <form method="POST" action="/admin/jobs">
            <h2>Add Job</h2>

            <label>
                Customer Name
                <input name="customerName" required>
            </label>

            <label>
                Contact Number
                <input name="contactNumber">
            </label>

            <label>
                Job Address
                <input name="jobAddress" required>
            </label>

            <label>
                Date
                <input type="date" name="date" required>
            </label>

            <label>
                Time
                <input type="time" name="time">
            </label>

            <label>
                Status
                <select name="status">
                    <option>Booked</option>
                    <option>In Progress</option>
                    <option>Completed</option>
                    <option>Cancelled</option>
                </select>
            </label>

            <label>
                Job Details
                <textarea name="details" required></textarea>
            </label>

            <button type="submit">SAVE JOB</button>
        </form>

        <h2>Saved Jobs</h2>
        ${jobList || "<p>No jobs saved yet.</p>"}

        <a class="back-link" href="/admin/dashboard">BACK TO DASHBOARD</a>
    `));
});

app.post("/admin/jobs", requireLogin, (req, res) => {
    jobs.push({
        date: req.body.date,
        time: req.body.time,
        customerName: req.body.customerName,
        contactNumber: req.body.contactNumber,
        jobAddress: req.body.jobAddress,
        status: req.body.status,
        details: req.body.details
    });

    res.redirect("/admin/jobs");
});

app.get("/admin/files", requireLogin, (req, res) => {
    const fileList = files.map(file => `
        <article class="card">
            <div class="item-top">
                <strong>${escapeHtml(file.fileName)}</strong>
                <span>${escapeHtml(file.date)}</span>
            </div>

            <p><strong>Customer:</strong> ${escapeHtml(file.customerName)}</p>
            <p><strong>Job Address:</strong> ${escapeHtml(file.jobAddress)}</p>
            <p><strong>Description:</strong> ${escapeHtml(file.description) || "No description recorded"}</p>
            <a class="terminal-link" href="${safeUrl(file.fileUrl)}" target="_blank" rel="noopener noreferrer">OPEN FILE</a>
        </article>
    `).join("");

    res.send(terminalPage("NFJ Files", "FILES", `
        <h1>Files <span class="blink">_</span></h1>

        <p>Store links to receipts, certificates, manuals, quotes, invoices and job documents.</p>

        <form method="POST" action="/admin/files">
            <h2>Add File</h2>

            <label>
                File Name
                <input name="fileName" required>
            </label>

            <label>
                Customer Name
                <input name="customerName" required>
            </label>

            <label>
                Job Address
                <input name="jobAddress" required>
            </label>

            <label>
                File URL
                <input type="url" name="fileUrl" placeholder="https://..." required>
            </label>

            <label>
                Description
                <textarea name="description"></textarea>
            </label>

            <button type="submit">SAVE FILE</button>
        </form>

        <h2>Saved Files</h2>
        ${fileList || "<p>No files saved yet.</p>"}

        <a class="back-link" href="/admin/dashboard">BACK TO DASHBOARD</a>
    `));
});

app.post("/admin/files", requireLogin, (req, res) => {
    files.push({
        date: new Date().toLocaleString("en-GB"),
        fileName: req.body.fileName,
        customerName: req.body.customerName,
        jobAddress: req.body.jobAddress,
        fileUrl: req.body.fileUrl,
        description: req.body.description
    });

    res.redirect("/admin/files");
});

app.get("/admin/photos", requireLogin, (req, res) => {
    const photoList = photos.map(photo => `
        <article class="card">
            <div class="item-top">
                <strong>${escapeHtml(photo.customerName)}</strong>
                <span>${escapeHtml(photo.date)}</span>
            </div>

            <img src="${safeUrl(photo.photoUrl)}" alt="Job photo for ${escapeHtml(photo.customerName)}" class="job-photo">

            <p><strong>Job Address:</strong> ${escapeHtml(photo.jobAddress)}</p>
            <p><strong>Description:</strong> ${escapeHtml(photo.description) || "No description recorded"}</p>
            <a class="terminal-link" href="${safeUrl(photo.photoUrl)}" target="_blank" rel="noopener noreferrer">OPEN PHOTO</a>
        </article>
    `).join("");

    res.send(terminalPage("NFJ Photos", "JOB PHOTOS", `
        <h1>Photos <span class="blink">_</span></h1>

        <p>Store site photo links for job evidence, before/after records and customer references.</p>

        <form method="POST" action="/admin/photos">
            <h2>Add Job Photo</h2>

            <label>
                Customer Name
                <input name="customerName" required>
            </label>

            <label>
                Job Address
                <input name="jobAddress" required>
            </label>

            <label>
                Photo URL
                <input type="url" name="photoUrl" placeholder="https://..." required>
            </label>

            <label>
                Description
                <textarea name="description"></textarea>
            </label>

            <button type="submit">SAVE PHOTO</button>
        </form>

        <h2>Saved Photos</h2>
        <div class="grid">${photoList || "<p>No photos saved yet.</p>"}</div>

        <a class="back-link" href="/admin/dashboard">BACK TO DASHBOARD</a>
    `));
});

app.post("/admin/photos", requireLogin, (req, res) => {
    photos.push({
        date: new Date().toLocaleString("en-GB"),
        customerName: req.body.customerName,
        jobAddress: req.body.jobAddress,
        photoUrl: req.body.photoUrl,
        description: req.body.description
    });

    res.redirect("/admin/photos");
});

app.get("/admin/notes", requireLogin, (req, res) => {
    const noteList = notes.map(note => `
        <article class="card">
            <div class="item-top">
                <strong>${escapeHtml(note.customerName)}</strong>
                <span>${escapeHtml(note.date)}</span>
            </div>

            <p><strong>Job Address:</strong> ${escapeHtml(note.jobAddress)}</p>
            <p><strong>Work Completed:</strong> ${escapeHtml(note.workCompleted)}</p>
            <p><strong>Materials Used:</strong> ${escapeHtml(note.materialsUsed) || "None recorded"}</p>
            <p><strong>Customer Sign-Off:</strong> ${escapeHtml(note.signatureName) || "Not signed"}</p>
        </article>
    `).join("");

    res.send(terminalPage("NFJ Job Notes", "JOB NOTES", `
        <h1>Notes <span class="blink">_</span></h1>

        <p>Record what was completed on site, what materials were used, and who signed off the job.</p>

        <form method="POST" action="/admin/notes">
            <h2>Create Job Note</h2>

            <label>
                Customer Name
                <input name="customerName" required>
            </label>

            <label>
                Job Address
                <input name="jobAddress" required>
            </label>

            <label>
                Work Completed
                <textarea name="workCompleted" required></textarea>
            </label>

            <label>
                Materials Used
                <textarea name="materialsUsed"></textarea>
            </label>

            <label>
                Customer Sign-Off Name
                <input name="signatureName" placeholder="Typed name for now">
            </label>

            <button type="submit">SAVE NOTE</button>
        </form>

        <h2>Saved Notes</h2>
        ${noteList || "<p>No notes saved yet.</p>"}

        <a class="back-link" href="/admin/dashboard">BACK TO DASHBOARD</a>
    `));
});

app.post("/admin/notes", requireLogin, (req, res) => {
    notes.push({
        date: new Date().toLocaleString("en-GB"),
        customerName: req.body.customerName,
        jobAddress: req.body.jobAddress,
        workCompleted: req.body.workCompleted,
        materialsUsed: req.body.materialsUsed,
        signatureName: req.body.signatureName
    });

    res.redirect("/admin/notes");
});

app.get("/admin/invoices", requireLogin, (req, res) => {
    const invoiceList = invoices.map(invoice => {
        const emailBody = encodeURIComponent(
`NFJ Services LTD Invoice

Invoice Number: ${invoice.invoiceNumber}

Customer: ${invoice.customerName}
Email: ${invoice.customerEmail}
Address: ${invoice.jobAddress}

Work / Job Details:
${invoice.description}

Amount Due: £${invoice.amount}

Thank you,
NFJ Services LTD
Directors: Keith Andrews & Chris Lawton`
        );

        const emailSubject = encodeURIComponent(`Invoice ${invoice.invoiceNumber} from NFJ Services LTD`);
        const emailHref = escapeHtml(`mailto:${invoice.customerEmail}?subject=${emailSubject}&body=${emailBody}`);

        return `
            <article class="card">
                <div class="item-top">
                    <strong>${escapeHtml(invoice.invoiceNumber)}</strong>
                    <span>${escapeHtml(invoice.date)}</span>
                </div>

                <p><strong>Customer:</strong> ${escapeHtml(invoice.customerName)}</p>
                <p><strong>Email:</strong> ${escapeHtml(invoice.customerEmail)}</p>
                <p><strong>Address:</strong> ${escapeHtml(invoice.jobAddress)}</p>
                <p><strong>Details:</strong> ${escapeHtml(invoice.description)}</p>
                <p><strong>Amount:</strong> £${escapeHtml(invoice.amount)}</p>

                <a class="terminal-link" href="${emailHref}">
                    SEND BY EMAIL
                </a>

                <a class="terminal-link" href="/admin/invoices/${escapeHtml(invoice.invoiceNumber)}">
                    VIEW A4 INVOICE
                </a>
            </article>
        `;
    }).join("");

    res.send(terminalPage("NFJ Invoices", "INVOICE SYSTEM", `
        <h1>Invoices <span class="blink">_</span></h1>

        <p>
            NFJ Services LTD<br>
            Electrical • Network Cabling • Tech Installations • Maintenance<br>
            Directors: Keith Andrews & Chris Lawton
        </p>

        <form method="POST" action="/admin/invoices">
            <h2>Create Invoice</h2>

            <label>
                Customer Name
                <input name="customerName" required>
            </label>

            <label>
                Customer Email
                <input type="email" name="customerEmail" required>
            </label>

            <label>
                Job Address
                <input name="jobAddress" required>
            </label>

            <label>
                Work / Job Details
                <textarea name="description" required></textarea>
            </label>

            <label>
                Amount (£)
                <input type="number" name="amount" step="0.01" min="0" required>
            </label>

            <button type="submit">CREATE INVOICE</button>
        </form>

        <h2>Saved Invoices</h2>
        ${invoiceList || "<p>No invoices created yet.</p>"}

        <a class="back-link" href="/admin/dashboard">BACK TO DASHBOARD</a>
    `));
});

app.post("/admin/invoices", requireLogin, (req, res) => {
    const amount = Number(req.body.amount);
    const invoiceNumber = `NFJ-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(4, "0")}`;

    invoices.push({
        invoiceNumber,
        date: new Date().toLocaleDateString("en-GB"),
        customerName: req.body.customerName,
        customerEmail: req.body.customerEmail,
        jobAddress: req.body.jobAddress,
        description: req.body.description,
        amount: Number.isFinite(amount) ? amount.toFixed(2) : "0.00"
    });

    res.redirect("/admin/invoices");
});

app.get("/admin/invoices/:invoiceNumber", requireLogin, (req, res) => {
    const invoice = invoices.find(item => item.invoiceNumber === req.params.invoiceNumber);

    if (!invoice) {
        return res.send("<h1>Invoice not found</h1><a href='/admin/invoices'>Back to invoices</a>");
    }

    const emailBody = encodeURIComponent(
`Hi ${invoice.customerName},

Please find your invoice details below.

Invoice Number: ${invoice.invoiceNumber}
Date: ${invoice.date}

Work / Job Details:
${invoice.description}

Amount Due: £${invoice.amount}

Kind regards,
NFJ Services LTD`
    );

    const emailSubject = encodeURIComponent(`Invoice ${invoice.invoiceNumber} from NFJ Services LTD`);
    const emailHref = escapeHtml(`mailto:${invoice.customerEmail}?subject=${emailSubject}&body=${emailBody}`);

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${escapeHtml(invoice.invoiceNumber)} - NFJ Services LTD</title>

            <style>
                * {
                    box-sizing: border-box;
                }

                body {
                    margin: 0;
                    background: #e5e7eb;
                    font-family: Arial, sans-serif;
                    color: #111827;
                    padding: 24px;
                }

                .toolbar {
                    max-width: 210mm;
                    margin: 0 auto 16px;
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    flex-wrap: wrap;
                }

                .toolbar a,
                .toolbar button {
                    border: none;
                    background: #0f172a;
                    color: white;
                    padding: 10px 14px;
                    border-radius: 6px;
                    text-decoration: none;
                    cursor: pointer;
                    font-size: 14px;
                }

                .invoice-page {
                    width: 210mm;
                    min-height: 297mm;
                    margin: 0 auto;
                    background: white;
                    padding: 18mm;
                    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18);
                }

                .invoice-header {
                    display: flex;
                    justify-content: space-between;
                    gap: 24px;
                    border-bottom: 3px solid #0f172a;
                    padding-bottom: 18px;
                    margin-bottom: 28px;
                }

                .brand {
                    display: flex;
                    gap: 14px;
                    align-items: center;
                }

                .logo-box {
                    width: 68px;
                    height: 68px;
                    border-radius: 10px;
                    background: #0f172a;
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                    font-weight: bold;
                }

                .brand h1 {
                    margin: 0;
                    color: #0f172a;
                    font-size: 26px;
                }

                .brand p {
                    margin: 4px 0 0;
                    color: #475569;
                    line-height: 1.4;
                    font-size: 13px;
                }

                .invoice-title {
                    text-align: right;
                }

                .invoice-title h2 {
                    margin: 0;
                    font-size: 34px;
                    color: #0f172a;
                    letter-spacing: 2px;
                }

                .invoice-title p {
                    margin: 6px 0 0;
                    color: #475569;
                }

                .details-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 24px;
                    margin-bottom: 28px;
                }

                .box {
                    border: 1px solid #cbd5e1;
                    border-radius: 8px;
                    padding: 14px;
                }

                .box h3 {
                    margin: 0 0 10px;
                    color: #0f172a;
                    font-size: 14px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                .box p {
                    margin: 0;
                    color: #334155;
                    line-height: 1.6;
                }

                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 18px;
                }

                th {
                    background: #0f172a;
                    color: white;
                    padding: 12px;
                    text-align: left;
                    font-size: 14px;
                }

                td {
                    border: 1px solid #cbd5e1;
                    padding: 14px 12px;
                    vertical-align: top;
                    line-height: 1.6;
                }

                .amount {
                    width: 130px;
                    text-align: right;
                    white-space: nowrap;
                }

                .total-row td {
                    font-weight: bold;
                    font-size: 18px;
                    background: #f8fafc;
                }

                .footer-note {
                    margin-top: 36px;
                    border-top: 1px solid #cbd5e1;
                    padding-top: 14px;
                    color: #64748b;
                    font-size: 13px;
                    line-height: 1.6;
                }

                @media print {
                    body {
                        background: white;
                        padding: 0;
                    }

                    .toolbar {
                        display: none;
                    }

                    .invoice-page {
                        box-shadow: none;
                        margin: 0;
                        width: 210mm;
                        min-height: 297mm;
                    }
                }

                @media (max-width: 760px) {
                    body {
                        padding: 0;
                        background: white;
                    }

                    .toolbar {
                        padding: 12px;
                        margin: 0;
                        max-width: none;
                        justify-content: center;
                    }

                    .invoice-page {
                        width: 100%;
                        min-height: auto;
                        padding: 20px;
                        box-shadow: none;
                    }

                    .invoice-header {
                        display: block;
                    }

                    .details-grid {
                        grid-template-columns: 1fr;
                    }

                    .invoice-title {
                        text-align: left;
                        margin-top: 18px;
                    }

                    .box {
                        margin-bottom: 16px;
                    }
                }
            </style>
        </head>

        <body>
            <div class="toolbar">
                <a href="/admin/invoices">Back</a>
                <a href="${emailHref}">Email</a>
                <button onclick="window.print()">Print / Save PDF</button>
            </div>

            <main class="invoice-page">
                <header class="invoice-header">
                    <div class="brand">
                        <div class="logo-box">NFJ</div>
                        <div>
                            <h1>NFJ Services LTD</h1>
                            <p>
                                Electrical • Network Cabling • Tech Installations • Maintenance<br>
                                Directors: Keith Andrews & Chris Lawton
                            </p>
                        </div>
                    </div>

                    <div class="invoice-title">
                        <h2>INVOICE</h2>
                        <p><strong>No:</strong> ${escapeHtml(invoice.invoiceNumber)}</p>
                        <p><strong>Date:</strong> ${escapeHtml(invoice.date)}</p>
                    </div>
                </header>

                <section class="details-grid">
                    <div class="box">
                        <h3>Invoice To</h3>
                        <p>
                            <strong>${escapeHtml(invoice.customerName)}</strong><br>
                            ${escapeHtml(invoice.customerEmail)}
                        </p>
                    </div>

                    <div class="box">
                        <h3>Job Address</h3>
                        <p>${escapeHtml(invoice.jobAddress)}</p>
                    </div>
                </section>

                <table>
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th class="amount">Amount</th>
                        </tr>
                    </thead>

                    <tbody>
                        <tr>
                            <td>${escapeHtml(invoice.description)}</td>
                            <td class="amount">£${escapeHtml(invoice.amount)}</td>
                        </tr>

                        <tr class="total-row">
                            <td>Total Due</td>
                            <td class="amount">£${escapeHtml(invoice.amount)}</td>
                        </tr>
                    </tbody>
                </table>

                <div class="footer-note">
                    <p>
                        Thank you for choosing NFJ Services LTD. Please contact us if you have any questions about this invoice.
                    </p>
                </div>
            </main>
        </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log(`NFJ admin backend running at http://localhost:${PORT}/admin`);
});
