import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";

export const config = {
  runtime: "edge",
};

interface Label {
  id: string;
  name: string;
  color: string;
}

interface LabelPayload {
  pageId: string;
  labels: Label[];
}

interface PagePayload {
  id: string;
  userId: string;
  state: "SUCCEEDED" | string;
  originalUrl: string;
  downloadUrl: string | null;
  slug: string;
  title: string;
  author: string | null;
  description: string;
  savedAt: string;
  createdAt: string;
  publishedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
  readAt: string | null;
  updatedAt: string;
  itemLanguage: string;
  wordCount: number;
  siteName: string;
  siteIcon: string;
  readingProgressLastReadAnchor: number;
  readingProgressHighestReadAnchor: number;
  readingProgressTopPercent: number;
  readingProgressBottomPercent: number;
  thumbnail: string;
  itemType: "WEBSITE" | string;
  uploadFileId: string | null;
  contentReader: "WEB" | string;
  subscription: object | null;
  directionality: "LTR" | "RTL";
  note: string | null;
  recommenderNames: string[];
  folder: string;
  labelNames: string[];
  highlightAnnotations: object[];
  seenAt: string | null;
  topic: string | null;
  digestedAt: string | null;
  score: number | null;
  previewContent: string;
}

interface WebhookPayload {
  action: string;
  label?: LabelPayload;
  page?: PagePayload;
}

export default async (req: Request): Promise<Response> => {
  try {
    const body: WebhookPayload = (await req.json()) as WebhookPayload;
    console.log("Received webhook payload:", body);
    const label = body.label as LabelPayload;
    const pageCreated = body.page as PagePayload;

    let webhookType: "LABEL_ADDED" | "PAGE_CREATED";
    // detect webhook type
    if (label) {
      webhookType = "LABEL_ADDED";
    } else if (pageCreated) {
      webhookType = "PAGE_CREATED";
    } else {
      throw new Error("No label or page data found in the webhook payload.");
    }
    let articleId = "";
    // get the label to annotate from the environment
    const annotateLabel = process.env["OMNIVORE_ANNOTATE_LABEL"] ?? "";

    switch (webhookType) {
      case "LABEL_ADDED":
        console.log(`Received LABEL_ADDED webhook.`, label);

        // bail if no label is specified in the environment
        if (!annotateLabel) {
          throw new Error("No label specified in environment.");
        }

        const labels = label?.labels || [label]; // handle one vs multiple labels
        const labelNames = labels.map((label) => label.name.split(":")[0]); // split at ":" to handle label variants
        const matchedLabel = labelNames.find(
          (labelName) => labelName === annotateLabel
        );

        // bail if a label is specified in the environment but not in the webhook we received
        if (!matchedLabel) {
          throw new Error(
            `Label "${annotateLabel}" does not match any of the labels <${labelNames.join(
              ", "
            )}> provided in the webhook.`
          );
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
        const errorMessage =
          "Neither label data received nor PAGE_CREATED event.";
        console.log(errorMessage);
        return new Response(errorMessage, {
          status: 400,
        });
    }

    // STEP 1: fetch the full article content from Omnivore (not part of the webhook payload)
    const omnivoreHeaders = {
      "Content-Type": "application/json",
      Authorization: process.env["OMNIVORE_API_KEY"] ?? "",
    };

    interface FetchQueryResponse {
      data: {
        article: {
          article: {
            content: string;
            title: string;
            labels: Array<{
              name: string;
              description: string;
            }>;
            highlights: Array<{
              id: string;
              type: string;
            }>;
          };
        };
      };
    }

    let fetchQuery = {
      query: `query Article {
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
              description
            }
            highlights(input: { includeFriends: false }) {
              id
              shortId
              user {
                  id
                  name
                  createdAt
              }
              type
            }
          }
        }
      }
    }`,
    };

    const omnivoreRequest = await fetch(
      "https://api-prod.omnivore.app/api/graphql",
      {
        method: "POST",
        headers: omnivoreHeaders,
        body: JSON.stringify(fetchQuery),
        redirect: "follow",
      }
    );
    const omnivoreResponse =
      (await omnivoreRequest.json()) as FetchQueryResponse;

    const {
      data: {
        article: {
          article: {
            content: articleContent,
            title: articleTitle,
            labels: articleLabels,
            highlights,
          },
        },
      },
    } = omnivoreResponse;

    const promptFromLabel = articleLabels.find(
      ({ name }) => name.split(":")[0] === annotateLabel
    )?.description;

    const existingNote = highlights.find(({ type }) => type === "NOTE");

    if (articleContent.length < 280) {
      throw new Error(
        "Article content is less than 280 characters, no need to summarize."
      );
    }

    // STEP 2: generate a completion using OpenAI's API
    const openai = new OpenAI(); // defaults to process.env["OPENAI_API_KEY"]
    let prompt =
      promptFromLabel ||
      process.env["OPENAI_PROMPT"] ||
      "Return a tweet-length TL;DR of the following article.";
    const model = process.env["OPENAI_MODEL"] || "gpt-4o-mini";
    const settings = process.env["OPENAI_SETTINGS"] || `{"model":"${model}"}`;

    const completionResponse = await openai.chat.completions
      .create({
        ...JSON.parse(settings),
        messages: [
          {
            role: "user",
            content: `Instruction: ${prompt} 
Article title: ${articleTitle}
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

    const articleAnnotation = (
      completionResponse?.choices?.[0].message?.content || ""
    )
      .trim()
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');

    // STEP 3: Update Omnivore article with OpenAI completion

    let mutationQuery: {
      query: string;
      variables: {
        input: {
          highlightId?: string;
          annotation: string;
          type?: string;
          id?: string;
          shortId?: string;
          articleId?: string;
        };
      };
    };
    const fragment = `
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
  }`;

    // Omnivore UI only shows one highlight note per article so
    // if we have an existing note, update it; otherwise, create a new one
    if (existingNote) {
      mutationQuery = {
        query: `mutation UpdateHighlight($input: UpdateHighlightInput!) {
      updateHighlight(input: $input) {
        ... on UpdateHighlightSuccess {
          highlight {
            ...HighlightFields
          }
        }
        ... on UpdateHighlightError {
          errorCodes
        }
      }
    }${fragment}`,
        variables: {
          input: {
            highlightId: existingNote.id,
            annotation: articleAnnotation,
          },
        },
      };
    } else {
      const id = uuidv4();
      const shortId = id.substring(0, 8);

      mutationQuery = {
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
    }${fragment}`,
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
    }

    const OmnivoreAnnotationRequest = await fetch(
      "https://api-prod.omnivore.app/api/graphql",
      {
        method: "POST",
        headers: omnivoreHeaders,
        body: JSON.stringify(mutationQuery),
      }
    );
    const OmnivoreAnnotationResponse =
      (await OmnivoreAnnotationRequest.json()) as { data: unknown };
    console.log(
      `Article annotation added to article "${articleTitle}" (ID: ${articleId}): ${JSON.stringify(
        OmnivoreAnnotationResponse.data
      )}`,
      `Used this GraphQL query: ${JSON.stringify(mutationQuery)}`
    );

    return new Response(`Article annotation added.`);
  } catch (error) {
    return new Response(
      `Error adding annotation to Omnivore article: ${
        (error as Error).message
      }`,
      { status: 500 }
    );
  }
};
