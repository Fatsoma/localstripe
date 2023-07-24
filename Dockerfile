FROM python:3

ENV VAULT_VERSION=1.3.1

RUN cd /tmp && \
  wget https://releases.hashicorp.com/vault/${VAULT_VERSION}/vault_${VAULT_VERSION}_linux_amd64.zip && \
  unzip vault_${VAULT_VERSION}_linux_amd64.zip && \
  mv vault /usr/local/bin/vault && \
  rm vault_${VAULT_VERSION}_linux_amd64.zip

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

COPY . /app

RUN cd /app && \
  rm dist/localstripe-*.tar.gz && \
  python setup.py sdist && \
  pip install dist/localstripe-*.tar.gz && \
  rm -rf /app

ENV PORT=8420
EXPOSE 8420

CMD ["/usr/local/bin/entrypoint.sh"]
