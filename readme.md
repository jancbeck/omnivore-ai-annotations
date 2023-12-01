# Summarize Omnivore articles using GPT on Vercel deployment

## Overview

This Vercel serverless function automatically summarizes articles when a specific label, "summarize", is added to them. It uses the OpenAI GPT-3.5 Turbo model for generating summaries and interacts with the Omnivore API to add summaries to the article notebook.

## Prerequisites

- Node.js 14.x or higher
- npm
- OpenAI API key
- Omnivore API key
- Vercel account

## Deployment and Usage

### Vercel Deployment

1. Add your repository to Vercel.
2. Set up the environment variables (`OPENAI_API_KEY` and `OMNIVORE_API_KEY`) in the Vercel dashboard.
3. Deploy the project.

### Omnivore Webhook Setup

1. Log in to your Omnivore dashboard.
2. Navigate to the webhook settings.
3. Add a new webhook and set the URL to the deployed Vercel function URL.
4. Configure the webhook to trigger when a new label is added.

Now, whenever a label named "summarize" is added to an article in Omnivore, the Vercel function will automatically summarize the article.

## API Endpoints

- **POST /api/summarize**: Summarizes an article when the "summarize" label is added.

## Development Setup

### Local Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/jancbeck/vercel-omnivore-openai
   ```

2. Navigate to the project directory:

   ```bash
   cd vercel-omnivore-openai
   ```

3. Install dependencies:

   ```bash
   npm i -g vercel
   npm install
   ```

#### Testing with Postman

1. **Local Testing**: Vercel offers a local development environment using the `vercel dev` command. Run this command in your project directory.
2. **Postman Setup**: Open Postman and create a new request. Set the request type to whatever your function expects (likely POST or GET).
3. **Request URL**: Use `http://localhost:3000/api/summarize` as the URL, replacing `3000` with whatever port `vercel dev` is using.
4. **Send Request**: Click "Send" in Postman to trigger the function.

## License

MIT License.

## Roadmap

- [ ] use individual article highlights to allow "chatting" within Omnivore (e.g. highlight text with note "explain" and GPT will update the highlight with a reply based on the prompt and context)
