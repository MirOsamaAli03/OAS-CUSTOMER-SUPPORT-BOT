
import session from "express-session";
import MongoStore from "connect-mongo";
import bcrypt from "bcrypt";
import { areJidsSameUser } from '@whiskeysockets/baileys'
import Redis from 'ioredis';
import { useRedisAuthStateWithHSet, deleteHSetKeys } from 'baileys-redis-auth';
import cors from 'cors';
import { askGPT } from "./gpt.js";
import { llama } from "./ollama_node.js";
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
import fs from 'fs';
import path from 'path';


const redis = new Redis({
    host: '127.0.0.1',
    port: 6379,
});
// --------------------
// GLOBALS
// --------------------
let sock = null;
let isConnected = false;

import mongoose from "mongoose"

// const mongoose = require("mongoose")

await mongoose.connect("mongodb://localhost:27017/Whatsapp_Customer_Support_Agent")

console.log("MongoDB connected")

const User = mongoose.model("Messages", {

    message_text: String,
    person_num: Number,
    group_name: String,
    milli_sec: Number,
    timestamp: Date,
    grouplink: String
})

const analyzed = mongoose.model("Analyzed_messages", {

    message_text: String,
    group_name: String,
    attention: Boolean,

    is_notified: Boolean,
    last_message_time: Date

})

const supportNumberSchema = new mongoose.Schema(
    {
        num: String,

    },
    { collection: "support_numbers" } // 👈 IMPORTANT
);

const SupportNumber = mongoose.model(
    "SupportNumber",
    supportNumberSchema
);

const notifyNumberSchema = new mongoose.Schema(
    {

        num: String

    },
    { collection: "notify_numbers" } // 👈 IMPORTANT
);

const notifyNumber = mongoose.model(
    "notifyNumber",
    notifyNumberSchema
);





const grp_link = new mongoose.Schema(
    {
        link: String,
        group_name: String

    },
    { collection: "group_links" } // 👈 IMPORTANT
);

const grp_links = mongoose.model(
    "grp_links",
    grp_link
);

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
}, { collection: "registered_admins" });

const reg = mongoose.model(

    "reg",
    userSchema
)

const solved_queries = mongoose.Schema({

    message: String,
    BY_AI: Boolean,
    Remarks: String,
    time_solved: String,
    group_name: String

})

const resolved_issue = mongoose.model(

    "resolved_issue",
    solved_queries
)

const AUTH_DIR = path.join(process.cwd(), 'auth');
const MESSAGE_FILE = path.join(process.cwd(), 'messages.json');

// --------------------
// HELPERS
// --------------------
function deleteAuthFolder() {
    if (fs.existsSync(AUTH_DIR)) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        console.log('🧹 auth folder deleted');
    }
}

function extractText(msg) {
    const m = msg.message;
    return (
        m?.conversation ||
        m?.extendedTextMessage?.text ||
        m?.imageMessage?.caption ||
        m?.videoMessage?.caption ||
        m?.ephemeralMessage?.message?.conversation ||
        m?.ephemeralMessage?.message?.extendedTextMessage?.text ||
        ''
    );
}

function saveMessage(record) {
    let data = [];
    if (fs.existsSync(MESSAGE_FILE)) {
        data = JSON.parse(fs.readFileSync(MESSAGE_FILE, 'utf8'));
    }
    data.push(record);
    fs.writeFileSync(MESSAGE_FILE, JSON.stringify(data, null, 2));
}

function toJid(to) {
    if (to.includes('@')) return jidNormalizedUser(to);
    const digits = String(to).replace(/\D/g, '');
    return jidNormalizedUser(`${digits}@s.whatsapp.net`);
}


let fif_min_num = "923092400176"
let thirty_min_num = "923212242432"
let one_hour_num = "14696939509"
let notify_time = 30 * 60 * 1000

let notify_nums = []

