import makeWASocket, {
    DisconnectReason,
    fetchLatestBaileysVersion,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import { jidNormalizedUser } from '@whiskeysockets/baileys';
import Pino from 'pino';
import qrcode from 'qrcode-terminal';
import axios from 'axios';
import express from 'express';

let sock = null;
let isConnected = false;
async function start() {
    // Persist creds to ./auth (delete this folder to log out)
    const { state, saveCreds } = await useMultiFileAuthState('auth');

    // Use WA’s current version for best compatibility
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        mobile: true, // 🔥 REQUIRED FOR PAIRING CODE
        logger: Pino({ level: 'warn' }),
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: 'silent' })),
        },
    });


    // Save auth updates
    sock.ev.on('creds.update', saveCreds);

    let pairingRequested = false;
    // Show QR in terminal when needed
    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {

        if (connection === 'open') {
            console.log('✅ WhatsApp connected');
            isConnected = true;
        }

        if (connection === 'connecting' && !sock.authState.creds.registered && !pairingRequested) {
            pairingRequested = true;

            try {
                const number = '923092400176'; // NO +, NO spaces
                const code = await sock.requestPairingCode(number);
                console.log('📲 Pairing code:', code);
            } catch (err) {
                console.error('Pairing error:', err);
            }
        }
        if (connection === 'close') {
            const shouldReconnect =
                (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('connection closed', { shouldReconnect });
            if (shouldReconnect) start();
            else console.log('Logged out. Delete ./auth to re-pair.');
        }
    });

    // Receive new messages & optionally forward to a webhook
    sock.ev.on('messages.upsert', async ({ type, messages }) => {
        if (type !== 'notify') return; // ignore history sync
        for (const msg of messages) {
            const jid = msg.key.remoteJid;
            const m = msg.message;
            const text =
                m?.conversation ||
                m?.extendedTextMessage?.text ||
                m?.ephemeralMessage?.message?.conversation ||
                '';

            console.log(`📩 From ${jid}: ${text}`);

            // simple auto-reply
            if (text?.trim().toLowerCase() === 'ping') {
                await sock.sendMessage(jid, { text: 'pong' }, { quoted: msg });
            }

            // forward to webhook if configured
            if (process.env.WEBHOOK_URL) {
                try {
                    await axios.post(process.env.WEBHOOK_URL, {
                        from: jid,
                        text,
                        timestamp: Number(msg.messageTimestamp || 0) * 1000,
                        id: msg.key.id
                    });
                } catch (e) {
                    console.error('webhook error:', e.message);
                }
            }
        }
    });
}

start().catch(err => console.error(err));

const app = express();
app.use(express.json());

// Optional bearer token auth: set SEND_TOKEN env var to enable
const SEND_TOKEN = process.env.SEND_TOKEN;
app.use((req, res, next) => {
    if (!SEND_TOKEN) return next();
    const auth = req.headers.authorization || '';
    if (auth === `Bearer ${SEND_TOKEN}`) return next();
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
});

// Normalize "to" → JID. Accepts either full JID or phone like "923001234567"
function toJid(to) {
    if (!to) throw new Error('Missing "to"');
    if (to.includes('@')) return jidNormalizedUser(to);
    const digits = String(to).replace(/\D/g, '');
    if (!digits) throw new Error('Invalid phone number');
    return jidNormalizedUser(`${digits}@s.whatsapp.net`);
}

// POST /send  { "to": "923001234567", "text": "hello" }
// Also accepts JID in "to" like "...@s.whatsapp.net" or group "...@g.us"
app.post('/send', async (req, res) => {
    try {
        if (!sock || !isConnected) {
            return res.status(503).json({ ok: false, error: 'WhatsApp not connected yet' });
        }
        const { to, text } = req.body || {};
        if (!to || !text) return res.status(400).json({ ok: false, error: 'to and text are required' });

        const jid = toJid(to);

        // If it's a user JID, verify existence (safe to skip for groups)
        if (!jid.endsWith('@g.us')) {
            const [wa] = await sock.onWhatsApp(jid);
            if (!wa?.exists) return res.status(404).json({ ok: false, error: 'Number not on WhatsApp' });
        }

        const sent = await sock.sendMessage(jid, { text });
        return res.json({ ok: true, to: jid, id: sent?.key?.id });
    } catch (e) {
        console.error('send error:', e);
        return res.status(500).json({ ok: false, error: e.message });
    }
});

// Health check
app.get('/health', (_req, res) =>
    res.json({ ok: true, connected: isConnected })
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`HTTP API listening on http://localhost:${PORT}`));