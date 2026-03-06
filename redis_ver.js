
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
const { Schema } = mongoose

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
    last_message_time: Date,
    notify_n: { type: [String], default: [] },
    last_message_text: String

})

const analyzed_admin = mongoose.model("Analyzed_messages_admins", {

    message_text: String,
    group_name: String,
    attention: Boolean,

    is_notified: Boolean,
    last_message_time: Date,
    notify_n: { type: [String], default: [] },
    last_message_text: String

})


const teamsSchema = new mongoose.Schema(

    {
        team_name: String,
        groups: { type: [String], default: [] },
        // agent_info: { type: Map, of: String, default: {} }
        agent_info: {
            type: Map,
            of: new Schema({
                role: String,
                number: String
            }, { _id: false }),
            default: {}
        }



    },
    { collection: "Teams_info" }

)

const teams = mongoose.model(
    "teams",
    teamsSchema
)

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

const dummyNumbersSchema = new mongoose.Schema(
    {
        num: String,
        name: String

    },
    { collection: "dummy_numbers" } // 👈 IMPORTANT
);

const dummyNumber = mongoose.model(
    "dummyNumber",
    dummyNumbersSchema
);

const teamMemberRegisterSchema = new mongoose.Schema(

    {
        username: String,
        number: String,
        password: String,
        role: String,
        team_name: String,
        groups: { type: [String], default: [] },
        numbers: { type: [String], default: [] },
        names: { type: [String], default: [] }


    },
    { collection: "user_registration" }

)
const teamMembers = mongoose.model(

    "teamMembers",
    teamMemberRegisterSchema
);

const notifyNumberSchema = new mongoose.Schema(
    {

        num: String,
        time_to_notify: Number,
        name: String,
        team: String,
        groups: { type: [String], default: [] }

    },
    { collection: "notify_numbers" } // 👈 IMPORTANT
);

const notifyNumber = mongoose.model(
    "notifyNumber",
    notifyNumberSchema
);

const notifyNumberSchemaAdmin = new mongoose.Schema(
    {

        num: String,
        time_to_notify: Number

    },
    { collection: "notify_numbers_admins" } // 👈 IMPORTANT
);

