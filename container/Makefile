# dsh web container helpers.
# Defaults target this fork's GHCR namespace; override any variable on the
# command line, for example: make build REPO_URL=https://github.com/deepseek-ai/deepseek-harness.git

ORG       ?= OpScaleHub
REPO      ?= deepseek-harness
IMAGE     ?= ghcr.io/$(shell echo "$(ORG)/$(REPO)" | tr '[:upper:]' '[:lower:]')
TAG       ?= latest
REPO_URL  ?= https://github.com/$(ORG)/$(REPO).git
REPO_REF  ?= master

ROOT      := $(abspath $(dir $(lastword $(MAKEFILE_LIST)))/..)
DOCKERFILE := $(ROOT)/Containerfile

.PHONY: build build-plain build-no-cache publish run run-it stop logs prune

build: ## Build the image (what the publishing workflow pushes)
	docker build \
		--build-arg REPO_URL=$(REPO_URL) \
		--build-arg REPO_REF=$(REPO_REF) \
		--tag $(IMAGE):$(TAG) \
		--file $(DOCKERFILE) $(ROOT)

build-plain: ## Build with the full BuildKit progress log
	docker build --progress=plain \
		--build-arg REPO_URL=$(REPO_URL) \
		--build-arg REPO_REF=$(REPO_REF) \
		--tag $(IMAGE):$(TAG) \
		--file $(DOCKERFILE) $(ROOT)

build-no-cache: ## Build ignoring every cache
	docker build --no-cache \
		--build-arg REPO_URL=$(REPO_URL) \
		--build-arg REPO_REF=$(REPO_REF) \
		--tag $(IMAGE):$(TAG) \
		--file $(DOCKERFILE) $(ROOT)

publish: build ## Build and push (docker login ghcr.io first)
	docker push $(IMAGE):$(TAG)

run: ## Run detached, publishing port 3080 and persisting harness data
	docker run -d --name dsh-web -p 3080:3080 -v dsh-data:/root/.dsh $(IMAGE):$(TAG)

run-it: ## Run in the foreground with telemetry off
	docker run --rm -it -p 3080:3080 -e DSH_TELEMETRY_DISABLED=1 -v dsh-data:/root/.dsh $(IMAGE):$(TAG)

stop: ## Stop and remove the running container
	docker rm -f dsh-web 2>/dev/null || true

logs: ## Tail the running container's logs
	docker logs -f dsh-web

prune: ## Drop stopped containers and dangling builder cache
	docker container prune -f
	docker builder prune -f