const retrival = async (User) => {


    let not_num = await notifyNumber.distinct('num')
    console.log(not_num)

    const numbers = await SupportNumber.find();
    console.log(numbers[0].num);

    const uniqueGroups = await User.distinct("group_name")
    console.log(uniqueGroups)

    for (const group of uniqueGroups) {
        if (!group) continue;



        const last10 = await User.find({ group_name: group })
            .sort({ milli_sec: -1 })
            .limit(5)

        console.log("Total messages:", last10.length)
        console.log(last10[0].milli_sec)
        console.log(Date.now())
        // const person_num=last10[0].person_num
        let is_analyzed = false







        let lastMessage = "";

        for (let i = last10.length - 1; i >= 0; i--) {

            let is_support = false

            for (const number of numbers) {
                if ((last10[i].person_num || 0).toString() == number.num) {

                    lastMessage += "Support: "
                    is_support = true
                    break
                }

            }
            if (!is_support) {

                lastMessage += "Customer: "

            }

            lastMessage += `"${last10[i].message_text}."`

            // person_num.push(last10[i].person_num)


            lastMessage += "\n"
        }



        const an = await analyzed.find({ group_name: group, message_text: lastMessage })

        if (an.length > 0) {
            console.log(an)
            console.log(an.length)


            if (!an[0].attention) {

                const lastTime = last10[0].milli_sec
                const now = Date.now()


                if (now - lastTime >= notify_time) {

                    console.log(notify_time, " is exceeded\n")
                    if (!an[0].is_notified) {

                        if (not_num.length > 0) {
                            for (const n of not_num) {
                                console.log(`Sending Notification to ${n}\n`)
                                const response = await axios.post(
                                    "http://localhost:5700/send",
                                    {
                                        to: `${n}`,
                                        text: `Group needs your attention\nGroup Name: ${group}}`,
                                    },
                                    {
                                        headers: {
                                            "Content-Type": "application/json",
                                        },
                                    }
                                )
                            }
                        }
                        else {

                            console.log(`Sending Notification to Osama\n`)

                            const response = await axios.post(
                                "http://localhost:5700/send",
                                {
                                    to: `${fif_min_num}`,
                                    text: `Group needs your attention\nGroup Name: ${group}}`,
                                },
                                {
                                    headers: {
                                        "Content-Type": "application/json",
                                    },
                                }
                            )




                        }
                        an[0].is_notified = true
                        an[0].save()
                    }
                    else {


                        console.log("Message Already Sent!!\n")
                    }
                }

            }


            is_analyzed = true
        }
        else {
            const hasDocs = await analyzed.exists({});

            if (hasDocs) {
                console.log("Collection is NOT empty");
                await analyzed.deleteMany({ group_name: group });
            } else {
                console.log("Collection is EMPTY");
            }



            // const reply = await llama(lastMessage, `You are a helpful customer support agent. Analyze if this chat between customer and support indicates that customer's problem has been solved or not.

            // STRICT RULES:
            // - reply only yes or no
            // - no explanation requried`)
            //   console.log(reply.message.content);

            //   const istrue = reply.message.content.toLowerCase().includes('yes')

            //   console.log(istrue)

            const reply = await askGPT(lastMessage);
            console.log(reply)
            const istrue = reply.toLowerCase().includes('yes')

            console.log(istrue)

            if (istrue) {
                // const cur = Date.now()
                const pakTime = new Date(Date.now()).toLocaleString("en-PK", {
                    timeZone: "Asia/Karachi",
                });
                try {
                    await resolved_issue.create({ group_name: an[0].group_name, message: an[0].message_text, BY_AI: true, Remarks: "Issue successfully resolved with AI attention", time_solved: pakTime })
                }
                catch {


                }
            }




            await analyzed.create({ group_name: group, message_text: lastMessage, attention: istrue, is_notified: false, last_message_time: last10[0].milli_sec })
        }



    }
}


let checkerStarted = false;

let timer = 120
let checkerInterval = null

// function startReplyChecker() {
//     if (checkerInterval) {
//         clearInterval(checkerInterval);
//     }

//     console.log(`🕒 Reply checker started with ${timer}s`);

//     checkerInterval = setInterval(() => {
//         retrival(User);
//     }, timer * 1000);
// }


function startReplyChecker() {
    if (checkerStarted) return;
    checkerStarted = true;

    console.log('🕒 Reply checker started');
    setInterval(() => retrival(User), timer * 1000);
}



// --------------------
// START WHATSAPP
// --------------------

