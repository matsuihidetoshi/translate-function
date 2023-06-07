import { Stack, StackProps, aws_apigateway, Duration } from 'aws-cdk-lib'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { LambdaIntegration } from 'aws-cdk-lib/aws-apigateway'
import { Runtime } from 'aws-cdk-lib/aws-lambda'
import { Construct } from 'constructs'

export class TranslateFunctionStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const translateFunction = new NodejsFunction(scope, 'translate-function', {
      runtime: Runtime.NODEJS_18_X,
      functionName: 'translateFunction',
      entry: 'src/translate-function.handler.ts',
      timeout: Duration.seconds(60),
      logRetention: 30,
    })

    const restApi = new aws_apigateway.RestApi(this, 'translate-function-rest-api', {
      restApiName: 'RestApiForTranslateFunction',
      deployOptions: {
        stageName: 'v1',
      },
    })

    const restApiTranslateResource = restApi.root.addResource('translate')

    restApiTranslateResource.addMethod('GET', new LambdaIntegration(translateFunction))
  }
}
