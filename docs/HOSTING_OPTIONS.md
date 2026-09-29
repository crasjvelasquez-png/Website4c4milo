# Hosting choices for your existing domain

You already own c4milo.com through Domain.com. Domain registration pays for the address; hosting serves the website. Keep the domain and hosting accounts in your name. No accounts or DNS records have been changed.

Prices and limits checked September 28, 2026:

| Route | Hosting cost | What you manage |
| --- | --- | --- |
| Self-host on a DigitalOcean 1 GiB VPS | $6/month; optional weekly backup adds $1.20/month | Linux updates, Docker/Caddy, files and backups |
| Cloudflare Pages Free | $0/month for this static site within its limits | Source files, uploads and DNS; Cloudflare manages the serving infrastructure |

The VPS matches the requested self-hosting setup and supports the existing Node backend if listening is restored later. Follow [LAUNCH.md](LAUNCH.md). The free alternative is managed hosting rather than your own server; it works with the current design because you removed live listening. Either route preserves portable source and uses your own account. Do not purchase anything until the cost and maintenance tradeoff are chosen.

Sources: [DigitalOcean pricing](https://www.digitalocean.com/pricing/droplets), [backup pricing](https://docs.digitalocean.com/products/backups/details/pricing/), [Cloudflare Pages](https://www.cloudflare.com/products/pages/), [Pages limits](https://developers.cloudflare.com/pages/platform/limits/).

Domain.com advertises ordinary .com renewal at $22.99/year. Your existing-account renewal may differ; check its invoice/renewal screen. Domain renewal is separate from either hosting route. An eventual Laylo subscription is also separate. [Domain.com rates](https://www.domain.com/tlds/com)

## Free static-host route, if you choose it

Estimated initial setup: 30–60 minutes, plus DNS activation time. This has not been deployed or tested in a real Cloudflare account.

1. **Prepare the site locally.** Add your audio/artwork and final links, then run `npm run build`. Open the local preview. The generated `dist/` folder is the upload, not the source folder or .env. Each Pages asset must be no larger than 25 MiB; if the final audio is larger, choose the VPS or plan suitable media hosting instead of uploading an oversized file. Keep listening disabled, since this route does not run the Node API.
2. **Upload in your account.** Create/sign into your own Cloudflare account, choose the Free plan, then Workers & Pages → Create application → Pages → upload assets. Upload the `dist/` folder or a ZIP of its contents with index.html at the root. Name the project and deploy it. Test the supplied pages.dev preview first. Drag-and-drop supports up to 1,000 files; this site is far below that limit. Direct Upload projects cannot later switch to Git integration without creating a new project. [Upload instructions](https://developers.cloudflare.com/pages/get-started/direct-upload/)
3. **Connect the domain.** In the Pages project's Custom domains tab, add c4milo.com. For the root domain, add it as a Cloudflare DNS zone, review/copy all existing records (especially email MX/TXT records), and update nameservers in the registrar account to the exact pair Cloudflare assigns. Registration remains at Domain.com. If keeping existing nameservers, you can instead add www.c4milo.com in Pages and create the instructed www CNAME at your current DNS provider pointing to the project's pages.dev hostname; this alone does not connect the root domain. Associate the hostname in Pages before changing the record. [Custom domain instructions](https://developers.cloudflare.com/pages/configuration/custom-domains/)
4. **Check HTTPS and playback.** Wait for the custom domain to become active with its automatically provisioned certificate. Visit the exact HTTPS hostname on your phone and laptop; verify logos, disclosures, audio loading, seeking, fades and stopping on tab/page exit. Do not publish the final URL until these checks pass. The local Node security headers are not automatically carried over to a static provider; configure provider headers if you choose this route. [Pages platform](https://www.cloudflare.com/products/pages/)
5. **Keep updates and backups.** Keep source, content.json and assets backed up outside the hosting account. For updates, edit locally, build and upload a new deployment. Keep the prior deployment/source archive for rollback. Review domain renewal and account recovery details annually. There is no Linux server to patch on this route; the source remains yours to move to a different host.

No credentials are needed in chat. Login, billing and recovery stay under your ownership.
