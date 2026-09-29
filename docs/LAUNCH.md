# Beginner launch guide

The site is currently a local preview. You confirmed that c4milo.com is already registered through Domain.com. Keep that registration in your own account; no second domain purchase or registrar transfer is needed. No hosting account/server has been created or deployed by the agent. You are unsure of the hosting budget; technical comfort remains unanswered. The self-hosting route below costs $6/month before optional backups. A free managed static-host alternative is described in HOSTING_OPTIONS.md.

## Domain versus hosting

A domain is the address you register, such as `yourartist.com`, usually paid yearly. Hosting is the computer that serves your website, usually paid monthly. DNS connects the address to that computer's IP. HTTPS encrypts the connection; Caddy obtains and renews certificates automatically once DNS and ports are correct. [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)

## Self-hosting costs, rechecked September 28, 2026

For the requested self-hosting approach, a small Linux VPS with Docker and Caddy fits the current dependency-free site. Allow $6/month for the server, or $7.20/month with the optional weekly backup. The original listening backend is now disabled at your request. Technical comfort and acceptance of this recurring cost still need your answer before provisioning. If you already have a maintained VPS, reuse it.

| Item | Verified price | Billing |
| --- | --- | --- |
| DigitalOcean Basic regular VPS, 1 GiB / 1 vCPU / 25 GiB | $6/month | Monthly hosting |
| Existing Domain.com `.com` renewal | Public advertised rate $22.99/year; confirm your account invoice | Annual domain, already registered |
| DigitalOcean basic weekly backup | 20% of VPS cost, $1.20/month for $6 VPS | Optional recurring backup |
| Caddy + certificate | No software/certificate charge | Included setup |

At the advertised Domain.com renewal rate, the server plus domain renewal totals $94.99/year (about $7.92/month averaged), or $109.39/year (about $9.12/month averaged) with weekly backups. The initial domain payment is already made. Taxes, existing-account renewal terms, bandwidth overages, extra storage and paid email can change these totals. Confirm the actual renewal date/price in your Domain.com account.

