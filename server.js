const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const mqtt = require('mqtt');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname), { index: false }));

// 1. Cấu hình Session Bảo mật cho Web
app.use(session({
    secret: 'chuoi_bao_mat_ngau_nhien_123456',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } 
}));

const ADMIN_ACCOUNT_FILE = path.join(__dirname, 'admin-account.json');
let USER_DB = null;

function loadAdminAccountFromDB(filePath = ADMIN_ACCOUNT_FILE) {
    try {
        if (fs.existsSync(filePath)) {
            const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (parsed && parsed.username && parsed.passwordHash) {
                USER_DB = parsed;
                return parsed;
            }
        }
    } catch (err) {
        console.error('Lỗi đọc admin-account:', err);
    }

    return null;
}

function saveAdminAccountToDB(account, filePath = ADMIN_ACCOUNT_FILE) {
    fs.writeFileSync(filePath, JSON.stringify(account, null, 4), 'utf8');
    USER_DB = account;
    return account;
}

function loadOrInitAdminAccount(filePath = ADMIN_ACCOUNT_FILE) {
    const existing = loadAdminAccountFromDB(filePath);
    if (existing && existing.username && existing.passwordHash) {
        return existing;
    }
    return null;
}

async function setAdminAccount({ username, password }, filePath = ADMIN_ACCOUNT_FILE) {
    if (!username || !password) {
        throw new Error('Tên đăng nhập và mật khẩu không được để trống.');
    }

    const account = {
        username: username.trim(),
        passwordHash: await bcrypt.hash(password, 10)
    };

    return saveAdminAccountToDB(account, filePath);
}

async function verifyAdminCredentials(username, password, filePath = ADMIN_ACCOUNT_FILE) {
    const account = loadAdminAccountFromDB(filePath);
    if (!account || !account.username || !account.passwordHash) return false;
    return account.username === username && await bcrypt.compare(password, account.passwordHash);
}

loadOrInitAdminAccount();

// --- CẤU HÌNH MQTT BROKER ---
const MQTT_CONFIG_FILE = path.join(__dirname, 'mqtt-config.json');
let MQTT_CONFIG = {
    host: 'localhost',
    port: 1883,
    protocol: 'mqtt',
    username: 'mqtt-user',
    password: 'matkhaucuaban',
    topicPrefix: 'home/audio'
};

function loadMqttConfigFromDB() {
    try {
        if (fs.existsSync(MQTT_CONFIG_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(MQTT_CONFIG_FILE, 'utf8'));
            MQTT_CONFIG = { ...MQTT_CONFIG, ...parsed };
        } else {
            saveMqttConfigToDB();
        }
    } catch (err) {
        console.error('Lỗi đọc mqtt-config:', err);
    }
}

function saveMqttConfigToDB() {
    fs.writeFileSync(MQTT_CONFIG_FILE, JSON.stringify(MQTT_CONFIG, null, 4), 'utf8');
}
loadMqttConfigFromDB();

// --- QUẢN LÝ THIẾT BỊ ---
const DB_FILE = path.join(__dirname, 'boxes.json');
let BOX_LIST = [];
function loadBoxesFromDB() {
    try {
        if (fs.existsSync(DB_FILE)) BOX_LIST = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        else { BOX_LIST = [{ id: "box_khu_1", name: "🏛️ Thiết Bị Khu 1" }, { id: "box_khu_2", name: "🛠️ Thiết Bị Khu 2" }]; saveBoxesToDB(); }
    } catch (err) { console.error("Lỗi đọc boxes:", err); }
}
function saveBoxesToDB() { fs.writeFileSync(DB_FILE, JSON.stringify(BOX_LIST, null, 4), 'utf8'); }
loadBoxesFromDB();

