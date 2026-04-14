FROM node:20-bullseye AS deps

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    build-essential \
    libc6-dev \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps

FROM node:20-bullseye

RUN apt-get update && apt-get install -y \
    ffmpeg \
    imagemagick \
    python3 \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN mkdir -p System/Cache

EXPOSE 8080

CMD ["node", "--max-old-space-size=512", "index.js"]