const notifyNumberAdmin = mongoose.model(
    "notifyNumberAdmin",
    notifyNumberSchemaAdmin
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
    usernum: { type: String, required: true, unique: true },
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

const query_remarks = mongoose.Schema({

    message: String,
    Remarks: String,
    time_of_remarks: String,
    group_name: String

})

const remarks_query = mongoose.model(

    "remarks_query",
    query_remarks
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




let current_send_admin = []


const retrivalAdmin = async (User) => {

    current_send_admin.length = 0

    // let not_num = await notifyNumber.distinct('num')

    let not_num = await notifyNumberAdmin.aggregate([
        {
            $group: {
                _id: "$num",          // distinct by num
                doc: { $first: "$$ROOT" } // keep full document
            }
        },
        {
            $replaceRoot: { newRoot: "$doc" }
        }
    ]);
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
        console.log(Date.now() - last10[0].milli_sec)
        console.log(notify_time)
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



        const an = await analyzed_admin.find({ group_name: group, message_text: lastMessage })

        if (an.length > 0) {
            // console.log(an)
            console.log(an.length)


            if (!an[0].attention) {

                const lastTime = last10[0].milli_sec
                const now = Date.now()


                if (!an[0].is_notified) {

                    let notify_sent = false

                    if (not_num.length > 0) {



                        for (const n of not_num) {




                            console.log("Notification needs to be send")
                            console.log(n.time_to_notify)

                            if (now - lastTime >= n.time_to_notify) {



                                if (!an[0].notify_n.includes(n.num)) {

                                    notify_sent = false

                                    console.log(`Sending Notification to ${n.num}\n`)
                                    let text_to_show = `to ${n.num} for group ${group}`
                                    current_send_admin.push(text_to_show)
                                    const response = await axios.post(
                                        "http://localhost:5700/send",
                                        {
                                            to: `${n.num}`,
                                            text: `Group needs your attention\nGroup Name: ${group}}`,
                                        },
                                        {
                                            headers: {
                                                "Content-Type": "application/json",
                                            },
                                        }
                                    )

                                    await analyzed_admin.updateOne(
                                        { _id: an[0]._id },  // Select the first document by its _id
                                        { $push: { notify_n: n.num } }  // Push the group name to notify_grps
                                    );
                                }






                            }

                        }
                    }
                    else {

                        console.log(`Sending Notification to Osama\n`)

                        // const response = await axios.post(
                        //     "http://localhost:5700/send",
                        //     {
                        //         to: `${fif_min_num}`,
                        //         text: `Group needs your attention\nGroup Name: ${group}}`,
                        //     },
                        //     {
                        //         headers: {
                        //             "Content-Type": "application/json",
                        //         },
                        //     }
                        // )


                        notify_sent = true

                    }
                    if ((an[0].notify_n.length === not_num.length) || notify_sent) {
                        an[0].is_notified = true
                        an[0].notify_n = []
                        an[0].save()
                    }
                }
                else {


                    console.log("Message Already Sent to all notify parties!!\n")
                }


            }


            is_analyzed = true
        }
        else {
            const hasDocs = await analyzed_admin.exists({});

            if (hasDocs) {
                console.log("Collection is NOT empty");
                await analyzed_admin.deleteMany({ group_name: group });
            } else {
                console.log("Collection is EMPTY");
            }


            const reply = await askGPT(lastMessage);
            console.log(reply)
            const istrue = reply.toLowerCase().includes('yes')

            console.log(istrue)

            // const cur = Date.now()
            const pakTime = new Date(Date.now()).toLocaleString("en-PK", {
                timeZone: "Asia/Karachi",
            });

            if (istrue) {
                await resolved_issue.create({ group_name: group, message: lastMessage, BY_AI: true, Remarks: "Issue successfully resolved with AI attention", time_solved: pakTime })


            }


            await analyzed_admin.create({ group_name: group, message_text: lastMessage, attention: istrue, is_notified: false, last_message_time: last10[0].milli_sec, notify_n: [], last_message_text: last10[0].message_text })
        }



    }
}





let current_send = []

const retrival = async (User) => {

    current_send.length = 0

    // let not_num = await notifyNumber.distinct('num')

    let not_num = await notifyNumber.aggregate([
        {
            $group: {
                _id: "$num",          // distinct by num
                doc: { $first: "$$ROOT" } // keep full document
            }
        },
        {
            $replaceRoot: { newRoot: "$doc" }
        }
    ]);
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
        console.log(Date.now() - last10[0].milli_sec)
        console.log(notify_time)
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
            // console.log(an)
            console.log(an.length)


            if (!an[0].attention) {

                const lastTime = last10[0].milli_sec
                const now = Date.now()


                if (!an[0].is_notified) {

                    let notify_sent = false

                    if (not_num.length > 0) {



                        for (const n of not_num) {




                            console.log("Notification needs to be send")
                            console.log(n.time_to_notify)

                            if (now - lastTime >= n.time_to_notify) {



                                if (!an[0].notify_n.includes(n.num) && n.groups.includes(group)) {

                                    notify_sent = false

                                    console.log(`Sending Notification to ${n.num}\n`)
                                    let text_to_show = `to ${n.num} for group ${group}`
                                    current_send.push(text_to_show)
                                    console.log(n.num)
                                    console.log(n.name)
                                    console.log(group)

                                    const response = await axios.post(
                                        "http://localhost:5700/send",
                                        {
                                            to: `${n.num}`,
                                            text: `Group needs your attention ${n.name}\nGroup Name: ${group}\n Team Name: ${n.team}`,
                                        },
                                        {
                                            headers: {
                                                "Content-Type": "application/json",
                                            },
                                        }
                                    )

                                    await analyzed.updateOne(
                                        { _id: an[0]._id },  // Select the first document by its _id
                                        { $push: { notify_n: n.num } }
                                    );
                                }






                            }

                        }
                    }
                    else {

                        console.log(`Sending Notification to Osama\n`)

                        // const response = await axios.post(
                        //     "http://localhost:5700/send",
                        //     {
                        //         to: `${fif_min_num}`,
                        //         text: `Group needs your attention\nGroup Name: ${group}}`,
                        //     },
                        //     {
                        //         headers: {
                        //             "Content-Type": "application/json",
                        //         },
                        //     }
                        // )


                        notify_sent = true

                    }

                    const grp_specific_num = await notifyNumber.find({
                        groups: group
                    });

                    if (grp_specific_num.length > 0) {
                        let num_available = 0;

                        const notifyList = new Set(an?.[0]?.notify_n || []); // safe + fast lookup

                        for (const grp of grp_specific_num) {
                            if (notifyList.has(grp.num)) {
                                num_available++;
                            }
                        }

                        if (notifyList.size === num_available || notify_sent) {
                            console.log("All notified for group:", group);
                            an[0].is_notified = true
                            an[0].notify_n = []
                            an[0].markModified('notify_n'); // ensure mongoose tracks array change

                            await an[0].save()
                        }
                    }
                    // else if(notify_sent){

                    //     console.log("All notified for group:", group);
                    //         an[0].is_notified = true
                    //         an[0].notify_n = []
                    //         an[0].markModified('notify_n'); // ensure mongoose tracks array change

                    //         await an[0].save()


                    // }

                    // if ((an[0].notify_n.length === not_num.length) || notify_sent) {
                    //     an[0].is_notified = true
                    //     an[0].notify_n = []
                    //     an[0].save()
                    // }
                }
                else {


                    console.log("Message Already Sent to all notify parties!!\n")
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

            // const cur = Date.now()
            const pakTime = new Date(Date.now()).toLocaleString("en-PK", {
                timeZone: "Asia/Karachi",
            });

            if (istrue) {
                await resolved_issue.create({ group_name: group, message: lastMessage, BY_AI: true, Remarks: "Issue successfully resolved with AI attention", time_solved: pakTime })


            }

            let is_support_a = false
            let lastMessage_a = ""

            for (const number of numbers) {
                if ((last10[0].person_num || 0).toString() == number.num) {

                    lastMessage_a += "Support: "
                    is_support_a = true
                    break
                }

            }
            if (!is_support_a) {

                lastMessage_a += "Customer: "

            }

            lastMessage_a += `"${last10[0].message_text}."`


            await analyzed.create({ group_name: group, message_text: lastMessage, attention: istrue, is_notified: false, last_message_time: last10[0].milli_sec, notify_n: [], last_message_text: lastMessage_a })
        }



    }
}


// function startReplyChecker() {
//     if (checkerInterval) {
//         clearInterval(checkerInterval);
//     }

//     console.log(`🕒 Reply checker started with ${timer}s`);

//     checkerInterval = setInterval(() => {
//         retrival(User);
//     }, timer * 1000);
// }

let checkerStarted = false;

let timer = 120
let checkerInterval = null


function startReplyChecker() {
    if (checkerStarted) return;
    checkerStarted = true;

    console.log('🕒 Reply checker started');
    setInterval(() => retrival(User), timer * 1000);
}

let checkerStartedAdmin = false;

let timerAdmin = 150
let checkerIntervalAdmin = null


function startReplyCheckerAdmin() {
    if (checkerStartedAdmin) return;
    checkerStartedAdmin = true;

    console.log('🕒 Reply checker started');
    setInterval(() => retrivalAdmin(User), timerAdmin * 1000);
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

            setInterval(() => {
                sock.sendPresenceUpdate('available')
            }, 25_000)

            readLastMessage();
            startReplyChecker()
            startReplyCheckerAdmin();

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
import { json } from "stream/consumers";

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

app.get('/configure_admin', checkAuth, async (req, res) => {

    // const not_num = await notifyNumber.distinct("num")

    const role = decodeURIComponent(req.query.role).trim();

    const team = decodeURIComponent(req.query.team).trim();

    // const team_groups = req.query.groups
    //     ? decodeURIComponent(req.query.groups).split(',').map(g => g.trim())
    //     : [];

    const team_groups = req.query.groups
        ? JSON.parse(decodeURIComponent(req.query.groups))
        : [];


    const numbers = req.query.numbers
        ? decodeURIComponent(req.query.numbers).split(',').map(g => g.trim())
        : [];

    const names = req.query.names
        ? decodeURIComponent(req.query.names).split(',').map(g => g.trim())
        : [];

    console.log(team_groups)
    console.log(role)
    console.log(numbers)
    console.log(team)
    let allGroups
    let needsAttention
    let groups = team_groups

    // const not_num = await notifyNumberAdmin.distinct("num")
    const not_num = await notifyNumberAdmin.aggregate([
        { $sort: { time: -1 } },   // latest first
        {
            $group: {
                _id: "$num",
                doc: { $first: "$$ROOT" }
            }
        },
        { $replaceRoot: { newRoot: "$doc" } }
    ]);
    res.render('configure_admin', { not_num, role, numbers, team, groups, names });
});


app.get('/configure', checkAuth, async (req, res) => {

    // const not_num = await notifyNumber.distinct("num")

    const role = decodeURIComponent(req.query.role).trim();

    const team = decodeURIComponent(req.query.team).trim();

    // const team_groups = req.query.groups
    //     ? decodeURIComponent(req.query.groups).split(',').map(g => g.trim())
    //     : [];

    const team_groups = req.query.groups
        ? JSON.parse(decodeURIComponent(req.query.groups))
        : [];


    const numbers = req.query.numbers
        ? decodeURIComponent(req.query.numbers).split(',').map(g => g.trim())
        : [];

    const names = req.query.names
        ? decodeURIComponent(req.query.names).split(',').map(g => g.trim())
        : [];

    console.log(team_groups)
    console.log(role)
    console.log(numbers)
    console.log(team)
    let allGroups
    let needsAttention
    let groups = team_groups
    const not_num = await notifyNumber.aggregate([
        { $match: { team: team } },
        { $sort: { time: -1 } },   // latest first
        {
            $group: {
                _id: "$num",
                doc: { $first: "$$ROOT" }
            }
        },
        { $replaceRoot: { newRoot: "$doc" } }
    ]);
    res.render('configure', { not_num, role, numbers, team, groups, names });
});


app.get('/handle_team', checkAuth, async (req, res) => {

    const role = decodeURIComponent(req.query.role).trim();

    const team = decodeURIComponent(req.query.team).trim();

    // const team_groups = req.query.groups
    //     ? decodeURIComponent(req.query.groups).split(',').map(g => g.trim())
    //     : [];

    const team_groups = req.query.groups
        ? JSON.parse(decodeURIComponent(req.query.groups))
        : [];


    const numbers = req.query.numbers
        ? decodeURIComponent(req.query.numbers).split(',').map(g => g.trim())
        : [];

    const names = req.query.names
        ? decodeURIComponent(req.query.names).split(',').map(g => g.trim())
        : [];

    console.log(team_groups)
    console.log(role)
    console.log(numbers)
    console.log(team)

    let groups = team_groups

    const not_num = await dummyNumber.aggregate([
        { $sort: { _id: -1 } },  // sort by latest inserted

        {
            $group: {
                _id: "$num",
                doc: { $first: "$$ROOT" }
            }
        },

        { $replaceRoot: { newRoot: "$doc" } }
    ]);

    const handle_teams = await teams.find()

    let selected_grps = []
    let selected_nums = []


    for (const team of handle_teams) {

        for (const grp of team.groups) {

            selected_grps.push(grp)
        }

        for (const [key, value] of team.agent_info) {
            // console.log(key, value.role, value.number);
            selected_nums.push(value.number)



        }




    }


    console.log(selected_grps)
    // const unique_selected_nums = [...new Set(selected_nums)];

    console.log(selected_nums)

    const allgrps = await User.distinct("group_name");

    res.render('handle_team', { not_num, allgrps, handle_teams, selected_grps, selected_nums, role, groups, numbers, team, names });
});


app.get('/auth', (req, res) => {


    res.render('auth');
});



app.get('/register_team/:teamName', checkAuth, async (req, res) => {
    try {
        const team = await teams.findOne({ team_name: req.params.teamName });
        let agent_num = []
        let agent_name = []
        let agent_role = []




        const role = decodeURIComponent(req.query.role).trim();

        const team_of_member = decodeURIComponent(req.query.team).trim();

        // const team_groups = req.query.groups
        //     ? decodeURIComponent(req.query.groups).split(',').map(g => g.trim())
        //     : [];

        const team_groups = req.query.groups
            ? JSON.parse(decodeURIComponent(req.query.groups))
            : [];


        const numbers = req.query.numbers
            ? decodeURIComponent(req.query.numbers).split(',').map(g => g.trim())
            : [];

        const names = req.query.names
            ? decodeURIComponent(req.query.names).split(',').map(g => g.trim())
            : [];

        console.log(team_groups)
        console.log(role)
        console.log(numbers)
        console.log(team_of_member)

        let groups = team_groups

        const teamName = team.team_name
        const grps = team.groups // Your function to get groups
        const not_num = team.agent_info // Your function to get agents
        console.log(not_num)


        for (const [key, value] of not_num) {
            console.log(key, value.role, value.number);
            agent_num.push(value.number)
            agent_name.push(key)
            agent_role.push(value.role)


        }



        res.render('register_team', {
            team,
            agent_num,
            agent_name,
            agent_role,
            grps,
            teamName,
            role,
            team_of_member,
            groups,
            numbers,
            names
        });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// Add these to your backend file

// Dashboard Home



app.get('/dashboard', checkAuth, async (req, res) => {


    // const allGroups = await User.distinct("group_name");

    // const allGroups = await User.distinct("group_name", {
    //     group_name: { $nin: [null, ""] }
    // })

    const role = decodeURIComponent(req.query.role).trim();

    const team = decodeURIComponent(req.query.team).trim();

    // const team_groups = req.query.groups
    //     ? decodeURIComponent(req.query.groups).split(',').map(g => g.trim())
    //     : [];

    const team_groups = req.query.groups
        ? JSON.parse(decodeURIComponent(req.query.groups))
        : [];


    const numbers = req.query.numbers
        ? decodeURIComponent(req.query.numbers).split(',').map(g => g.trim())
        : [];

    const names = req.query.names
        ? decodeURIComponent(req.query.names).split(',').map(g => g.trim())
        : [];

    console.log(team_groups)
    console.log(role)
    console.log(numbers)
    console.log(team)
    let allGroups
    let needsAttention
    let groups = team_groups

    if (team_groups.length > 0 && team_groups[0] != '') {
        needsAttention = await analyzed.find({ attention: false, group_name: team_groups }).sort({ last_message_time: -1 });

        allGroups = await User.aggregate([
            {
                $match: {
                    group_name: { $in: team_groups }  // 🔥 filter specific groups
                }
            },
            { $sort: { milli_sec: -1 } },
            {
                $group: {
                    _id: "$group_name",
                    latestMilli: { $first: "$milli_sec" },
                    latestTimestamp: { $first: "$timestamp" }
                }
            },
            { $sort: { latestMilli: -1 } }
        ]);

    }
    else {
        needsAttention = await analyzed_admin.find({ attention: false }).sort({ last_message_time: -1 });

        allGroups = await User.aggregate([
            { $match: { group_name: { $nin: [null, ""] } } },
            { $sort: { milli_sec: -1 } },  // latest message first
            {
                $group: {
                    _id: "$group_name",
                    latestMilli: { $first: "$milli_sec" },
                    latestTimestamp: { $first: "$timestamp" }   // ✅ add this

                }
            },
            { $sort: { latestMilli: -1 } }  // keep order
        ]);
    }
    // const groupNames = allGroups.map(g => g._id);
    const clean_groups = allGroups.map(g => ({
        groupName: g._id,
        timestamp: g.latestTimestamp,
        milli_sec: g.latestMilli
    }));


    // console.log(milliseconds);
    console.log('render index → current_send:', current_send)

    console.log(clean_groups)


    res.render('index', { needsAttention, groups, current_send, role, team, numbers, clean_groups, names });
});

// View Chat History for a Group
app.get('/chat/:groupName', checkAuth, async (req, res) => {

    try {
        const role = decodeURIComponent(req.query.role).trim();

        const team = decodeURIComponent(req.query.team).trim();
        // const team_groups = req.query.groups
        //     ? decodeURIComponent(req.query.groups).split(',').map(g => g.trim()).map(g => g.trim())
        //     : [];

        const team_groups = req.query.groups
            ? JSON.parse(decodeURIComponent(req.query.groups))
            : [];

        const u_numbers = req.query.numbers
            ? decodeURIComponent(req.query.numbers).split(',').map(g => g.trim()).map(g => g.trim())
            : [];

        const names = req.query.names
            ? decodeURIComponent(req.query.names).split(',').map(g => g.trim())
            : [];

        console.log(team_groups)
        console.log(role)
        console.log(u_numbers)
        console.log(team)
        let groups = team_groups

        const messages = await User.find({ group_name: req.params.groupName })
            .sort({ milli_sec: -1 })
            .limit(5);

        const supportDocs = await SupportNumber.find().lean();
        console.log(supportDocs)
        const numbers = supportDocs.map(n => n.num);
        console.log(numbers)
        messages.reverse()
        console.log(role)
        res.render('chat', { groupName: req.params.groupName, messages, numbers, role, groups, u_numbers, team, names });
    }
    catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});


app.get('/edit_team/:teamName', checkAuth, async (req, res) => {
    try {
        const team = await teams.findOne({ team_name: req.params.teamName });
        let agent_name = []
        // We need these for the dropdowns
        const grps = team.groups // Your function to get groups
        const not_num = team.agent_info // Your function to get agents
        console.log(not_num)

        const role = decodeURIComponent(req.query.role).trim();

        const team_of_member = decodeURIComponent(req.query.team).trim();

        // const team_groups = req.query.groups
        //     ? decodeURIComponent(req.query.groups).split(',').map(g => g.trim())
        //     : [];

        const team_groups = req.query.groups
            ? JSON.parse(decodeURIComponent(req.query.groups))
            : [];

        const numbers = req.query.numbers
            ? decodeURIComponent(req.query.numbers).split(',').map(g => g.trim())
            : [];

        const names = req.query.names
            ? decodeURIComponent(req.query.names).split(',').map(g => g.trim())
            : [];

        console.log(team_groups)
        console.log(role)
        console.log(numbers)
        console.log(team_of_member)
        let allGroups
        let needsAttention
        let groups = team_groups
        // console.log(Object.keys(not_num))

        for (const [key, value] of not_num) {
            console.log(key, value.role, value.number);
            agent_name.push(key)
        }


        // const all_num = await dummyNumber.aggregate([
        //     { $sort: { _id: -1 } },  // sort by latest inserted

        //     {
        //         $group: {
        //             _id: "$num",
        //             doc: { $first: "$$ROOT" }
        //         }
        //     },

        //     { $replaceRoot: { newRoot: "$doc" } }
        // ]);
        // const all_agents_name = all_num.map(doc => doc.name);

        // console.log(all_agents_name)


        const all_num = await dummyNumber.aggregate([
            { $sort: { _id: -1 } },
            {
                $group: {
                    _id: "$num",
                    doc: { $first: "$$ROOT" }
                }
            },
            { $replaceRoot: { newRoot: "$doc" } }
        ]);

        // CHANGE THIS: Map to objects instead of just strings
        const all_agents = all_num.map(doc => ({
            name: doc.name,
            number: doc.num // Ensure this matches the field name in your DB ('num')
        }));

        console.log(all_agents)
        const allgrps = await User.distinct("group_name");

        let selected_grps = []
        let selected_nums = []

        const handle_teams = await teams.find()


        for (const team of handle_teams) {

            for (const grp of team.groups) {

                selected_grps.push(grp)
            }

            for (const [key, value] of team.agent_info) {
                // console.log(key, value.role, value.number);
                selected_nums.push(value.number)



            }




        }


        console.log(selected_grps)
        // const unique_selected_nums = [...new Set(selected_nums)];

        console.log(selected_nums)


        console.log(agent_name)
        res.render('edit_team', {
            team,
            allgrps,
            agent_name,
            grps,
            all_agents,
            selected_grps,
            selected_nums,
            role,
            team_of_member,
            groups,
            numbers,
            names

        });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

app.post('/update-team-full', checkAuth, async (req, res) => {
    const { old_name, new_name, groups, agent_info, oldAgents } = req.body;

    try {
        // Find existing team
        const team = await teams.findOne({ team_name: old_name });
        const user_info = await teamMembers.find({ team_name: old_name })



        team.team_name = new_name;
        team.groups = groups;
        let agent_name = []
        console.log(team.team_name)
        console.log(team.groups)
        let new_agent_nums = []
        let new_agent_names = []

        for (const [name, info] of Object.entries(agent_info)) {
            console.log(name, info.number, info.role);

            if (info.number === "...") {
                // Find the actual number from dummyNumber collection
                const one_agent = await dummyNumber.findOne({ name: name });
                console.log(one_agent)

                if (one_agent) {
                    info.number = one_agent.num; // update the original object
                }

                agent_name.push(name);

            }

            for (const user of user_info) {

                if (user.number === info.number) {
                    user.role = info.role
                    await user.save()
                }
            }

            new_agent_nums.push(info.number)
            new_agent_names.push(name)


        }

        for (const user of user_info) {

            user.numbers = new_agent_nums
            user.names = new_agent_names

            await user.save()

        }



        // Clear and replace the Map
        team.agent_info = agent_info;
        console.log(agent_info)
        console.log(agent_name)


        await team.save();

        if (oldAgents.length > 0) {

            console.log("OLD AGENTS: ", oldAgents)

            await teamMembers.deleteMany({
                team_name: old_name,
                number: { $in: oldAgents }
            });

            await notifyNumber.deleteMany({
                team: old_name,
                num: { $in: oldAgents }
            });

        }

        await teamMembers.updateMany(
            { team_name: old_name },
            {
                $set: {
                    team_name: new_name,
                    groups: groups
                }
            }
        );
        await notifyNumber.updateMany(
            { team: old_name },
            {
                $set: {
                    team: new_name,
                    groups: groups
                }
            }
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/delete-team', checkAuth, async (req, res) => {
    const { team_name } = req.body

    try {

        const team_info = await teams.find({ team_name: team_name })

        console.log("DELETE TEAM")
        console.log(team_info)

        await teams.deleteOne({ team_name });
        await teamMembers.deleteMany({ team_name });
        await notifyNumber.deleteMany({ team: team_name });


        res.json({ success: true });

    }
    catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.post('/register_user', checkAuth, async (req, res) => {
    const { username, number, password, role, numbers, team_name, groups, names } = req.body

    try {

        console.log(groups)
        console.log(numbers)

        console.log(team_name)

        const member_registered = await teamMembers.find({ number: number, team_name: team_name })


        if (member_registered.length > 0) {

            res.json({ success: false, message: "already" })

        }
        else {

            const response = await axios.post(
                "http://localhost:5700/send",
                {
                    to: `${number}`,
                    text: `Team Name: ${team_name}\nRole: ${role}\nUser Name: ${username}\nUser Number: ${number}\nPassword: ${password}\nGroups Assigned: ${groups}`,
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            )
            teamMembers.create({ username: username, number: number, password: password, role: role, team_name: team_name, numbers: numbers, groups: groups, names: names })
            res.json({ success: true })

        }


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
                console.log("Number Not On Whatsapp")
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
    await analyzed_admin.deleteMany({ group_name });


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
    const doc2 = await analyzed_admin.findOne({ group_name });
    if (doc2) {
        doc2.attention = true;
        await doc2.save();
    }
    await resolved_issue.create({ group_name: group_name, message: message, BY_AI: false, Remarks: remarks, time_solved: pakTime })
    res.json({ success: true });
});


app.post('/add_remarks', async (req, res) => {
    const { group_name, message, remarks } = req.body;
    // const curr = Date.now()
    const pakTime = new Date(Date.now()).toLocaleString("en-PK", {
        timeZone: "Asia/Karachi",
    });
    console.log(message)

    await remarks_query.create({ group_name: group_name, message: message, Remarks: remarks, time_of_remarks: pakTime })
    res.json({ success: true });
});

app.post('/register_check', async (req, res) => {

    // const { fname, email, password } = req.body
    const { usernum, password } = req.body


    // let na = fname
    let unum = usernum
    let pas = password

    // console.log(na, em, pas)
    console.log(unum, pas)


    const che = await reg.findOne({ usernaum: unum })

    if (!che) {

        try {
            const hashedPassword = await bcrypt.hash(pas, 10);
            const newUser = new reg({
                usernum: unum,
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

    const { type,  password, number } = req.body





    let unum = number
    let pas = password

    console.log(type)

    if (type === "admin" ) {

        console.log("ADMIN LOGIN")
        console.log(unum, pas)

        const user = await reg.findOne({ usernum: unum });
        if (!user) return res.send({ success: false, message: 'User not found' });

        const isMatch = await bcrypt.compare(pas, user.password);

        if (isMatch) {
            // This line creates the session in MongoDB and the cookie in the browser
            req.session.userId = user._id;
            return res.json({ success: true, redirect: `/dashboard?role=admin` });

        } else {
            res.send({ success: false, message: 'Invalid password' });
        }
    }
    else {
        console.log('MEMBER LOGIN')
        console.log(unum, pas, number)

        const user = await teamMembers.findOne({ number: number });
        if (!user) return res.send({ success: false, message: 'User not found' });

        console.log(user.username, user.password, user.number, user.team_name)


        if (user.password === pas && user.number === unum) {
            // This line creates the session in MongoDB and the cookie in the browser
            req.session.userId = user._id;
            // return res.json({ success: true, redirect: `/dashboard?role=${user.role}&team=${user.team_name}&groups=${user.groups.join(',')}&numbers=${user.numbers.join(',')}` });

            return res.json({
                success: true,
                redirect:
                    `/dashboard?role=${encodeURIComponent(user.role)}` +
                    `&team=${encodeURIComponent(user.team_name)}` +
                    `&groups=${encodeURIComponent(JSON.stringify(user.groups))}` +
                    `&numbers=${encodeURIComponent(user.numbers.join(','))}` +
                    `&names=${encodeURIComponent(user.names.join(','))}`

            });


        } else {
            res.send({ success: false, message: 'Invalid Credentials' });
        }

    }


})

app.get('/logout_bot', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/auth');
    });
});

app.post('/set-time', async (req, res) => {
    const { New_time } = req.body;

    timerAdmin = Number(New_time)
    console.log("New Timer: ", timerAdmin)
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


app.post('/set-team', async (req, res) => {
    const { numbers, groups, Team_Name } = req.body;

    // let num = 

    const team_is_there = await teams.find({ team_name: Team_Name })

    if (team_is_there.length > 0) {

        res.json({ success: false, message: "Team name already registered" });

    }
    else {


        const agents = await dummyNumber.find({
            num: numbers
        });
        let num_name = {}
        for (const agent of agents) {
            num_name[agent['name']] = { 'role': "member", 'number': agent['num'] }



        }
        console.log(num_name)
        // let notify_time = Number(New_time)
        // notify_time = notify_time * 60 * 1000    // notify_nums.push(num)
        let grp_list = groups

        console.log(grp_list)

        await teams.create({ groups: grp_list, agent_info: num_name, team_name: Team_Name })

        res.json({ success: true });

    }
});


app.post('/set-numbers', async (req, res) => {
    const { New_number, New_time, team, name, groups } = req.body;
    
    console.log("TEAM CONFIGURATION")
    const team_groups = groups
        ? JSON.parse(decodeURIComponent(groups))
        : [];
    console.log(groups)
    console.log(team_groups)


    let num = New_number
    let notify_time = Number(New_time)
    notify_time = notify_time * 60 * 1000   

   await notifyNumber.updateOne(
    { num: num }, 
    { 
        $set: { 
            time_to_notify: notify_time,
            team: team,
            name: name,
            groups: team_groups
        } 
    },
    { upsert: true }
);

    // await notifyNumber.create({ num: num, time_to_notify: notify_time, team: team, name: name, groups: team_groups })
    let not_num = await notifyNumber.distinct('num')
    console.log(not_num)
    res.json({ success: true });
});

app.post('/del-numbers', async (req, res) => {
    const { del_number } = req.body;

    let num = del_number

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


app.post('/set-numbers-admins', async (req, res) => {
    const { New_number, New_time } = req.body;

    let num = New_number
    let notify_time = Number(New_time)
    notify_time = notify_time * 60 * 1000    // notify_nums.push(num)
    console.log(num)
    // console.log(notify_nums)

    await notifyNumberAdmin.updateOne(
    { num: num }, 
    { 
        $set: { 
            
            time_to_notify: notify_time
        
        } 
    },
    { upsert: true }
);

    // await notifyNumberAdmin.create({ num: num, time_to_notify: notify_time })
    let not_num = await notifyNumberAdmin.distinct('num')
    console.log(not_num)
    res.json({ success: true });
});



app.post('/del-numbers-admins', async (req, res) => {
    const { del_number } = req.body;

    let num = del_number

    const exists = await notifyNumberAdmin.exists({ num: num });

    if (exists) {
        console.log("✅ Exists");
        await notifyNumberAdmin.deleteMany({ num: num });
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