async function startWhatsApp() {

    const { state, saveCreds } = await useRedisAuthStateWithHSet({
        redis,
        sessionId: 'osa_customer_chatbot' // This ID keeps your session unique in Redis
    });
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger: Pino({ level: 'silent' }),
        printQRInTerminal: false,

        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: 'silent' })),
        },

        getMessage: async (key) => {
            return { conversation: 'decryption-retry' }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr) qrcode.generate(qr, { small: true });

        if (connection === 'open') {
            isConnected = true;
            console.log('✅ WhatsApp connected');
            readLastMessage();
            startReplyChecker()

        }

        if (connection === 'close') {
            isConnected = false;

            const status = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = status !== DisconnectReason.loggedOut;

            console.log('❌ connection closed', { shouldReconnect });

            if (!shouldReconnect) {
                // deleteAuthFolder();
                await redis.flushall();
                console.log('Logged out remotely');
                await redis.del('osa_customer_chatbot');
                setTimeout(() => startWhatsApp(), 5000);
            } else {

                // console.log("okay")
                // // const response = await axios.post(
                // //     "http://localhost:5700/logout")

                // setInterval(() => {
                //     startWhatsApp();
                // }, 20 * 1000);

                console.log("🔄 Network issue, reconnecting in 5s...");
                setTimeout(() => startWhatsApp(), 5000);

            }
        }
    });


    function getSenderNumber(msg) {
        const jid = msg.key.remoteJidAlt;

        if (jid?.endsWith('@s.whatsapp.net')) {
            return jid.split('@')[0]; // 923001234567
        }

        return null;
    }

    function getGroupSenderNumber(msg) {
        const participant = msg.key.participantAlt;

        if (participant?.endsWith('@s.whatsapp.net')) {
            return participant.split('@')[0];
        }

        return null;
    }

    async function getGroupNameSafe(sock, jid) {
        if (!jid || !jid.endsWith('@g.us')) {
            return null; // 👈 CRITICAL GUARD
        }

        try {
            const meta = await sock.groupMetadata(jid);
            return meta?.subject || null;
        } catch (err) {
            console.error('groupMetadata failed:', err.message);
            return null;
        }
    }

    // --------------------
    // MESSAGE LISTENER
    // --------------------
    sock.ev.on('messages.upsert', async ({ type, messages }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message) continue;

            const jid = msg.key.remoteJid;

            // let groupLink = null

            // groupLink = await getgrouplink(jid)

            // const remoteJidAlt = msg.key.remoteJidAlt 

            // async function get_grp_name() {

            //   const metadata = await getGroupNameSafe(sock,jid)
            //   console.log(metadata);
            //   return metadata

            // }
            // const m_t=get_grp_name()

            let groupName = null;
            if (jid.endsWith('@g.us')) {
                groupName = await getGroupNameSafe(sock, jid);
                console.log('Group name:', groupName);
            }



            const text = extractText(msg);
            if (!text) continue;

            const tsSeconds = Number(msg.messageTimestamp); // seconds
            const tsMillis = tsSeconds * 1000;              // milliseconds
            const dateUTC = new Date(tsMillis);            // UTC-based Date
            const dateLocal = new Date(tsMillis); // Pakistan is UTC+5
            console.log('Local Time PKT:', dateLocal.toString());



            const record = {
                id: msg.key.id,
                jid,
                fromMe: msg.key.fromMe,
                sender: msg.key.participant || jid,
                isGroup: jid.endsWith('@g.us'),
                text,
                timestamp: dateLocal.toString(),
                milli_sec: tsMillis,
                number_: getSenderNumber(msg),
                grp_num: getGroupSenderNumber(msg),
                grp_name: groupName,
                // groupLink
            };

            console.log(`📩 ${jid}: ${text}`);

            // ✅ SAVE FOR AI
            saveMessage(record);
            readLastMessage();
            if (record.grp_name !== null) {
                await User.create({ person_num: record.grp_num, group_name: record.grp_name, message_text: record.text, timestamp: record.timestamp, milli_sec: record.milli_sec })
                //  retrival(User)
            }

            // example auto reply
            if (text.trim().toLowerCase() === 'ping') {
                await sock.sendMessage(jid, { text: 'pong' }, { quoted: msg });
            }

            // optional webhook
            if (process.env.WEBHOOK_URL) {
                try {
                    await axios.post(process.env.WEBHOOK_URL, record);
                } catch (e) {
                    console.error('Webhook error:', e.message);
                }
            }
        }
    });
}