Primary sources checked September 28, 2026: [DigitalOcean plan pricing](https://www.digitalocean.com/pricing/droplets), [Domain.com .com renewal table](https://www.domain.com/tlds/com), [DigitalOcean backup pricing](https://docs.digitalocean.com/products/backups/details/pricing/). A 1 GiB VPS is an estimated fit for this small site, not a measured capacity guarantee. Docker/Caddy deployment is prepared but not executed locally because Docker is not installed here.

## 1. Keep your existing domain

1. Sign into your own Domain.com account and confirm c4milo.com is listed.
2. Check its expiry, renewal price, auto-renew preference and recovery email.
3. Enable two-factor authentication if available and keep recovery details in your password manager.
4. Find its DNS editor; preserve existing email MX/TXT records when adding web records later.

Registration remains at Domain.com. Hosting is a separate service; no transfer or extra registrar purchase is required. If using another domain you have not registered, obtain it in your own registrar account and compare renewal prices before buying.

## 2. Prepare your server

Estimated first launch: 45–90 minutes for a beginner, plus DNS propagation.

1. In your own hosting account, create a small Ubuntu LTS VPS using the plan you chose. A Docker marketplace image can simplify installation; otherwise follow the [official Docker Ubuntu installation instructions](https://docs.docker.com/engine/install/ubuntu/).
2. Add your SSH public key during server creation and save the server's public IP. Never share the private key.
3. Create a provider firewall allowing TCP 80 and 443 to visitors, TCP 22 from your current public IP for SSH, and optionally UDP 443 for HTTP/3. Do not expose port 3000.
4. From your Mac, connect using `ssh root@SERVER_IP` for initial setup (replace `SERVER_IP`). Use a non-root administrative account for ongoing administration following your provider's setup guide.
5. On the server, confirm `docker --version` and `docker compose version` work.

Docker privileges can control the whole server; use only your own trusted administrative account. See [DigitalOcean's initial server setup guide](https://www.digitalocean.com/community/tutorials/initial-server-setup-with-ubuntu) for creating a non-root account and SSH access. Nothing here creates accounts or changes infrastructure automatically.

## 3. Connect DNS

In your registrar's DNS editor:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | Your server's public IPv4 address |
| CNAME | `www` | Your root domain, such as `yourartist.com` |

Use the default TTL, or 300 seconds if offered. Remove conflicting old web A/AAAA records only for the domain you are moving. Do not remove mail MX/TXT records. Add an AAAA record only if IPv6 is configured and reachable on this server. Caddy's supplied configuration serves the exact hostname you choose in `DOMAIN`; the `www` DNS record alone does not add a `www` website. You can omit it initially.

Check `dig +short yourartist.com` on your Mac. It should return the server IP. DNS often updates within minutes but can take 24–48 hours depending on previous caching. Do not disable HTTPS verification to work around propagation.

## 4. Upload and start the website

1. On your Mac, open a terminal in the website folder. Package the source without local secrets:

   ```sh
   tar -czf artist-site.tar.gz package.json content.json public scripts lib server.mjs Dockerfile compose.yaml Caddyfile .dockerignore .env.example
   ```

2. Upload to your server, replacing account/IP placeholders:

   ```sh
   scp artist-site.tar.gz ADMIN_USER@SERVER_IP:~/
   ```

3. On the server, unpack into a directory you own:

   ```sh
   mkdir -p ~/artist-site
   tar -xzf ~/artist-site.tar.gz -C ~/artist-site
   cd ~/artist-site
   cp .env.example .env
   chmod 600 .env
   nano .env
   ```

   Set `DOMAIN=yourartist.com` to your real hostname. Last.fm values can stay blank. Save with Ctrl+O, Enter, then exit Ctrl+X.

4. Build and start from `~/artist-site`:

   ```sh
   docker compose up -d --build
   docker compose ps
   docker compose logs --tail=50 caddy
   ```

5. Visit `https://yourartist.com` on your phone and laptop. Check the logo links, release disclosures, audio play/pause/seek, mobile layout and stopping on tab/page exit. Caddy redirects HTTP to HTTPS and renews certificates. Keep the `caddy_data` volume: it stores certificate state.

To support `www` as a redirect, append this block to `Caddyfile`, replacing both domains:

```caddy
www.yourartist.com {
  redir https://yourartist.com{uri} permanent
}
```

Then run `docker compose restart caddy`. Both hostnames must point to the server. If HTTPS fails, inspect Caddy logs and verify DNS plus TCP ports 80/443. If the site container is unhealthy, inspect `docker compose logs --tail=50 site`; Caddy waits for it to start.

## 5. Maintain and back up

1. **Before every change:** keep an off-server copy of `content.json`, `public/assets/` and source code. Use a private repository or a backed-up folder on your own computer. Keep `.env` separately in your password manager; it is excluded from the upload archive and Docker image.
2. **Update content:** change your local source, run `npm run build` and `npm test`, check the preview, upload a new archive, unpack it over the existing server files, and run `docker compose up -d --build`. Existing `.env` is preserved. Removed assets must also be removed from the server source if you no longer want them public.
3. **Monthly:** install server security updates through your provider's documented process, inspect disk space with `df -h`, and refresh container base images with `docker compose pull` followed by `docker compose build --pull` and `docker compose up -d`. Restart/reboot when required and verify the public site afterward.
4. **Weekly:** use a provider backup if it fits your budget. Save independent source/assets backups after content changes. There is no app database or uploaded visitor data to preserve. Caddy certificate state lives in Docker volumes; do not run `docker compose down -v` during routine updates.
5. **Test recovery:** on a replacement server, install Docker, upload your saved source, recreate `.env` securely, run Compose, and point DNS at the new IP. Caddy can issue fresh certificates once DNS resolves. For a bad content update, restore the previous source archive and rebuild. Confirm domain renewal and billing alerts remain active.

All domain registration, VPS billing, API applications, backup storage and recovery credentials remain yours. The final provider choice waits for budget and experience; this guide is reusable with another VPS offering Docker and public HTTP/HTTPS ports.
