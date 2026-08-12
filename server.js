const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_SALT = process.env.SECRET_SALT || 'wheatstone_bridge_secret_salt_2026';

// Kết nối PostgreSQL Supabase
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(express.json());
app.use(cookieParser());

// Cấu hình CORS cho phép trang web GitHub Pages truy cập
app.use(cors({
    origin: true,
    credentials: true
}));

const BOT_PATTERN = /bot|googlebot|crawler|spider|robot|crawling|lighthouse|headlesschrome|curl|python-requests/i;

function hashIP(ip) {
    return crypto.createHash('sha256').update(ip + SECRET_SALT).digest('hex');
}

// Route kiểm tra server hoạt động
app.get('/', (req, res) => {
    res.send('Wheatstone Visitor Counter API is running!');
});

app.post('/api/visitor-count', async (req, res) => {
    try {
        const userAgent = req.headers['user-agent'] || '';
        
        // 1. Lọc Bot/Crawler
        if (BOT_PATTERN.test(userAgent)) {
            const result = await pool.query('SELECT COUNT(*) FROM visitors');
            return res.json({ success: true, count: parseInt(result.rows[0].count, 10) });
        }

        // 2. Hash IP bảo mật
        const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '0.0.0.0';
        const ipHash = hashIP(clientIP);

        // 3. Nhận diện Visitor
        let visitorId = req.cookies.__vid || req.headers['x-visitor-id'];

        if (!visitorId) {
            visitorId = crypto.randomUUID();
        }

        // 4. Kiểm tra trong Database Supabase
        const checkResult = await pool.query(
            `SELECT visitor_id FROM visitors WHERE visitor_id = $1 OR visitor_hash = $2 LIMIT 1`, 
            [visitorId, ipHash]
        );

        if (checkResult.rows.length === 0) {
            // Visitor MỚI -> Thêm vào DB (Atomic Check)
            await pool.query(
                `INSERT INTO visitors (visitor_id, visitor_hash, user_agent) VALUES ($1, $2, $3) ON CONFLICT (visitor_id) DO NOTHING`,
                [visitorId, ipHash, userAgent]
            );
        } else {
            // Visitor CŨ -> Cập nhật thời gian truy cập
            const matchedId = checkResult.rows[0].visitor_id;
            await pool.query(`UPDATE visitors SET last_seen_at = NOW() WHERE visitor_id = $1`, [matchedId]);
        }

        // Set Secure Cookie cho trình duyệt
        res.cookie('__vid', visitorId, {
            maxAge: 10 * 365 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            secure: true,
            sameSite: 'None'
        });

        // Trả về số Unique Visitors thực tế từ Database
        const countResult = await pool.query('SELECT COUNT(*) FROM visitors');
        return res.json({
            success: true,
            count: parseInt(countResult.rows[0].count, 10),
            visitor_id: visitorId
        });

    } catch (err) {
        console.error("Database Error:", err);
        const countResult = await pool.query('SELECT COUNT(*) FROM visitors');
        return res.json({ success: false, count: parseInt(countResult.rows[0].count, 10) });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
