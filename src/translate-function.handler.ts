import { Translate } from 'aws-sdk'
import { APIGatewayProxyEvent } from 'aws-lambda'

const translate = new Translate()

export const handler = async (event: APIGatewayProxyEvent) => {
  try {
    const requestBody = JSON.parse(event.body || '{"text": ""}') as { text: string }
    const textToTranslate = requestBody.text

    const translateParams = {
      Text: textToTranslate,
      SourceLanguageCode: 'ja',
      TargetLanguageCode: 'en',
    }

    const translatedText = await translate.translateText(translateParams).promise()

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
      },
      body: JSON.stringify({ translatedText }),
    }
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error }),
    }
  }
}
