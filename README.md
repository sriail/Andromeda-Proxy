<p align="center">
    <a href="https://github.com/sriail/Andromeda-Proxy">
        <img src="src/assets/images/icons/andromedaLogoDark.png" width="200" height="200" />
    </a>
    </p>
<h1 align="center" id="readme-top">Andromeda</h1>
<p align="center" id="readme-top">Andromeda is a simple and clean web proxy designed for speed and ease-of-use, made in Astro.</p>
<p align="center">
</p>

## Tech Stack
[Astro](https://astro.build) - Server-side rendering and static site generation<br>
[Fastify](https://fastify.dev) - HTTP server <br>
[Vite](https://vite.dev) - Build system <br>
[TailwindCSS](https://tailwindcss.com) - CSS framework <br>
[Ultraviolet](https://github.com/titaniumnetwork-dev/Ultraviolet) - Web proxy <br>
[Scramjet](https://github.com/MercuryWorkshop/Scramjet) - Web proxy <br>
[Wisp-js](https://github.com/MercuryWorkshop/wisp-js) - Wisp server and client in JavaScript <br>
[Bare-mux](https://github.com/MercuryWorkshop/bare-mux) - Modular implementation of the Bare client interface <br>
[EpoxyTransport](https://github.com/MercuryWorkshop/EpoxyTransport) Bare-mux transport using epoxy-tls <br>
[CurlTransport](https://github.com/MercuryWorkshop/CurlTransport) Bare-mux transport using libcurl.js <br>

# Setup
> [!TIP]
> Deploy locally on localhost to have an address only you can access, all of the functionality will remain the same and the site will work properly! To do this, set up with (`pnpm`) using the steps below and visit http://localhost:8080 for a full complete site locally!

Setting Up Andromeda is simple and convenient, for (`pnpm`), run
```bash
git clone https://github.com/sriail/Andromeda-Proxy
cd Andromeda-Proxy
pnpm i
pnpm bstart
# Run pnpm dev instead of pnpm bstart to test in a dev environment, The Bare server may have limited functionality
#pnpm dev
```
Andromeda will run on port 8080 by default, or 4321 for a dev environment (`pnpm dev`).

> [!CAUTION]
> The Bare Server WILL NOT WORK using (`npm run dev`) which will lead to lack of functionality, however the wisp server and basic proxy system will still be functional

And for (`npm`), run
```bash
git clone https://github.com/sriail/Andromeda-Proxy
cd Andromeda-Proxy
npm install
npm run start
# Run npm run dev instead of npm run start to test in a dev environment, The Bare server may have limited functionality
#npm run dev
```

# Deployment

Andromeda can be easily deployed to various platforms with the bundled backend functionality. 

**For detailed deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md)**

## Quick Deployment

## Deploy to Heroku
[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/sriail/Andromeda-Proxy)

Heroku fully supports WebSocket connections and is recommended for production deployments of the site.

**Manual deployment:**
```bash
heroku create your-app-name
git push heroku main
```

## Deploy to CodeSandbox
[![Edit in CodeSandbox](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/s/github/sriail/Andromeda-Proxy)

## Deploy with Docker

Andromeda by default includes a Dockerfile for containerized deployments:

```bash
# Build the Docker image
docker build -t andromeda .

# Run the container
docker run -p 8080:8080 andromeda
```

Or using the Docker Compose below:

```yaml
version: '3.8'
services:
  andromeda:
    build: .
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - PORT=8080
      # Optional: Bare server connection limiter settings
      # - BARE_MAX_CONNECTIONS_PER_IP=100
      # - BARE_WINDOW_DURATION=60
      # - BARE_BLOCK_DURATION=30
    restart: unless-stopped
```

## Environment Variables
All platforms support the following environment variables:
- `PORT` - The port number to run the server on (default: 8080)

### Bare Server Connection Limiter
These variables control the rate limiting for the Bare server to prevent abuse while allowing normal browsing (optional but recommended) can be adjusted based on security preferences and expected usage:
- `BARE_MAX_CONNECTIONS_PER_IP` - Maximum number of concurrent keep-alive connections per IP address (default: 1000)
- `BARE_WINDOW_DURATION` - Time window in seconds for counting connections (default: 60)
- `BARE_BLOCK_DURATION` - Duration in seconds to block an IP after exceeding the limit (default: 30)

# Credits
[sriail](https://github.com/sriail) - Owner and current dev of this repo <br>
[Owski](https://github.com/unretain) - Owner of the Original Radius Proxy <br>
[proudparrot2](https://github.com/proudparrot2) - Founder and original dev of Radius <br>
[MotorTruck1221](https://github.com/motortruck1221) - Astro rewrite and lead dev of Radius <br>
[All of the contributors!](https://github.com/sriail/Andromeda-Proxy/graphs/contributors)
