# Amazon Translate を使って自作音声翻訳サイトを作る

こんにちは！ [**株式会社スタートアップテクノロジー**](https://startup-technology.com/) テックリード、 [**AWS Serverless HERO**](https://aws.amazon.com/developer/community/heroes/hidetoshi-matsui/) の松井です！

突然ですが、ビジネスや旅行などで突然外国語でコミュニケーションを取らなければならなくなり、困ったことはありませんか？
そんな問題を解決するために、今回は [**Amazon Translate**](https://aws.amazon.com/jp/translate/) を使ってお手軽に **自作音声翻訳サイトを作る** 方法をご紹介します！

## 必要要件

- 下記サービスの有効なアカウント
  - **AWS**
  - **GitHub**
- **AWS CDK** の動作環境
  - バージョン: 2.79.1
- 数十〜数百円程度の AWS 利用料

## 注意事項
- 今回のハンズオンで構築する Web API はインターネットにオープンになります。実際にアプリケーションに組み込む際などは、意図的にオープンにする目的がない限り Amazon Cognito や AWS Amplify などを組み合わせる、または自前の認証機能を構築するなどして、トークン検証等の仕組みをセットにして使用することを推奨します。
- 同じくオープンな Web API である性質上、公開したままにしておくと第三者による利用等により思わぬ高額請求が発生する可能性があります。動作確認後はできるだけ速やかに API を削除することを推奨します。

## Amazon Translate とは？

[**公式ページ**](https://aws.amazon.com/jp/translate/)にもあるとおり、 **AWS が提供する深層学習モデルを使用して、従来の統計ベースやルールベースの翻訳アルゴリズムよりも正確で自然な翻訳を提供する言語翻訳自動化のサービス** です。  
AWS マネジメントコンソールからサービスを利用できる他、 [**AWS SDK**](https://aws.amazon.com/jp/developer/tools/) を通してプログラムから呼び出すことで、自前のアプリケーションに簡単に翻訳機能を組み込むこともできます。

## アーキテクチャ

![Voice Translate Architecture](https://github.com/matsuihidetoshi/translate-function/assets/38583473/ad4b8cd1-efa4-4f1e-9bd2-4c3f3a02fbdb)

### 動作フロー

1. **AWS Amplify Console** でホスティングした翻訳インターフェースとなる静的 Web ページ（以下、翻訳ページと呼ぶ）に、Web ブラウザからアクセスします。
2. 翻訳ページの設定画面で翻訳元と翻訳先の言語を選択します。
3. 翻訳ページで翻訳元に設定した言語で話すと、ブラウザの [**SpeechRecognition**](https://developer.mozilla.org/ja/docs/Web/API/SpeechRecognition) API で話した内容が文字起こしされます。
4. 文字起こししたテキストと翻訳元と翻訳先の言語コードを、 **Amazon API Gateway** 経由で **AWS Lambda** 関数に送信します。
5. Lambda 関数は受け取ったパラメータから、 **Amazon Translate** を使って翻訳し、翻訳ページに結果を返します。
6. Web ブラウザが結果を受け取り、翻訳結果を表示します。

この3~6の動作を、 SpeechRecognition API の `continuous` パラメータを `true` とすることで繰り返し実行するため、短い文章ごとに区切って話せば、続けて喋りながらリアルタイムに翻訳結果を受け取ることができます。

## 構築手順

### 0. 環境セットアップ

**AWS CDK(Cloud Development Kit)** が動作する環境を構築しましょう。  
すでにお手元に CDK が動作する環境がある場合は必要ありませんが、 [**AWS Cloud9**](https://aws.amazon.com/jp/cloud9) を使ってローカル環境に依存しないハンズオン環境を構築していただくことも可能です。  
その場合、 [**こちらの記事**](https://aws.amazon.com/jp/builders-flash/202202/ivs-display-viewer-command/?awsf.filter-name=*all#03) を参考にしていただくとスムーズかと思います。  
同記事にて **ディスクサイズ拡張** の方法も記載しておりますので、こちらも忘れず実施しましょう。

### 1. API の構築

まずは、今回の機能の根幹になる Web API を構築していきます。  
併せて、ソースコードも解説していきます。

***

- 下記コマンドを実行し、リポジトリをクローンします。

    ```bash
    git clone git@github.com:matsuihidetoshi/ivs-viewers-count-cdk.git
    ```

***

- Web API リソース構築スクリプトの、 `lib/translate-function-stack.ts` から解説していきます。

  ```typescript
  import { Stack, StackProps, Duration } from 'aws-cdk-lib'
  import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
  import { RestApi, Model, JsonSchemaType, Cors } from 'aws-cdk-lib/aws-apigateway'
  import { LambdaIntegration } from 'aws-cdk-lib/aws-apigateway'
  import { Runtime } from 'aws-cdk-lib/aws-lambda'
  import { Construct } from 'constructs'
  import { PolicyStatement } from 'aws-cdk-lib/aws-iam'

  export class TranslateFunctionStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
      super(scope, id, props)

      // ① Lambda 関数の作成
      const translateFunction = new NodejsFunction(this, 'translate-function', {
        runtime: Runtime.NODEJS_18_X,
        functionName: 'translateFunction',
        entry: 'src/translate-function.handler.ts',
        timeout: Duration.seconds(60),
        logRetention: 30,
      })

      // ② Amazon Translate を操作するためのポリシーをアタッチ
      translateFunction.addToRolePolicy(
        new PolicyStatement({
          resources: ['*'],
          actions: ['translate:TranslateText'],
        })
      )

      // ③ API Gateway の REST API を作成
      const restApi = new RestApi(this, 'translate-function-rest-api', {
        restApiName: 'RestApiForTranslateFunction',
        deployOptions: {
          stageName: 'v1',
        },
      })

      // ④ リソースの追加と CORS の設定
      const restApiTranslateResource = restApi.root.addResource('translate', {
        defaultCorsPreflightOptions: {
          allowOrigins: Cors.ALL_ORIGINS,
          allowMethods: Cors.ALL_METHODS,
          allowHeaders: Cors.DEFAULT_HEADERS,
          statusCode: 200,
        },
      })

      // ⑤リクエストパラメータのモデルの作成
      const translateModel: Model = restApi.addModel('translateModel', {
        schema: {
          type: JsonSchemaType.OBJECT,
          properties: {
            text: {
              type: JsonSchemaType.STRING,
            },
            translateFrom: {
              type: JsonSchemaType.STRING,
            },
            translateTo: {
              type: JsonSchemaType.STRING,
            },
          },
          required: ['text', 'translateFrom', 'translateTo'],
        },
      })

      // ⑥ REST API と Lambda 関数の統合
      restApiTranslateResource.addMethod('POST', new LambdaIntegration(translateFunction), {
        requestModels: { 'application/json': translateModel },
      })
    }
  }
  ```

  - ①で、 Lambda 関数を作成しています。
    - `NodejsFunction` クラスを使用して、 Lambda の関数コード `src/ivs-viewers-count-function.handler.ts` を `entry` に指定しています。これにより、 TypeScript のコードをデプロイ時に自動的にトランスパイルしてくれます。
  - ②で、 Amazon Translate を操作するためのポリシーをアタッチしています。
  - ③で、 Lambda 関数を外部からのリクエストをトリガーに呼び出すための REST API を作成しています。
  - ④で、 `/translate` というパスのリソースの追加と CORS の設定をしています。
    - CORS の設定をしないと、後に構築する Web ページ側からのリクエストに失敗します。
    - 今回はデモのため全ての Origin からのリクエストを許可していますが実際にアプリケーションに組み込む場合は必要に応じて Origin を制限するようにしましょう。
  - ⑤で、リクエストパラメータのモデルを作成しています。
    - ここでの `text`, `translateFrom`, `translateTo` といったプロパティが、 Web API リクエスト時の POST メソッドのパラメータと対応します。
  - ⑥で、 REST API と Lambda 関数を統合しています。
    - 翻訳文字数が多くなる可能性もあるので、文字数制限の厳しい GET メソッドではなく POST メソッドを受け付けるようにしています。

- 続いて、 Lambda 関数コード `src/translate-function.handler.ts` を解説していきます。

  ```typescript
  import { Translate } from 'aws-sdk'
  import { APIGatewayProxyEvent } from 'aws-lambda'

  const translate = new Translate()

  export const handler = async (event: APIGatewayProxyEvent) => {
    try {

      // ①リクエストパラメータの受け取りと翻訳パラメータの組み立て
      const requestBody = JSON.parse(event.body || '{"text": "", "translateFrom": "", "translateTo": ""}') as {
        text: string
        translateFrom: string
        translateTo: string
      }
      const Text = requestBody.text
      const SourceLanguageCode = requestBody.translateFrom
      const TargetLanguageCode = requestBody.translateTo

      const translateParams = {
        Text,
        SourceLanguageCode,
        TargetLanguageCode,
      }

      // ②翻訳
      const translatedText = await translate.translateText(translateParams).promise()

      // ③クライアントへレスポンス
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
  ```

  - ①で、 REST API から受け取ったパラメータを使用して、 Amazon Translate に渡すパラメータを組み立てています。
  - ②で、実際に Amazon Translate で翻訳しています。
  - ③で、翻訳ページにレスポンスします。

- 実際に Web API をデプロイします。

  ```bash
  cdk bootstrap #AWS アカウント内で一度も CDK を使用していない場合、実行します。
  cdk deploy
  ```

- デプロイが成功したら下記のように出力されるので、 `=` に続く REST API のエンドポイントを控えます（後から AWS マネジメントコンソールで確認することもできます）。

  ```bash
  Outputs:
  TranslateFunctionStack.translatefunctionrestapiEndpoint******** = https://**********.execute-api.ap-northeast-1.amazonaws.com/v1/
  ```

