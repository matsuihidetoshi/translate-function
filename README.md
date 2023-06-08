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

