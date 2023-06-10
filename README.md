# Amazon Translate を使って自作音声翻訳サイトを作る

こんにちは！ [**株式会社スタートアップテクノロジー**](https://startup-technology.com/) テックリード、 [**AWS Serverless HERO**](https://aws.amazon.com/developer/community/heroes/hidetoshi-matsui/) の松井です！

突然ですが、ビジネスや旅行などで急に外国語でコミュニケーションを取らなければならなくなり、困ったことはありませんか？
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

***

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

***

- 実際に Web API をデプロイします。

  ```bash
  cdk bootstrap #AWS アカウント内で一度も CDK を使用していない場合、実行します。
  cdk deploy
  ```

***

- 下記の通り質問されるので、 `y` を入力して `Enter` を押下してください。

    ```bash
    Do you wish to deploy these changes (y/n)? y
    ```

***

- デプロイが成功したら下記のように出力されるので、 `=` に続く REST API のエンドポイントを控えます（後から AWS マネジメントコンソールで確認することもできます）。

  ```bash
  Outputs:
  TranslateFunctionStack.translatefunctionrestapiEndpoint******** = https://**********.execute-api.ap-northeast-1.amazonaws.com/v1/
  ```

***

### 2. 翻訳ページの作成

続いて、翻訳ページを作成していきます。  
こちらもソースコードの解説も併せてしていきます。

***

- 下記コマンドを実行し、リポジトリをクローンします。

    ```bash
    git clone git@github.com:matsuihidetoshi/voice-transcript.git
    ```

***

- ソースコードを解説します。

  ```html
  <!DOCTYPE html>
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Voice Translate</title>
    </head>
    <body>
      <div id="setting">
        <h1>Voice Translate</h1>
        <h2>Choose languages and press "Start translation".</h2>
        <label for="translate-from">Translate from:</label>
        <!-- ①翻訳元、翻訳先言語の選択 -->
        <select id="translate-from">
          <option value="ar,ar-SA">Arabic</option>
          <!-- 省略 -->
          <option value="tr,tr-TR">Turkish</option>
        </select>
        <br>
        <label for="translate-to">Translate to:</label>
        <select id="translate-to">
          <option value="ar,ar-SA">Arabic</option>
          <!-- 省略 -->
          <option value="tr,tr-TR">Turkish</option>
        </select>
        <br>
        <button id="start-translation">Start translation</button>
      </div>
      <div id="translate" style="display: none;">
        <h3>Speak!</h3>
        <p>translation:</p>
        <!-- ②翻訳結果の表示 -->
        <h1 id="translate-display"></h1>
        <button id="restart">Restart</button>
      </div>
    </body>
  </html>
  <script>
    SpeechRecognition = webkitSpeechRecognition || SpeechRecognition
    const transcriptDisplay = document.getElementById('translate-display')
    const recognition = new SpeechRecognition()

    // ③翻訳開始ボタンをクリックして、文字起こししてから翻訳リクエストを送信
    document.getElementById('start-translation').onclick = () => {
      const settingElement = document.getElementById('setting')
      const translateElement = document.getElementById('translate')
      const sourceLangElement = document.getElementById('translate-from')
      const sourceLang = sourceLangElement.options[sourceLangElement.selectedIndex].value.split(',')[1]

      settingElement.style = 'display: none;'
      translateElement.style = ''

      startTranslation(sourceLang)
    }

    document.getElementById('restart').onclick = () => {
      location.reload()
    }

    // ④文字起こしと翻訳処理を実行する関数
    const startTranslation = (sourceLang) => {
      let index = 0
      recognition.continuous = true
      recognition.lang = sourceLang

      recognition.onresult = (event) => {
        getTranslatedText(
          event.results[index][0].transcript,
        ).then((response) => {
          transcriptDisplay.innerHTML = response.translatedText.TranslatedText
        })
        index ++
      }

      recognition.start()
    }

    // ⑤翻訳をリクエストする関数
    const getTranslatedText = async (text) => {
      const translateFromElement = document.getElementById('translate-from')
      const translateToElement = document.getElementById('translate-to')
      const translateFrom = translateFromElement.options[translateFromElement.selectedIndex].value.split(',')[0]
      const translateTo = translateToElement.options[translateToElement.selectedIndex].value.split(',')[0]

      // ⑥翻訳 API へのリクエスト（ここに REST API のエンドポイントを記述）
      const response = await fetch('https://**********.execute-api.ap-northeast-1.amazonaws.com/v1/translate', {
        method: 'POST',
        mode: 'cors',
        cache: 'no-cache',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          translateFrom,
          translateTo,
        })
      })
      return response.json()
    }
  </script>
  ```

  - ①で、翻訳元、翻訳先の言語を選択するプルダウンを作成しています。
    - SpeechRecognition API は `ar-SA` のような形式で言語コードを受け付ける一方で、 Amazon Translate は `ar` のような形式と `ar-SA` のような形式が混在した形で言語コードを受け取るので、今回は `value` 属性に `ar,ar-SA` のようなカンマ区切りの形式でそれぞれの言語コードを記述しています。
  - ②の箇所に翻訳結果が表示されます。
  - ③で、ボタンの押下と共に文字起こしと翻訳がスタートします。
    - プルダウンで選択した翻訳元の言語コードを受け取って SpeechRecognition API に文字起こしする言語を渡しています。
    - 設定画面と翻訳画面の表示切り替えも行なっています。
  - ④で、文字起こしをトリガーにして逐次翻訳 API にリクエストを送信しています。
  - ⑤で、実際に翻訳 API にリクエストを送信しています。
    - `option` 要素の `value` 属性の形式が先ほどの①の通りの形式になっているので `,` で分割して取得したものを API にリクエストするパラメータに含めています。
  - ⑥で翻訳 API にリクエストを送信しますが、ここに先ほど **1. API の構築** の一番最後に控えた API のエンドポイントを記述します。

***

- 解説にもあった通り、ソースコード上の REST API エンドポイントを書き換えます。
  - Before: `https://**********.execute-api.ap-northeast-1.amazonaws.com/v1/translate`
  - After: `[実際に控えた API エンドポイント]translate`

***

- 新しいリポジトリを作成します。
  - [**こちら**](https://docs.github.com/ja/repositories/creating-and-managing-repositories/creating-a-new-repository) の手順に従って新たなリポジトリを作成しましょう。

***

- 変更をコミットして新しいリポジトリにソースコードを push します。

  ```bash
  git add .
  git commit -m 'Set REST API endpoint'
  git remote set-url origin [新しいリポジトリのURL]
  git push origin main
  ```

### 3. 翻訳ページのデプロイ

今回はフレームワークやライブラリを使用しない非常にシンプルな HTML + JavaScript の単一ファイルの Web ページですが、こちらを AWS Amplify を使ってホスティングします。

***

- AWS マネジメントコンソールにログインします。

***

- **AWS Amplify** を選択します。

  ![スクリーンショット 2023-06-08 17 18 33](https://github.com/matsuihidetoshi/translate-function/assets/38583473/5d10f31e-aa84-4e97-9bde-c7978c633c17)

***

- **使用を開始する** をクリックします。

  ![スクリーンショット 2023-06-08 17 22 33](https://github.com/matsuihidetoshi/translate-function/assets/38583473/9aaeea84-6f07-492f-af41-159fb7766e38)

***

- 再度 **Amplify ホスティング** の **使用を開始する** をクリックします。

  ![スクリーンショット 2023-06-08 17 24 30](https://github.com/matsuihidetoshi/translate-function/assets/38583473/d1a35eab-e707-4ecd-9d9f-ad6092279edd)

***

- **GitHub** を選択し **続行** をクリックします。

  ![スクリーンショット 2023-06-08 17 26 04](https://github.com/matsuihidetoshi/translate-function/assets/38583473/83cfb1d4-b51a-40f2-a16b-efa1d73c44c9)

***

- このような画面が表示された場合、 **Authorize AWS Amplify** をクリックします。

  ![スクリーンショット 2023-06-08 17 28 16](https://github.com/matsuihidetoshi/translate-function/assets/38583473/66db21f9-24e1-495d-9f16-9874fd19210e)

***

- 自分の個人の GitHub アカウントをクリックします。

  ![スクリーンショット 2023-06-08 17 30 16](https://github.com/matsuihidetoshi/translate-function/assets/38583473/5768ddd5-efa1-424a-ba2e-64735152306c)

***

- **Only select repositories** を選択し、自分のリポジトリに push した先ほどの `voice-transcript` を選択し、 **Install & Authorize** をクリックします。

  ![スクリーンショット 2023-06-08 17 31 22](https://github.com/matsuihidetoshi/translate-function/assets/38583473/3da51d31-f0e5-4072-935c-192bb8d02e02)

***

- 先ほど選択したリポジトリをここでも選択し、他はそのままで **次へ** をクリックします。

  ![スクリーンショット 2023-06-08 17 37 23](https://github.com/matsuihidetoshi/translate-function/assets/38583473/e98b8656-f875-43df-af61-ae5dabc0fc17)

***

- **AWS Amplify がプロジェクトルートディレクトリでホストされているすべてのファイルを自動的にデプロイすることを許可** をチェックし、 **次へ** をクリックします。

  ![スクリーンショット 2023-06-08 17 39 42](https://github.com/matsuihidetoshi/translate-function/assets/38583473/ba08fb11-1cd2-485d-92f8-4b816ea30bc7)

***

- **保存してデプロイ** をクリックします。

  ![スクリーンショット 2023-06-08 17 40 38](https://github.com/matsuihidetoshi/translate-function/assets/38583473/5ee9953d-c158-4a35-b8eb-d67c6a9ae067)

***

- デプロイフローが開始されるので、 **デプロイ** のフェーズが完了するまで待ってから、アプリケーションのURLをクリックします。

  ![スクリーンショット 2023-06-08 17 41 29](https://github.com/matsuihidetoshi/translate-function/assets/38583473/d1d1b959-a196-496c-80d3-72e1c9ea3bb7)

***

- 下記のような画面が表示されれば成功です！

  ![スクリーンショット 2023-06-08 17 48 13](https://github.com/matsuihidetoshi/translate-function/assets/38583473/12e52c2f-aedc-4d7f-9a3b-a2a2f257ed4d)

### 4. 動作確認

実際に動作確認してみましょう！

***

- **Translate from(翻訳元の言語)** と **Translate to(翻訳先の言語)** を選択し、 **Start translation** をクリックします。

  ![スクリーンショット 2023-06-08 17 49 59](https://github.com/matsuihidetoshi/translate-function/assets/38583473/92e6f891-8bb4-4ad1-8fec-caf141c5d483)

***

- 翻訳元として選択した言語で話してみて、翻訳が出てきたら成功です！

  ![スクリーンショット 2023-06-08 17 54 19](https://github.com/matsuihidetoshi/translate-function/assets/38583473/ea3a1ed7-df66-4ee0-90c4-02915cb255b8)

### 5. 構成の削除

そのまま残していただいても構いませんが、冒頭の注意事項の通り思わぬ請求が発生する可能性もありますので、削除手順を記載します。

***

- 先ほどの Amplify ホスティングのページにて、 **アクション** > **アプリの削除** を選択します。

  ![スクリーンショット 2023-06-08 18 02 36](https://github.com/matsuihidetoshi/translate-function/assets/38583473/84220d16-0b90-48f3-ac05-755f2d13d4fa)

***

- **削除** を入力して、 **削除** をクリックします。

  ![スクリーンショット 2023-06-08 18 49 09](https://github.com/matsuihidetoshi/translate-function/assets/38583473/ec2bf635-1539-482c-a654-6c34bb05c822)

***

- 最後に、 CDK で管理している Web API を削除します。

  ```bash
  cdk destroy
  ```

***

- 下記のように質問されるので、 `y` を入力して Enter を押下します。

  ```bash
  Are you sure you want to delete: TranslateFunctionStack (y/n)? y
  ```

***

これで削除も完了です！

## まとめ

いかがでしたでしょうか？  
Amazon Translate を AWS SDK で使用した私の感想ですが、思ったよりもずっと早くレスポンスが返ってきたので、色々なアプリケーションに組み込んで応用しやすそうだなと感じました！  
みなさんもぜひ活用してみてください！

Happy Coding!
