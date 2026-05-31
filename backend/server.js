const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;

const adminUsers = [
    {
        username: "keith",
        passwordHash: bcrypt.hashSync("Unicorn1234", 10)
    },
    {
        username: "chris",
        passwordHash: bcrypt.hashSync("Password1", 10)
    }
];

app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: "change-this-secret-later",
    resave: false,
    saveUninitialized: false
}));

function requireLogin(req, res, next) {
    if (!req.session.loggedIn) {
        return res.redirect("/admin");
    }

    next();
}

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

                <input type="text" name="username" placeholder="Username" required style="width: 100%; padding: 12px; margin-bottom: 10px; box-sizing: border-box;">
                <input type="password" name="password" placeholder="Password" required style="width: 100%; padding: 12px; margin-bottom: 10px; box-sizing: border-box;">

                <button type="submit" style="width: 100%; padding: 12px; background: #3b82f6; color: white; border: none; border-radius: 6px;">Login</button>
            </form>
        </body>
        </html>
    `);
});

app.post("/admin/login", (req, res) => {
    const { username, password } = req.body;
    const user = adminUsers.find(admin => admin.username === username);

    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.send("Login failed. <a href='/admin'>Try again</a>");
    }

    req.session.loggedIn = true;
    req.session.username = user.username;
    res.redirect("/admin/dashboard");
});

app.get("/admin/dashboard", requireLogin, (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>NFJ Admin Dashboard</title>

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
                    max-width: 1000px;
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

                h1 {
                    margin: 0 0 12px;
                    font-size: 28px;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    text-shadow: 0 0 8px #00ff66;
                }

                p {
                    color: #9cffb8;
                    line-height: 1.6;
                }

                .status {
                    color: #00ff66;
                }

                .grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                    gap: 14px;
                    margin-top: 24px;
                }

                .terminal-button {
                    display: block;
                    border: 1px solid #00ff66;
                    color: #00ff66;
                    text-decoration: none;
                    padding: 18px;
                    min-height: 80px;
                    background: rgba(0, 255, 102, 0.06);
                    box-shadow: inset 0 0 10px rgba(0, 255, 102, 0.12);
                }

                .terminal-button:hover {
                    background: #00ff66;
                    color: #000000;
                }

                .terminal-button span {
                    display: block;
                    font-size: 13px;
                    margin-top: 8px;
                    opacity: 0.8;
                }

                .logout {
                    display: inline-block;
                    margin-top: 28px;
                    color: #00ff66;
                    text-decoration: none;
                    border: 1px solid #00ff66;
                    padding: 10px 14px;
                }

                .logout:hover {
                    background: #00ff66;
                    color: #000000;
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

                    h1 {
                        font-size: 22px;
                    }
                }
            </style>
        </head>

        <body>
            <main class="screen">
                <div class="top-bar">
                    <strong>NFJ SERVICES LTD :: ADMIN SYSTEM</strong>
                    <span class="status">STATUS: ONLINE</span>
                </div>

                <h1>Admin Dashboard <span class="blink">_</span></h1>

                <p>
                    Private operations system loaded. Select a module below.
                </p>

                <div class="grid">
                    <a class="terminal-button" href="/admin/jobs">
                        CURRENT JOBS
                        <span>Booked work and site details</span>
                    </a>

                    <a class="terminal-button" href="/admin/files">
                        FILES
                        <span>Documents, certificates and receipts</span>
                    </a>

                    <a class="terminal-button" href="/admin/photos">
                        PHOTOS
                        <span>Job photos and site evidence</span>
                    </a>

                    <a class="terminal-button" href="/admin/notes">
                        NOTES
                        <span>Work notes and customer sign-off</span>
                    </a>

                    <a class="terminal-button" href="/admin/invoices">
                        INVOICES
                        <span>Create and manage invoices</span>
                    </a>
                </div>

                <a class="logout" href="/admin/logout">LOG OUT</a>
            </main>
        </body>
        </html>
    `);
});

app.get("/admin/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/admin");
    });
});

app.get("/admin/jobs", requireLogin, (req, res) => {
    res.send("<h1>Current Jobs</h1><p>This page will hold booked jobs.</p><a href='/admin/dashboard'>Back</a>");
});

app.get("/admin/files", requireLogin, (req, res) => {
    res.send("<h1>Files</h1><p>This page will hold uploaded job files.</p><a href='/admin/dashboard'>Back</a>");
});

app.get("/admin/photos", requireLogin, (req, res) => {
    res.send("<h1>Photos</h1><p>This page will hold job photos.</p><a href='/admin/dashboard'>Back</a>");
});

app.get("/admin/notes", requireLogin, (req, res) => {
    res.send("<h1>Notes</h1><p>This page will hold job notes and sign-off records.</p><a href='/admin/dashboard'>Back</a>");
});

app.get("/admin/invoices", requireLogin, (req, res) => {
    res.send("<h1>Invoices</h1><p>This page will hold invoice tools.</p><a href='/admin/dashboard'>Back</a>");
});

app.listen(PORT, () => {
    console.log(`NFJ admin backend running at http://localhost:${PORT}/admin`);
});
