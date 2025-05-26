FROM denoland/deno:latest

WORKDIR /app

COPY . .

RUN deno cache backend/config/server.ts

CMD ["run", "--allow-net", "--allow-read", "backend/config/server.ts"]
