const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;

const adminUser = {
    username: "admin",
    passwordHash: bcrypt.hashSync("change-me-now", 10)
};

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

    const usernameMatches = username === adminUser.username;
    const passwordMatches = bcrypt.compareSync(password, adminUser.passwordHash);

    if (!usernameMatches || !passwordMatches) {
        return res.send("Login failed. <a href='/admin'>Try again</a>");
    }

    req.session.loggedIn = true;
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
        </head>
        <body style="font-family: Arial; background: #0f172a; color: white; padding: 30px;">
            <h1>NFJ Admin Dashboard</h1>
            <p>Welcome. This is the private admin area.</p>

            <ul>
                <li><a href="/admin/jobs" style="color: #93c5fd;">Current Jobs</a></li>
                <li><a href="/admin/files" style="color: #93c5fd;">Files</a></li>
                <li><a href="/admin/photos" style="color: #93c5fd;">Photos</a></li>
                <li><a href="/admin/notes" style="color: #93c5fd;">Notes</a></li>
                <li><a href="/admin/invoices" style="color: #93c5fd;">Invoices</a></li>
            </ul>

            <a href="/admin/logout" style="color: #93c5fd;">Logout</a>
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
