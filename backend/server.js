const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;

const MAIN_SITE_URL = process.env.MAIN_SITE_URL || "https://nfjservicesltd.co.uk/";

const DROPBOX_LINKS = {
    invoices: process.env.DROPBOX_INVOICES_URL || "https://www.dropbox.com/request/fehl8e9km5s49m7bnt9a",
    photos: process.env.DROPBOX_PHOTOS_URL || "https://www.dropbox.com/request/ak0rudbljxcsmt6p0sdt",
    notes: process.env.DROPBOX_NOTES_URL || "https://www.dropbox.com/request/2i93wsdjfvnrap07sw0b",
    files: process.env.DROPBOX_FILES_URL || "https://www.dropbox.com/request/5u2eyel5qgirvhhsuv8c",
    expenses: process.env.DROPBOX_EXPENSES_URL || "https://www.dropbox.com/request/whh3zm8iwq4qx8flxw4m"
};

const jobs = [];
const files = [];
const photos = [];
const notes = [];
const invoices = [];
const expenses = [];

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
        console.warn("No admin passwords set. Add KEITH_ADMIN_PASSWORD and CHRIS_ADMIN_PASSWORD in Render.");
    }

    return users;
}

const adminUsers = getAdminUsers();

const isProduction = process.env.NODE_ENV === "production" || process.env.RENDER === "true";

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(express.urlencoded({ extended: true, limit: "100kb" }));

app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
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

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function nl2br(value) {
    return escapeHtml(value).replace(/\n/g, "<br>");
}

function safeUrl(value) {
    try {
        const url = new URL(String(value || ""));

        if (url.protocol === "http:" || url.protocol === "https:") {
            return url.href;
        }
    } catch (error) {
        return "#";
    }

    return "#";
}

function recordNumber(prefix, collection) {
    return `${prefix}-${new Date().getFullYear()}-${String(collection.length + 1).padStart(4, "0")}`;
}

function requireLogin(req, res, next) {
    if (!req.session.loggedIn) {
        return res.redirect("/admin");
    }

    next();
}

function dropboxButton(type, label) {
    return `
        <a class="terminal-link"
           href="${escapeHtml(DROPBOX_LINKS[type])}"
           target="_blank"
           rel="noopener noreferrer">
            ${escapeHtml(label)}
        </a>
    `;
}

const failedLogins = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 8;

function getLoginKey(req) {
    return req.ip || req.headers["x-forwarded-for"] || "unknown";
}

function isLoginBlocked(req) {
    const key = getLoginKey(req);
    const record = failedLogins.get(key);

    if (!record) {
        return false;
    }

    if (Date.now() - record.firstAttempt > LOGIN_WINDOW_MS) {
        failedLogins.delete(key);
        return false;
    }

    return record.count >= MAX_LOGIN_ATTEMPTS;
}

function recordFailedLogin(req) {
    const key = getLoginKey(req);
    const record = failedLogins.get(key);

    if (!record || Date.now() - record.firstAttempt > LOGIN_WINDOW_MS) {
        failedLogins.set(key, {
            count: 1,
            firstAttempt: Date.now()
        });
        return;
    }

    record.count += 1;
}