import fsp from 'fs/promises';   // rename to 'fsp'
import { group, timeStamp } from 'console';
import { Items } from 'openai/resources/conversations.mjs';
import { name } from 'ejs';

async function readLastMessage() {
    try {
        const data = await fsp.readFile('./messages.json', 'utf-8');
        const messages = JSON.parse(data);

        if (messages.length === 0) return console.log('No messages found');

        const lastMessage = messages[messages.length - 1];

        console.log('Last message:', lastMessage);

    } catch (err) {
        console.error('Error reading message.json:', err);
    }
}

// readLastMessage();


//  const now = Date.now(); // current time in milliseconds
//     const diff = now - tsMillis; 

//     console.log('Difference:', diff);

//     const seconds = diff / 1000;      // milliseconds → seconds
//     const minutes = seconds / 60;     // milliseconds → minutes
//     const hours   = minutes / 60;     // milliseconds → hours

//     console.log({ seconds, minutes, hours });

// --------------------
// START APP
// --------------------
startWhatsApp().catch(console.error);

// --------------------
// HTTP API
// --------------------
const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public')); // For CSS/JS files

app.use(express.json());


app.use(session({
    secret: 'oas_bott', // A random string to sign the cookie
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: "mongodb://localhost:27017/Whatsapp_Customer_Support_Agent"
    }),
    cookie: { maxAge: 1000 * 60 * 60 * 2 } // Cookie expires in 24 hours
}));

const checkAuth = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/auth'); // Not logged in? Go to login page.
    }
    next();
};

app.get('/configure', checkAuth, async (req, res) => {

    const not_num = await notifyNumber.distinct("num")
    res.render('configure', { not_num });
});


app.get('/auth', (req, res) => {


    res.render('auth');
});




// Add these to your backend file

// Dashboard Home



app.get('/dashboard', checkAuth, async (req, res) => {
    const needsAttention = await analyzed.find({ attention: false }).sort({ last_message_time: -1 });

    // const allGroups = await User.distinct("group_name");

    // const allGroups = await User.distinct("group_name", {
    //     group_name: { $nin: [null, ""] }
    // })

    const allGroups = await User.aggregate([
        { $match: { group_name: { $nin: [null, ""] } } },
        { $sort: { milli_sec: -1 } },  // latest message first
        {
            $group: {
                _id: "$group_name",
                latestMilli: { $first: "$milli_sec" }
            }
        },
        { $sort: { latestMilli: -1 } }  // keep order
    ]);
    const groupNames = allGroups.map(g => g._id);


    res.render('index', { needsAttention, groupNames });
});

