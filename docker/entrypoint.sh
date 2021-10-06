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

echo "Starting localstripe for setting webhooks"
localstripe --from-scratch --port "$PORT" &

echo "Setting webhook $WEBHOOK_URL"
# shellcheck disable=SC2034
for i in {1..100} ; do
  sleep 0.2
  ! curl -s -o/dev/null "localhost:${PORT}/_config/webhooks/webhook" \
    -d "url=$WEBHOOK_URL" \
    -d "secret=$WEBHOOK_SIGNING_SECRET" \
    -d 'events[]=payment_intent.succeeded' \
    -d 'events[]=payment_intent.payment_failed' \
    -d 'events[]=payment_method.updated' \
    -d 'events[]=payment_method.card_automatically_updated' \
    -d 'events[]=payment_method.detached' \
    || break
done

echo "Setting connect webhook $CONNECT_WEBHOOK_URL"
curl -s -o/dev/null "localhost:${PORT}/_config/webhooks/connect-webhook" \
  -d "url=$CONNECT_WEBHOOK_URL" \
  -d "secret=$CONNECT_WEBHOOK_SIGNING_SECRET" \
  -d 'events[]=payment_intent.succeeded' \
  -d 'events[]=payment_intent.payment_failed'

echo "Restarting localstripe"
pgrep localstripe | xargs kill
exec localstripe --port "$PORT"
