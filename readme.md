# Summarize Omnivore articles using GPT and Vercel

## Implementation:

1. **Initialize a New Project**: Create a new directory and initialize it as a Git repository. Add a `vercel.json` file to specify your project settings.

2. **Create Serverless Function**: In your project directory, create a new folder called `api`. Inside `api`, create a new file, say `summarize.js`.

3. **Install Dependencies**: Run `npm install axios openai` to install the necessary packages for HTTP requests and OpenAI API interaction.

4. **Write the Function**: Populate `summarize.js` with the code to fetch the article, summarize it, and update Omnivore.

5. **Environment Variables**: Add your OpenAI and Omnivore API keys as environment variables in your Vercel dashboard.

6. **Deploy**: Push your code to GitHub and connect it to Vercel for automatic deployments.

### Code Example (`summarize.js`):

```javascript
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
```

### Rate Limiting

1. **Retry Logic**: Implement a retry mechanism with exponential backoff. If you hit the rate limit, wait for a specified time and then try again, gradually increasing the wait time.
2. **Rate-Limiter Packages**: Use npm packages like `bottleneck` or `p-throttle` to manage rate-limiting in your code.
3. **API Gateway**: Use a third-party API Gateway that handles rate limiting, although this might be overkill for your use case.

_won't worry about that for now_

### Error Handling and Monitoring

1. **Vercel Dashboard**: Vercel automatically logs function invocations, errors, and performance metrics. You can view these logs in your Vercel dashboard.
2. **Manual Logging**: Log critical steps and errors in your code, which will appear in the Vercel logs.
3. **HTTP Status Codes**: Return appropriate HTTP status codes to indicate success or failure.

_let's just use out of the box features of Vercel_

### Testing with Postman

1. **Local Testing**: Vercel offers a local development environment using the `vercel dev` command. Run this command in your project directory.
2. **Postman Setup**: Open Postman and create a new request. Set the request type to whatever your function expects (likely POST or GET).
3. **Request URL**: Use `http://localhost:3000/api/summarize` as the URL, replacing `3000` with whatever port `vercel dev` is using.
4. **Send Request**: Click "Send" in Postman to trigger the function.
