const axios = require("axios");
const { OpenAIAPI } = require("openai");

module.exports = async (req, res) => {
  const openai = new OpenAIAPI({ key: process.env.OPENAI_API_KEY });

  try {
    // Fetch article from Omnivore
    const omnivoreResponse = await axios.get("Omnivore_API_endpoint_here");
    const articleContent = omnivoreResponse.data.content;

    // Summarize using OpenAI API
    const summaryResponse = await openai.createCompletion({
      engine: "text-davinci-002",
      prompt: `Summarize: ${articleContent}`,
      max_tokens: 50,
    });
    const summary = summaryResponse.choices[0].text.trim();

    // Update Omnivore article with summary
    const updatePayload = { note: summary };
    await axios.post("Omnivore_API_update_endpoint_here", updatePayload);

    res.status(200).send("Article summarized and updated.");
  } catch (error) {
    res.status(500).send(`Error: ${error.message}`);
  }
};
