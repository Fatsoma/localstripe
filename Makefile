.PHONY: all
all: help

PROJECTNAME = localstripe
ENV ?= preview
ifeq ($(ENV),sandbox)
REGION = us-east-1
else
REGION = us-west-1
endif
LOCAL_TAG = $(ENV)-$(REGION)-localstripe:latest
ECR_TAG = 819738237059.dkr.ecr.$(REGION).amazonaws.com/$(ENV)-$(REGION)-localstripe:latest

SYSTEM = $(shell uname -s)
HOST_POST ?= 8420
HOST_NAME=host.docker.internal
RUN_ENV ?= development

## docker-login: Login to ECR repository
.PHONY: docker-login
docker-login:
	@echo "  > Logging in to ECR repository for environment $(ENV)"
	@$(shell aws ecr get-login --region $(REGION) --no-include-email)

## docker-build: Build docker image ENV=preview (default)
.PHONY: docker-build
docker-build:
	@echo "  > Building Docker image $(LOCAL_TAG)"
	@docker build -t $(LOCAL_TAG) .
	@echo "  > Build Completed"

## docker-push: Push docker image ENV=preview (default)
.PHONY: docker-push
docker-push:
	@echo "  > Tagging image: $(ECR_TAG)"
	@docker tag $(LOCAL_TAG) $(ECR_TAG)
	@echo "  > Pushing docker image: $(ECR_TAG)"
	@docker push $(ECR_TAG)
	@echo "  > Push Completed"

## docker-run: Run docker image locally RUN_ENV=development (default)
.PHONY: docker-run
ifeq ($(SYSTEM),Darwin)
docker-run:
	@echo "  > Running docker image: $(LOCAL_TAG)"
	@docker run --rm -p $(HOST_PORT):8420 --env-file .env.$(RUN_ENV) $(LOCAL_TAG)
else
HOST_IP ?= $(shell docker network inspect bridge -f "{{json (index .IPAM.Config 0).Gateway}}")
docker-run:
	@echo "  > Running docker image: $(LOCAL_TAG) with host $(HOST_NAME):$(HOST_IP)"
	@docker run --rm -p $(HOST_PORT):80 --add-host "$(HOST_NAME):$(HOST_IP)" --env-file .env.$(RUN_ENV) $(LOCAL_TAG)
endif

## docker-image: Combine docker build and push
.PHONY: docker-image
docker-image: docker-build docker-push

.PHONY: help
help: Makefile
	@echo
	@echo "Choose a command to run in: '$(PROJECTNAME)':"
	@echo
	@sed -n 's/^##//p' $< | column -t -s ':' | sed -e 's/^/ /'
	@echo
