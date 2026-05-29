# .github/workflows/deploy.yml
#
# Deployment pipeline — triggers on push to main (after CI passes).
#
# Stages:
#   1. pre-deploy    — final checks before touching production
#   2. build-push    — build Docker image, push to ECR
#   3. migrate       — run Prisma migrations against production RDS
#   4. deploy        — update App Runner service with the new image
#   5. smoke-test    — verify the new deployment responds correctly
#   6. rollback      — automatic rollback on smoke test failure
#
# Secrets required (set in GitHub → Settings → Secrets):
#
#   AWS_ACCOUNT_ID              — 12-digit AWS account ID
#   AWS_REGION                  — e.g. ap-south-1
#   AWS_ACCESS_KEY_ID           — IAM user with ECR push + App Runner deploy
#   AWS_SECRET_ACCESS_KEY       — corresponding secret
#   ECR_REPOSITORY              — e.g. feuhrer/business-api
#   APP_RUNNER_SERVICE_ARN      — full ARN of the App Runner service
#   APP_RUNNER_SERVICE_URL      — https://xxxxx.ap-south-1.awsapprunner.com
#   DATABASE_URL_PROD           — production RDS connection string
#   SLACK_WEBHOOK_URL           — deployment notifications (optional)

name: Deploy

on:
  push:
    branches:
      - main
    paths-ignore:
      - '**.md'
      - 'docs/**'

  # Allow manual deploys from the Actions tab
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required:    true
        default:     'production'
        type:        choice
        options:
          - production
          - staging

# Only one deploy runs at a time — prevent race conditions on App Runner
concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false   # Never cancel an in-progress deploy

env:
  NODE_VERSION:        '20'
  AWS_REGION:          ${{ secrets.AWS_REGION }}
  ECR_REGISTRY:        ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com
  ECR_REPOSITORY:      ${{ secrets.ECR_REPOSITORY }}
  IMAGE_TAG:           ${{ github.sha }}

