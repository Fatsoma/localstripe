#!/bin/bash

set -e

get_data() {
  python -c "import json; import sys; print(json.load(sys.stdin)['data']['$1'])"
}

PORT=${PORT:-8420}
if ! echo "$PORT" | grep -q '^[0-9]\+$' ; then
  echo "Unexpected value for PORT: ${PORT}"
  exit 1
fi

if [ -z "$WEBHOOK_URL" ] ||
  [ -z "$CONNECT_WEBHOOK_URL" ] ||
  [ -z "$WEBHOOK_SIGNING_SECRET" ] ||
  [ -z "$CONNECT_WEBHOOK_SIGNING_SECRET" ]
then
  if [ -z "$ENVIRONMENT" ]; then
    echo 'Missing ENVIRONMENT env variable'
    exit 1
  fi

  vaultCmd=/usr/local/bin/vault

  VAULT_SECRETS=
  [ -n "$VAULT_ADDR" ] || export VAULT_ADDR=$VAULT_ADDRESS
  if [ -n "$VAULT_ADDR" ]; then
    token=$("$vaultCmd" login -token-only -method=aws role="$VAULT_ROLE") && \
      VAULT_SECRETS=$(VAULT_TOKEN="$token" "$vaultCmd" kv get -format=json "secret/fatsoma/${ENVIRONMENT}/api/payment")
    if [ -z "$WEBHOOK_URL" ]; then
      WEBHOOK_URL=$(echo "$VAULT_SECRETS" | get_data 'stripe_webhook_url')
    fi
    if [ -z "$CONNECT_WEBHOOK_URL" ]; then
      CONNECT_WEBHOOK_URL=$(echo "$VAULT_SECRETS" | get_data 'stripe_connect_webhook_url')
    fi
    if [ -z "$WEBHOOK_SIGNING_SECRET" ]; then
      WEBHOOK_SIGNING_SECRET=$(echo "$VAULT_SECRETS" | get_data 'stripe_webhook_signing_secret')
    fi
    if [ -z "$CONNECT_WEBHOOK_SIGNING_SECRET" ]; then
      CONNECT_WEBHOOK_SIGNING_SECRET=$(echo "$VAULT_SECRETS" | get_data 'stripe_connect_webhook_signing_secret')
    fi
  fi
fi

echo "Starting localstripe"
exec localstripe --port "$PORT" --from-scratch --no-save --config <<JSON
{
  "WebhookEndpoints": {
    "webhook": {
      "url": "$WEBHOOK_URL",
      "secret": "$WEBHOOK_SIGNING_SECRET",
      "events": [
        "payment_intent.succeeded",
        "payment_intent.payment_failed",
        "payment_method.updated",
        "payment_method.card_automatically_updated",
        "payment_method.detached"
      ]
    },
    "connect-webhook": {
      "url": "$CONNECT_WEBHOOK_URL",
      "secret": "$CONNECT_WEBHOOK_SIGNING_SECRET",
      "events": [
        "payment_intent.succeeded",
        "payment_intent.payment_failed"
      ]
    }
  }
}
JSON
