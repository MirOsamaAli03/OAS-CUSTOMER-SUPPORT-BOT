
// const originalError = console.error;

// console.log = () => {};
// console.debug = () => {};
// console.warn = () => {};
// console.error = originalError;

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
    is_fif: Boolean,
    is_thr: Boolean,
    is_one: Boolean

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




const retrival = async (User) => {


    const numbers = await SupportNumber.find();
    console.log(numbers[0].num);

    const uniqueGroups = await User.distinct("group_name")
    console.log(uniqueGroups)

    for (const group of uniqueGroups) {
        if (!group) continue;



        const last10 = await User.find({ group_name: group })
            .sort({ milli_sec: -1 })
            .limit(6)

        console.log("Total messages:", last10.length)
        console.log(last10[0].milli_sec)
        console.log(Date.now())
        // const person_num=last10[0].person_num
        let is_analyzed = false







        let lastMessage = "";

        for (let i = last10.length - 1; i >= 0; i--) {

            let is_support = false

            for (const number of numbers) {
                if (last10[i].person_num == number.num) {

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

                console.log(an[0].attention)
                const lastTime = last10[0].milli_sec
                const FIFTEEN_MIN = 15 * 60 * 1000
                const THIRTY_MIN = 30 * 60 * 1000
                const ONE_HOUR = 60 * 60 * 1000

                const now = Date.now()


                if (now - lastTime >= FIFTEEN_MIN) {
                    console.log("✅ 15 minutes crossed")
                    an[0].is_fif = true;
                    await an[0].save();
                    const gl = await grp_links.find({ group_name: group })

                    if (gl.length > 0) {
                        const response = await axios.post(
                            "http://localhost:3000/send",
                            {
                                to: "923092400176",
                                text: `Group needs your attention\nGroup Name: ${group}\nGroup link: ${gl[0].link}`,
                            },
                            {
                                headers: {
                                    "Content-Type": "application/json",
                                },
                            }
                        )

                    }
                    else {

                        const response = await axios.post(
                            "http://localhost:3000/send",
                            {
                                to: "923092400176",
                                text: `Group needs your attention\nGroup Name: ${group}`,
                            },
                            {
                                headers: {
                                    "Content-Type": "application/json",
                                },
                            }
                        )
                    }

                    if (now - lastTime >= THIRTY_MIN) {
                        console.log("✅ 30 minutes crossed")
                        an[0].is_thr = true;
                        await an[0].save();

                        if (gl.length > 0) {
                            const response = await axios.post(
                                "http://localhost:3000/send",
                                {
                                    to: "923212242432",
                                    text: `Group needs your attention\nGroup Name: ${group}\nGroup link: ${gl[0].link}`,
                                },
                                {
                                    headers: {
                                        "Content-Type": "application/json",
                                    },
                                }
                            )

                        }
                        else {

                            const response = await axios.post(
                                "http://localhost:3000/send",
                                {
                                    to: "923212242432",
                                    text: `Group needs your attention\nGroup Name: ${group}`,
                                },
                                {
                                    headers: {
                                        "Content-Type": "application/json",
                                    },
                                }
                            )
                        }

                        if (now - lastTime >= ONE_HOUR) {
                            console.log("✅ One Hour crossed")

                            an[0].is_one = true;
                            await an[0].save();

                            if (gl.length > 0) {
                                const response = await axios.post(
                                    "http://localhost:3000/send",
                                    {
                                        to: "14696939509",
                                        text: `Group needs your attention\nGroup Name: ${group}\nGroup link: ${gl[0].link}`,
                                    },
                                    {
                                        headers: {
                                            "Content-Type": "application/json",
                                        },
                                    }
                                )

                            }
                            else {

                                const response = await axios.post(
                                    "http://localhost:3000/send",
                                    {
                                        to: "14696939509",
                                        text: `Group needs your attention\nGroup Name: ${group}`,
                                    },
                                    {
                                        headers: {
                                            "Content-Type": "application/json",
                                        },
                                    }
                                )
                            }



                        }

                    }

                }



                else {
                    console.log("⏳ Less than 15 minutes")
                }



            }
            // else{

            //   console.log("Problem has been solved")
            //   await analyzed.deleteMany({ group_name: group });

            // }
            is_analyzed = true
        } else {
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




            await analyzed.create({ group_name: group, message_text: lastMessage, attention: istrue, is_fif: false, is_thr: false, is_one: false })
        }



        // console.log(lastMessage)


        // const reply = await askGPT(lastMessage);
        // console.log(reply)
        // const istrue = reply.toLowerCase().includes('yes')

        // console.log(istrue)


        // if (is_analyzed) continue;

        // const reply = await llama(lastMessage, `You are a helpful customer support agent. 
        // Analyze if this customer message indicates that his/her problem has been solved or not.

        // STRICT RULES:
        // - reply only yes or no
        // - no explanation requried

        // `)
        // console.log(reply.message.content);

        // const istrue = reply.message.content.toLowerCase().includes('yes')

        // console.log(istrue)




        // if (!istrue) {
        //   const lastTime = last10[0].milli_sec
        //   const FIFTEEN_MIN = 15 * 60 * 1000
        //   const THIRTY_MIN = 30 * 60 * 1000
        //   const ONE_HOUR = 60 * 60 * 1000

        //   const now = Date.now()

        //   if (now - lastTime >= FIFTEEN_MIN) {
        //     console.log("✅ 15 minutes crossed")

        //     const response = await axios.post(
        //       "http://localhost:3000/send",
        //       {
        //         to: "923092400176",
        //         text: "group need your attention",
        //       },
        //       {
        //         headers: {
        //           "Content-Type": "application/json",
        //         },
        //       }
        //     )
        //     if (now - lastTime >= THIRTY_MIN) {
        //       console.log("✅ 30 minutes crossed")

        //       // const response = await axios.post(
        //       //   "http://localhost:3000/send",
        //       //   {
        //       //     to: "923212242432",
        //       //     text: "group need your attention",
        //       //   },
        //       //   {
        //       //     headers: {
        //       //       "Content-Type": "application/json",
        //       //     },
        //       //   }
        //       // )

        //       if (now - lastTime >= ONE_HOUR) {
        //         console.log("✅ One Hour crossed")

        //         // const response = await axios.post(
        //         //   "http://localhost:3000/send",
        //         //   {
        //         //     to: "14696939509",
        //         //     text: "group need your attention",
        //         //   },
        //         //   {
        //         //     headers: {
        //         //       "Content-Type": "application/json",
        //         //     },
        //         //   }
        //         // )



        //       }

        //     }

        //   }



        //   else {
        //     console.log("⏳ Less than 15 minutes")
        //   }


        // }
    }
}

let checkerStarted = false;



function startReplyChecker() {
    if (checkerStarted) return;
    checkerStarted = true;

    console.log('🕒 Reply checker started');
    setInterval(() => retrival(User), 30 * 1000);
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
                // //     "http://localhost:3000/logout")

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

    //     async function getgrouplink(jid) {
    //   if (!jid.endsWith('@g.us')) return null;

    //   try {
    //     const metadata = await sock.groupMetadata(jid);

    //     const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    //     console.log(botJid)

    //     const isBotAdmin = metadata.participants.some(
    //       p => p.id === botJid && (p.admin === 'admin' || p.admin === 'superadmin')
    //     );

    //     if (!isBotAdmin) {
    //       console.log('Bot is not admin, cannot fetch invite link');
    //       return null;
    //     }

    //     const code = await sock.groupInviteCode(jid);
    //     const gl = `https://chat.whatsapp.com/${code}`;
    //     console.log('Group link:', gl);

    //     return gl;

    //   } catch (err) {
    //     console.error('Failed to get group invite link:', err);
    //     return null;
    //   }
    // }


    // async function getgrouplink(jid) {
    //     if (!jid.endsWith('@g.us')) return null

    //     try {
    //         const metadata = await sock.groupMetadata(jid)

    //         const isBotAdmin = metadata.participants.some(p =>
    //             areJidsSameUser(p.id, sock.user.id) &&
    //             (p.admin === 'admin' || p.admin === 'superadmin')
    //         )
    //         console.log('BOT JID:', sock.user.id)

    //         if (!isBotAdmin) {
    //             console.log('Bot is not admin (verified by Baileys)')
    //             return null
    //         }

    //         const code = await sock.groupInviteCode(jid)
    //         const gl = `https://chat.whatsapp.com/${code}`
    //         console.log('Group link:', gl)

    //         return gl

    //     } catch (err) {
    //         console.error('Failed to get group invite link:', err)
    //         return null
    //     }
    // }


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

// Add these to your backend file

// Dashboard Home
app.get('/dashboard', async (req, res) => {
    const needsAttention = await analyzed.find({ attention: false });

    // const allGroups = await User.distinct("group_name");

    const allGroups = await User.distinct("group_name", {
        group_name: { $nin: [null, ""] }
    });

    res.render('index', { needsAttention, allGroups });
});

// View Chat History for a Group
app.get('/chat/:groupName', async (req, res) => {

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
                return res.status(404).json({ ok: false, error: 'Number not on WhatsApp' });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
    console.log(`🚀 HTTP API running on http://localhost:${PORT}`)
);

