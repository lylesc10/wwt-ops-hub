#!/usr/bin/env bash
#
# Deploy wwt-ops-hub to Azure Container Apps.
#
# Builds the image in the cloud with Azure Container Registry (no local Docker
# needed), then creates/updates a Container App. Server-side credentials are
# stored as Container App *secrets*; VITE_* values are passed as Docker build
# args because they are baked into the browser bundle at build time.
#
# Usage:
#   ./deploy-azure.sh                  # reads values from ./.env
#   ENV_FILE=.env.prod ./deploy-azure.sh
#
# Prereqs:
#   az login
#   az extension add --name containerapp --upgrade
#   az provider register --namespace Microsoft.App
#   az provider register --namespace Microsoft.OperationalInsights
set -euo pipefail

# ── Configuration (override via environment) ──────────────────────────────────
RESOURCE_GROUP="${RESOURCE_GROUP:-wwt-ops-hub-rg}"
LOCATION="${LOCATION:-eastus}"
ENVIRONMENT="${ENVIRONMENT:-wwt-ops-hub-env}"
APP_NAME="${APP_NAME:-wwt-ops-hub}"
ACR_NAME="${ACR_NAME:-wwtopshubacr}"          # must be globally unique, alphanumeric
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d%H%M%S)}"
ENV_FILE="${ENV_FILE:-.env}"

IMAGE="ops-hub:${IMAGE_TAG}"

# ── Load app secrets/config from the env file ─────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
  echo "Loading config from $ENV_FILE"
  set -a; source "$ENV_FILE"; set +a
else
  echo "WARNING: $ENV_FILE not found — relying on already-exported env vars"
fi

require() { [[ -n "${!1:-}" ]] || { echo "ERROR: $1 is required (set it in $ENV_FILE)"; exit 1; }; }
require VITE_SUPABASE_URL
require VITE_SUPABASE_ANON_KEY
require SUPABASE_SERVICE_ROLE_KEY

# ── Resource group + registry ─────────────────────────────────────────────────
echo "==> Resource group: $RESOURCE_GROUP ($LOCATION)"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

echo "==> Container registry: $ACR_NAME"
az acr show --name "$ACR_NAME" --output none 2>/dev/null || \
  az acr create --resource-group "$RESOURCE_GROUP" --name "$ACR_NAME" \
    --sku Basic --admin-enabled true --output none

# ── Build image in the cloud (passes VITE_* as build args) ────────────────────
echo "==> Building image $IMAGE in ACR"
az acr build \
  --registry "$ACR_NAME" \
  --image "$IMAGE" \
  --build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
  --build-arg VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
  --build-arg VITE_APP_ENV="${VITE_APP_ENV:-production}" \
  --build-arg VITE_FN_MOCK="${VITE_FN_MOCK:-}" \
  .

ACR_SERVER="$(az acr show --name "$ACR_NAME" --query loginServer -o tsv)"
ACR_USER="$(az acr credential show --name "$ACR_NAME" --query username -o tsv)"
ACR_PASS="$(az acr credential show --name "$ACR_NAME" --query 'passwords[0].value' -o tsv)"

# ── Container Apps environment ────────────────────────────────────────────────
echo "==> Container Apps environment: $ENVIRONMENT"
az containerapp env show --name "$ENVIRONMENT" --resource-group "$RESOURCE_GROUP" --output none 2>/dev/null || \
  az containerapp env create --name "$ENVIRONMENT" --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" --output none

# ── Assemble runtime secrets + env vars ───────────────────────────────────────
# Secret name -> source env var. Only non-empty ones are included.
declare -A SECRET_SRC=(
  [supabase-service-role-key]=SUPABASE_SERVICE_ROLE_KEY
  [smartsheet-access-token]=SMARTSHEET_ACCESS_TOKEN
  [fn-client-id]=FN_CLIENT_ID
  [fn-client-secret]=FN_CLIENT_SECRET
  [fn-username]=FN_USERNAME
  [fn-password]=FN_PASSWORD
  [twilio-account-sid]=TWILIO_ACCOUNT_SID
  [twilio-auth-token]=TWILIO_AUTH_TOKEN
  [anthropic-api-key]=ANTHROPIC_API_KEY
)

SECRETS=()
ENVS=( "VITE_SUPABASE_URL=$VITE_SUPABASE_URL" "FN_BASE_URL=${FN_BASE_URL:-https://api.fieldnation.com}" )
[[ -n "${ALLOWED_ORIGINS:-}" ]] && ENVS+=( "ALLOWED_ORIGINS=$ALLOWED_ORIGINS" )

for secret in "${!SECRET_SRC[@]}"; do
  var="${SECRET_SRC[$secret]}"
  val="${!var:-}"
  [[ -z "$val" ]] && continue
  SECRETS+=( "${secret}=${val}" )
  # map the secret back to the env var name the handlers read
  ENVS+=( "${var}=secretref:${secret}" )
done

# ── Create or update the container app ────────────────────────────────────────
if az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --output none 2>/dev/null; then
  echo "==> Updating existing app: $APP_NAME"
  az containerapp secret set --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
    --secrets "${SECRETS[@]}" --output none
  az containerapp registry set --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
    --server "$ACR_SERVER" --username "$ACR_USER" --password "$ACR_PASS" --output none
  az containerapp update --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
    --image "$ACR_SERVER/$IMAGE" \
    --set-env-vars "${ENVS[@]}" --output none
else
  echo "==> Creating app: $APP_NAME"
  az containerapp create --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
    --environment "$ENVIRONMENT" \
    --image "$ACR_SERVER/$IMAGE" \
    --registry-server "$ACR_SERVER" --registry-username "$ACR_USER" --registry-password "$ACR_PASS" \
    --target-port 8080 --ingress external \
    --min-replicas 1 --max-replicas 3 \
    --secrets "${SECRETS[@]}" \
    --env-vars "${ENVS[@]}" --output none
fi

FQDN="$(az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
  --query properties.configuration.ingress.fqdn -o tsv)"
echo ""
echo "✅ Deployed: https://$FQDN"
echo "   Add this URL to ALLOWED_ORIGINS and to Supabase Auth redirect URLs."
