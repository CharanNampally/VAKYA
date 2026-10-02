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
