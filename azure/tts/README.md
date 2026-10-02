# Vākya Vāgdhenu service

This container exposes Vāgdhenu Sanskrit chant synthesis through `POST /v1/speak`. It runs on the
Azure Container Apps serverless T4 profile with zero minimum replicas and one maximum replica.

The image pins Vāgdhenu, IndicF5, and BigVGAN revisions and bakes public model assets into the image
to avoid downloading weights during a cold start. The API accepts bounded Devanagari text and uses
Azure Table Storage for persistent global and per-client daily quotas.

Required environment:

- `AZURE_STORAGE_TABLE_ENDPOINT`
- `VAKYA_QUOTA_TABLE` (default `VakyaTtsQuota`)
- `VAKYA_GLOBAL_DAILY_LIMIT` (default `50`)
- `VAKYA_CLIENT_DAILY_LIMIT` (default `10`)
- `VAKYA_ALLOWED_ORIGINS`
- `VAGDHENU_NFE` (default `32`)

The service is for classical Sanskrit chant synthesis. It is not a verified conversational voice.

## Deployed Azure resources

All resources are in `rg-snampallyai`:

- Container App: `ca-vakya-tts`
- Environment: `cae-vakya-tts-ncus`
- Workload profile: `gpu-t4-consumption` (`Consumption-GPU-NC8as-T4`)
- Registry: `crvakyattsnc` (Basic)
- Quota table: `VakyaTtsQuota` in the existing `stsnampallya166177357273` account
- Endpoint: `https://ca-vakya-tts.bravemushroom-b8d00672.northcentralus.azurecontainerapps.io`
- Verified revision: `ca-vakya-tts--lean7`
- Verified image: `crvakyattsnc.azurecr.io/vagdhenu-api:20261002.7`
- Image digest: `sha256:5dcfe86b2831f4d69f5e9517080b88697bc809571acee6555004ae20d9b6438c`

The Container App uses managed identity for ACR pulls and Table Storage. It has 8 vCPU, 56 GiB,
HTTP concurrency 1, minimum replicas 0, and maximum replicas 1. Logging is disabled at the
environment level to avoid a fixed Log Analytics dependency; console/system logs remain available
through Container Apps diagnostics.

The T4 GPU is billed per second only while a replica runs. The Basic registry is the only intended
fixed-cost resource. Daily quota defaults are 50 total renders and 10 per client; both values can be
changed through Container App environment variables.

The verified endpoint is the web client's default. `EXPO_PUBLIC_TTS_API_URL` remains available as
a build-time override for a replacement deployment.