function clearFailedLogin(req) {
    failedLogins.delete(getLoginKey(req));
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
                }

                .denied-box {
                    width: min(760px, 100%);
                    border: 3px solid #ff1f1f;
                    padding: 32px;
                    text-align: center;
                    box-shadow: 0 0 22px rgba(255, 0, 0, 0.7);
                    background: radial-gradient(circle at center, #260000 0%, #000000 70%);
                }

                .warning {
                    font-size: clamp(44px, 9vw, 88px);
                    font-weight: bold;
                    letter-spacing: 4px;
                    text-transform: uppercase;
                    text-shadow: 0 0 18px #ff0000;
                }

                .subtext {
                    margin-top: 18px;
                    color: #ff9b9b;
                    font-size: 18px;
                    line-height: 1.6;
                    text-transform: uppercase;
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

                .action-row {
                    margin: 16px 0 24px;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }

                .amount {
                    color: #ffffff;
                    font-weight: bold;
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

function documentPage(options) {
    const dropboxLink = options.dropboxUrl
        ? `<a class="dropbox" href="${escapeHtml(options.dropboxUrl)}" target="_blank" rel="noopener noreferrer">Upload to Dropbox</a>`
        : "";

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${escapeHtml(options.title)}</title>

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

                .toolbar a.dropbox {
                    background: #0061ff;
                }

                .document-page {
                    width: 210mm;
                    min-height: 297mm;
                    margin: 0 auto;
                    background: white;
                    padding: 18mm;
                    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18);
                }

                .document-header {
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

                .document-title {
                    text-align: right;
                }

                .document-title h2 {
                    margin: 0;
                    font-size: 30px;
                    color: #0f172a;
                    letter-spacing: 2px;
                    text-transform: uppercase;
                }

                .document-title p {
                    margin: 6px 0 0;
                    color: #475569;
                }

                .details-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 18px;
                    margin-bottom: 24px;
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
                    word-break: break-word;
                }

                .wide {
                    grid-column: 1 / -1;
                }

                .amount-box {
                    margin-top: 20px;
                    background: #f8fafc;
                    border: 2px solid #0f172a;
                    border-radius: 8px;
                    padding: 18px;
                    display: flex;
                    justify-content: space-between;
                    gap: 16px;
                    font-size: 22px;
                    font-weight: bold;
                }

                .photo-preview {
                    max-width: 100%;
                    max-height: 430px;
                    object-fit: contain;
                    display: block;
                    margin-top: 10px;
                    border: 1px solid #cbd5e1;
                    border-radius: 8px;
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

                    .document-page {
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

                    .document-page {
                        width: 100%;
                        min-height: auto;
                        padding: 20px;
                        box-shadow: none;
                    }

                    .document-header {
                        display: block;
                    }

                    .document-title {
                        text-align: left;
                        margin-top: 18px;
                    }

                    .details-grid {
                        grid-template-columns: 1fr;
                    }

                    .wide {
                        grid-column: auto;
                    }

                    .amount-box {
                        display: block;
                    }
                }
            </style>
        </head>

        <body>
            <div class="toolbar">
                <a href="${escapeHtml(options.backUrl)}">Back</a>
                <button onclick="window.print()">Create / Save PDF</button>
                ${dropboxLink}
            </div>

            <main class="document-page">
                <header class="document-header">
                    <div class="brand">
                        <div class="logo-box">NFJ</div>
                        <div>
                            <h1>NFJ Services LTD</h1>
                            <p>
                                Electrical - Network Cabling - Tech Installations - Maintenance<br>
                                Directors: Keith Andrews & Chris Lawton
                            </p>
                        </div>
                    </div>

                    <div class="document-title">
                        <h2>${escapeHtml(options.heading)}</h2>
                        <p><strong>No:</strong> ${escapeHtml(options.number)}</p>
                        <p><strong>Date:</strong> ${escapeHtml(options.date)}</p>
                    </div>
                </header>

                ${options.content}

                <div class="footer-note">
                    <p>
                        This record was created through the NFJ Services LTD admin system.
                        Use Create / Save PDF first, then upload the saved file to Dropbox if required.
                    </p>
                </div>
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

        <body style="font-family: Arial; background: #0f172a; color: white; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px;">
            <form method="POST" action="/admin/login" style="background: #1e293b; padding: 25px; border-radius: 10px; width: 320px; box-shadow: 0 14px 35px rgba(0,0,0,0.35);">
                <h1 style="margin-top: 0;">NFJ Admin</h1>
                <p style="color: #cbd5e1;">Private access only</p>

                <input type="text" name="username" placeholder="Username" required style="width: 100%; padding: 12px; margin-bottom: 10px; box-sizing: border-box;">
                <input type="password" name="password" placeholder="Password" required style="width: 100%; padding: 12px; margin-bottom: 10px; box-sizing: border-box;">

                <button type="submit" style="width: 100%; padding: 12px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">Login</button>

                <a href="${escapeHtml(MAIN_SITE_URL)}" style="display: block; text-align: center; margin-top: 14px; padding: 11px; border: 1px solid #3b82f6; color: #93c5fd; border-radius: 6px; text-decoration: none;">
                    Back to Main Site
                </a>
            </form>
        </body>
        </html>
    `);
});

app.post("/admin/login", (req, res) => {
    if (isLoginBlocked(req)) {
        return res.send(accessDeniedPage("Too many failed login attempts"));
    }

    const { username, password } = req.body;
    const user = adminUsers.find(admin => admin.username === username);

    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        recordFailedLogin(req);
        return res.send(accessDeniedPage());
    }

    clearFailedLogin(req);

    req.session.regenerate(error => {
        if (error) {
            return res.status(500).send("Session error");
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
                <p>Booked work and printable job sheets</p>
            </a>

            <a class="terminal-link card" href="/admin/files">
                FILES
                <p>Documents, certificates and printable file records</p>
            </a>

            <a class="terminal-link card" href="/admin/photos">
                PHOTOS
                <p>Job photos and printable photo records</p>
            </a>

            <a class="terminal-link card" href="/admin/notes">
                NOTES
                <p>Work notes and printable customer sign-off</p>
            </a>

            <a class="terminal-link card" href="/admin/invoices">
                INVOICES
                <p>Create, print, email and upload invoices</p>
            </a>

            <a class="terminal-link card" href="/admin/expenses">
                EXPENSES
                <p>Record expenses and printable expense forms</p>
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
                <strong>${escapeHtml(job.jobNumber)}</strong>
                <span>${escapeHtml(job.date)} ${escapeHtml(job.time)}</span>
            </div>

            <p><strong>Customer:</strong> ${escapeHtml(job.customerName)}</p>
            <p><strong>Status:</strong> ${escapeHtml(job.status)}</p>
            <p><strong>Contact:</strong> ${escapeHtml(job.contactNumber || "Not recorded")}</p>
            <p><strong>Address:</strong> ${escapeHtml(job.jobAddress)}</p>
            <p><strong>Details:</strong> ${escapeHtml(job.details)}</p>

            <a class="terminal-link" href="/admin/jobs/${escapeHtml(job.jobNumber)}">VIEW A4 JOB SHEET</a>
            ${dropboxButton("files", "UPLOAD JOB SHEET TO DROPBOX")}
        </article>
    `).join("");

    res.send(terminalPage("NFJ Current Jobs", "CURRENT JOBS", `
        <h1>Current Jobs <span class="blink">_</span></h1>

        <p>Book work, create job sheets, save them as PDF and upload if needed.</p>

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
        jobNumber: recordNumber("JOB", jobs),
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

app.get("/admin/jobs/:jobNumber", requireLogin, (req, res) => {
    const job = jobs.find(item => item.jobNumber === req.params.jobNumber);

    if (!job) {
        return res.send("<h1>Job not found</h1><a href='/admin/jobs'>Back to jobs</a>");
    }

    res.send(documentPage({
        title: `${job.jobNumber} - NFJ Job Sheet`,
        heading: "Job Sheet",
        number: job.jobNumber,
        date: job.date,
        backUrl: "/admin/jobs",
        dropboxUrl: DROPBOX_LINKS.files,
        content: `
            <section class="details-grid">
                <div class="box">
                    <h3>Customer</h3>
                    <p>${escapeHtml(job.customerName)}</p>
                </div>

                <div class="box">
                    <h3>Contact Number</h3>
                    <p>${escapeHtml(job.contactNumber || "Not recorded")}</p>
                </div>

                <div class="box">
                    <h3>Job Date / Time</h3>
                    <p>${escapeHtml(job.date)} ${escapeHtml(job.time || "")}</p>
                </div>

                <div class="box">
                    <h3>Status</h3>
                    <p>${escapeHtml(job.status)}</p>
                </div>

                <div class="box wide">
                    <h3>Job Address</h3>
                    <p>${escapeHtml(job.jobAddress)}</p>
                </div>

                <div class="box wide">
                    <h3>Job Details</h3>
                    <p>${nl2br(job.details)}</p>
                </div>
            </section>
        `
    }));
});

app.get("/admin/files", requireLogin, (req, res) => {
    const fileList = files.map(file => {
        const fileUrl = safeUrl(file.fileUrl);

        return `
            <article class="card">
                <div class="item-top">
                    <strong>${escapeHtml(file.fileNumber)}</strong>
                    <span>${escapeHtml(file.date)}</span>
                </div>

                <p><strong>File Name:</strong> ${escapeHtml(file.fileName)}</p>
                <p><strong>Customer:</strong> ${escapeHtml(file.customerName)}</p>
                <p><strong>Job Address:</strong> ${escapeHtml(file.jobAddress)}</p>
                <p><strong>Description:</strong> ${escapeHtml(file.description || "No description recorded")}</p>

                <a class="terminal-link" href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener noreferrer">OPEN FILE</a>
                <a class="terminal-link" href="/admin/files/${escapeHtml(file.fileNumber)}">VIEW A4 FILE RECORD</a>
                ${dropboxButton("files", "UPLOAD FILE TO DROPBOX")}
            </article>
        `;
    }).join("");

    res.send(terminalPage("NFJ Files", "FILES", `
        <h1>Files <span class="blink">_</span></h1>

        <p>Store links to receipts, certificates, manuals, quotes, invoices and job documents.</p>

        <div class="action-row">
            ${dropboxButton("files", "UPLOAD FILE TO DROPBOX")}
        </div>

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
        fileNumber: recordNumber("FILE", files),
        date: new Date().toLocaleString("en-GB"),
        fileName: req.body.fileName,
        customerName: req.body.customerName,
        jobAddress: req.body.jobAddress,
        fileUrl: req.body.fileUrl,
        description: req.body.description
    });

    res.redirect("/admin/files");
});

app.get("/admin/files/:fileNumber", requireLogin, (req, res) => {
    const file = files.find(item => item.fileNumber === req.params.fileNumber);

    if (!file) {
        return res.send("<h1>File record not found</h1><a href='/admin/files'>Back to files</a>");
    }

    const fileUrl = safeUrl(file.fileUrl);

    res.send(documentPage({
        title: `${file.fileNumber} - NFJ File Record`,
        heading: "File Record",
        number: file.fileNumber,
        date: file.date,
        backUrl: "/admin/files",
        dropboxUrl: DROPBOX_LINKS.files,
        content: `
            <section class="details-grid">
                <div class="box">
                    <h3>File Name</h3>
                    <p>${escapeHtml(file.fileName)}</p>
                </div>

                <div class="box">
                    <h3>Customer</h3>
                    <p>${escapeHtml(file.customerName)}</p>
                </div>

                <div class="box wide">
                    <h3>Job Address</h3>
                    <p>${escapeHtml(file.jobAddress)}</p>
                </div>

                <div class="box wide">
                    <h3>File Link</h3>
                    <p><a href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(fileUrl)}</a></p>
                </div>

                <div class="box wide">
                    <h3>Description</h3>
                    <p>${nl2br(file.description || "No description recorded")}</p>
                </div>
            </section>
        `
    }));
});

app.get("/admin/photos", requireLogin, (req, res) => {
    const photoList = photos.map(photo => {
        const photoUrl = safeUrl(photo.photoUrl);

        return `
            <article class="card">
                <div class="item-top">
                    <strong>${escapeHtml(photo.photoNumber)}</strong>
                    <span>${escapeHtml(photo.date)}</span>
                </div>

                <img src="${escapeHtml(photoUrl)}" alt="Job photo for ${escapeHtml(photo.customerName)}" class="job-photo">

                <p><strong>Customer:</strong> ${escapeHtml(photo.customerName)}</p>
                <p><strong>Job Address:</strong> ${escapeHtml(photo.jobAddress)}</p>
                <p><strong>Description:</strong> ${escapeHtml(photo.description || "No description recorded")}</p>

                <a class="terminal-link" href="${escapeHtml(photoUrl)}" target="_blank" rel="noopener noreferrer">OPEN PHOTO</a>
                <a class="terminal-link" href="/admin/photos/${escapeHtml(photo.photoNumber)}">VIEW A4 PHOTO RECORD</a>
                ${dropboxButton("photos", "UPLOAD PHOTO TO DROPBOX")}
            </article>
        `;
    }).join("");

    res.send(terminalPage("NFJ Photos", "JOB PHOTOS", `
        <h1>Photos <span class="blink">_</span></h1>

        <p>Store site photo links for job evidence, before/after records and customer references.</p>

        <div class="action-row">
            ${dropboxButton("photos", "UPLOAD PHOTO TO DROPBOX")}
        </div>

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
        photoNumber: recordNumber("PHOTO", photos),
        date: new Date().toLocaleString("en-GB"),
        customerName: req.body.customerName,
        jobAddress: req.body.jobAddress,
        photoUrl: req.body.photoUrl,
        description: req.body.description
    });

    res.redirect("/admin/photos");
});

app.get("/admin/photos/:photoNumber", requireLogin, (req, res) => {
    const photo = photos.find(item => item.photoNumber === req.params.photoNumber);

    if (!photo) {
        return res.send("<h1>Photo record not found</h1><a href='/admin/photos'>Back to photos</a>");
    }

    const photoUrl = safeUrl(photo.photoUrl);

    res.send(documentPage({
        title: `${photo.photoNumber} - NFJ Photo Record`,
        heading: "Photo Record",
        number: photo.photoNumber,
        date: photo.date,
        backUrl: "/admin/photos",
        dropboxUrl: DROPBOX_LINKS.photos,
        content: `
            <section class="details-grid">
                <div class="box">
                    <h3>Customer</h3>
                    <p>${escapeHtml(photo.customerName)}</p>
                </div>

                <div class="box">
                    <h3>Photo Link</h3>
                    <p><a href="${escapeHtml(photoUrl)}" target="_blank" rel="noopener noreferrer">Open original photo</a></p>
                </div>

                <div class="box wide">
                    <h3>Job Address</h3>
                    <p>${escapeHtml(photo.jobAddress)}</p>
                </div>

                <div class="box wide">
                    <h3>Description</h3>
                    <p>${nl2br(photo.description || "No description recorded")}</p>
                    <img src="${escapeHtml(photoUrl)}" alt="Job photo" class="photo-preview">
                </div>
            </section>
        `
    }));
});

app.get("/admin/notes", requireLogin, (req, res) => {
    const noteList = notes.map(note => `
        <article class="card">
            <div class="item-top">
                <strong>${escapeHtml(note.noteNumber)}</strong>
                <span>${escapeHtml(note.date)}</span>
            </div>

            <p><strong>Customer:</strong> ${escapeHtml(note.customerName)}</p>
            <p><strong>Job Address:</strong> ${escapeHtml(note.jobAddress)}</p>
            <p><strong>Work Completed:</strong> ${escapeHtml(note.workCompleted)}</p>
            <p><strong>Materials Used:</strong> ${escapeHtml(note.materialsUsed || "None recorded")}</p>
            <p><strong>Customer Sign-Off:</strong> ${escapeHtml(note.signatureName || "Not signed")}</p>

            <a class="terminal-link" href="/admin/notes/${escapeHtml(note.noteNumber)}">VIEW A4 NOTE FORM</a>
            ${dropboxButton("notes", "UPLOAD NOTE TO DROPBOX")}
        </article>
    `).join("");

    res.send(terminalPage("NFJ Job Notes", "JOB NOTES", `
        <h1>Notes <span class="blink">_</span></h1>

        <p>Record what was completed on site, what materials were used, and who signed off the job.</p>

        <div class="action-row">
            ${dropboxButton("notes", "UPLOAD NOTE TO DROPBOX")}
        </div>

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
        noteNumber: recordNumber("NOTE", notes),
        date: new Date().toLocaleString("en-GB"),
        customerName: req.body.customerName,
        jobAddress: req.body.jobAddress,
        workCompleted: req.body.workCompleted,
        materialsUsed: req.body.materialsUsed,
        signatureName: req.body.signatureName
    });

    res.redirect("/admin/notes");
});

app.get("/admin/notes/:noteNumber", requireLogin, (req, res) => {
    const note = notes.find(item => item.noteNumber === req.params.noteNumber);

    if (!note) {
        return res.send("<h1>Note not found</h1><a href='/admin/notes'>Back to notes</a>");
    }

    res.send(documentPage({
        title: `${note.noteNumber} - NFJ Job Note`,
        heading: "Job Note",
        number: note.noteNumber,
        date: note.date,
        backUrl: "/admin/notes",
        dropboxUrl: DROPBOX_LINKS.notes,
        content: `
            <section class="details-grid">
                <div class="box">
                    <h3>Customer</h3>
                    <p>${escapeHtml(note.customerName)}</p>
                </div>

                <div class="box">
                    <h3>Customer Sign-Off</h3>
                    <p>${escapeHtml(note.signatureName || "Not signed")}</p>
                </div>

                <div class="box wide">
                    <h3>Job Address</h3>
                    <p>${escapeHtml(note.jobAddress)}</p>
                </div>

                <div class="box wide">
                    <h3>Work Completed</h3>
                    <p>${nl2br(note.workCompleted)}</p>
                </div>

                <div class="box wide">
                    <h3>Materials Used</h3>
                    <p>${nl2br(note.materialsUsed || "None recorded")}</p>
                </div>
            </section>
        `
    }));
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

Amount Due: GBP ${invoice.amount}

Thank you,
NFJ Services LTD
Directors: Keith Andrews & Chris Lawton`
        );

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
                <p><strong>Amount:</strong> <span class="amount">&pound;${escapeHtml(invoice.amount)}</span></p>

                <a class="terminal-link"
                   href="mailto:${escapeHtml(invoice.customerEmail)}?subject=Invoice ${escapeHtml(invoice.invoiceNumber)} from NFJ Services LTD&body=${emailBody}">
                    SEND BY EMAIL
                </a>

                <a class="terminal-link" href="/admin/invoices/${escapeHtml(invoice.invoiceNumber)}">
                    VIEW A4 INVOICE
                </a>

                ${dropboxButton("invoices", "UPLOAD INVOICE TO DROPBOX")}
            </article>
        `;
    }).join("");

    res.send(terminalPage("NFJ Invoices", "INVOICE SYSTEM", `
        <h1>Invoices <span class="blink">_</span></h1>

        <p>
            NFJ Services LTD<br>
            Electrical - Network Cabling - Tech Installations - Maintenance<br>
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
                Amount (&pound;)
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

    if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).send("Invalid invoice amount");
    }

    invoices.push({
        invoiceNumber: recordNumber("NFJ", invoices),
        date: new Date().toLocaleDateString("en-GB"),
        customerName: req.body.customerName,
        customerEmail: req.body.customerEmail,
        jobAddress: req.body.jobAddress,
        description: req.body.description,
        amount: amount.toFixed(2)
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

Amount Due: GBP ${invoice.amount}

Kind regards,
NFJ Services LTD`
    );

    res.send(documentPage({
        title: `${invoice.invoiceNumber} - NFJ Invoice`,
        heading: "Invoice",
        number: invoice.invoiceNumber,
        date: invoice.date,
        backUrl: "/admin/invoices",
        dropboxUrl: DROPBOX_LINKS.invoices,
        content: `
            <section class="details-grid">
                <div class="box">
                    <h3>Invoice To</h3>
                    <p>
                        <strong>${escapeHtml(invoice.customerName)}</strong><br>
                        ${escapeHtml(invoice.customerEmail)}
                    </p>
                </div>

                <div class="box">
                    <h3>Email Invoice</h3>
                    <p>
                        <a href="mailto:${escapeHtml(invoice.customerEmail)}?subject=Invoice ${escapeHtml(invoice.invoiceNumber)} from NFJ Services LTD&body=${emailBody}">
                            Send invoice by email
                        </a>
                    </p>
                </div>

                <div class="box wide">
                    <h3>Job Address</h3>
                    <p>${escapeHtml(invoice.jobAddress)}</p>
                </div>

                <div class="box wide">
                    <h3>Work / Job Details</h3>
                    <p>${nl2br(invoice.description)}</p>
                </div>
            </section>

            <div class="amount-box">
                <span>Total Due</span>
                <span>&pound;${escapeHtml(invoice.amount)}</span>
            </div>
        `
    }));
});

