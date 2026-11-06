'use strict';

/**
 * Plain-language documentation for every field of an architecture model.
 *
 * Single source for the JSON Schema descriptions (editor hover help), the
 * modelling guide and the engine's warnings, so they cannot drift apart.
 */

const COMPONENT_TYPE_DOCS = Object.freeze({
  user: 'A person who uses the system (customer, employee, administrator).',
  web_app: 'A web front end or backend-for-frontend that serves pages to browsers.',
  api: 'An API endpoint or gateway that other clients call (e.g. API Gateway, a REST service edge).',
  service: 'A long-running backend service or container (e.g. ECS, EKS pod, EC2 app).',
  function: 'A serverless function (e.g. AWS Lambda).',
  database: 'A database (e.g. RDS, Aurora, DynamoDB).',
  object_storage: 'File or object storage (e.g. S3, a container registry).',
  cache: 'An in-memory cache (e.g. ElastiCache Redis).',
  queue: 'A message queue or event bus (e.g. SQS, SNS, Kafka).',
  identity_provider: 'A sign-in service (e.g. Cognito, Auth0, Okta).',
  cdn: 'A content delivery network (e.g. CloudFront).',
  load_balancer: 'A load balancer or ingress (e.g. ALB, NLB).',
  monitoring: 'Central logging or security monitoring (e.g. CloudTrail + CloudWatch, a SIEM). Add one if you have it.',
  external_service: 'A third-party system you do not run (payment provider, SaaS, a partner or bank).',
});

/**
 * Security controls and facts a component can declare. Anything not declared
 * is treated as ABSENT, so declare every control you have.
 */
const PROPERTY_DOCS = Object.freeze({
  publicFacing: 'true if it can be reached directly from the internet (public endpoint, public bucket, public IP).',
  authentication: 'How callers prove who they are: none, basic, api_key, token, oauth or mtls.',
  authorization: 'true if every request is checked against what this caller may access (per object and per function), not just that they are signed in.',
  mfa: 'Identity providers only: true if multi-factor authentication is enforced.',
  inputValidation: 'true if all input is validated against an allow-list schema before use.',
  logging: 'true if security-relevant actions (or, for data stores, data access) are logged centrally.',
  rateLimited: 'true if requests are throttled per client.',
  encryptionAtRest: 'Data stores: true if stored data is encrypted (e.g. KMS-managed keys).',
  dataClassification: 'The most sensitive data it holds: public, internal, confidential or restricted.',
  leastPrivilege: 'true if its IAM role or service account has only the permissions it needs.',
  privileged: 'true if it runs as root or in a privileged container.',
  dependencyScanning: 'true if its build scans third-party dependencies (npm audit, Snyk, Dependabot).',
  redundancy: 'Databases, queues and caches: true if deployed across availability zones or replicated.',
  waf: 'true if a web application firewall sits in front of it.',
});

const FLOW_DOCS = Object.freeze({
  id: 'Unique id for this data flow, e.g. "f1".',
  from: 'Id of the component that sends the data.',
  to: 'Id of the component that receives the data.',
  protocol: 'e.g. https, tls, grpc, grpcs, tcp, sftp, mllp. https, tls, grpcs, mtls, wss and sftp count as encrypted.',
  encrypted: 'Override whether the channel is encrypted. Leave it out to derive it from the protocol.',
  authenticated: 'true if the receiver authenticates the sender on this flow. Defaults to false.',
  dataClassification: 'Most sensitive data on this flow: public, internal, confidential or restricted. Defaults to internal.',
  description: 'Optional note shown in tooltips and reports.',
});

const DATA_CLASSIFICATION_DOCS = Object.freeze({
  public: 'Meant to be public (marketing pages, product images).',
  internal: 'Not public, but low harm if leaked (internal ids, configuration).',
  confidential: 'Harmful if leaked (orders, customer contact details, business data).',
  restricted: 'Severe harm if leaked: credentials, payment data, health data, government ids.',
});

module.exports = { COMPONENT_TYPE_DOCS, PROPERTY_DOCS, FLOW_DOCS, DATA_CLASSIFICATION_DOCS };
