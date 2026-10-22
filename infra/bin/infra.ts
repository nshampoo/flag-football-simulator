#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { SiteStack } from '../lib/site-stack';

const app = new cdk.App();

new SiteStack(app, 'FlagFootballSimSite', {
  env: { account: '404933715334', region: 'us-east-1' },
  tags: { project: 'flag-football-simulator' },
});
