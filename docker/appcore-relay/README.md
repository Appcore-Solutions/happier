# Appcore relay

Runs this fork's relay (server and web app, with message senders, display names and Friends on by default) on a VPS, behind Caddy for automatic HTTPS. Friends open the web address and sign up; no install is required.

## What you need first

- A VPS with Docker and the Docker Compose plugin.
- A domain (or subdomain) whose DNS `A`/`AAAA` record points at the VPS.
- Ports 80 and 443 open to the internet. Caddy uses them to obtain the certificate.
- Access to the image. The **Fork relay image** workflow publishes `ghcr.io/appcore-solutions/happier-relay` on every push to `dev`. Either make that package public (GitHub → organization **Packages** → `happier-relay` → **Package settings** → **Change visibility**), or run `docker login ghcr.io` on the VPS with a token that has `read:packages`.

## Start it

1. Copy this folder to the VPS.
2. Next to `compose.yaml`, create a file named `.env` containing:

   ```
   HAPPIER_DOMAIN=happier.example.com
   HAPPIER_RELAY_TAG=dev
   ```

   `dev` follows every push to the fork's `dev` branch. To stay on one build, use a `sha-<commit>` tag from the workflow summary.
3. Run `docker compose up -d`, then follow startup with `docker compose logs -f relay`.
4. Open `https://<your domain>`, create an account, and pick a username. Each friend does the same, then you add each other under Friends.

## Update

After a new image is published:

```
docker compose pull && docker compose up -d
```

The relay applies its database migrations on start.

## Back up

All relay data (SQLite database and files) lives in the `relay-data` volume. Back it up before updating, for example:

```
docker compose stop relay
docker run --rm -v appcore-relay_relay-data:/data -v "$PWD":/backup alpine tar czf /backup/relay-data.tgz -C /data .
docker compose start relay
```

The volume name is prefixed with the folder name; check it with `docker volume ls`.

## Windows desktop app (optional)

Run the **Fork Windows desktop installer** workflow from the fork's **Actions** tab, entering `https://<your domain>` as the relay address. Download the installer from the run's artifacts. It installs as **Happier (Appcore)** alongside any official Happier app and never updates itself to an official release. It is unsigned, so Windows SmartScreen shows a warning on first launch (**More info → Run anyway**).