app.get("/admin/expenses", requireLogin, (req, res) => {
    const expenseList = expenses.map(expense => {
        const receiptUrl = expense.receiptUrl ? safeUrl(expense.receiptUrl) : "";

        return `
            <article class="card">
                <div class="item-top">
                    <strong>${escapeHtml(expense.expenseNumber)}</strong>
                    <span>${escapeHtml(expense.date)}</span>
                </div>

                <p><strong>Supplier:</strong> ${escapeHtml(expense.supplierName)}</p>
                <p><strong>Category:</strong> ${escapeHtml(expense.category)}</p>
                <p><strong>Amount:</strong> <span class="amount">&pound;${escapeHtml(expense.amount)}</span></p>
                <p><strong>Payment Method:</strong> ${escapeHtml(expense.paymentMethod || "Not recorded")}</p>
                <p><strong>Notes:</strong> ${escapeHtml(expense.notes || "No notes recorded")}</p>

                ${receiptUrl ? `<a class="terminal-link" href="${escapeHtml(receiptUrl)}" target="_blank" rel="noopener noreferrer">OPEN RECEIPT</a>` : ""}
                <a class="terminal-link" href="/admin/expenses/${escapeHtml(expense.expenseNumber)}">VIEW A4 EXPENSE FORM</a>
                ${dropboxButton("expenses", "UPLOAD EXPENSE RECEIPT TO DROPBOX")}
            </article>
        `;
    }).join("");

    res.send(terminalPage("NFJ Expenses", "EXPENSES", `
        <h1>Expenses <span class="blink">_</span></h1>

        <p>Record business expenses, purchases, receipts and job costs.</p>

        <div class="action-row">
            ${dropboxButton("expenses", "UPLOAD EXPENSE RECEIPT TO DROPBOX")}
        </div>

        <form method="POST" action="/admin/expenses">
            <h2>Add Expense</h2>

            <label>
                Expense Date
                <input type="date" name="date" required>
            </label>

            <label>
                Supplier / Shop Name
                <input name="supplierName" required>
            </label>

            <label>
                Category
                <select name="category">
                    <option>Materials</option>
                    <option>Tools</option>
                    <option>Fuel</option>
                    <option>Parking</option>
                    <option>Software</option>
                    <option>Phone / Internet</option>
                    <option>Subcontractor</option>
                    <option>Other</option>
                </select>
            </label>

            <label>
                Amount (&pound;)
                <input type="number" name="amount" step="0.01" min="0" required>
            </label>

            <label>
                Payment Method
                <input name="paymentMethod" placeholder="Card, cash, bank transfer etc">
            </label>

            <label>
                Receipt URL
                <input type="url" name="receiptUrl" placeholder="https://...">
            </label>

            <label>
                Notes
                <textarea name="notes"></textarea>
            </label>

            <button type="submit">SAVE EXPENSE</button>
        </form>

        <h2>Saved Expenses</h2>
        ${expenseList || "<p>No expenses saved yet.</p>"}

        <a class="back-link" href="/admin/dashboard">BACK TO DASHBOARD</a>
    `));
});

