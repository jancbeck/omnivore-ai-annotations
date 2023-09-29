import axios from "axios";
import OpenAI from "openai";

module.exports = async (req, res) => {
  // req.body looks like this:{
  //     "action": "created",
  //     "userId": "64275c28-cd60-11ed-a26c-fb80cc4a9a1e",
  //     "label": {
  //       "type": "label",
  //       "userId": "64275c28-cd60-11ed-a26c-fb80cc4a9a1e",
  //       "pageId": "nOFXJYoBGhy2EPBcqSZg",
  //       "id": "65f08a0e-5e1d-11ee-b62a-5ff4af17cb9a",
  //       "name": "summarize",
  //       "color": "#CE88EF",
  //       "description": "",
  //       "createdAt": "2023-09-28T16: 38: 05.236Z"
  //     }
  // }
  // only proceed if label is "summarize"
  if (req.body.label.name !== "summarize") {
    res.status(200).send("Not a summarize label");
    return;
  }

  const openai = new OpenAI(); // defaults to process.env["OPENAI_API_KEY"]
  const config = {
    headers: {
      Authorization: process.env["OMNIVORE_API_KEY"],
    },
  };
  /**
   * GraphQL query to retrieve article content and labels based on page ID.
   * @param {Object} req - The request object.
   * @param {string} req.body.label.pageId - The page ID of the article to retrieve.
   * @returns {Object} The article content and labels.
   */
  let query = `query Article {
    article(
      slug: "${req.body.label.pageId}"
      username: "."
      format: "markdown"
      ) {
        ... on ArticleSuccess {
          article {
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
    omnivoreResponse = await axios.post(
      "https://api-prod.omnivore.app/api/graphql",
      { query },
      config
    );
    //res.status(200).send(omnivoreResponse);
  } catch (error) {
    res.status(500).send(`Error 1: ${error.message}`);
    return;
  }

  const articleContent = omnivoreResponse.data.data.article.article.content;
  let completionResponse;
  try {
    completionResponse = await openai.chat.completions
      .create({
        messages: [
          {
            role: "user",
            content: `${articleContent} 
      summarize the above article in one sentence for a well educated but busy executive`,
          },
        ],
        model: "gpt-3.5-turbo-16k",
        max_tokens: 70,
        temperature: 0,
      })
      .catch((err) => {
        throw err;
      });

    //res.status(200).send(completionResponse);
  } catch (error) {
    res.status(500).send(`Error 2: ${error.message}`);
    return;
  }
  const articleSummary = completionResponse.choices[0].message.content
    .trim()
    .replace(/"/g, '\\"')
    .replace(/\\/g, "\\\\");

  // Update Omnivore article with summary
  // use simple hash for id shortid based on article id and datetime
  const id = `${req.body.label.pageId}-${Date.now()}`;
  const shortId = id.substring(0, 8);

  query = `mutation CreateHighlight {
    createHighlight(
      input: {id: "${id}", shortId: "${shortId}", articleId: "${req.body.label.pageId}", annotation: "GPT SUMMARY: ${articleSummary}", type: NOTE}
    ) {
      ... on CreateHighlightSuccess {
        highlight {
          id
          shortId
          quote
          prefix
          suffix
          patch
          annotation
          sharedAt
          createdAt
          updatedAt
          createdByMe
          highlightPositionPercent
          highlightPositionAnchorIndex
          type
          html
          color
        }
      }
    }
  }`;

  try {
    const response = await axios.post(
      "https://api-prod.omnivore.app/api/graphql",
      { query },
      config
    );
    //res.status(200).send(response.data);
    res.status(200).send("Article summary added");
  } catch (error) {
    res.status(500).send(`Error 3: ${error.message}`);
  }
};