// --- QUẢN LÝ KÊNH NHANH ---
const CHANNELS_FILE = path.join(__dirname, 'channels.json');
let QUICK_CHANNELS = [];
function loadChannelsFromDB() {
    try {
        if (fs.existsSync(CHANNELS_FILE)) QUICK_CHANNELS = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf8'));
        else { QUICK_CHANNELS = [{ id: "ch_1", name: "🛠️ Kênh Luồng 1 (Test)", url: "http://192.168.1.3:8001/stream" }]; saveChannelsToDB(); }
    } catch (err) { console.error("Lỗi đọc channels:", err); }
}
function saveChannelsToDB() { fs.writeFileSync(CHANNELS_FILE, JSON.stringify(QUICK_CHANNELS, null, 4), 'utf8'); }
loadChannelsFromDB();

// ---------------------------------------------------------
// TÍNH NĂNG MỚI: QUẢN LÝ LỊCH HẸN GIỜ (SCHEDULES JSON)
// ---------------------------------------------------------
const SCHEDULES_FILE = path.join(__dirname, 'schedules.json');
let SCHEDULES_LIST = [];
function loadSchedulesFromDB() {
    try {
        if (fs.existsSync(SCHEDULES_FILE)) {
            SCHEDULES_LIST = JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf8'));
        } else {
            SCHEDULES_LIST = [];
            saveSchedulesToDB();
        }
    } catch (err) { console.error("Lỗi đọc schedules:", err); }
}
function saveSchedulesToDB() { fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(SCHEDULES_LIST, null, 4), 'utf8'); }
loadSchedulesFromDB();


let boxStatusMap = {};
let lastPlayedUrl = "⏸️ Hệ thống đang tạm dừng hoặc chưa có luồng phát";
let mqttClient = null;

function getTopicPath(topicSuffix) {
    const prefix = (MQTT_CONFIG.topicPrefix || 'daivietpda').trim().replace(/\/+$/g, '');
    const suffix = String(topicSuffix || '').trim().replace(/^\/+/, '');
    return suffix ? `${prefix}/${suffix}` : prefix;
}

function connectMqttBroker() {
    if (mqttClient) {
        mqttClient.end(true);
    }

    const brokerUrl = `${MQTT_CONFIG.protocol || 'mqtt'}://${MQTT_CONFIG.host}:${MQTT_CONFIG.port}`;
    const connectOptions = {};
    if (MQTT_CONFIG.username) connectOptions.username = MQTT_CONFIG.username;
    if (MQTT_CONFIG.password !== undefined && MQTT_CONFIG.password !== null) connectOptions.password = MQTT_CONFIG.password;

    console.log(`[MQTT] Đang kết nối tới ${brokerUrl}`);
    mqttClient = mqtt.connect(brokerUrl, connectOptions);

    mqttClient.on('connect', () => {
        console.log('Backend đã kết nối thành công tới MQTT Broker.');
        BOX_LIST.forEach(box => { mqttClient.subscribe(getTopicPath(`${box.id}/status`)); });
    });

    mqttClient.on('message', (topic, message) => {
        const payload = message.toString();
        BOX_LIST.forEach(box => {
            if (topic === getTopicPath(`${box.id}/status`) && payload === 'online') {
                boxStatusMap[box.id] = Date.now();
            }
        });
    });

    mqttClient.on('error', (err) => {
        console.error('[MQTT] Lỗi kết nối:', err);
    });
}

if (require.main === module) {
    connectMqttBroker();
}

function checkAuth(req, res, next) {
    if (req.session.loggedIn) next();
    else res.redirect('/login');
}

