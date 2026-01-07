// import axios from "axios";

// const OLLAMA_URL = "http://ai1.oashost.com:11434";
// // const OLLAMA_URL = "http://10.10.10.11:11434";

// const MODEL = "llama3.1:8b";

// async function llama(userMessage, systemMessage = "") {
//   /*
//     Simple function to chat with a local LLM running on Ollama
//   */

//   const messages = [];

//   if (systemMessage) {
//     messages.push({
//       role: "system",
//       content: systemMessage,
//     });
//   }

//   messages.push({
//     role: "user",
//     content: userMessage,
//   });

//   const payload = {
//     model: MODEL,
//     messages,
//     stream: false,
//   };

//   try {
//     const response = await axios.post(
//       `${OLLAMA_URL}/api/chat`,
//       payload,
//       {
//         headers: {
//           "Content-Type": "application/json",
//         },
//       }
//     );

//     return response.data;
//   } catch (err) {
//     return `Error: ${err.message}`;
//   }
// }

// // Example usage
// (async () => {
//   const response = await llama(`Extract data from this Bill of Lading html...`);

//   if (typeof response === "object") {
//     console.log(
//       "Response:",
//       response?.message?.content?.trim()
//     );
//   } else {
//     console.log("Response:", response);
//   }
// })();


import axios from "axios";

// const OLLAMA_URL = "http://ai1.oashost.com:11434";
const OLLAMA_URL = "http://10.10.10.11:11434"
const MODEL = "llama3.1:8b";

export async function llama(userMessage, systemMessage = "") {
  const messages = [];

  if (systemMessage) {
    messages.push({
      role: "system",
      content: systemMessage,
    });
  }

  messages.push({
    role: "user",
    content: userMessage,
  });

  const payload = {
    model: MODEL,
    messages,
    stream: false,
     options: {
      temperature: 0
    }
  };

  try {
    const response = await axios.post(
      `${OLLAMA_URL}/api/chat`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  } catch (err) {
    throw new Error(err.message);
  }
}

