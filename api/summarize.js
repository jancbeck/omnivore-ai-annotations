import OpenAI from "openai";

export const config = {
  runtime: "edge",
};

export default async (req) => {
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response("No payload found.", { status: 400 });
  }

  // req.body looks like this:{
  //     "action": "created",
  //     "userId": "<YOUR USER ID>",
  //     "label": {
  //       "type": "label",
  //       "userId": "<YOUR USER ID>",
  //       "pageId": "nOFXJYoBGhy2EPBcqSZg",
  //       "id": "65f08a0e-5e1d-11ee-b62a-5ff4af17cb9a",
  //       "name": "summarize",
  //       "color": "#CE88EF",
  //       "description": "",
  //       "createdAt": "2023-09-28T16: 38: 05.236Z"
  //     }
  // }

  const summarizeLabel = process.env["OMNIVORE_SUMMARIZE_LABEL"];
  const omnivoreHeaders = {
    "Content-Type": "application/json",
    Authorization: process.env["OMNIVORE_API_KEY"],
  };

  // bail if a label is specified in the environment but not in the webhook we received
  // if the environment has no label set, we'll just summarize everything (only use on PAGE_CREATED event!)
  if (summarizeLabel && body.label.name !== summarizeLabel) {
    return new Response("Not a summarize label");
  }

  // STEP 1: fetch the full article content from Omnivore (not part of the webhook payload)
  const articleId = body.label.pageId;
  const openai = new OpenAI(); // defaults to process.env["OPENAI_API_KEY"]
  /**
   * GraphQL query to retrieve article content and labels based on page ID.
   * @param {Object} req - The request object.
   * @param {string} articleId - The page ID of the article to retrieve.
   * @returns {Object} The article content and labels.
   */
  let query = `query Article {
    article(
      slug: "${articleId}"
      username: "."
      format: "markdown"
      ) {
        ... on ArticleSuccess {
          article {
            title
            content
            labels {
              name
            }
          }
        }
      }
    }`;

  let omnivoreResponse;
  try {
    omnivoreResponse = await fetch(
      "https://api-prod.omnivore.app/api/graphql",
      {
        method: "POST",
        headers: omnivoreHeaders,
        body: JSON.stringify({ query }),
      }
    );
    omnivoreResponse = await omnivoreResponse.json();
  } catch (error) {
    return new Response(
      `Error fetching article from Omnivore: ${error.message}`,
      { status: 500 }
    );
  }
  const articleContent = omnivoreResponse.data.article.article.content;
  const articleTitle = omnivoreResponse.data.article.article.title;

  // STEP 2: generate a completion using OpenAI's API
  let completionResponse;
  const prompt =
    process.env["OPENAI_PROMPT"] ||
    "Return a tweet-length TL;DR of the following article.";
  const model = process.env["OPENAI_MODEL"] || "gpt-3.5-turbo-16k";
  const settings = process.env["OPENAI_SETTINGS"] || `{"model":"${model}"}`;
  try {
    completionResponse = await openai.chat.completions
      .create({
        ...JSON.parse(settings),
        messages: [
          {
            role: "user",
            content: `Instruction: ${prompt} 
Article content: ${articleContent}`,
          },
        ],
      })
      .catch((err) => {
        throw err;
      });
    // log stats about response incorporating the prompt, title and usage of
    console.log(
      `Fetched completion from OpenAI for article "${articleTitle}" (ID: ${articleId}) using prompt "${prompt}": ${JSON.stringify(
        completionResponse.usage
      )}`
    );

    // console.log(res.status(200).send(completionResponse));
  } catch (error) {
    return new Response(
      `Error fetching completion from OpenAI for article "${articleTitle}" (ID: ${articleId}) using prompt "${prompt}": ${error.message}`,
      { status: 500 }
    );
  }
  const articleSummary = completionResponse.choices[0].message.content
    .trim()
    .replace(/"/g, '\\"')
    .replace(/\\/g, "\\\\");

  // STEP 3: Update Omnivore article with OpenAI completion

  // use simple hash for id shortid based on article id and datetime
  const id = Date.now();
  const shortId = id.toString().slice(-8);
  const annotationSettings =
    process.env["OMNIVORE_ANNOTATION_SETTINGS"] || `type: NOTE`;

  query = `mutation CreateHighlight {
    createHighlight(
      input: {
        id: "${id}", 
        shortId: "${shortId}", 
        articleId: "${articleId}", 
        annotation: "${articleSummary.substring(0, 4000)}", 
        ${annotationSettings}}
    ) {
      ... on CreateHighlightSuccess {
        highlight {
          id
        }
      }
      ... on CreateHighlightError {
        errorCodes
      }
    }
  }`;
  console.log(omnivoreHeaders);
  let OmnivoreAnnotationResponse;
  try {
    OmnivoreAnnotationResponse = await fetch(
      "https://api-prod.omnivore.app/api/graphql",
      {
        method: "POST",
        headers: omnivoreHeaders,
        body: JSON.stringify({ query }),
      }
    );
    OmnivoreAnnotationResponse = await OmnivoreAnnotationResponse.json();
    return new Response(
      `Article annotation added to article "${articleTitle}" (ID: ${articleId}): ${JSON.stringify(
        OmnivoreAnnotationResponse.data.createHighlight
      )}`
    );
  } catch (error) {
    return new Response(
      `Error adding annotation to Omnivore article "${articleTitle}" (ID: ${articleId}): ${error.message}`,
      { status: 500 }
    );
  }
};