app.post("/admin/expenses", requireLogin, (req, res) => {
    const amount = Number(req.body.amount);

    if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).send("Invalid expense amount");
    }

    expenses.push({
        expenseNumber: recordNumber("EXP", expenses),
        date: req.body.date,
        supplierName: req.body.supplierName,
        category: req.body.category,
        amount: amount.toFixed(2),
        paymentMethod: req.body.paymentMethod,
        receiptUrl: req.body.receiptUrl,
        notes: req.body.notes
    });

    res.redirect("/admin/expenses");
});

app.get("/admin/expenses/:expenseNumber", requireLogin, (req, res) => {
    const expense = expenses.find(item => item.expenseNumber === req.params.expenseNumber);

    if (!expense) {
        return res.send("<h1>Expense not found</h1><a href='/admin/expenses'>Back to expenses</a>");
    }

    const receiptUrl = expense.receiptUrl ? safeUrl(expense.receiptUrl) : "";

    res.send(documentPage({
        title: `${expense.expenseNumber} - NFJ Expense Form`,
        heading: "Expense Form",
        number: expense.expenseNumber,
        date: expense.date,
        backUrl: "/admin/expenses",
        dropboxUrl: DROPBOX_LINKS.expenses,
        content: `
            <section class="details-grid">
                <div class="box">
                    <h3>Supplier / Shop</h3>
                    <p>${escapeHtml(expense.supplierName)}</p>
                </div>

                <div class="box">
                    <h3>Category</h3>
                    <p>${escapeHtml(expense.category)}</p>
                </div>

                <div class="box">
                    <h3>Payment Method</h3>
                    <p>${escapeHtml(expense.paymentMethod || "Not recorded")}</p>
                </div>

                <div class="box">
                    <h3>Receipt</h3>
                    <p>
                        ${receiptUrl ? `<a href="${escapeHtml(receiptUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(receiptUrl)}</a>` : "No receipt URL recorded"}
                    </p>
                </div>

                <div class="box wide">
                    <h3>Notes</h3>
                    <p>${nl2br(expense.notes || "No notes recorded")}</p>
                </div>
            </section>

            <div class="amount-box">
                <span>Total Expense</span>
                <span>&pound;${escapeHtml(expense.amount)}</span>
            </div>
        `
    }));
});

app.listen(PORT, () => {
    console.log(`NFJ admin backend running at http://localhost:${PORT}/admin`);
});
