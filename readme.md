# Let ChatGPT annotate Omnivore articles for you

## Overview

This serverless function can be used to automatically add annotations to Omnivore articles when a specific label (say, "summarize") is added to them. It uses Omnivore's [API](https://docs.omnivore.app/integrations/api.html) and [webhooks](https://docs.omnivore.app/integrations/webhooks.html) as well as [OpenAI's chat completions API](https://platform.openai.com/docs/guides/text-generation). 

## How to Use

For most convenience, deployment using [Vercel](https://vercel.com) is recommended. Theoretically it could work on other serverless functions providers but I have only tested it with Vercel. Vercel offers a free hobby plan that should cover basic usage of this function.

Deploy the example using Vercel:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/jancbeck/omnivore-ai-annotations&project-name=omnivore-ai-annotations&repository-name=omnivore-ai-annotations)

## Vercel Setup

Once you added the repo to Vercel, set up the [environment variables](https://vercel.com/docs/projects/environment-variables).

- `OMNIVORE_API_KEY` (required): omnivore.app --> [API Key](https://omnivore.app/settings/api)
- `OPENAI_API_KEY` (required): platform.openai.com --> [API Keys](https://platform.openai.com/api-keys)
- `OMNIVORE_ANNOTATE_LABEL` (optional): set this to the name of label you want to use to trigger processing. Example: "Summarize" (without quotes). If you don't set this and use the `PAGE_CREATED` Omnivore webhook event, the script will process every article you add to Omnivore.
- `OPENAI_PROMPT` (optional): the instruction that's send to OpenAI's GPT model in addition to the article content. 
- `OPENAI_MODEL` (optional): the [model name](https://platform.openai.com/docs/models/gpt-4-and-gpt-4-turbo) to use. Defaults to "gpt-3.5-turbo-16k" (without quotes).
- `OPENAI_SETTINGS` (optional, advanced): additional [request parameters](https://platform.openai.com/docs/api-reference/chat/create) send when generating the chat completion. Use JSON. Example: `{"temperature": 0, "seed": 1234}`.

Deploy and copy the URL of your deployment.

### Omnivore Webhook Setup

In Omnivore add a new [webhook](https://omnivore.app/settings/webhooks) and set the URL to the deployed Vercel function URL from the step above and add the path `/api/annotate` to it. Example: `https://projectname.vercel.app/api/annotate`

If you have defined a label name to listen for in the step above, then select `LABEL_ADDED` as event type. 
If you want the function to process every article you add to Omnivore, then instead select `PAGE_CREATED`.

Now either add a new article to Omnivore or your label to an existing article. Within less than a minute, the response of the model's completion should appear in the notebook of the article. 

Check the [runtime logs](https://vercel.com/docs/observability/runtime-logs) if you encounter issues. Check your API keys and never share them publicly.

## Development 

### Clone and Deploy

```bash
git clone https://github.com/jancbeck/omnivore-ai-annotations
```

Install the Vercel CLI and dependencies:

```bash
npm i -g vercel
npm i
```

Then run the app at the root of the repository:

```bash
vercel dev
```

## API Endpoints

- **POST /api/annotate**: Annotates an article with an AI generated response.

### Local testing with Postman

1. **Local Testing**: Vercel offers a local development environment using the `vercel dev` command. Run this command in your project directory.
2. **Postman Setup**: Open Postman and create a new request. Set the request type to whatever your function expects (likely POST or GET).
3. **Request URL**: Use `http://localhost:3000/api/annotate` as the URL, replacing `3000` with whatever port `vercel dev` is using.
4. **Send Request**: Click "Send" in Postman to trigger the function.

Observe the response and terminal output for logging information.

## License

MIT License.

## Ideas

- [ ] use individual article highlights to allow "chatting" within Omnivore (e.g. highlight text, add note "explain" and GPT will generate the highlight with a reply based on the prompt and context. 
- [ ] instruct the model to highlight the article for you via [function calls](https://platform.openai.com/docs/guides/function-calling). Perhaps using the article notebook as an instruction input.
