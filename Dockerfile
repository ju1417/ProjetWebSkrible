FROM denoland/deno:alpine-1.42.1

WORKDIR /app

COPY . .

RUN deno cache config/server.ts

EXPOSE 8080

CMD ["run", "--allow-net", "--allow-env", "config/server.ts"]
