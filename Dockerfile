FROM python:3

COPY . /app

RUN cd /app && \
  rm dist/localstripe-*.tar.gz && \
  python setup.py sdist && \
  pip install dist/localstripe-*.tar.gz && \
  rm -rf /app

CMD ["localstripe"]
