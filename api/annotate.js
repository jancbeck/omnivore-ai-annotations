import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";

export const config = {
  runtime: "edge",
};

export default async (req) => {
  let body;
  try {
    body = await req.json();
  } catch (e) {
    console.log(`No payload found: ${e.message}`);
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
  // or when multiple labels are are present:
  //   {
  //   action: 'created',
  //   userId: '64275c28-cd60-11ed-a26c-fb80cc4a9a1e',
  //   label: {
  //     type: 'label',
  //     userId: '64275c28-cd60-11ed-a26c-fb80cc4a9a1e',
  //     pageId: '77d98706-74d5-11ee-a8cc-ab92ff997b71',
  //     labels: [
  //     {
  //         id: '65f08a0e-5e1d-11ee-b62a-5ff4af17cb9a',
  //         name: 'summarize',
  //         color: '#CE88EF',
  //         description: '',
  //         createdAt: '2023-09-28T16:38:05.236Z'
  //       },
  //         {
  //         id: 'd0fabf54-f6ee-11ed-89ae-07056972a2f0',
  //         name: 'Newsletter',
  //         color: '#07D2D1',
  //         description: null,
  //         createdAt: '2023-05-20T09:15:08.704Z'
  //       }
  //     ]
  //   }
  // }
  // or when a page is created:
  //   {
  //     "action": "created",
  //     "userId": "<YOUR USER ID>",
  //     "page": {
  //         "type": "page",
  //         "userId": "<YOUR USER ID>",
  //         "id": "f187586d-1380-4c1b-887f-140fb9217465",
  //         "slug": "fast-api-experiment-middleware-feature-by-life-is-short-so-enjoy-18a22a66735",
  //         "originalHtml": "FULLHTML",
  //         "description": "While I worked on adding authentication into FastAPI application, I had a chance to take a look the FastAPI Middleware feature. Let’s try the example in FastAPI documentation. The example is adding…",
  //         "title": "FastAPI: Experiment Middleware feature | by Life-is-short--so--enjoy-it | Aug, 2023 | Medium",
  //         "author": "Life-is-short--so--enjoy-it",
  //         "url": "https://medium.com/@life-is-short-so-enjoy-it/fastapi-experiment-middleware-feature-c0a0c7314d74",
  //         "pageType": "ARTICLE",
  //         "hash": "37e42d0dbd7b710094e77808a81bdd43",
  //         "image": "https://miro.medium.com/v2/resize:fit:1200/1*SDkMzvL5PNsIGchfG-N--w.png",
  //         "publishedAt": "2023-08-12T08:05:10.316Z",
  //         "readingProgressPercent": 0,
  //         "readingProgressAnchorIndex": 0,
  //         "state": "SUCCEEDED",
  //         "createdAt": "2023-08-23T13:47:25.365Z",
  //         "savedAt": "2023-08-23T13:47:25.365Z",
  //         "siteName": "Medium",
  //         "language": "English",
  //         "siteIcon": "https://miro.medium.com/v2/1*m-R_BkNf1Qjr1YbyOIJY2w.png",
  //         "wordsCount": 1257,
  //         "archivedAt": null
  //     }
  // }

  const { label, page: pageCreated } = body;
  let webhookType;
  if (Boolean(label?.labels?.length || label?.name)) {
    webhookType = "LABEL_ADDED";
  }
  if (Boolean(pageCreated?.id)) {
    webhookType = "PAGE_CREATED";
  }
  let articleId;

  switch (webhookType) {
    case "LABEL_ADDED":
      console.log(`Received LABEL_ADDED webhook.`, label);

      const annotateLabel = process.env["OMNIVORE_ANNOTATE_LABEL"] || false;

      // bail if no label is specified in the environment
      if (!annotateLabel) {
        console.log(`No label specified in environment.`);
        return new Response("No label specified in environment.", {
          status: 400,
        });
      }

      const labels = label?.labels || [label]; // handle one vs multiple labels
      const labelNames = labels.map((label) => label.name);

      // bail if a label is specified in the environment but not in the webhook we received
      if (!labelNames.includes(annotateLabel)) {
        console.log(
          `Label "${annotateLabel}" does not match any of the labels "${labelNames}" specified in environment.`,
          label
        );
        return new Response("Not an annotation label", { status: 400 });
      }
      articleId = label.pageId;
      break;

    case "PAGE_CREATED":
      console.log(`Received PAGE_CREATED webhook.`, pageCreated);
      articleId = pageCreated.id;
      break;

    default:
      // don't do anything if no label is specified in the environment
      // and we didn't receive a label in the webhook payload
      console.log("Neither label data received nor PAGE_CREATED event.");
      return new Response(
        "Neither label data received nor PAGE_CREATED event.",
        {
          status: 400,
        }
      );
  }

  // STEP 1: fetch the full article content from Omnivore (not part of the webhook payload)
  const omnivoreHeaders = {
    "Content-Type": "application/json",
    Authorization: process.env["OMNIVORE_API_KEY"],
  };
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
        redirect: "follow",
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
  const openai = new OpenAI(); // defaults to process.env["OPENAI_API_KEY"]
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
  const articleAnnotation = completionResponse.choices[0].message.content
    .trim()
    .replace(/"/g, '\\"')
    .replace(/\\/g, "\\\\");

  // STEP 3: Update Omnivore article with OpenAI completion

  const id = uuidv4();
  const shortId = id.substring(0, 8);

  query = {
    query: `mutation CreateHighlight($input: CreateHighlightInput!) {
      createHighlight(input: $input) {
        ... on CreateHighlightSuccess {
          highlight {
            ...HighlightFields
          }
        }

        ... on CreateHighlightError {
          errorCodes
        }
      }
    }
    
  fragment HighlightFields on Highlight {
    id
    type
    shortId
    quote
    prefix
    suffix
    patch
    color
    annotation
    createdByMe
    createdAt
    updatedAt
    sharedAt
    highlightPositionPercent
    highlightPositionAnchorIndex
    labels {
      id
      name
      color
      createdAt
    }
  }`,
    variables: {
      input: {
        type: "NOTE",
        id: id,
        shortId: shortId,
        articleId: articleId,
        annotation: articleAnnotation,
      },
    },
  };
  let OmnivoreAnnotationResponse;
  try {
    OmnivoreAnnotationResponse = await fetch(
      "https://api-prod.omnivore.app/api/graphql",
      {
        method: "POST",
        headers: omnivoreHeaders,
        body: JSON.stringify(query),
        redirect: "follow",
      }
    );
    OmnivoreAnnotationResponse = await OmnivoreAnnotationResponse.json();
    console.log(
      `Article annotation added to article "${articleTitle}" (ID: ${articleId}): ${JSON.stringify(
        OmnivoreAnnotationResponse.data.createHighlight
      )}`,
      `Used this GraphQL query: ${JSON.stringify(query)}`
    );

    return new Response(`Article annotation added.`);
  } catch (error) {
    return new Response(
      `Error adding annotation to Omnivore article "${articleTitle}" (ID: ${articleId}): ${error.message}`,
      { status: 500 }
    );
  }
};
