# Alerts: keyless Google sign-in (one-time setup)

The alert sender never holds a Google key file. Vercel gives each call a short-lived identity token; Google trusts it
and lets the call act as the Firebase service account only to send notifications. Done once, in Google Cloud Shell
(console.cloud.google.com, project `sw-bowls`, the `>_` button at the top right).

Replace nothing below except where it says CHANGE. `PROJECT_NUMBER` is looked up for you.

```sh
gcloud config set project sw-bowls
PROJECT_NUMBER=$(gcloud projects describe sw-bowls --format='value(projectNumber)')
echo "project number: $PROJECT_NUMBER"

gcloud services enable iamcredentials.googleapis.com sts.googleapis.com fcm.googleapis.com

# 1. A pool that trusts Vercel for this one project (CHANGE the team slug if yours is not giulia-gallos-projects)
TEAM=giulia-gallos-projects
gcloud iam workload-identity-pools create vercel --location=global --display-name="Vercel"
gcloud iam workload-identity-pools providers create-oidc vercel \
  --location=global --workload-identity-pool=vercel \
  --issuer-uri="https://oidc.vercel.com/$TEAM" \
  --allowed-audiences="https://vercel.com/$TEAM" \
  --attribute-mapping="google.subject=assertion.sub" \
  --attribute-condition="assertion.sub == 'owner:$TEAM:project:swd-google-calendar:environment:production'"

# 2. Let that Vercel project act as the Firebase service account (find its address first)
gcloud iam service-accounts list --format='value(email)'
SA=firebase-adminsdk-XXXXX@sw-bowls.iam.gserviceaccount.com   # CHANGE to the firebase-adminsdk address printed above
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --role=roles/iam.workloadIdentityUser \
  --member="principal://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/vercel/subject/owner:$TEAM:project:swd-google-calendar:environment:production"
```

Then add these Vercel environment variables (plain "Config" values, none is secret):
`GCP_PROJECT_NUMBER` (printed above), `GCP_WIF_POOL=vercel`, `GCP_WIF_PROVIDER=vercel`, `GCP_SERVICE_ACCOUNT_EMAIL` (the SA address).
In the Vercel project, Settings > Security > "Secure backend access with OIDC federation" must be on, in Team mode.

If the pool commands are refused by an organization policy, the message names the policy; tell the webmaster.
