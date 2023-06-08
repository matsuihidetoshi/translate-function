# Amazon Translate を使って自作音声翻訳サイトを作る

こんにちは！ [**株式会社スタートアップテクノロジー**](https://startup-technology.com/) テックリード、 [**AWS Serverless HERO**](https://aws.amazon.com/developer/community/heroes/hidetoshi-matsui/) の松井です！

突然ですが、ビジネスや旅行などで突然外国語でコミュニケーションを取らなければならなくなり、困ったことはありませんか？
そんな問題を解決するために、今回は [**Amazon Translate**](https://aws.amazon.com/jp/translate/) を使ってお手軽に **自作音声翻訳サイトを作る** 方法をご紹介します！

## 必要要件

- 下記サービスの有効なアカウント
  - **AWS**
  - **GitHub**
- **AWS CDK**: 2.79.1
- 数十〜数百円程度の AWS 利用料

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