// View Chat History for a Group
app.get('/chat/:groupName', checkAuth, async (req, res) => {

    try {

        const messages = await User.find({ group_name: req.params.groupName })
            .sort({ milli_sec: -1 })
            .limit(5);

        const supportDocs = await SupportNumber.find().lean();
        console.log(supportDocs)
        const numbers = supportDocs.map(n => n.num);
        console.log(numbers)
        messages.reverse()

        res.render('chat', { groupName: req.params.groupName, messages, numbers });
    }
    catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.get('/', checkAuth, (req, res) => {
    res.redirect('/dashboard');
});


app.get('/health', (_req, res) =>
    res.json({ ok: true, connected: isConnected })
);

app.post('/send', async (req, res) => {
    try {
        if (!sock || !isConnected) {
            return res.status(503).json({ ok: false, error: 'WhatsApp not connected' });
        }

        const { to, text } = req.body;
        if (!to || !text) {
            return res.status(400).json({ ok: false, error: 'to & text required' });
        }

        const jid = toJid(to);

        if (!jid.endsWith('@g.us')) {
            const [wa] = await sock.onWhatsApp(jid);
            if (!wa?.exists) {
                // return res.status(404).json({ ok: false, error: 'Number not on WhatsApp' });
                HTMLFormControlsCollection.log("Number Not On Whatsapp")
            }
        }

        const sent = await sock.sendMessage(jid, { text });
        res.json({ ok: true, id: sent.key.id });

    } catch (e) {
        console.error(e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.post('/logout', async (_req, res) => {
    try {
        if (!sock) return res.status(400).json({ ok: false });

        await sock.logout();
        isConnected = false;
        deleteAuthFolder();

        res.json({ ok: true, message: 'Logged out & auth cleared' });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.post('/delete-group', async (req, res) => {
    const { group_name } = req.body;

    await analyzed.deleteMany({ group_name });

    res.json({ success: true });
});


app.post('/attention-true', async (req, res) => {
    const { group_name, message, remarks } = req.body;
    // const curr = Date.now()
    const pakTime = new Date(Date.now()).toLocaleString("en-PK", {
        timeZone: "Asia/Karachi",
    });
    console.log(message)

    const doc = await analyzed.findOne({ group_name });
    if (doc) {
        doc.attention = true;
        await doc.save();
    }
    await resolved_issue.create({ group_name: group_name, message: message, BY_AI: false, Remarks: remarks, time_solved: pakTime })
    res.json({ success: true });
});


app.post('/register_check', async (req, res) => {

    // const { fname, email, password } = req.body
    const { username, password } = req.body


    // let na = fname
    let uname = username
    let pas = password

    // console.log(na, em, pas)
    console.log(uname, pas)


    const che = await reg.findOne({ username: uname })

    if (!che) {

        try {
            const hashedPassword = await bcrypt.hash(pas, 10);
            const newUser = new reg({
                username: uname,
                password: hashedPassword // Store the hash, not the plain text
            });
            await newUser.save();
            console.log("Registered")
            res.json({ success: true })

            // res.redirect('/auth');
        } catch (err) {
            console.log("REGISTER ERROR ❌", err);
            res.json({ success: false, message: err.message || "Error Registering User" });
        }
    }
    else {

        res.json({ success: false, message: "Username already registered" })

    }


})


app.post('/login_check', async (req, res) => {

    const { username, password } = req.body


    let uname = username
    let pas = password

    console.log(uname, pas)

    const user = await reg.findOne({ username: uname });
    if (!user) return res.send({ success: false, message: 'User not found' });

    const isMatch = await bcrypt.compare(pas, user.password);

    if (isMatch) {
        // This line creates the session in MongoDB and the cookie in the browser
        req.session.userId = user._id;
        return res.json({ success: true, redirect: "/dashboard" });

    } else {
        res.send({ success: false, message: 'Invalid password' });
    }



})

app.get('/logout_bot', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/auth');
    });
});

app.post('/set-time', async (req, res) => {
    const { New_time } = req.body;

    timer = Number(New_time)
    console.log("New Timer: ", timer)
    startReplyChecker()

    res.json({ success: true });
});

app.post('/set-time-for_notify', async (req, res) => {
    const { New_time } = req.body;

    notify_time = Number(New_time)
    notify_time = notify_time * 60 * 1000
    console.log("New Timer For Notifcation: ", notify_time)
    // startReplyChecker()

    res.json({ success: true });
});


app.post('/set-numbers', async (req, res) => {
    const { New_number } = req.body;

    let num = New_number
    // notify_nums.push(num)

    // console.log(notify_nums)

    await notifyNumber.create({ num: num })
    let not_num = await notifyNumber.distinct('num')
    console.log(not_num)
    res.json({ success: true });
});

app.post('/del-numbers', async (req, res) => {
    const { del_number } = req.body;

    let num = del_number
    // if (!notify_nums.includes(num)) {
    //     res.json({ success: false })


    // }
    // else {
    //     notify_nums = notify_nums.filter(item => item != num)

    //     console.log(notify_nums)
    //     // await notifyNumber.deleteMany({num:num})


    //     res.json({ success: true });

    // }

    const exists = await notifyNumber.exists({ num: num });

    if (exists) {
        console.log("✅ Exists");
        await notifyNumber.deleteMany({ num: num });
        res.json({ success: true });


    } else {
        console.log("❌ Not found");
        res.json({ success: false })

    }

});






// const PORT = process.env.PORT || 5700;

const PORT = 5700;

app.listen(PORT, () =>
    console.log(`🚀 HTTP API running on http://localhost:${PORT}`)
);

