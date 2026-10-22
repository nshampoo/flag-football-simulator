import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

/**
 * Flag Football Simulator: a static app. Every sim, including the best-setup search, runs in the
 * browser.
 *
 *   CloudFront (HTTPS) ──> site bucket (private) ── the app, uploaded from app/dist by `cdk deploy`
 *
 * shampoe.com serves this distribution at /flag/app/ (see the `apps` list in that repo's
 * infra/bin/infra.ts).
 */
export class SiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const site = new s3.Bucket(this, 'Site', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // public access goes through CloudFront only
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true, // the app is rebuilt from app/
    });

    const distribution = new cloudfront.Distribution(this, 'Cdn', {
      comment: 'Flag Football Simulator',
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(site),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // North America + Europe edges: cheapest tier
    });

    new s3deploy.BucketDeployment(this, 'Deploy', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../app/dist'))],
      destinationBucket: site,
      // shampoe.com's proxy behavior doesn't cache files without Cache-Control, so set it here.
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=300')],
      distribution,
      distributionPaths: ['/*'],
    });

    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, 'CloudFrontDomain', { value: distribution.distributionDomainName });
  }
}