// Routes giao diện cơ bản
app.get('/login', (req, res) => {
    const hasAdmin = Boolean(USER_DB && USER_DB.username);
    res.send(`
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <title>Đăng Nhập Hệ Thống Audio</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', sans-serif; }
                body { background: url('https://images.unsplash.com/photo-1598550476439-6847785fcea6?q=80&w=1920&auto=format&fit=crop') no-repeat center center fixed; background-size: cover; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                .login-container { background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(10px); width: 100%; max-width: 440px; padding: 40px 25px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
                h2 { text-align: center; color: #1a1a1a; margin-bottom: 20px; }
                .note { color: #555; font-size: 13px; margin-bottom: 16px; text-align: center; }
                input { width: 100%; padding: 14px; border: 1px solid #ccc; border-radius: 10px; font-size: 16px; margin-bottom: 14px; outline: none; }
                button { width: 100%; padding: 14px; background: linear-gradient(135deg, #007bff, #0056b3); color: white; border: none; border-radius: 10px; font-size: 16px; font-weight: bold; cursor: pointer; }
                .form-separator { height: 1px; background: #e5e7eb; margin: 18px 0; }
            </style>
        </head>
        <body>
        <div class="login-container">
            <h2>🎙️ AUDIO SYSTEM</h2>
            <p class="note">Đăng nhập bằng tài khoản quản trị hiện tại.</p>
            <form action="/login" method="POST">
                <input type="text" name="username" placeholder="Tên đăng nhập" required />
                <input type="password" name="password" placeholder="Mật khẩu" required />
                <button type="submit">ĐĂNG NHẬP</button>
            </form>
            <div class="form-separator"></div>
            <form action="/register" method="POST">
                <input type="text" name="username" placeholder="Tên tài khoản mới" required />
                <input type="password" name="password" placeholder="Mật khẩu mới" required />
                <input type="password" name="confirmPassword" placeholder="Nhập lại mật khẩu" required />
                <button type="submit">ĐĂNG KÝ TÀI KHOẢN QUẢN TRỊ</button>
            </form>
            <p class="note" style="margin-top: 12px;">${hasAdmin ? 'Tài khoản quản trị đã tồn tại. Bạn có thể đổi tên và mật khẩu sau khi đăng nhập.' : 'Tài khoản quản trị đầu tiên sẽ được tạo tại đây.'}</p>
        </div>
        </body>
        </html>
    `);
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (await verifyAdminCredentials(username, password)) {
        req.session.loggedIn = true;
        res.redirect('/');
    } else {
        res.send("<script>alert('Sai tài khoản hoặc mật khẩu!'); window.location='/login';</script>");
    }
});