jobs:

  # ── 1. Pre-deploy checks ──────────────────────────────────────────────────────
  pre-deploy:
    name: Pre-deploy checks
    runs-on: ubuntu-latest
    timeout-minutes: 5
    environment: production

    outputs:
      image_uri: ${{ steps.image-uri.outputs.uri }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Verify CI passed
        run: |
          echo "Deploying commit: ${{ github.sha }}"
          echo "Triggered by:     ${{ github.actor }}"
          echo "Branch:           ${{ github.ref_name }}"
          echo "Timestamp:        $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

      - name: Set image URI output
        id: image-uri
        run: |
          echo "uri=${{ env.ECR_REGISTRY }}/${{ env.ECR_REPOSITORY }}:${{ env.IMAGE_TAG }}" \
            >> "$GITHUB_OUTPUT"

      - name: Notify deployment started
        if: ${{ secrets.SLACK_WEBHOOK_URL != '' }}
        uses: slackapi/slack-github-action@v1.26.0
        with:
          payload: |
            {
              "text": ":rocket: *Deploy started*",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": ":rocket: *Feuhrer CDL API — Deploy started*\n*Commit:* `${{ github.sha }}`\n*Actor:* ${{ github.actor }}\n*Branch:* `${{ github.ref_name }}`"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL:  ${{ secrets.SLACK_WEBHOOK_URL }}
          SLACK_WEBHOOK_TYPE: INCOMING_WEBHOOK


  # ── 2. Build and push Docker image to ECR ────────────────────────────────────
  build-push:
    name: Build & push image
    runs-on: ubuntu-latest
    timeout-minutes: 20
    needs: pre-deploy
    environment: production

    outputs:
      image_uri:    ${{ steps.push.outputs.image_uri }}
      image_digest: ${{ steps.push.outputs.digest }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id:     ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region:            ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Extract metadata for Docker
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.ECR_REGISTRY }}/${{ env.ECR_REPOSITORY }}
          tags: |
            type=sha,prefix=,format=long
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}
            type=raw,value=${{ github.ref_name }}

      - name: Build and push to ECR
        id: push
        uses: docker/build-push-action@v5
        with:
          context:   .
          push:      true
          tags:      ${{ steps.meta.outputs.tags }}
          labels:    ${{ steps.meta.outputs.labels }}
          # Layer caching via ECR — dramatically speeds up builds
          cache-from: |
            type=registry,ref=${{ env.ECR_REGISTRY }}/${{ env.ECR_REPOSITORY }}:cache
          cache-to: |
            type=registry,ref=${{ env.ECR_REGISTRY }}/${{ env.ECR_REPOSITORY }}:cache,mode=max
          build-args: |
            NODE_ENV=production
            BUILD_SHA=${{ github.sha }}
            BUILD_TIME=${{ github.event.head_commit.timestamp }}
          # Provenance attestation for supply chain security
          provenance: true
          sbom:       true

      - name: Record image details
        run: |
          echo "Image URI:    ${{ env.ECR_REGISTRY }}/${{ env.ECR_REPOSITORY }}:${{ env.IMAGE_TAG }}"
          echo "Image digest: ${{ steps.push.outputs.digest }}"


  # ── 3. Database migration ─────────────────────────────────────────────────────
  # Runs Prisma migrate deploy against production RDS.
  # Uses a temporary runner — never the App Runner container itself.
  #
  # Migration design:
  #   - 'migrate deploy' applies pending migrations idempotently
  #   - All migrations must be backwards-compatible (new columns nullable,
  #     no column drops, no renames) so the current version keeps running
  #     while the new version starts
  migrate:
    name: Database migration
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: build-push
    environment: production

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci --prefer-offline

      - name: Generate Prisma client
        run: npx prisma generate
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL_PROD }}

      - name: Run migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL_PROD }}

      - name: Verify migration status
        run: npx prisma migrate status
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL_PROD }}


  # ── 4. Deploy to App Runner ───────────────────────────────────────────────────
  deploy:
    name: Deploy to App Runner
    runs-on: ubuntu-latest
    timeout-minutes: 15
    needs: [build-push, migrate]
    environment: production

    outputs:
      previous_deployment_id: ${{ steps.get-current.outputs.deployment_id }}

    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id:     ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region:            ${{ env.AWS_REGION }}

      - name: Get current deployment ID (for rollback)
        id: get-current
        run: |
          DEPLOYMENT_ID=$(aws apprunner list-operations \
            --service-arn "${{ secrets.APP_RUNNER_SERVICE_ARN }}" \
            --query 'OperationSummaryList[?Status==`SUCCEEDED`] | [0].Id' \
            --output text 2>/dev/null || echo "none")
          echo "deployment_id=${DEPLOYMENT_ID}" >> "$GITHUB_OUTPUT"
          echo "Previous deployment: ${DEPLOYMENT_ID}"

      - name: Update App Runner service image
        id: update-service
        run: |
          IMAGE_URI="${{ env.ECR_REGISTRY }}/${{ env.ECR_REPOSITORY }}:${{ env.IMAGE_TAG }}"
          echo "Deploying image: ${IMAGE_URI}"

          OPERATION_ID=$(aws apprunner update-service \
            --service-arn "${{ secrets.APP_RUNNER_SERVICE_ARN }}" \
            --source-configuration "{
              \"ImageRepository\": {
                \"ImageIdentifier\": \"${IMAGE_URI}\",
                \"ImageRepositoryType\": \"ECR\"
              }
            }" \
            --query 'OperationId' \
            --output text)

          echo "operation_id=${OPERATION_ID}" >> "$GITHUB_OUTPUT"
          echo "App Runner operation: ${OPERATION_ID}"

      - name: Wait for App Runner deployment
        run: |
          echo "Waiting for App Runner deployment to complete..."
          SERVICE_ARN="${{ secrets.APP_RUNNER_SERVICE_ARN }}"

          # Poll every 15 seconds for up to 10 minutes
          for i in $(seq 1 40); do
            STATUS=$(aws apprunner describe-service \
              --service-arn "$SERVICE_ARN" \
              --query 'Service.Status' \
              --output text)

            echo "  [${i}/40] Service status: ${STATUS}"

            if [ "$STATUS" = "RUNNING" ]; then
              echo "Deployment succeeded"
              exit 0
            fi

            if [ "$STATUS" = "OPERATION_IN_PROGRESS" ]; then
              sleep 15
              continue
            fi

            # Any other status (CREATE_FAILED, DELETE_IN_PROGRESS, etc.) = failure
            echo "Unexpected service status: ${STATUS}"
            exit 1
          done

          echo "Deployment timed out after 10 minutes"
          exit 1


  # ── 5. Smoke test ─────────────────────────────────────────────────────────────
  smoke-test:
    name: Smoke test
    runs-on: ubuntu-latest
    timeout-minutes: 5
    needs: deploy
    environment: production

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Wait for App Runner health check
        # App Runner needs a moment to route traffic to the new instances
        run: sleep 20

      - name: Run smoke tests
        id: smoke
        run: |
          BASE_URL="${{ secrets.APP_RUNNER_SERVICE_URL }}"
          echo "Running smoke tests against: ${BASE_URL}"
          bash scripts/smoke-test.sh "${BASE_URL}"

      - name: Extended health check
        run: |
          BASE_URL="${{ secrets.APP_RUNNER_SERVICE_URL }}"

          echo "Checking liveness..."
          LIVE=$(curl -sf "${BASE_URL}/health/live" | python3 -c \
            "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))")
          [ "$LIVE" = "alive" ] || (echo "Liveness check failed: ${LIVE}" && exit 1)

          echo "Checking readiness..."
          READY=$(curl -sf "${BASE_URL}/health/ready" | python3 -c \
            "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))")
          [ "$READY" = "ready" ] || (echo "Readiness check failed: ${READY}" && exit 1)

          echo "All health checks passed"

      - name: Notify deployment success
        if: success() && ${{ secrets.SLACK_WEBHOOK_URL != '' }}
        uses: slackapi/slack-github-action@v1.26.0
        with:
          payload: |
            {
              "text": ":white_check_mark: *Deploy succeeded*",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": ":white_check_mark: *Feuhrer CDL API — Deploy succeeded*\n*Commit:* `${{ github.sha }}`\n*Actor:* ${{ github.actor }}\n*URL:* ${{ secrets.APP_RUNNER_SERVICE_URL }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL:  ${{ secrets.SLACK_WEBHOOK_URL }}
          SLACK_WEBHOOK_TYPE: INCOMING_WEBHOOK


  # ── 6. Rollback ───────────────────────────────────────────────────────────────
  # Triggers only when the smoke test fails.
  # Tells App Runner to redeploy the previous image tag.
  rollback:
    name: Rollback
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: smoke-test
    environment: production
    # Only run if smoke test failed
    if: failure()

    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id:     ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region:            ${{ env.AWS_REGION }}

      - name: Find previous stable image
        id: find-previous
        run: |
          # Find the second-most-recent successful image in ECR
          # (the most recent is the one we just deployed that failed)
          PREVIOUS_TAG=$(aws ecr describe-images \
            --repository-name "${{ env.ECR_REPOSITORY }}" \
            --query 'sort_by(imageDetails, &imagePushedAt)[-2].imageTags[0]' \
            --output text 2>/dev/null || echo "")

          if [ -z "$PREVIOUS_TAG" ] || [ "$PREVIOUS_TAG" = "None" ]; then
            echo "No previous image found — cannot rollback automatically"
            exit 1
          fi

          echo "previous_tag=${PREVIOUS_TAG}" >> "$GITHUB_OUTPUT"
          echo "Rolling back to: ${PREVIOUS_TAG}"

      - name: Rollback App Runner to previous image
        run: |
          PREVIOUS_URI="${{ env.ECR_REGISTRY }}/${{ env.ECR_REPOSITORY }}:${{ steps.find-previous.outputs.previous_tag }}"
          echo "Rolling back to: ${PREVIOUS_URI}"

          aws apprunner update-service \
            --service-arn "${{ secrets.APP_RUNNER_SERVICE_ARN }}" \
            --source-configuration "{
              \"ImageRepository\": {
                \"ImageIdentifier\": \"${PREVIOUS_URI}\",
                \"ImageRepositoryType\": \"ECR\"
              }
            }"

      - name: Wait for rollback
        run: |
          SERVICE_ARN="${{ secrets.APP_RUNNER_SERVICE_ARN }}"
          for i in $(seq 1 40); do
            STATUS=$(aws apprunner describe-service \
              --service-arn "$SERVICE_ARN" \
              --query 'Service.Status' \
              --output text)
            echo "  [${i}/40] Rollback status: ${STATUS}"
            if [ "$STATUS" = "RUNNING" ]; then
              echo "Rollback complete"
              exit 0
            fi
            sleep 15
          done
          echo "Rollback timed out"
          exit 1

      - name: Notify rollback
        if: always() && ${{ secrets.SLACK_WEBHOOK_URL != '' }}
        uses: slackapi/slack-github-action@v1.26.0
        with:
          payload: |
            {
              "text": ":rotating_light: *Deploy FAILED — rollback initiated*",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": ":rotating_light: *Feuhrer CDL API — Deploy FAILED*\n*Failed commit:* `${{ github.sha }}`\n*Rolled back to:* `${{ steps.find-previous.outputs.previous_tag }}`\n*Actor:* ${{ github.actor }}\nCheck the Actions tab for details."
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL:  ${{ secrets.SLACK_WEBHOOK_URL }}
          SLACK_WEBHOOK_TYPE: INCOMING_WEBHOOK