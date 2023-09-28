import axios from "axios";
import OpenAI from "openai";

module.exports = async (req, res) => {
  const openai = new OpenAI(); // defaults to process.env["OPENAI_API_KEY"]

  const config = {
    headers: {
      Authorization: process.env["OMNIVORE_API_KEY"],
    },
  };
  let query = `query Article {
    article(
      slug: "${req.body.page.slug}"
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
    res.status(500).send(`Error: ${error.message}`);
    return;
  }

  const article = omnivoreResponse.data.data.article.article;
  // only proceed if article has "summarize" label
  const labels = article.labels;
  const hasSummarizeLabel = labels.some((label) => label.name === "summarize");
  if (!hasSummarizeLabel) {
    res.status(200).send("Article does not have 'summarize' label");
    return;
  }

  const articleContent = article.content;
  let completionResponse;
  try {
    completionResponse = await openai.completions.create({
      prompt: `${articleContent} 
      summarize the above article in one sentence for a busy executive`,
      max_tokens: 70,
      model: "gpt-3.5-turbo-instruct",
      temperature: 0,
    });

    //res.status(200).send(completionResponse);
  } catch (error) {
    res.status(500).send(`Error: ${error.message}`);
    return;
  }
  const articleSummary = completionResponse.choices[0].text.trim();

  // Update Omnivore article with summary
  // use simple hash for id shortid based on article id and datetime
  const id = `${req.body.page.id}-${Date.now()}`;
  const shortId = id.substring(0, 8);
  query = `mutation CreateHighlight {
    createHighlight(
      input: {id: "${id}", shortId: "${id}", articleId: "${req.body.page.id}", annotation: "GPT SUMMARY: ${articleSummary}", type: NOTE}
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
    res.status(200).send(response.data);
  } catch (error) {
    res.status(500).send(`Error: ${error.message}`);
  }
};