app.post('/register', async (req, res) => {
    const { username, password, confirmPassword } = req.body;
    if (!username || !password || !confirmPassword) {
        return res.send("<script>alert('Vui lòng nhập đủ thông tin!'); window.location='/login';</script>");
    }
    if (password !== confirmPassword) {
        return res.send("<script>alert('Mật khẩu nhập lại không khớp!'); window.location='/login';</script>");
    }
    try {
        const existing = loadAdminAccountFromDB();
        if (existing && existing.username && existing.passwordHash) {
            return res.send("<script>alert('Tài khoản quản trị đã tồn tại. Vui lòng đổi tên/mật khẩu từ giao diện cài đặt.'); window.location='/login';</script>");
        }
        await setAdminAccount({ username, password });
        res.send("<script>alert('Đăng ký tài khoản quản trị thành công!'); window.location='/login';</script>");
    } catch (err) {
        console.error(err);
        res.send(`<script>alert('${err.message}'); window.location='/login';</script>`);
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

app.get('/', checkAuth, (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

app.get('/api/mqtt-config', checkAuth, (req, res) => {
    res.json({ mqttConfig: MQTT_CONFIG });
});

app.put('/api/mqtt-config', checkAuth, (req, res) => {
    const { host, port, protocol, username, password, topicPrefix } = req.body;
    MQTT_CONFIG = {
        ...MQTT_CONFIG,
        host: host ? host.trim() : MQTT_CONFIG.host,
        port: parseInt(port, 10) || MQTT_CONFIG.port,
        protocol: protocol ? protocol.trim() : MQTT_CONFIG.protocol,
        username: username !== undefined ? username : MQTT_CONFIG.username,
        password: password !== undefined ? password : MQTT_CONFIG.password,
        topicPrefix: topicPrefix !== undefined && topicPrefix !== '' ? topicPrefix.trim() : MQTT_CONFIG.topicPrefix
    };
    saveMqttConfigToDB();
    connectMqttBroker();
    res.json({ success: true, mqttConfig: MQTT_CONFIG });
});

app.get('/api/admin/account', checkAuth, (req, res) => {
    const account = loadAdminAccountFromDB();
    res.json({ success: Boolean(account), username: account ? account.username : '' });
});

app.put('/api/admin/account', checkAuth, async (req, res) => {
    const { currentPassword, username, newPassword, confirmPassword } = req.body;
    try {
        const currentAccount = loadAdminAccountFromDB();
        if (!currentAccount || !currentAccount.username || !currentAccount.passwordHash) {
            return res.status(404).json({ success: false, error: 'Chưa có tài khoản quản trị.' });
        }
        const validCurrentPassword = await bcrypt.compare(currentPassword || '', currentAccount.passwordHash);
        if (!validCurrentPassword) {
            return res.status(401).json({ success: false, error: 'Mật khẩu hiện tại không đúng.' });
        }
        if (!username || !username.trim()) {
            return res.status(400).json({ success: false, error: 'Tên đăng nhập không được để trống.' });
        }
        if (newPassword && newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, error: 'Mật khẩu mới không khớp.' });
        }
        const finalPassword = newPassword && newPassword.trim() ? newPassword : currentPassword;
        const updatedAccount = await setAdminAccount({ username: username.trim(), password: finalPassword });
        res.json({ success: true, username: updatedAccount.username });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// API Thiết bị & Kênh nhanh
app.get('/api/boxes', checkAuth, (req, res) => {
    const now = Date.now();
    const data = BOX_LIST.map(box => {
        const lastSeen = boxStatusMap[box.id] || 0;
        return { ...box, online: (now - lastSeen) < 12000 };
    });
    res.json({ boxes: data, lastPlayedUrl: lastPlayedUrl });
});
app.post('/api/boxes', checkAuth, (req, res) => {
    const { id, name } = req.body;
    if (BOX_LIST.find(b => b.id === id)) return res.json({ success: false, error: 'ID đã tồn tại' });
    BOX_LIST.push({ id, name }); saveBoxesToDB();
    if (mqttClient) mqttClient.subscribe(getTopicPath(`${id}/status`));
    res.json({ success: true });
});
app.put('/api/boxes/:id', checkAuth, (req, res) => {
    const box = BOX_LIST.find(b => b.id === req.params.id);
    if (box) { box.name = req.body.name; saveBoxesToDB(); return res.json({ success: true }); }
    res.json({ success: false });
});
app.delete('/api/boxes/:id', checkAuth, (req, res) => {
    BOX_LIST = BOX_LIST.filter(b => b.id !== req.params.id); saveBoxesToDB();
    res.json({ success: true });
});

app.get('/api/channels', checkAuth, (req, res) => res.json({ channels: QUICK_CHANNELS }));
app.post('/api/channels', checkAuth, (req, res) => {
    const { name, url } = req.body; QUICK_CHANNELS.push({ id: 'ch_' + Date.now(), name, url });
    saveChannelsToDB(); res.json({ success: true });
});
app.put('/api/channels/:id', checkAuth, (req, res) => {
    const ch = QUICK_CHANNELS.find(c => c.id === req.params.id);
    if (ch) { ch.name = req.body.name; ch.url = req.body.url; saveChannelsToDB(); return res.json({ success: true }); }
    res.json({ success: false });
});
app.delete('/api/channels/:id', checkAuth, (req, res) => {
    QUICK_CHANNELS = QUICK_CHANNELS.filter(c => c.id !== req.params.id); saveChannelsToDB();
    res.json({ success: true });
});

// ---------------------------------------------------------
// API MỚI: CRUD HẸN GIỜ PHÁT THANH
// ---------------------------------------------------------
app.get('/api/schedules', checkAuth, (req, res) => {
    res.json({ schedules: SCHEDULES_LIST });
});

app.post('/api/schedules', checkAuth, (req, res) => {
    const { name, target, url, time, days } = req.body; // days là mảng số [1,2,3] ứng với các thứ trong tuần
    if (!name || !target || !url || !time || !days || days.length === 0) {
        return res.json({ success: false, error: 'Vui lòng nhập đầy đủ thông tin hẹn giờ!' });
    }
    const newSchedule = {
        id: 'sched_' + Date.now(),
        name, target, url, time,
        days: days.map(Number) // Đảm bảo định dạng số thô
    };
    SCHEDULES_LIST.push(newSchedule);
    saveSchedulesToDB();
    res.json({ success: true });
});

app.delete('/api/schedules/:id', checkAuth, (req, res) => {
    SCHEDULES_LIST = SCHEDULES_LIST.filter(s => s.id !== req.params.id);
    saveSchedulesToDB();
    res.json({ success: true });
});

// ---------------------------------------------------------
// TIẾN TRÌNH TỰ ĐỘNG KIỂM TRA & KÍCH HOẠT HẸN GIỜ (CRON WORKER)
// ---------------------------------------------------------
let lastTriggeredMinute = ""; // Đánh dấu tránh trùng lệnh trong cùng 1 phút

function checkSchedulesLoop() {
    const now = new Date();
    const currentDay = now.getDay(); // 0: Chủ nhật, 1: Thứ 2, ..., 6: Thứ 7
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${hh}:${mm}`; // Định dạng "HH:MM"
    
    const timeKey = `${currentDay}-${currentTimeStr}`;
    if (lastTriggeredMinute === timeKey) return; // Đã chạy rồi thì bỏ qua phút này

    SCHEDULES_LIST.forEach(sched => {
        if (sched.time === currentTimeStr && sched.days.includes(currentDay)) {
            lastTriggeredMinute = timeKey;
            console.log(`[⏰ HẸN GIỜ] Kích hoạt lịch trình: ${sched.name}`);

            const topicUrl = sched.url;
            
            // Cập nhật trạng thái hiển thị trên màn hình tổng
            if (topicUrl === 'OFF') {
                lastPlayedUrl = `⏰ [Lịch trình] Tự động TẮT PHÁT THANH tại nhóm: ${sched.target}`;
            } else {
                lastPlayedUrl = `⏰ [Lịch trình] Tự động PHÁT: ${topicUrl} (Mục tiêu: ${sched.target})`;
            }

            // Gửi lệnh qua MQTT Broker tới thiết bị mục tiêu
            const publishToBox = (boxId) => {
                mqttClient.publish(getTopicPath(`${boxId}/url`), topicUrl, { retain: true, qos: 1 });
            };

            if (sched.target === 'ALL') {
                BOX_LIST.forEach(box => publishToBox(box.id));
            } else {
                publishToBox(sched.target);
            }
        }
    });
}
if (require.main === module) {
    // Chạy quét cấu hình ngầm mỗi 30 giây để đảm bảo độ chính xác
    setInterval(checkSchedulesLoop, 30000);
}


// API Điều khiển thủ công
app.post('/api/control', checkAuth, (req, res) => {
    const { action, target, url, volume } = req.body;
    if (action === 'play') {
        const topicUrl = (url === 'OFF' || !url) ? 'OFF' : url;
        if (url === 'OFF' || !url) lastPlayedUrl = "⏸️ Hệ thống đang tạm dừng hoặc chưa có luồng phát";
        else {
            let targetName = target === 'ALL' ? "Tất cả các khu" : (BOX_LIST.find(b => b.id === target)?.name || target);
            lastPlayedUrl = `🔥 Đang phát tại [${targetName}]: ${url}`;
        }
        const sendPlay = (boxId) => mqttClient.publish(getTopicPath(`${boxId}/url`), topicUrl, { retain: true, qos: 1 });
        if (target === 'ALL') BOX_LIST.forEach(box => sendPlay(box.id));
        else sendPlay(target);
        return res.json({ success: true, lastPlayedUrl });
    }
    if (action === 'reboot') {
        mqttClient.publish(getTopicPath(`${target}/system`), "reboot", { retain: false, qos: 1 });
        return res.json({ success: true });
    }
    if (action === 'volume') {
        mqttClient.publish(getTopicPath(`${target}/volume`), volume.toString(), { retain: true, qos: 1 });
        return res.json({ success: true });
    }
    res.status(400).json({ success: false });
});

if (require.main === module) {
    app.listen(3000, () => console.log('Hệ thống đang chạy tại cổng 3000!'));
}

module.exports = {
    app,
    loadAdminAccountFromDB,
    saveAdminAccountToDB,
    setAdminAccount,
    verifyAdminCredentials
};